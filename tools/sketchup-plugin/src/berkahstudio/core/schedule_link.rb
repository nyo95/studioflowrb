# frozen_string_literal: true

require 'digest'
require 'json'
require 'securerandom'
require 'set'
require 'tmpdir'

module BerkahStudio
  module MaterialScheduler
    # Codes from the Product Schedule (WO-SKETCHUP-01 Stage 1b, WO-SKETCHUP-02, WO-SKETCHUP-03). StudioFlow allocates
    # every code and may give a deleted item's code to a new item later, so a SketchUp material is identified with its
    # item only through the project id + entry id (+ option id) stored on it, never through its name. Names: PL-01 for
    # the final or only option, PL-01-B for a non-final alternative. Every link, rename, new item and merge waits for the
    # user's answer; a merge needs the same entry and option id.
    module ScheduleLink
      DICT = 'BerkahStudio'.freeze
      ENTRY_KEY = 'studioflow_entry_id'.freeze
      PROJECT_KEY = 'studioflow_project_id'.freeze
      # The schedule option the material shows; absent = linked to the item only (old links are never guessed).
      OPTION_KEY = 'studioflow_option_id'.freeze
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
        [ENTRY_KEY, PROJECT_KEY, OPTION_KEY, CODE_KEY, TITLE_KEY].each { |key| material.delete_attribute(DICT, key) }
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
          return linked_actions(material, model, project_id, schedule, entry)
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
        return link_with_option(material, model, project_id, match, schedule) if answer == IDYES
        return picker(material, model, project_id, schedule) if answer == IDNO
      end

      # Status in words (WO-SKETCHUP-03): what the drafter may trust about this material.
      def self.status_text(entry, option_id)
        state, final_label = LinkRules.link_status(entry['options'], option_id)
        case state
        when :no_spec then 'item belum punya spesifikasi (opsi)'
        when :single then final_label ? 'final' : 'satu-satunya opsi, belum final'
        when :option_not_chosen then "opsi belum dipilih#{final_label ? " (final: #{final_label})" : ''}"
        when :option_missing then "opsi yang ditautkan sudah dihapus#{final_label ? " (final: #{final_label})" : ''}"
        when :final then "opsi #{final_label}, final"
        when :not_final then "BUKAN final (final: opsi #{final_label})"
        when :only_option then 'satu-satunya opsi, belum final'
        else 'alternatif, belum ada yang final'
        end
      end

      def self.option_of(entry, option_id)
        (entry['options'] || []).find { |row| row['id'] == option_id }
      end

      def self.link_label(entry, option)
        return entry_label(entry) unless option

        title = option['title'].to_s.strip
        "#{entry['code']} opsi #{option['label']}#{title.empty? ? '' : " · #{title}"}"
      end

      def self.linked_actions(material, model, project_id, schedule, entry)
        option_id = material.get_attribute(DICT, OPTION_KEY).to_s
        option = option_of(entry, option_id)
        expected = LinkRules.expected_name(entry['code'], entry['options'], option_id)
        leave = 'Biarkan'
        actions = [leave]
        rename = list_safe("Ganti nama jadi #{expected}") if expected && expected != material.name
        actions << rename if rename
        choose = (entry['options'] || []).length > 1 ? 'Pilih opsi lain...' : nil
        actions << choose if choose
        actions << 'Ganti ke item lain...'
        input = UI.inputbox(['Tindakan'], [leave], [actions.join('|')], "#{material.name}: #{link_label(entry, option)} - #{status_text(entry, option_id)}")
        return unless input && Sketchup.active_model == model && material.valid?

        case input[0]
        when leave then offer_merge(material, model, project_id, entry)
        when rename then link(material, model, project_id, entry, option, schedule)
        when choose then link_with_option(material, model, project_id, entry, schedule)
        else picker(material, model, project_id, schedule)
        end
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

        link_with_option(material, model, project_id, match, schedule)
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

        return create_and_link(material, model, project_id, category, schedule) if input[0] == new_item

        link_with_option(material, model, project_id, items[labels.index(input[0])], schedule)
      end

      # An item with options is linked to one of them (WO-SKETCHUP-03): the only option is taken, several are asked
      # (the final one marked); an item without options is linked as the item. Options are never made from SketchUp.
      def self.link_with_option(material, model, project_id, entry, schedule)
        options = entry['options'] || []
        return link(material, model, project_id, entry, nil, schedule) if options.empty?
        return link(material, model, project_id, entry, options.first, schedule) if options.length == 1

        labels = options.map { |row| list_safe("#{row['label']}#{row['title'].to_s.strip.empty? ? '' : " · #{row['title']}"}#{row['isFinal'] ? ' (final)' : ''}") }
        input = UI.inputbox(['Opsi'], [CHOOSE], [([CHOOSE] + labels).join('|')], "#{entry['code']}: opsi mana yang dipakai material \"#{material.name}\"?")
        return unless input && input[0] != CHOOSE
        return unless Sketchup.active_model == model && material.valid?

        link(material, model, project_id, entry, options[labels.index(input[0])], schedule)
      end

      def self.create_and_link(material, model, project_id, category, schedule = nil)
        answer = UI.messagebox("Buat item baru di \"#{category}\"? StudioFlow memberi kodenya, lalu material \"#{material.name}\" memakai kode itu.", MB_YESNO)
        return unless answer == IDYES

        # The key is kept on the material until StudioFlow answers, so a second click after a lost answer replays the
        # same request and gets the same item instead of a second one.
        request = { 'key' => SecureRandom.uuid, 'projectId' => project_id, 'section' => SECTION, 'category' => category, 'at' => Time.now.to_i }
        Undo.wrap('Item baru (menunggu StudioFlow)') { material.set_attribute(DICT, PENDING_KEY, JSON.generate(request)) }
        send_create(material, model, request, schedule)
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

      def self.send_create(material, model, request, schedule = nil)
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

          # Owner D2: a new item has no option; the material links to the item.
          link(material, model, request['projectId'], { 'id' => created['entryId'], 'code' => created['code'], 'title' => '', 'options' => [] }, nil, schedule)
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

      # A material whose link points at an item that is gone: it may hold a code a new item now carries.
      def self.stale_holder?(holder, project_id, schedule)
        return false unless schedule

        ids = (schedule['entries'] || []).map { |row| row['id'] }
        LinkRules.classify(holder.get_attribute(DICT, PROJECT_KEY), holder.get_attribute(DICT, ENTRY_KEY), project_id, ids) == :stale
      end

      def self.free_name(model, base)
        return base unless model.materials[base]

        (2..999).map { |index| "#{base} #{index}" }.find { |name| !model.materials[name] }
      end

      def self.link(material, model, project_id, entry, option, schedule = nil)
        code = entry['code'].to_s
        option_id = option ? option['id'] : nil
        name = LinkRules.expected_name(code, entry['options'], option_id)
        taken = name && model.materials[name]
        taken = nil if taken == material
        # A stale material holding the code (its item was deleted and the code reused) may step aside, if the user says so.
        if taken && stale_holder?(taken, project_id, schedule)
          aside = free_name(model, "#{name} lama")
          answer = UI.messagebox("Nama \"#{name}\" dipakai material lama yang dulu tertaut ke #{former_label(taken)} (sudah dihapus dari jadwal).\n\nGanti nama material lama itu jadi \"#{aside}\" supaya material ini bisa memakai \"#{name}\"?", MB_YESNO)
          if answer == IDYES && aside
            Undo.wrap('Ganti nama material lama') { taken.name = aside }
            taken = nil
          end
        end
        Undo.wrap('Kode dari jadwal') do
          material.set_attribute(DICT, ENTRY_KEY, entry['id'])
          material.set_attribute(DICT, PROJECT_KEY, project_id)
          option_id ? material.set_attribute(DICT, OPTION_KEY, option_id) : material.delete_attribute(DICT, OPTION_KEY)
          material.set_attribute(DICT, CODE_KEY, code)
          material.set_attribute(DICT, TITLE_KEY, (option ? option['title'] : entry['title']).to_s)
          material.delete_attribute(DICT, PENDING_KEY)
          if name && !taken
            material.name = name
            MaterialMetadata.apply_code(material, name)
          end
        end
        ModelScanner.invalidate_cache
        EventBus.publish(:data_changed)
        Sketchup.set_status_text("Material terhubung ke #{link_label(entry, option)}: #{status_text(entry, option_id)}")
        # A holder linked to the same option is offered as a merge right after, which settles the name.
        if taken && !LinkRules.merge_candidate?(link_ids(material), link_ids(taken), project_id, (entry['options'] || []).length)
          UI.messagebox("Material terhubung ke #{link_label(entry, option)}, tetapi nama \"#{name}\" sudah dipakai material lain, jadi namanya tetap \"#{material.name}\".\nGanti atau bersihkan material \"#{name}\" yang lain dulu kalau nama ini harus dipakai.")
        end
        offer_merge(material, model, project_id, entry)
      end

      # ── Merge (WO-SKETCHUP-03, owner 2026-10-22) ─────────────────────────────

      def self.link_ids(material)
        { project_id: material.get_attribute(DICT, PROJECT_KEY), entry_id: material.get_attribute(DICT, ENTRY_KEY), option_id: material.get_attribute(DICT, OPTION_KEY) }
      end

      # Only materials the Schedule calls one specification: same entry and same option id. The user sees the surface
      # counts; a different look defaults to "do not merge" and, to go on, the user picks the look that stays.
      def self.offer_merge(material, model, project_id, entry)
        return unless material.valid?

        option_count = (entry['options'] || []).length
        ids = link_ids(material)
        others = model.materials.select { |other| other != material && LinkRules.merge_candidate?(ids, link_ids(other), project_id, option_count) }
        return if others.empty?

        group = [material] + others
        counts = usage_counts(model, group)
        looks = group.to_h { |row| [row, look_of(row)] }
        lines = group.map { |row| "• #{row.name}: #{counts[row]} permukaan" }.join("\n")
        option = option_of(entry, ids[:option_id].to_s)
        heading = "Ada #{group.length} material untuk #{link_label(entry, option)}:\n#{lines}"
        if group.all? { |row| looks[row] == looks[material] }
          answer = UI.messagebox("#{heading}\n\nTampilannya sama (tekstur, ukuran, warna). Gabungkan jadi satu material? Tampilan permukaan tidak berubah; bisa di-undo.", MB_YESNO)
          return unless answer == IDYES

          survivor = material
        else
          keep = 'Jangan gabung'
          choices = [keep] + group.map { |row| list_safe("Gabung, pakai tampilan \"#{row.name}\"") }
          UI.messagebox("#{heading}\n\nPERHATIAN: tampilannya berbeda (tekstur, ukuran tekstur atau warna). Kalau digabung, permukaan material lain ikut memakai tampilan yang dipilih.")
          input = UI.inputbox(['Gabung?'], [keep], [choices.join('|')], "Gabung material #{entry['code']}")
          return unless input && input[0] != keep

          survivor = group[choices.index(input[0]) - 1]
        end
        return unless Sketchup.active_model == model && group.all?(&:valid?)

        merge(model, survivor, group - [survivor], material, entry)
      end

      def self.merge(model, survivor, losers, source, entry)
        distorted = 0
        Undo.wrap('Gabungkan material') do
          distorted = replace_materials(model, losers.to_set, survivor)
          losers.each { |row| model.materials.remove(row) }
          [ENTRY_KEY, PROJECT_KEY, OPTION_KEY, CODE_KEY, TITLE_KEY].each do |key|
            value = source.valid? ? source.get_attribute(DICT, key) : nil
            value.nil? ? survivor.delete_attribute(DICT, key) : survivor.set_attribute(DICT, key, value)
          end
          name = LinkRules.expected_name(entry['code'], entry['options'], survivor.get_attribute(DICT, OPTION_KEY).to_s)
          if name && survivor.name != name && !model.materials[name]
            survivor.name = name
            MaterialMetadata.apply_code(survivor, name)
          end
        end
        ModelScanner.invalidate_cache
        EventBus.publish(:data_changed)
        Sketchup.set_status_text("#{losers.length + 1} material digabung menjadi #{survivor.name}")
        return if distorted.zero?

        UI.messagebox("#{distorted} permukaan memakai tekstur yang didistorsi (Position Texture dengan 4 pin); posisinya mungkin bergeser. Cek permukaan itu, atau Undo.")
      end

      # One pass over the model: top-level entities and every definition once (groups are definitions too).
      def self.each_container(model)
        yield model.entities
        model.definitions.each { |definition| yield definition.entities unless definition.image? }
      end

      # Faces and instances painted with each material, counted once per definition (not per copy).
      def self.usage_counts(model, materials)
        counts = Hash.new(0)
        wanted = materials.to_set
        each_container(model) do |entities|
          entities.each do |entity|
            next unless entity.is_a?(Sketchup::Face) || entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)

            counts[entity.material] += 1 if wanted.include?(entity.material)
            counts[entity.back_material] += 1 if entity.is_a?(Sketchup::Face) && wanted.include?(entity.back_material)
          end
        end
        counts
      end

      # Repaints every face/instance using a loser with the survivor, carrying each textured face's position over so
      # the surface looks the same. Returns the number of faces whose distorted texture could not be carried exactly.
      def self.replace_materials(model, losers, survivor)
        distorted = 0
        each_container(model) do |entities|
          entities.to_a.each do |entity|
            next unless entity.valid?

            if entity.is_a?(Sketchup::Face)
              [true, false].each do |front|
                current = front ? entity.material : entity.back_material
                next unless losers.include?(current)

                distorted += 1 unless repaint_face(entity, current, survivor, front)
              end
            elsif (entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)) && losers.include?(entity.material)
              entity.material = survivor
            end
          end
        end
        distorted
      end

      # true when the face got the survivor with its texture position kept (or there was no texture to keep).
      def self.repaint_face(face, old, survivor, front)
        if old.texture && survivor.texture
          points = face.outer_loop.vertices.map(&:position)
          corners = LinkRules.spread_corners(points.map(&:to_a))
          if corners
            helper = face.get_UVHelper(front, !front)
            uvqs = corners.map { |index| front ? helper.get_front_UVQ(points[index]) : helper.get_back_UVQ(points[index]) }
            if uvqs.map(&:z).minmax.reduce(:-).abs < 1e-6 && uvqs.none? { |uvq| uvq.z.abs < 1e-9 }
              mapping = corners.zip(uvqs).flat_map { |index, uvq| [points[index], Geom::Point3d.new(uvq.x / uvq.z, uvq.y / uvq.z, 1)] }
              face.position_material(survivor, mapping, front)
              return true
            end
            assign_side(face, survivor, front)
            return false
          end
        end
        assign_side(face, survivor, front)
        true
      rescue ArgumentError, TypeError => e
        Logger.warn(:merge_texture_position_failed, message: e.message)
        assign_side(face, survivor, front)
        false
      end

      def self.assign_side(face, material, front)
        front ? face.material = material : face.back_material = material
      end

      # What a material looks like: texture image content and size, colour, transparency, colorize mode.
      def self.look_of(material)
        texture = material.texture
        image = nil
        if texture
          path = File.join(Dir.tmpdir, "berkahstudio_look_#{material.entityID}.png")
          begin
            texture.write(path)
            image = Digest::SHA256.file(path).hexdigest if File.exist?(path)
          ensure
            File.delete(path) if File.exist?(path)
          end
          image ||= File.basename(texture.filename.to_s)
        end
        colorize = material.respond_to?(:colorize_type) ? material.colorize_type : nil
        [image, texture && [texture.width.to_f.round(4), texture.height.to_f.round(4)], material.color.to_a, material.alpha.to_f.round(4), colorize]
      end

      # ── Check and refresh codes (WO-SKETCHUP-03) ─────────────────────────────

      def self.refresh_codes
        model = Sketchup.active_model
        project_id = StudioflowClient.project_id(model)
        return UI.messagebox('Sambung model ini ke proyek StudioFlow dulu (Sambung ke StudioFlow...).') unless StudioflowClient.connected?(model)

        linked = model.materials.select { |material| linked_entry_id(material, project_id) }
        return UI.messagebox('Belum ada material yang terhubung ke jadwal proyek ini.') if linked.empty?

        Sketchup.set_status_text('Berkah Studio: mengecek material terhubung terhadap jadwal StudioFlow...')
        StudioflowClient.schedule(project_id) do |schedule, error|
          Sketchup.set_status_text('')
          next UI.messagebox(StudioflowClient.explain(error)) if error
          next unless Sketchup.active_model == model

          apply_refresh(model, project_id, linked.select(&:valid?), schedule)
        end
      end

      def self.names_of(rows, limit = 10)
        "#{rows.first(limit).join(', ')}#{rows.length > limit ? ', ...' : ''}"
      end

      def self.apply_refresh(model, project_id, linked, schedule)
        entries = (schedule['entries'] || []).to_h { |row| [row['id'], row] }
        by_key = {}
        notes = Hash.new { |hash, key| hash[key] = [] }
        rows = linked.map do |material|
          by_key[material.entityID] = material
          entry = entries[linked_entry_id(material, project_id)]
          option_id = material.get_attribute(DICT, OPTION_KEY).to_s
          target = nil
          if entry
            state, final_label = LinkRules.link_status(entry['options'], option_id)
            notes[:not_final] << "#{material.name} (final: #{final_label})" if state == :not_final
            notes[:option_not_chosen] << material.name if state == :option_not_chosen
            notes[:option_missing] << material.name if state == :option_missing
            target = LinkRules.expected_name(entry['code'], entry['options'], option_id) || material.name
          end
          { key: material.entityID, name: material.name, target: target }
        end
        holders = model.materials.to_h { |material| [material.name, material.entityID] }
        plan = LinkRules.refresh_plan(rows, holders)
        others = model.materials.count { |material| !material.get_attribute(DICT, ENTRY_KEY).to_s.empty? && material.get_attribute(DICT, PROJECT_KEY).to_s != project_id }
        renames = plan[:renames].map { |row| [by_key[row[:key]], row[:target]] }

        summary = []
        summary << "#{renames.length} material diganti namanya:\n#{renames.first(15).map { |m, c| "• #{m.name} → #{c}" }.join("\n")}#{renames.length > 15 ? "\n• ..." : ''}" unless renames.empty?
        summary << "#{notes[:not_final].length} material memakai opsi yang BUKAN final: #{names_of(notes[:not_final])}" unless notes[:not_final].empty?
        summary << "#{notes[:option_not_chosen].length} material belum dipilih opsinya (item punya beberapa opsi; klik materialnya untuk memilih): #{names_of(notes[:option_not_chosen])}" unless notes[:option_not_chosen].empty?
        summary << "#{notes[:option_missing].length} material tertaut ke opsi yang sudah dihapus: #{names_of(notes[:option_missing])}" unless notes[:option_missing].empty?
        summary << "#{plan[:stale].length} material tertaut ke item yang sudah dihapus dari jadwal (nama dan tautan lama dibiarkan, klik materialnya untuk menautkan ulang): #{names_of(plan[:stale].map { |row| row[:name] })}" unless plan[:stale].empty?
        summary << "#{plan[:conflicts].length} dilewati karena namanya bentrok (dipakai material lain, atau beberapa material menuju nama yang sama): #{names_of(plan[:conflicts].map { |row| "#{row[:name]} → #{row[:target]}" })}" unless plan[:conflicts].empty?
        summary << "#{others} material tertaut ke proyek lain dan tidak dicek." if others.positive?
        return UI.messagebox('Semua material terhubung sudah sesuai jadwal.') if summary.empty?
        return UI.messagebox("Tidak ada nama yang diganti.\n\n#{summary.join("\n\n")}") if renames.empty?

        answer = UI.messagebox("Cek & perbarui kode dari jadwal:\n\n#{summary.join("\n\n")}\n\nGanti nama #{renames.length} material sekarang?", MB_YESNO)
        return unless answer == IDYES

        Undo.wrap('Perbarui kode dari jadwal') do
          # Temporary names first, so two codes can swap without a collision.
          renames.each_with_index { |(material, _code), index| material.name = "__studioflow_#{index}_#{material.entityID}" }
          renames.each do |material, name|
            entry = entries[linked_entry_id(material, project_id)]
            option = option_of(entry, material.get_attribute(DICT, OPTION_KEY).to_s)
            material.name = name
            material.set_attribute(DICT, CODE_KEY, entry['code'])
            material.set_attribute(DICT, TITLE_KEY, (option ? option['title'] : entry['title']).to_s)
            MaterialMetadata.apply_code(material, name)
          end
        end
        ModelScanner.invalidate_cache
        EventBus.publish(:data_changed)
        Sketchup.set_status_text("Kode diperbarui: #{renames.length} material")
      end
    end
  end
end
