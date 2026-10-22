# frozen_string_literal: true

require 'set'

module BerkahStudio
  module MaterialScheduler
    # Codes from the Product Schedule (WO-SKETCHUP-01 Stage 1b). StudioFlow allocates every code; a SketchUp material
    # is linked to its schedule item (project id + entry id stored on the material). Every link, rename, new item and
    # merge waits for the user's answer (decisions 11-13). Merging only touches this model, never the Schedule.
    module ScheduleLink
      DICT = 'BerkahStudio'.freeze
      ENTRY_KEY = 'studioflow_entry_id'.freeze
      PROJECT_KEY = 'studioflow_project_id'.freeze
      SECTION = 'MATERIAL'.freeze
      CHOOSE = '(pilih)'.freeze

      # SO-1, SO-001, so-01 and SO-01 are one code (decision 12): prefix case-insensitive, leading zeros ignored.
      def self.code_key(name)
        match = name.to_s.strip.match(/\A([A-Za-z]+)\s*-\s*0*(\d+)\z/)
        match ? "#{match[1].upcase}-#{match[2].to_i}" : nil
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

      def self.unlink(material)
        material.delete_attribute(DICT, ENTRY_KEY)
        material.delete_attribute(DICT, PROJECT_KEY)
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
        unless server =~ %r{\Ahttps?://}i
          UI.messagebox('Alamat StudioFlow harus diawali http:// atau https://')
          return
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
        linked = linked_entry_id(material, project_id)
        entry = linked && entries.find { |row| row['id'] == linked }
        if entry
          answer = UI.messagebox("Material \"#{material.name}\" terhubung ke #{entry_label(entry)}.\n\nGanti ke item lain?", MB_YESNO)
          return picker(material, model, project_id, schedule) if answer == IDYES

          return offer_merge(material, model, project_id, entry)
        end

        key = code_key(material.name)
        match = key && entries.find { |row| code_key(row['code']) == key }
        if match
          answer = UI.messagebox("Material \"#{material.name}\":\nIni #{entry_label(match)}?\n\nYes = hubungkan, No = pilih item lain, Cancel = batal.", MB_YESNOCANCEL)
          return link(material, model, project_id, match) if answer == IDYES
          return picker(material, model, project_id, schedule) if answer == IDNO

          return
        end
        picker(material, model, project_id, schedule)
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

        Sketchup.set_status_text('Berkah Studio: membuat item di StudioFlow...')
        StudioflowClient.create_entry(project_id, SECTION, category) do |created, error|
          Sketchup.set_status_text('')
          next UI.messagebox(StudioflowClient.explain(error)) if error
          next unless Sketchup.active_model == model && material.valid?

          link(material, model, project_id, { 'id' => created['entryId'], 'code' => created['code'], 'title' => '' })
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
        Undo.wrap('Kode dari jadwal') do
          material.set_attribute(DICT, ENTRY_KEY, entry['id'])
          material.set_attribute(DICT, PROJECT_KEY, project_id)
          taken = model.materials[code]
          material.name = code unless taken && taken != material
          MaterialMetadata.apply_code(material, code)
        end
        ModelScanner.invalidate_cache
        EventBus.publish(:data_changed)
        Sketchup.set_status_text("Material terhubung ke #{entry_label(entry)}")
        offer_merge(material, model, project_id, entry)
      end

      # ── Merge (decision 13) ──────────────────────────────────────────────────

      def self.offer_merge(material, model, project_id, entry)
        key = code_key(entry['code'])
        others = model.materials.select do |other|
          other != material && (linked_entry_id(other, project_id) == entry['id'] || code_key(other.name) == key)
        end
        if others.empty?
          return if material.name == entry['code']

          return UI.messagebox("Nama \"#{entry['code']}\" sudah dipakai material lain, jadi material ini terhubung tetapi namanya tetap \"#{material.name}\".")
        end

        counts = usage_counts(model, [material] + others)
        lines = ([material] + others).map { |row| "• #{row.name}: #{counts[row]} permukaan" }
        differs = others.any? { |other| look_of(other) != look_of(material) }
        warning = differs ? "\n\nPERHATIAN: tekstur/warnanya berbeda. Setelah digabung semua memakai tampilan \"#{material.name}\"." : ''
        answer = UI.messagebox("Ada #{others.length + 1} material untuk #{entry_label(entry)}:\n#{lines.join("\n")}#{warning}\n\nGabungkan jadi satu material \"#{entry['code']}\"? (bisa di-undo)", MB_YESNO)
        if answer != IDYES
          return if material.name == entry['code']

          return UI.messagebox("Material tidak digabung. Material ini terhubung ke #{entry['code']} tetapi namanya tetap \"#{material.name}\" karena nama itu dipakai material lain.")
        end

        Undo.wrap('Gabungkan material') do
          others.each do |other|
            MaterialOps.replace_material_in_entities(model.entities, other, material, Set.new)
            model.definitions.each do |definition|
              next if definition.image?

              MaterialOps.replace_material_in_entities(definition.entities, other, material, Set.new)
            end
            model.materials.remove(other)
          end
          material.name = entry['code'] unless material.name == entry['code']
          material.set_attribute(DICT, ENTRY_KEY, entry['id'])
          material.set_attribute(DICT, PROJECT_KEY, project_id)
          MaterialMetadata.apply_code(material, entry['code'])
        end
        ModelScanner.invalidate_cache
        EventBus.publish(:data_changed)
        Sketchup.set_status_text("#{others.length + 1} material digabung menjadi #{entry['code']}")
      end

      # Faces painted with each material, counted once per definition (not per copy).
      def self.usage_counts(model, materials)
        counts = Hash.new(0)
        wanted = materials.to_set
        tally = lambda do |entities|
          entities.each do |entity|
            next unless entity.is_a?(Sketchup::Face) || entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)

            counts[entity.material] += 1 if wanted.include?(entity.material)
            counts[entity.back_material] += 1 if entity.is_a?(Sketchup::Face) && wanted.include?(entity.back_material)
          end
        end
        tally.call(model.entities)
        model.definitions.each { |definition| tally.call(definition.entities) unless definition.image? }
        counts
      end

      def self.look_of(material)
        texture = material.texture
        [texture ? File.basename(texture.filename.to_s) : nil, material.color.to_a]
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

          apply_refresh(model, project_id, linked, rows.to_h { |row| [row['entryId'], row['code']] })
        end
      end

      def self.apply_refresh(model, project_id, linked, codes)
        renames = []
        gone = []
        linked.each do |material|
          next unless material.valid?

          code = codes[linked_entry_id(material, project_id)]
          if code.nil?
            gone << material
          elsif material.name != code
            renames << [material, code]
          end
        end
        return UI.messagebox('Semua kode material sudah sama dengan jadwal.') if renames.empty? && gone.empty?

        moving = renames.map(&:first).to_set
        blocked = renames.select { |material, code| (holder = model.materials[code]) && !moving.include?(holder) }
        renames -= blocked
        summary = []
        summary << "#{renames.length} material diganti namanya:\n#{renames.first(15).map { |m, c| "• #{m.name} → #{c}" }.join("\n")}#{renames.length > 15 ? "\n• ..." : ''}" unless renames.empty?
        summary << "#{gone.length} material tidak lagi terhubung (itemnya sudah tidak ada di jadwal): #{gone.first(10).map(&:name).join(', ')}" unless gone.empty?
        summary << "#{blocked.length} dilewati karena namanya dipakai material lain: #{blocked.map { |m, c| "#{m.name} → #{c}" }.join(', ')}" unless blocked.empty?
        answer = UI.messagebox("Perbarui kode dari jadwal?\n\n#{summary.join("\n\n")}", MB_YESNO)
        return unless answer == IDYES

        Undo.wrap('Perbarui kode dari jadwal') do
          # Temporary names first, so two codes can swap without a collision.
          renames.each_with_index { |(material, _code), index| material.name = "__studioflow_#{index}_#{material.entityID}" }
          renames.each do |material, code|
            material.name = code
            MaterialMetadata.apply_code(material, code)
          end
          gone.each { |material| unlink(material) }
        end
        ModelScanner.invalidate_cache
        EventBus.publish(:data_changed)
        Sketchup.set_status_text("Kode diperbarui: #{renames.length} material")
      end
    end
  end
end
