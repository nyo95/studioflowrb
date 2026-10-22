# frozen_string_literal: true

require 'json'
require 'securerandom'
require 'set'

module BerkahStudio
  module MaterialScheduler
    # Codes from the Product Schedule (WO-SKETCHUP-01 Stage 1b, WO-SKETCHUP-02). StudioFlow allocates every code and may
    # give a deleted item's code to a new item later, so a SketchUp material is identified with its item only through
    # the project id + entry id stored on it, never through its name. Every link, rename and new item waits for the
    # user's answer. Merging returns with option ids (WO-SKETCHUP-03): one entry may hold alternatives that look alike.
    module ScheduleLink
      DICT = 'BerkahStudio'.freeze
      ENTRY_KEY = 'studioflow_entry_id'.freeze
      PROJECT_KEY = 'studioflow_project_id'.freeze
      # What the link said when it was made or last refreshed, to explain a link whose item is gone.
      CODE_KEY = 'studioflow_link_code'.freeze
      TITLE_KEY = 'studioflow_link_title'.freeze
      # An "Item baru" request that has not been answered yet: { key, projectId, section, category, at }.
      PENDING_KEY = 'studioflow_pending'.freeze
      SECTION = 'MATERIAL'.freeze
      CHOOSE = '(pilih)'.freeze

      def self.code_key(name)
        LinkRules.code_key(name)
      end

      def self.entry_label(entry)
        title = entry['title'].to_s.strip
        title.empty? ? entry['code'].to_s : "#{entry['code']} · #{title}"
      end

      # inputbox lists are separated by '|', so a label must not contain one.
      def self.list_safe(text)
        text.to_s.tr('|', '/')
      end

      def self.linked_entry_id(material, project_id)
        return nil unless material.get_attribute(DICT, PROJECT_KEY).to_s == project_id

        id = material.get_attribute(DICT, ENTRY_KEY).to_s
        id.empty? ? nil : id
      end

      # What the material was last linked to, for messages ("dulu ST-01 · Marmer Merah").
      def self.former_label(material)
        code = material.get_attribute(DICT, CODE_KEY).to_s
        title = material.get_attribute(DICT, TITLE_KEY).to_s.strip
        return 'item lama (kodenya tidak tercatat)' if code.empty?

        title.empty? ? code : "#{code} · #{title}"
      end

      def self.unlink(material)
        [ENTRY_KEY, PROJECT_KEY, CODE_KEY, TITLE_KEY].each { |key| material.delete_attribute(DICT, key) }
      end

      def self.pending(material)
        data = JSON.parse(material.get_attribute(DICT, PENDING_KEY).to_s)
        data.is_a?(Hash) ? data : nil
      rescue JSON::ParserError
        nil
      end

      # ── Connect ──────────────────────────────────────────────────────────────

      def self.connect
        model = Sketchup.active_model
        input = UI.inputbox(
          ['Alamat StudioFlow', 'Token (sfk_..., kosongkan untuk memakai yang tersimpan)'],
          [StudioflowClient.server, ''],
          'Sambung ke StudioFlow'
        )
        return unless input

        server = input[0].to_s.strip.chomp('/')
        token = input[1].to_s.strip
        token = StudioflowClient.token if token.empty?
        case LinkRules.server_check(server)
        when :refuse
          return UI.messagebox("Alamat StudioFlow harus https://...\nhttp:// hanya boleh untuk komputer ini (localhost) atau jaringan kantor (mis. 192.168.x.x), karena token ikut terkirim di setiap permintaan.")
        when :warn
          answer = UI.messagebox("#{server} memakai http (tanpa enkripsi). Token ikut terkirim dan bisa dibaca orang lain di jaringan yang sama.\n\nLanjutkan hanya kalau ini jaringan kantor yang kamu percaya.", MB_YESNO)
          return unless answer == IDYES
        end
        unless StudioflowClient.valid_token?(token)
          UI.messagebox("Token tidak dikenali. Buat token di StudioFlow (Account > Integration tokens) dengan izin SketchUp, lalu tempel di sini.")
          return
        end
        StudioflowClient.save_connection(server, token)
        Sketchup.set_status_text('Berkah Studio: mengambil daftar proyek dari StudioFlow...')
        StudioflowClient.list_projects do |projects, error|
          next UI.messagebox(StudioflowClient.explain(error)) if error
          next UI.messagebox('Tidak ada proyek StudioFlow yang bisa kamu buka dengan token ini.') if projects.empty?

          choose_project(model, projects)
        end
      end

      def self.choose_project(model, projects)
        labels = projects.each_with_index.map { |project, index| list_safe("#{index + 1}. #{project['name']}#{project['canApply'] ? '' : ' (hanya baca)'}") }
        current = projects.index { |project| project['id'] == StudioflowClient.project_id(model) }
        input = UI.inputbox(['Proyek untuk model ini'], [current ? labels[current] : labels[0]], [labels.join('|')], 'Pilih proyek StudioFlow')
        return unless input && Sketchup.active_model == model

        project = projects[labels.index(input[0])]
        model.set_attribute(DICT, 'studioflow_project_id', project['id'])
        model.set_attribute(DICT, 'studioflow_project_name', project['name'])
        UI.messagebox("Model ini tersambung ke proyek \"#{project['name']}\".\nKlik Auto-Rename Material lalu klik permukaan untuk memberi kode dari jadwal.")
      end

      def self.disconnect
        model = Sketchup.active_model
        name = StudioflowClient.project_name(model)
        model.set_attribute(DICT, 'studioflow_project_id', '')
        model.set_attribute(DICT, 'studioflow_project_name', '')
        UI.messagebox(name.empty? ? 'Model ini tidak tersambung ke proyek StudioFlow.' : "Sambungan model ini ke \"#{name}\" diputus. Link material tetap tersimpan dan aktif lagi kalau disambung ke proyek yang sama.")
      end

      # ── Click a material ─────────────────────────────────────────────────────

      def self.on_material(material, model)
        project_id = StudioflowClient.project_id(model)
        return if resume_pending(material, model, project_id)

        Sketchup.set_status_text('Berkah Studio: membaca jadwal dari StudioFlow...')
        StudioflowClient.schedule(project_id) do |schedule, error|
          Sketchup.set_status_text('')
          next UI.messagebox(StudioflowClient.explain(error)) if error
          next unless Sketchup.active_model == model && material.valid?

          decide(material, model, project_id, schedule)
        end
      end

      def self.decide(material, model, project_id, schedule)
        entries = schedule['entries'] || []
        state = LinkRules.classify(material.get_attribute(DICT, PROJECT_KEY), material.get_attribute(DICT, ENTRY_KEY), project_id, entries.map { |row| row['id'] })
        case state
        when :linked
          entry = entries.find { |row| row['id'] == material.get_attribute(DICT, ENTRY_KEY) }
          answer = UI.messagebox("Material \"#{material.name}\" terhubung ke #{entry_label(entry)}.\n\nGanti ke item lain?", MB_YESNO)
          return answer == IDYES ? picker(material, model, project_id, schedule) : nil
        when :other_project
          answer = UI.messagebox("Material \"#{material.name}\" tertaut ke item proyek StudioFlow lain (dulu #{former_label(material)}), bukan proyek model ini.\n\nHubungkan ke item proyek ini?", MB_YESNO)
          return unless answer == IDYES
        when :stale
          return stale_choice(material, model, project_id, schedule)
        end

        key = code_key(material.name)
        match = key && entries.find { |row| code_key(row['code']) == key }
        return picker(material, model, project_id, schedule) unless match

        answer = UI.messagebox("Material \"#{material.name}\" belum tertaut ke jadwal.\nIni #{entry_label(match)}?\n\nYes = hubungkan, No = pilih item lain, Cancel = batal.", MB_YESNOCANCEL)
        return link(material, model, project_id, match) if answer == IDYES
        return picker(material, model, project_id, schedule) if answer == IDNO
      end

      # The item this material was linked to is gone. Its code may already belong to a new item (StudioFlow reuses free
      # numbers), so the choice starts at "leave it" and the new item is named, never assumed (D5).
      def self.stale_choice(material, model, project_id, schedule)
        entries = schedule['entries'] || []
        key = code_key(material.name)
        match = key && entries.find { |row| code_key(row['code']) == key }
        leave = 'Biarkan (jangan tautkan)'
        other = 'Pilih item lain...'
        choices = [leave]
        choices << list_safe("Tautkan ke item baru #{entry_label(match)}") if match
        choices << other
        note = match ? "\nKode #{match['code']} sekarang dipakai item lain: #{entry_label(match)}." : ''
        input = UI.inputbox(['Tindakan'], [leave], [choices.join('|')], "Tautan tidak berlaku: #{material.name}")
        UI.messagebox("Material \"#{material.name}\" dulu tertaut ke #{former_label(material)}, yang sudah dihapus dari jadwal.#{note}\nMaterial dibiarkan; tautan lamanya tetap tercatat.") if input.nil? || input[0] == leave
        return if input.nil? || input[0] == leave
        return unless Sketchup.active_model == model && material.valid?
        return picker(material, model, project_id, schedule) if input[0] == other

        link(material, model, project_id, match)
      end

      def self.picker(material, model, project_id, schedule)
        entries = (schedule['entries'] || []).select { |row| row['section'] == SECTION }
        choices = (schedule['categoryChoices'] || []).select { |row| row['section'] == SECTION }.map { |row| row['category'].to_s }
        categories = (choices + entries.map { |row| row['category'].to_s }).reject(&:empty?).uniq { |name| name.downcase }.sort_by(&:downcase)
        return UI.messagebox('Jadwal proyek ini belum punya kategori material.') if categories.empty?

        listed = categories.map { |name| list_safe(name) }
        input = UI.inputbox(['Kategori'], [CHOOSE], [([CHOOSE] + listed).join('|')], "Kode dari jadwal: #{material.name}")
        return unless input && input[0] != CHOOSE

        category = categories[listed.index(input[0])]
        items = entries.select { |row| row['category'].to_s.casecmp?(category) }
        items = items.sort_by { |row| [-similarity(material.name, row['title']), row['code'].to_s] }
        new_item = list_safe("(Item baru di #{category})")
        labels = items.map { |row| list_safe(entry_label(row)) }
        input = UI.inputbox(['Item jadwal'], [CHOOSE], [([CHOOSE] + labels + [new_item]).join('|')], "#{category}: #{material.name}")
        return unless input && input[0] != CHOOSE
        return unless Sketchup.active_model == model && material.valid?

        return create_and_link(material, model, project_id, category) if input[0] == new_item

        link(material, model, project_id, items[labels.index(input[0])])
      end

      def self.create_and_link(material, model, project_id, category)
        answer = UI.messagebox("Buat item baru di \"#{category}\"? StudioFlow memberi kodenya, lalu material \"#{material.name}\" memakai kode itu.", MB_YESNO)
        return unless answer == IDYES

        # The key is kept on the material until StudioFlow answers, so a second click after a lost answer replays the
        # same request and gets the same item instead of a second one.
        request = { 'key' => SecureRandom.uuid, 'projectId' => project_id, 'section' => SECTION, 'category' => category, 'at' => Time.now.to_i }
        Undo.wrap('Item baru (menunggu StudioFlow)') { material.set_attribute(DICT, PENDING_KEY, JSON.generate(request)) }
        send_create(material, model, request)
      end

      # A click on a material with an unanswered "Item baru" finishes that request first (WO-SKETCHUP-02).
      def self.resume_pending(material, model, project_id)
        request = pending(material)
        return false unless request

        if request['projectId'] != project_id || !LinkRules.pending_fresh?(request, Time.now)
          Undo.wrap('Hapus permintaan lama') { material.delete_attribute(DICT, PENDING_KEY) }
          UI.messagebox("Permintaan \"Item baru di #{request['category']}\" untuk material ini sudah terlalu lama atau untuk proyek lain, jadi tidak diulang.\nCek di Product Schedule apakah itemnya sudah dibuat; kalau ya, tautkan lewat daftar item.")
          return false
        end
        answer = UI.messagebox("Permintaan \"Item baru di #{request['category']}\" untuk material \"#{material.name}\" belum mendapat jawaban dari StudioFlow.\n\nYes = selesaikan (tidak membuat item kedua), No = batalkan permintaan itu.", MB_YESNOCANCEL)
        return true if answer == IDCANCEL

        if answer == IDNO
          Undo.wrap('Batalkan permintaan item baru') { material.delete_attribute(DICT, PENDING_KEY) }
          UI.messagebox('Permintaan dibatalkan di SketchUp. Kalau StudioFlow sempat membuat itemnya, item itu tetap ada di Product Schedule.')
          return false
        end
        send_create(material, model, request)
        true
      end

      def self.send_create(material, model, request)
        Sketchup.set_status_text('Berkah Studio: membuat item di StudioFlow...')
        StudioflowClient.create_entry(request['projectId'], request['section'], request['category'], request['key']) do |created, error|
          Sketchup.set_status_text('')
          alive = Sketchup.active_model == model && material.valid?
          if error
            if alive && !LinkRules.keep_pending?(error[:code])
              Undo.wrap('Hapus permintaan item baru') { material.delete_attribute(DICT, PENDING_KEY) }
            end
            retry_note = LinkRules.keep_pending?(error[:code]) ? "\n\nKlik material ini lagi dengan Auto-Rename untuk mencoba lagi; StudioFlow tidak akan membuat item kedua." : ''
            next UI.messagebox("#{StudioflowClient.explain(error)}#{retry_note}")
          end
          unless alive
            next UI.messagebox("StudioFlow sudah membuat item #{created['code']} (#{created['category']}), tetapi material atau modelnya sudah tidak terbuka.\nBuka modelnya lalu klik materialnya: permintaan yang sama dilanjutkan, atau tautkan lewat daftar item #{created['category']}.")
          end

          link(material, model, request['projectId'], { 'id' => created['entryId'], 'code' => created['code'], 'title' => '' })
        end
      end

      # Item titles that share words with the material name, or whose initials it uses (hpl = High Pressure
      # Laminate), come first in the item list.
      def self.similarity(name, title)
        words_a = name.to_s.downcase.scan(/[a-z0-9]+/)
        words_b = title.to_s.downcase.scan(/[a-z0-9]+/)
        shared = (words_a & words_b).sum { |word| word.length >= 3 ? 2 : 1 }
        initials = words_b.select { |word| word.match?(/\A[a-z]/) }.map { |word| word[0] }.join
        shared + (words_a.include?(initials) && initials.length > 1 ? 3 : 0)
      end

      def self.link(material, model, project_id, entry)
        code = entry['code'].to_s
        taken = model.materials[code]
        Undo.wrap('Kode dari jadwal') do
          material.set_attribute(DICT, ENTRY_KEY, entry['id'])
          material.set_attribute(DICT, PROJECT_KEY, project_id)
          material.set_attribute(DICT, CODE_KEY, code)
          material.set_attribute(DICT, TITLE_KEY, entry['title'].to_s)
          material.delete_attribute(DICT, PENDING_KEY)
          material.name = code unless taken && taken != material
          MaterialMetadata.apply_code(material, code)
        end
        ModelScanner.invalidate_cache
        EventBus.publish(:data_changed)
        Sketchup.set_status_text("Material terhubung ke #{entry_label(entry)}")
        return unless taken && taken != material

        UI.messagebox("Material terhubung ke #{entry_label(entry)}, tetapi nama \"#{code}\" sudah dipakai material lain, jadi namanya tetap \"#{material.name}\".\nGanti atau bersihkan material \"#{code}\" yang lain dulu kalau nama ini harus dipakai.")
      end

      # ── Refresh codes ────────────────────────────────────────────────────────

      def self.refresh_codes
        model = Sketchup.active_model
        project_id = StudioflowClient.project_id(model)
        return UI.messagebox('Sambung model ini ke proyek StudioFlow dulu (Sambung ke StudioFlow...).') unless StudioflowClient.connected?(model)

        linked = model.materials.select { |material| linked_entry_id(material, project_id) }
        return UI.messagebox('Belum ada material yang terhubung ke jadwal proyek ini.') if linked.empty?

        ids = linked.map { |material| linked_entry_id(material, project_id) }.uniq
        return UI.messagebox('Lebih dari 500 item terhubung; Perbarui kode belum mendukung sebanyak itu sekaligus.') if ids.length > 500

        Sketchup.set_status_text('Berkah Studio: mengecek kode di StudioFlow...')
        StudioflowClient.resolve(project_id, ids) do |rows, error|
          Sketchup.set_status_text('')
          next UI.messagebox(StudioflowClient.explain(error)) if error
          next unless Sketchup.active_model == model

          apply_refresh(model, project_id, linked.select(&:valid?), rows.to_h { |row| [row['entryId'], row['code']] })
        end
      end

      def self.apply_refresh(model, project_id, linked, codes)
        by_key = {}
        rows = linked.map do |material|
          by_key[material.entityID] = material
          { key: material.entityID, name: material.name, target: codes[linked_entry_id(material, project_id)] }
        end
        holders = model.materials.to_h { |material| [material.name, material.entityID] }
        plan = LinkRules.refresh_plan(rows, holders)
        others = model.materials.count { |material| !material.get_attribute(DICT, ENTRY_KEY).to_s.empty? && material.get_attribute(DICT, PROJECT_KEY).to_s != project_id }
        renames = plan[:renames].map { |row| [by_key[row[:key]], row[:target]] }
        if renames.empty? && plan[:conflicts].empty? && plan[:stale].empty?
          return UI.messagebox("Semua kode material sudah sama dengan jadwal.#{others.positive? ? "\n#{others} material tertaut ke proyek lain dan tidak dicek." : ''}")
        end

        summary = []
        summary << "#{renames.length} material diganti namanya:\n#{renames.first(15).map { |m, c| "• #{m.name} → #{c}" }.join("\n")}#{renames.length > 15 ? "\n• ..." : ''}" unless renames.empty?
        unless plan[:stale].empty?
          summary << "#{plan[:stale].length} material tertaut ke item yang sudah dihapus dari jadwal (nama dan tautan lama dibiarkan, klik materialnya untuk menautkan ulang): #{plan[:stale].first(10).map { |row| row[:name] }.join(', ')}"
        end
        unless plan[:conflicts].empty?
          summary << "#{plan[:conflicts].length} dilewati karena namanya bentrok (dipakai material lain, atau beberapa material tertaut ke item yang sama): #{plan[:conflicts].first(10).map { |row| "#{row[:name]} → #{row[:target]}" }.join(', ')}"
        end
        summary << "#{others} material tertaut ke proyek lain dan tidak dicek." if others.positive?
        return UI.messagebox("Tidak ada nama yang diganti.\n\n#{summary.join("\n\n")}") if renames.empty?

        answer = UI.messagebox("Perbarui kode dari jadwal?\n\n#{summary.join("\n\n")}", MB_YESNO)
        return unless answer == IDYES

        Undo.wrap('Perbarui kode dari jadwal') do
          # Temporary names first, so two codes can swap without a collision.
          renames.each_with_index { |(material, _code), index| material.name = "__studioflow_#{index}_#{material.entityID}" }
          renames.each do |material, code|
            material.name = code
            material.set_attribute(DICT, CODE_KEY, code)
            MaterialMetadata.apply_code(material, code)
          end
        end
        ModelScanner.invalidate_cache
        EventBus.publish(:data_changed)
        Sketchup.set_status_text("Kode diperbarui: #{renames.length} material")
      end
    end
  end
end
