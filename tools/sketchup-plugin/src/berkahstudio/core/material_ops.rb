require 'set'

module BerkahStudio
  module MaterialScheduler
    module MaterialOps
      # Resolve the material on the clicked side of a face, including material
      # inherited from nested containers or the active editing path.
      def self.material_from_pick(picker, view, x, y, model)
        face = picker.picked_face
        return nil unless face && face.valid?

        index = (0...picker.count).find { |i| picker.path_at(i).last == face }
        return nil unless index

        path = picker.path_at(index)
        transform = model.edit_transform * picker.transformation_at(index)
        direction = view.pickray(x, y)[1].transform(transform.inverse)
        material = direction.dot(face.normal) > 0 ? face.back_material : face.material
        return material if material && material.valid?

        containers = (model.active_path || []) + path[0...-1]
        containers.reverse_each do |container|
          next unless container.respond_to?(:material)
          material = container.material
          return material if material && material.valid?
        end
        nil
      end

      def self.prompt_auto_rename(material, model)
        return false unless Sketchup.active_model == model && material.valid?

        options = PrefixRegistry.list.sort.map do |prefix, label|
          label = "HPL / #{label}" if prefix == 'PL'
          "#{prefix} - #{label}"
        end
        return UI.messagebox('Belum ada kategori material terdaftar.') if options.empty?

        # No category is preselected: pressing OK without choosing must not code the material as the first entry.
        placeholder = '(pilih kategori)'
        old_name = material.name
        input = UI.inputbox(
          ['Kategori material'], [placeholder], [([placeholder] + options).join('|')],
          "Rename Material: #{old_name}"
        )
        return false unless input
        return false unless Sketchup.active_model == model && material.valid?
        if input.first.to_s == placeholder
          UI.messagebox('Pilih kategori material dulu. Nama material tidak diubah.')
          return false
        end

        prefix = input.first.to_s.split(' - ', 2).first
        code = RulesEngine.make_code(prefix, next_available_number(prefix))
        success, error = rename(material.name, code)
        unless success
          UI.messagebox("Rename material gagal:\n#{error}")
          return false
        end

        UI.refresh_inspectors
        Sketchup.set_status_text("Material #{old_name} menjadi #{code}")
        true
      rescue => e
        Logger.error(:material_auto_rename_failed, message: e.message)
        UI.messagebox("Rename material gagal:\n#{e.message}")
        false
      end

      # Rename a material safely with collision checking
      def self.rename(old_name, new_name)
        model = Sketchup.active_model
        mat = model.materials[old_name]
        return false, "Material '#{old_name}' not found." unless mat

        new_name = new_name.to_s.strip
        return false, "New name cannot be empty." if new_name.empty?
        return true, "No change." if old_name == new_name

        # Check collision
        if model.materials[new_name]
          return false, "Material with name '#{new_name}' already exists."
        end

        # Renaming must be wrapped in undo
        begin
          Undo.wrap("Rename Material") do
            mat.name = new_name
            if RulesEngine.format_valid?(new_name) && PrefixRegistry.list.key?(RulesEngine.prefix_for_code(new_name))
              MaterialMetadata.apply_code(mat, new_name)
            else
              MaterialMetadata.clear_code(mat)
            end
          end
          ModelScanner.invalidate_cache
          EventBus.publish(:data_changed)
          Logger.info(:material_renamed, old: old_name, new: new_name)
          return true, nil
        rescue => e
          Logger.error(:material_rename_failed, message: e.message)
          return false, e.message
        end
      end

      # Swap names of two materials
      def self.swap(name_a, name_b)
        model = Sketchup.active_model
        mat_a = model.materials[name_a]
        mat_b = model.materials[name_b]
        return false, "Material '#{name_a}' or '#{name_b}' not found." unless mat_a && mat_b
        return true, "No change." if name_a == name_b

        begin
          Undo.wrap("Swap Materials") do
            # Use random suffix to prevent naming collisions during renaming steps
            tmp = "__swap_#{Time.now.to_i}_#{rand(10000)}"
            mat_a.name = tmp
            mat_b.name = name_a
            mat_a.name = name_b
          end
          ModelScanner.invalidate_cache
          EventBus.publish(:data_changed)
          Logger.info(:materials_swapped, a: name_a, b: name_b)
          return true, nil
        rescue => e
          Logger.error(:materials_swap_failed, message: e.message)
          return false, e.message
        end
      end

      # Purge unused materials in the model
      def self.purge_unused
        model = Sketchup.active_model
        begin
          Undo.wrap("Purge Unused Materials") do
            model.materials.purge_unused
          end
          ModelScanner.invalidate_cache
          EventBus.publish(:data_changed)
          Logger.info(:materials_purged)
          return true
        rescue => e
          Logger.error(:materials_purge_failed, message: e.message)
          return false
        end
      end

      # Merge materials: Replace all occurrences of source_code with target_code
      def self.merge_materials(source_code, target_code)
        model = Sketchup.active_model
        source_mat = model.materials[source_code]
        target_mat = model.materials[target_code]

        canonical_target = RulesEngine.canonical(target_code)
        return false unless canonical_target && PrefixRegistry.list.key?(RulesEngine.prefix_for_code(canonical_target))
        return true if source_mat == target_mat

        if source_mat.nil?
          Logger.warn(:merge_materials_skip, message: "Source material #{source_code} not found in model.")
          return false
        end

        begin
          Undo.wrap("Merge Materials") do
            if target_mat.nil?
              source_mat.name = canonical_target
              MaterialMetadata.apply_code(source_mat, canonical_target)
              Logger.info(:merge_materials_rename_only, source: source_code, target: canonical_target)
            else
              seen_defs = Set.new
              replace_material_in_entities(model.entities, source_mat, target_mat, seen_defs)
              model.definitions.each do |definition|
                next if definition.image? || seen_defs.include?(definition)
                seen_defs << definition
                replace_material_in_entities(definition.entities, source_mat, target_mat, seen_defs)
              end
              model.materials.remove(source_mat)
              Logger.info(:merge_materials_replaced, source: source_code, target: canonical_target)
            end
          end

          ModelScanner.invalidate_cache
          EventBus.publish(:data_changed)
          return true
        rescue => e
          Logger.error(:merge_materials_failed, message: e.message)
          return false
        end
      end

      # Clears backface material assignments
      def self.clear_backfaces(material_name = nil)
        model = Sketchup.active_model
        target_mat = material_name ? model.materials[material_name] : nil

        begin
          Undo.wrap("Clear Backfaces") do
            seen_defs = Set.new
            clear_in_entities = lambda do |entities|
              entities.each do |e|
                next unless e.valid?
                if e.is_a?(Sketchup::Face)
                  if e.back_material
                    if target_mat.nil? || e.back_material == target_mat
                      e.back_material = nil
                    end
                  end
                elsif e.is_a?(Sketchup::Group)
                  clear_in_entities.call(e.entities)
                elsif e.is_a?(Sketchup::ComponentInstance)
                  d = e.definition
                  next if seen_defs.include?(d)
                  seen_defs << d
                  clear_in_entities.call(d.entities)
                end
              end
            end
            clear_in_entities.call(model.entities)
          end
          ModelScanner.invalidate_cache
          EventBus.publish(:data_changed)
          Logger.info(:backfaces_cleared, target: material_name)
          return true
        rescue => e
          Logger.error(:clear_backfaces_failed, message: e.message)
          return false
        end
      end

      # Selects all entities in the viewport using the given material name
      def self.select_in_model(material_name)
        model = Sketchup.active_model
        m = model.materials[material_name]
        return false unless m

        sel = model.selection
        sel.clear

        def_uses_mat = {}

        scan = lambda do |entities, parent_material|
          entities.each do |e|
            if e.is_a?(Sketchup::Face)
              face_mat = e.material || parent_material
              face_back_mat = e.back_material
              if face_mat == m || face_back_mat == m
                sel.add(e)
              end
            elsif e.is_a?(Sketchup::Group)
              group_mat = e.material || parent_material
              if group_mat == m
                sel.add(e)
              end
              scan.call(e.entities, group_mat)
            elsif e.is_a?(Sketchup::ComponentInstance)
              inst_mat = e.material || parent_material
              if inst_mat == m
                sel.add(e)
              end
              d = e.definition
              if d
                unless def_uses_mat.key?(d)
                  def_uses_mat[d] = d.entities.any? do |ce|
                    (ce.respond_to?(:material) && ce.material == m) ||
                    (ce.respond_to?(:back_material) && ce.back_material == m)
                  end
                end
                sel.add(e) if def_uses_mat[d]
              end
            end
          end
        end

        scan.call(model.entities, nil)
        Logger.info(:selected_in_model, material: material_name, count: sel.length)
        true
      end

      # Find the next unused tag number for a given prefix (e.g. PT-3 -> next is PT-4)
      def self.next_available_number(prefix)
        prefix = prefix.to_s.upcase.strip
        raise ArgumentError, 'Choose a registered material category first.' unless PrefixRegistry.list.key?(prefix)

        model = Sketchup.active_model
        numbers = Set.new

        # Scan all materials currently in the model to find numbers associated with this prefix
        model.materials.each do |m|
          name = m.name
          # Check if coded e.g. "PT-1" or dirty e.g. "PT-1 copy"
          if name =~ /^#{Regexp.escape(prefix)}\s*-\s*(\d+)(.*)$/i
            numbers << $1.to_i
          end
        end

        if numbers.empty?
          1
        else
          numbers.max + 1
        end
      end

      # Apply pulled materials mapping (uuid -> code) to SketchUp model
      def self.apply_pull_data(materials_list)
        model = Sketchup.active_model
        return 0, "No materials list provided" unless materials_list.is_a?(Array)

        # 1. Build a map of target states from web
        web_map = {}
        materials_list.each do |m_data|
          uuid = m_data['uuid']
          code = m_data['code']
          next unless uuid && code
          web_map[uuid] = code
        end

        # 2. Match SketchUp materials by UUID
        to_rename = [] # Array of [material, target_code]

        model.materials.each do |m|
          uuid = m.get_attribute('BerkahStudio', 'uuid')
          next unless uuid && web_map.key?(uuid)

          target_code = web_map[uuid]

          # Check if code changed
          if m.name != target_code
            to_rename << [m, target_code]
          end
        end

        return 0, nil if to_rename.empty?

        renamed_count = 0
        begin
          Undo.wrap("Pull Cloud Swaps") do
            # First pass: Rename to temporary names to avoid collisions (e.g. swapping PT-01 and PT-02)
            to_rename.each do |m, target_code|
              temp_name = "__temp_pull_#{m.get_attribute('BerkahStudio', 'uuid')}_#{rand(10000)}"
              m.name = temp_name
            end

            # Second pass: Rename to final target codes
            to_rename.each do |m, target_code|
              m.name = target_code
              renamed_count += 1
            end
          end

          SyncService.allow_swatch_refresh_window(3)
          ModelScanner.invalidate_cache
          EventBus.publish(:data_changed)
          Logger.info(:pull_applied, count: renamed_count)
          return renamed_count, nil
        rescue => e
          Logger.error(:pull_apply_failed, message: e.message)
          return 0, e.message
        end
      end

      # Shared helper to replace one material with another in the model
      def self.replace_material_in_entities(entities, old_mat, new_mat, seen_defs = Set.new)
        entities.each do |e|
          next unless e.valid?
          if e.is_a?(Sketchup::Face)
            e.material = new_mat if e.material == old_mat
            e.back_material = new_mat if e.back_material == old_mat
          elsif e.is_a?(Sketchup::Group)
            e.material = new_mat if e.material == old_mat
            replace_material_in_entities(e.entities, old_mat, new_mat, seen_defs)
          elsif e.is_a?(Sketchup::ComponentInstance)
            e.material = new_mat if e.material == old_mat
            d = e.definition
            next if seen_defs.include?(d)
            seen_defs << d
            replace_material_in_entities(d.entities, old_mat, new_mat, seen_defs)
          end
        end
      end

      # Merge dirty material into clean material
      def self.merge_dirty_to_clean(dirty_name, clean_name)
        return false, "Dirty material '#{dirty_name}' not found." unless Sketchup.active_model.materials[dirty_name]
        return false, "Clean material '#{clean_name}' not found." unless Sketchup.active_model.materials[clean_name]

        success = merge_materials(dirty_name, clean_name)
        success ? [true, nil] : [false, "Could not merge '#{dirty_name}' into '#{clean_name}'."]
      end

      # Absorb source code into target code
      def self.merge_code(source_code, target_code)
        return false, "Source material '#{source_code}' not found." unless Sketchup.active_model.materials[source_code]

        success = merge_materials(source_code, target_code)
        success ? [true, nil] : [false, "Could not merge '#{source_code}' into '#{target_code}'."]
      end
    end
  end
end
