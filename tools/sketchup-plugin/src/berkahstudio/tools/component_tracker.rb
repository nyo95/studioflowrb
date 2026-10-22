# Maintained and loaded by the Berkah Studio extension.
require 'sketchup'
require 'json'
require 'cgi'
require 'digest/sha1'

module BK
  module ComponentTracker
    extend self

    PLUGIN_KEY = 'BKComponentTracker'.freeze
    MENU_NAME = 'BK Component Tracker'.freeze

    def activate
      register_menu
    end

    def register_menu
      return if @menu_loaded

      submenu = UI.menu('Plugins').add_submenu(MENU_NAME)
      submenu.add_item('Open Tracker Panel') { show_dialog }
      submenu.add_item('Rename Selected Component') { prompt_rename_selected_component }
      submenu.add_item('Refresh Tracker Report') { refresh_dialog }

      @menu_loaded = true
    end

    def show_dialog
      dialog.show
      refresh_dialog
    end

    def refresh_dialog
      payload = report_payload
      if @dialog && @dialog.visible?
        @dialog.execute_script("window.BKComponentTracker.render(#{JSON.generate(payload)});")
      end
      payload
    rescue => error
      UI.messagebox("BK Component Tracker error:\n#{error.message}")
      nil
    end

    def prompt_rename_selected_component
      instance = selected_component_instance
      return UI.messagebox('Pilih satu component instance dulu.') unless instance

      current_name = normalized_entity_name(instance)
      input = UI.inputbox(['Nama baru component definition'], [current_name], 'Rename Component')
      return unless input

      rename_selected_component(input[0])
    end

    def rename_selected_component(new_name)
      instance = selected_component_instance
      return UI.messagebox('Pilih satu component instance dulu.') unless instance

      sanitized_name = new_name.to_s.strip
      return UI.messagebox('Nama component tidak boleh kosong.') if sanitized_name.empty?

      definition = instance.definition
      old_name = normalized_entity_name(instance)
      model = Sketchup.active_model

      model.start_operation('Rename Component', true)
      definition.name = sanitized_name
      if instance.name.to_s.strip.empty? || instance.name == old_name
        instance.name = sanitized_name
      end
      model.commit_operation

      refresh_dialog
      true
    rescue => error
      model.abort_operation if model
      UI.messagebox("Rename gagal:\n#{error.message}")
      false
    end

    def rename_material_in_target(source_name, new_name)
      target = selected_target_entity
      return UI.messagebox('Pilih satu group atau component dulu.') unless target

      source = find_material_by_name(source_name)
      return UI.messagebox('Material sumber tidak ditemukan.') unless source

      sanitized_name = new_name.to_s.strip
      return UI.messagebox('Nama material baru tidak boleh kosong.') if sanitized_name.empty?

      unless target_uses_material?(target, source)
        return UI.messagebox('Material itu tidak dipakai di object yang sedang dipilih.')
      end

      model = Sketchup.active_model
      model.start_operation('Rename Material', true)
      source.name = sanitized_name
      model.commit_operation

      refresh_dialog
      true
    rescue => error
      model.abort_operation if model
      UI.messagebox("Rename material gagal:\n#{error.message}")
      false
    end

    def switch_material_in_target(source_name, target_name)
      target = selected_target_entity
      return UI.messagebox('Pilih satu group atau component dulu.') unless target

      source = find_material_by_name(source_name)
      replacement = find_material_by_name(target_name)

      return UI.messagebox('Material sumber tidak ditemukan.') unless source
      return UI.messagebox('Material target tidak ditemukan.') unless replacement
      return UI.messagebox('Material sumber dan target tidak boleh sama.') if source == replacement
      return UI.messagebox('Material itu tidak dipakai di object yang sedang dipilih.') unless target_uses_material?(target, source)

      model = Sketchup.active_model
      model.start_operation('Switch Material in Selected Object', true)
      prepare_target_for_local_edit(target)
      replace_material_in_entities(container_entities(target), source, replacement)
      target.material = replacement if target.material == source
      model.commit_operation

      refresh_dialog
      true
    rescue => error
      model.abort_operation if model
      UI.messagebox("Switch material failed:\n#{error.message}")
      false
    end


    def clear_material_in_target(source_name)
      target = selected_target_entity
      return UI.messagebox('Pilih satu group atau component dulu.') unless target

      source = find_material_by_name(source_name)
      return UI.messagebox('Material sumber tidak ditemukan.') unless source
      return UI.messagebox('Material itu tidak dipakai di object yang sedang dipilih.') unless target_uses_material?(target, source)

      model = Sketchup.active_model
      model.start_operation('Remove Material in Selected Object', true)
      prepare_target_for_local_edit(target)
      clear_material_in_entities(container_entities(target), source)
      target.material = nil if target.material == source
      model.commit_operation

      refresh_dialog
      true
    rescue => error
      model.abort_operation if model
      UI.messagebox("Remove material failed:\n#{error.message}")
      false
    end

    def hide_valid_materials_in_target
      target = selected_target_entity
      return UI.messagebox('Pilih satu group atau component dulu.') unless target
      return UI.messagebox('Restore hidden materials on this object before hiding again.') unless hidden_valid_ids(target).empty?

      model = Sketchup.active_model
      model.start_operation('Hide Valid Materials in Selected Object', true)
      prepare_target_for_local_edit(target)

      hidden_ids = []
      hide_valid_entities(container_entities(target), target.material, {}, hidden_ids)
      target.set_attribute(PLUGIN_KEY, 'hidden_valid_material_ids', JSON.generate(hidden_ids)) unless hidden_ids.empty?
      model.commit_operation

      UI.messagebox("Hidden #{hidden_ids.length} valid material item(s) in the selected object.")
      refresh_dialog
      true
    rescue => error
      model.abort_operation if model
      UI.messagebox("Hide valid materials failed:\n#{error.message}")
      false
    end

    def restore_valid_materials_in_target
      target = selected_target_entity
      return UI.messagebox('Pilih object yang sebelumnya di-hide dulu.') unless target

      ids = hidden_valid_ids(target)
      return UI.messagebox('Tidak ada material valid yang di-hide pada object ini.') if ids.empty?

      model = Sketchup.active_model
      restored = 0
      model.start_operation('Restore Valid Materials in Selected Object', true)
      entity_index(container_entities(target)).each do |id, entity|
        next unless ids.include?(id)
        entity.hidden = false if entity.valid?
        restored += 1
      end
      target.delete_attribute(PLUGIN_KEY, 'hidden_valid_material_ids')
      model.commit_operation

      UI.messagebox("Restored #{restored} item(s) in the selected object.")
      refresh_dialog
      true
    rescue => error
      model.abort_operation if model
      UI.messagebox("Restore valid materials failed:\n#{error.message}")
      false
    end

    private

    def dialog
      return @dialog if @dialog

      @dialog = UI::HtmlDialog.new(
        dialog_title: MENU_NAME,
        preferences_key: PLUGIN_KEY,
        scrollable: true,
        resizable: true,
        width: 920,
        height: 760,
        style: UI::HtmlDialog::STYLE_DIALOG
      )

      @dialog.set_html(dialog_html)
      @dialog.add_action_callback('ready') { |_context| refresh_dialog }
      @dialog.add_action_callback('refresh') { |_context| refresh_dialog }
      @dialog.add_action_callback('rename_component') { |_context, value| rename_selected_component(value) }
      @dialog.add_action_callback('switch_material') { |_context, source_name, target_name| switch_material_in_target(source_name, target_name) }
      @dialog.add_action_callback('remove_material') { |_context, source_name| clear_material_in_target(source_name) }
      @dialog.add_action_callback('hide_valid_materials') { |_context| hide_valid_materials_in_target }
      @dialog.add_action_callback('restore_valid_materials') { |_context| restore_valid_materials_in_target }

      @dialog
    end

    def report_payload
      target = selected_target_entity
      unless target
        return {
          ok: false,
          message: 'Pilih satu group atau component untuk mulai bekerja.'
        }
      end

      materials = material_report(target)
      component = selected_component_instance
      family = family_variant_payload(target)

      {
        ok: true,
        target: {
          type: entity_type_label(target),
          name: normalized_entity_name(target),
          material: material_name(target.material)
        },
        component: component_payload(component),
        family: family,
        materials: materials,
        material_count: materials.length,
        material_names: Sketchup.active_model.materials.map { |mat| material_name(mat) }.uniq.sort,
        has_component_selection: !component.nil?
      }
    end

    def component_payload(component)
      return nil unless component

      {
        definition_name: normalized_entity_name(component),
        instance_name: fallback_label(component.name, '(instance tanpa nama)'),
        instance_material: material_name(component.material),
        qty: all_component_instances.count { |item| item.definition == component.definition }
      }
    end

    def family_variant_payload(target)
      peers = all_trackable_entities
      family_key = family_key_for_entity(target)
      variant_key = variant_key_for_entity(target)
      family_matches = peers.select { |entity| family_key_for_entity(entity) == family_key }
      variant_matches = family_matches.select { |entity| variant_key_for_entity(entity) == variant_key }

      {
        family_name: inferred_family_name(target),
        family_key: family_key,
        variant_name: inferred_variant_name(target),
        variant_key: variant_key,
        family_qty: family_matches.length,
        variant_qty: variant_matches.length
      }
    end
    def material_report(target)
      stats = {}
      register_material_usage(stats, target.material, :target_container) unless target.material.nil?
      collect_material_usage(container_entities(target), stats)
      stats.map do |name, data|
        {
          name: name,
          status: data[:status],
          count: data[:count],
          where: format_usage_locations(data[:locations]),
          locations: data[:locations]
        }
      end.sort_by { |item| [-item[:count], item[:name]] }
    end

    def collect_material_usage(entities, stats, visited = {})
      entities.each do |entity|
        case entity
        when Sketchup::Face
          register_material_usage(stats, entity.material, :face_front) unless entity.material.nil?
          register_material_usage(stats, entity.back_material, :face_back) unless entity.back_material.nil?
        when Sketchup::Group
          register_material_usage(stats, entity.material, :group_container) unless entity.material.nil?
          collect_material_usage(entity.entities, stats, visited)
        when Sketchup::ComponentInstance
          next if entity.is_a?(Sketchup::Group)

          register_material_usage(stats, entity.material, :component_container) unless entity.material.nil?
          definition_key = safe_guid(entity.definition)
          next if visited[definition_key]

          collect_material_usage(entity.definition.entities, stats, visited.merge(definition_key => true))
        end
      end
    end

    def register_material_usage(stats, material, location_key)
      name = material_name(material)
      stats[name] ||= { count: 0, locations: Hash.new(0), status: material_status(material) }
      stats[name][:count] += 1
      stats[name][:locations][location_key] += 1
    end

    def material_status(material)
      return 'Unclassified' unless defined?(BerkahStudio::MaterialScheduler::RulesEngine)

      rules = BerkahStudio::MaterialScheduler::RulesEngine
      registry = BerkahStudio::MaterialScheduler::PrefixRegistry.list
      return 'Valid Code' if rules.is_registered_code?(material.name, registry)
      return 'Needs Cleanup' if rules.parse_dirty(material.name)

      'Junk'
    end

    def hidden_valid_ids(target)
      raw = target.get_attribute(PLUGIN_KEY, 'hidden_valid_material_ids', '[]')
      JSON.parse(raw.to_s).map(&:to_i)
    rescue JSON::ParserError, TypeError
      []
    end

    def prepare_target_for_local_edit(target)
      return target unless target.is_a?(Sketchup::ComponentInstance) && !target.is_a?(Sketchup::Group)
      return target unless target.definition.instances.length > 1

      target.make_unique
      target
    end

    def hide_valid_entities(entities, inherited_material, definition_stack, hidden_ids)
      entities.each do |entity|
        next unless entity.valid? && !entity.hidden?

        case entity
        when Sketchup::Face
          hide_entity(entity, hidden_ids) if valid_material_code?(entity.material || inherited_material)
        when Sketchup::Group
          hide_valid_entities(entity.entities, entity.material || inherited_material, definition_stack, hidden_ids)
        when Sketchup::ComponentInstance
          effective_material = entity.material || inherited_material
          if component_uses_only_valid_materials?(entity, effective_material, definition_stack)
            hide_entity(entity, hidden_ids)
          end
        end
      end
    end

    def component_uses_only_valid_materials?(instance, inherited_material, definition_stack)
      definition_key = safe_guid(instance.definition)
      return false if definition_stack[definition_key]

      instance.definition.entities.all? do |entity|
        entity_uses_only_valid_materials?(entity, inherited_material, definition_stack.merge(definition_key => true))
      end
    end

    def entity_uses_only_valid_materials?(entity, inherited_material, definition_stack)
      case entity
      when Sketchup::Face
        valid_material_code?(entity.material || inherited_material)
      when Sketchup::Group
        entity.entities.all? do |child|
          entity_uses_only_valid_materials?(child, entity.material || inherited_material, definition_stack)
        end
      when Sketchup::ComponentInstance
        component_uses_only_valid_materials?(entity, entity.material || inherited_material, definition_stack)
      else
        true
      end
    end

    def valid_material_code?(material)
      return false unless material
      return false unless defined?(BerkahStudio::MaterialScheduler::RulesEngine)

      rules = BerkahStudio::MaterialScheduler::RulesEngine
      registry = BerkahStudio::MaterialScheduler::PrefixRegistry.list
      rules.is_registered_code?(material.name, registry)
    end

    def hide_entity(entity, hidden_ids)
      entity.hidden = true
      hidden_ids << entity.persistent_id
    end

    def entity_index(entities, index = {}, definition_stack = {})
      entities.each do |entity|
        index[entity.persistent_id] = entity
        case entity
        when Sketchup::Group
          entity_index(entity.entities, index, definition_stack)
        when Sketchup::ComponentInstance
          definition_key = safe_guid(entity.definition)
          next if definition_stack[definition_key]
          entity_index(entity.definition.entities, index, definition_stack.merge(definition_key => true))
        end
      end
      index
    end

    def format_usage_locations(locations)
      labels = {
        target_container: 'Target',
        group_container: 'Group',
        component_container: 'Nested Component',
        face_front: 'Front Face',
        face_back: 'Back Face'
      }

      locations.keys.sort_by(&:to_s).map do |key|
        "#{labels[key] || key}: #{locations[key]}"
      end.join(', ')
    end

    def replace_material_in_entities(entities, source, replacement, visited = {})
      entities.each do |entity|
        case entity
        when Sketchup::Face
          entity.material = replacement if entity.material == source
          entity.back_material = replacement if entity.back_material == source
        when Sketchup::Group
          entity.material = replacement if entity.material == source
          replace_material_in_entities(entity.entities, source, replacement, visited)
        when Sketchup::ComponentInstance
          next if entity.is_a?(Sketchup::Group)

          entity.material = replacement if entity.material == source
          definition_key = safe_guid(entity.definition)
          next if visited[definition_key]

          replace_material_in_entities(entity.definition.entities, source, replacement, visited.merge(definition_key => true))
        end
      end
    end

    def clear_material_in_entities(entities, source, visited = {})
      entities.each do |entity|
        case entity
        when Sketchup::Face
          entity.material = nil if entity.material == source
          entity.back_material = nil if entity.back_material == source
        when Sketchup::Group
          entity.material = nil if entity.material == source
          clear_material_in_entities(entity.entities, source, visited)
        when Sketchup::ComponentInstance
          next if entity.is_a?(Sketchup::Group)

          entity.material = nil if entity.material == source
          definition_key = safe_guid(entity.definition)
          next if visited[definition_key]

          clear_material_in_entities(entity.definition.entities, source, visited.merge(definition_key => true))
        end
      end
    end

    def target_uses_material?(target, material)
      material_report(target).any? { |item| item[:name] == material_name(material) }
    end

    def find_material_by_name(name)
      return nil if name.to_s.strip.empty?

      Sketchup.active_model.materials.each do |material|
        return material if material_name(material) == name.to_s
      end
      nil
    end

    def purge_material_if_unused(material)
      model_materials = Sketchup.active_model.materials
      return unless model_materials.include?(material)
      return if material_used_in_model?(material)

      model_materials.remove(material)
    rescue
      nil
    end

    def material_used_in_model?(material)
      used = false
      scan_entities_for_material(Sketchup.active_model.entities, material) { used = true }
      used
    end

    def scan_entities_for_material(entities, material, visited = {}, &block)
      entities.each do |entity|
        case entity
        when Sketchup::Face
          if entity.material == material || entity.back_material == material
            yield
            return
          end
        when Sketchup::Group
          if entity.material == material
            yield
            return
          end
          scan_entities_for_material(entity.entities, material, visited, &block)
        when Sketchup::ComponentInstance
          next if entity.is_a?(Sketchup::Group)
          if entity.material == material
            yield
            return
          end
          definition_key = safe_guid(entity.definition)
          next if visited[definition_key]

          scan_entities_for_material(entity.definition.entities, material, visited.merge(definition_key => true), &block)
        end
      end
    end

    def all_component_instances
      results = []
      walk_instances(Sketchup.active_model.entities, results, {})
      results
    end

    def walk_instances(entities, results, trail)
      entities.each do |entity|
        case entity
        when Sketchup::ComponentInstance
          next if entity.is_a?(Sketchup::Group)

          results << entity
          child_key = safe_guid(entity.definition)
          next if trail[child_key]

          walk_instances(entity.definition.entities, results, trail.merge(child_key => true))
        when Sketchup::Group
          walk_instances(entity.entities, results, trail)
        end
      end
    end

    def all_trackable_entities
      results = []
      walk_trackable_entities(Sketchup.active_model.entities, results, {})
      results
    end

    def walk_trackable_entities(entities, results, trail)
      entities.each do |entity|
        case entity
        when Sketchup::Group
          results << entity
          walk_trackable_entities(entity.entities, results, trail)
        when Sketchup::ComponentInstance
          next if entity.is_a?(Sketchup::Group)

          results << entity
          child_key = safe_guid(entity.definition)
          next if trail[child_key]

          walk_trackable_entities(entity.definition.entities, results, trail.merge(child_key => true))
        end
      end
    end

    def selected_component_instance
      selection = Sketchup.active_model.selection.to_a.select do |entity|
        entity.is_a?(Sketchup::ComponentInstance) && !entity.is_a?(Sketchup::Group)
      end
      return nil unless selection.length == 1

      selection.first
    end

    def selected_target_entity
      selection = Sketchup.active_model.selection.to_a.select do |entity|
        entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)
      end
      return nil unless selection.length == 1

      selection.first
    end

    def container_entities(entity)
      return entity.entities if entity.is_a?(Sketchup::Group)
      entity.definition.entities
    end

    def entity_type_label(entity)
      entity.is_a?(Sketchup::Group) ? 'Group' : 'Component'
    end

    def family_key_for_entity(entity)
      Digest::SHA1.hexdigest(JSON.generate({
        base_name: normalized_family_name(entity),
        geometry: geometry_signature(entity)
      }))
    end

    def variant_key_for_entity(entity)
      Digest::SHA1.hexdigest(JSON.generate({
        family_key: family_key_for_entity(entity),
        materials: material_fingerprint(entity)
      }))
    end

    def inferred_family_name(entity)
      base = normalized_family_name(entity)
      return normalized_entity_name(entity) if base.empty?

      base.split.map(&:capitalize).join(' ')
    end

    def inferred_variant_name(entity)
      materials = material_fingerprint(entity)
      return 'Default' if materials.empty?

      materials.join(' + ')
    end

    def normalized_family_name(entity)
      name = normalized_entity_name(entity).downcase
      name = name.gsub(/#\d+/, ' ')
      name = name.gsub(/\b(copy|unique|mirrored|edited|edit|final|rev\d+|v\d+)\b/, ' ')
      name = name.gsub(/\b(red|green|blue|yellow|black|white|grey|gray|silver|gold|brown|orange)\b/, ' ')
      name = name.gsub(/[_\-]+/, ' ')
      name.gsub(/\s+/, ' ').strip
    end

    def geometry_signature(entity)
      counts = geometry_counts(container_entities(entity))
      bounds = entity.respond_to?(:bounds) ? entity.bounds : nil
      {
        type: entity_type_label(entity),
        faces: counts[:faces],
        edges: counts[:edges],
        nested_groups: counts[:groups],
        nested_components: counts[:components],
        width: rounded_number(bounds ? bounds.width : 0),
        height: rounded_number(bounds ? bounds.height : 0),
        depth: rounded_number(bounds ? bounds.depth : 0)
      }
    end

    def geometry_counts(entities, collector = nil, visited = {})
      collector ||= { faces: 0, edges: 0, groups: 0, components: 0 }

      entities.each do |entity|
        case entity
        when Sketchup::Face
          collector[:faces] += 1
        when Sketchup::Edge
          collector[:edges] += 1
        when Sketchup::Group
          collector[:groups] += 1
          geometry_counts(entity.entities, collector, visited)
        when Sketchup::ComponentInstance
          next if entity.is_a?(Sketchup::Group)

          collector[:components] += 1
          definition_key = safe_guid(entity.definition)
          next if visited[definition_key]

          geometry_counts(entity.definition.entities, collector, visited.merge(definition_key => true))
        end
      end

      collector
    end

    def material_fingerprint(entity)
      material_report(entity).map { |item| item[:name] }.reject { |name| name == '(none)' }.sort
    end
    def normalized_entity_name(entity)
      if entity.is_a?(Sketchup::Group)
        fallback_label(entity.name, "(Group ##{safe_guid(entity)})")
      else
        definition_name = entity.definition ? entity.definition.name : entity.name
        fallback_label(definition_name, "(Component ##{safe_guid(entity)})")
      end
    end

    def fallback_label(value, fallback)
      text = value.to_s.strip
      text.empty? ? fallback : text
    end

    def material_name(material)
      return '(none)' if material.nil?

      name = if material.respond_to?(:display_name)
               material.display_name.to_s
             else
               material.name.to_s
             end
      fallback_label(name, '(unnamed material)')
    end

    def safe_guid(entity)
      if entity.respond_to?(:guid) && entity.guid
        entity.guid
      elsif entity.respond_to?(:persistent_id)
        entity.persistent_id.to_s
      else
        entity.object_id.to_s
      end
    end

    def rounded_number(value)
      value.to_f.round(3)
    end

    def dialog_html
      <<~HTML
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>#{CGI.escapeHTML(MENU_NAME)}</title>
          <style>
            :root {
              --bg: #f3efe7;
              --panel: #fffdf8;
              --panel-soft: #f7f1e7;
              --ink: #1f2933;
              --muted: #61707d;
              --line: #d9d0c3;
              --accent: #1d6f5f;
              --accent-dark: #324a5f;
              --danger: #8b3a2e;
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 18px;
              font-family: "Segoe UI", Tahoma, sans-serif;
              background:
                radial-gradient(circle at top right, rgba(229, 184, 92, 0.18), transparent 28%),
                linear-gradient(180deg, #f6f2ea 0%, #ece6da 100%);
              color: var(--ink);
            }
            .wrap {
              max-width: 1040px;
              margin: 0 auto;
            }
            .hero, .panel {
              background: var(--panel);
              border: 1px solid var(--line);
              border-radius: 18px;
              box-shadow: 0 12px 30px rgba(31, 41, 51, 0.08);
            }
            .hero {
              padding: 24px;
              margin-bottom: 16px;
            }
            h1 {
              margin: 0 0 6px;
              font-size: 24px;
            }
            .sub {
              color: var(--muted);
              margin-bottom: 16px;
              font-size: 15px;
            }
            .actions {
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
              margin-bottom: 14px;
            }
            button {
              border: none;
              border-radius: 12px;
              padding: 11px 16px;
              background: var(--accent);
              color: white;
              cursor: pointer;
              font-weight: 700;
              font-size: 14px;
            }
            button.alt { background: var(--accent-dark); }
            button.warn { background: var(--danger); }
            button.small {
              padding: 8px 12px;
              border-radius: 10px;
              font-size: 13px;
            }
            input, select {
              width: 100%;
              border: 1px solid var(--line);
              border-radius: 12px;
              padding: 10px 12px;
              background: white;
              font-size: 14px;
            }
            .tabs {
              display: flex;
              gap: 10px;
              margin-top: 8px;
            }
            .tab-btn {
              background: #e9e0d3;
              color: var(--ink);
            }
            .tab-btn.active {
              background: var(--accent);
              color: white;
            }
            .tab-pane { display: none; }
            .tab-pane.active { display: block; }
            .stack {
              display: grid;
              gap: 16px;
            }
            .panel {
              padding: 0;
              overflow: hidden;
            }
            .panel-head {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 16px 18px;
              cursor: pointer;
              background: var(--panel);
            }
            .panel-head h2 {
              margin: 0;
              font-size: 18px;
            }
            .panel-meta {
              color: var(--muted);
              font-size: 13px;
            }
            .panel-body {
              padding: 0 18px 18px;
              border-top: 1px solid #efe5d8;
            }
            .panel.collapsed .panel-body { display: none; }
            .stats {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 12px;
            }
            .stat {
              padding: 14px;
              border-radius: 14px;
              background: var(--panel-soft);
              border: 1px solid #eee3d2;
            }
            .label {
              color: var(--muted);
              font-size: 12px;
              margin-bottom: 6px;
            }
            .value {
              font-size: 17px;
              font-weight: 700;
            }
            .form-grid {
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 10px;
              margin-top: 14px;
            }
            .row-grid {
              display: grid;
              grid-template-columns: 1.1fr 1fr auto;
              gap: 10px;
              align-items: end;
              margin-top: 14px;
            }
            .table-wrap {
              border: 1px solid #eee3d2;
              border-radius: 14px;
              overflow: hidden;
              background: white;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              text-align: left;
              padding: 10px 12px;
              border-bottom: 1px solid #f0e7db;
              vertical-align: top;
            }
            th {
              color: var(--muted);
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              background: #fbf8f2;
            }
            .empty {
              color: var(--muted);
              padding: 14px;
              border-radius: 14px;
              background: var(--panel-soft);
              margin-top: 14px;
            }
            .hint {
              color: var(--muted);
              font-size: 13px;
              margin-top: 10px;
            }
            .inline-actions {
              display: flex;
              gap: 8px;
              flex-wrap: wrap;
            }
            .material-status {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 999px;
              background: #eee3d2;
              color: var(--ink);
              font-size: 12px;
              font-weight: 700;
            }
            .material-status.valid-code { background: #dceee8; color: #1d6f5f; }
            .material-status.needs-cleanup { background: #fff0c2; color: #805400; }
            .material-status.junk { background: #f6ddd8; color: #8b3a2e; }
            @media (max-width: 760px) {
              .stats,
              .form-grid,
              .row-grid {
                grid-template-columns: 1fr;
              }
              .tabs,
              .actions {
                flex-direction: column;
              }
            }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="hero">
              <h1>BK Component Tracker</h1>
              <div class="sub">Pilih satu component untuk melihat family, variant, dan material di dalamnya. Tab Materials menandai material yang sudah valid, perlu dirapikan, atau masih junk.</div>
              <div class="actions">
                <button onclick="bk.refresh()">Refresh</button>
              </div>
              <div class="tabs">
                <button id="tab-component-btn" class="tab-btn active" onclick="bk.switchTab('component')">Component</button>
                <button id="tab-materials-btn" class="tab-btn" onclick="bk.switchTab('materials')">Materials</button>
              </div>
            </div>

            <div id="content"></div>
          </div>

          <script>
            const state = {
              tab: 'component',
              collapsed: {
                componentSummary: false,
                materialList: false,
                materialActions: false
              },
              payload: null
            };

            const bk = {
              refresh() { window.sketchup.refresh(); },
              switchTab(tab) {
                state.tab = tab;
                renderCurrent();
              },
              toggle(section) {
                state.collapsed[section] = !state.collapsed[section];
                renderCurrent();
              },
              renameComponent() {
                const value = document.getElementById('renameInput')?.value || '';
                window.sketchup.rename_component(value);
              },
              switchMaterial() {
                const source = document.getElementById('materialSource')?.value || '';
                const target = document.getElementById('materialTarget')?.value || '';
                window.sketchup.switch_material(source, target);
              },
              removeMaterial() {
                const source = document.getElementById('materialSource')?.value || '';
                window.sketchup.remove_material(source);
              },
              hideValidMaterials() {
                window.sketchup.hide_valid_materials();
              },
              restoreValidMaterials() {
                window.sketchup.restore_valid_materials();
              }
            };

            function escapeHtml(text) {
              return String(text)
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#039;');
            }

            function stat(label, value) {
              return `
                <div class="stat">
                  <div class="label">${label}</div>
                  <div class="value">${value}</div>
                </div>
              `;
            }

            function panel(id, title, meta, body) {
              const collapsed = state.collapsed[id];
              return `
                <div class="panel ${collapsed ? 'collapsed' : ''}">
                  <div class="panel-head" onclick="bk.toggle('${id}')">
                    <h2>${title}</h2>
                    <div class="panel-meta">${meta}</div>
                  </div>
                  <div class="panel-body">${body}</div>
                </div>
              `;
            }

            function renderMaterialOptions(names) {
              return (names || []).map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
            }

            function renderMaterialRows(items) {
              if (!items || items.length === 0) {
                return '<div class="empty">Belum ada material yang terdeteksi di object yang dipilih.</div>';
              }

              const rows = items.map((item) => `
                <tr>
                  <td>${escapeHtml(item.name)}</td>
                  <td><span class="material-status ${escapeHtml(String(item.status || '').toLowerCase().replaceAll(' ', '-'))}">${escapeHtml(item.status || 'Unclassified')}</span></td>
                  <td>${item.count}</td>
                  <td>${escapeHtml(item.where || '')}</td>
                </tr>
              `).join('');

              return `
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Current Material</th>
                        <th>Status</th>
                        <th>Used Count</th>
                        <th>Dipakai Di</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                  </table>
                </div>
              `;
            }

            function renderComponentTab(payload) {
              const component = payload.component;
              const target = payload.target;
              const family = payload.family;
              const renameBlock = `
                <div class="label">Rename Component</div>
                <div class="form-grid">
                  <input id="renameInput" type="text" value="${escapeHtml(component ? component.definition_name : '')}" placeholder="Masukkan nama baru component" ${component ? '' : 'disabled'} />
                  <button class="warn" onclick="bk.renameComponent()" ${component ? '' : 'disabled'}>Rename Selected</button>
                </div>
                <div class="hint">Rename hanya aktif jika yang dipilih adalah tepat satu component instance.</div>
              `;

              const summaryBody = `
                <div class="stats">
                  ${stat('Target Type', escapeHtml(target.type))}
                  ${stat('Target Name', escapeHtml(target.name))}
                  ${stat('Family', escapeHtml(family.family_name))}
                  ${stat('Family Qty', family.family_qty)}
                  ${stat('Variant', escapeHtml(family.variant_name))}
                  ${stat('Variant Qty', family.variant_qty)}
                  ${stat('Target Material', escapeHtml(target.material))}
                  ${stat('Family Rule', 'Geometry + base name, warna diabaikan')}
                  ${component ? stat('Definition Name', escapeHtml(component.definition_name)) : ''}
                  ${component ? stat('Instance Name', escapeHtml(component.instance_name)) : ''}
                  ${component ? stat('Instance Material', escapeHtml(component.instance_material)) : ''}
                  ${component ? stat('Definition Qty', component.qty) : ''}
                </div>
                <div class="hint">Contoh: item merah dan hijau dengan bentuk sama akan punya Family sama, tapi Variant berbeda.</div>
              `;

              return `
                <div class="stack">
                  ${panel('componentSummary', 'Selected Component', `${escapeHtml(target.name)}`, summaryBody)}
                  <div class="panel">
                    <div class="panel-body" style="display:block;padding-top:18px;border-top:none;">${renameBlock}</div>
                  </div>
                </div>
              `;
            }

            function renderMaterialsTab(payload) {
              const target = payload.target;
              const usedMaterialNames = payload.materials.map((item) => item.name);
              const usedOptions = renderMaterialOptions(usedMaterialNames);
              const targetOptions = renderMaterialOptions(payload.material_names);

              const listBody = `
                <div class="hint">Target aktif: ${escapeHtml(target.type)} - ${escapeHtml(target.name)}</div>
                ${renderMaterialRows(payload.materials)}
              `;

              const actionsBody = `
                <div class="row-grid">
                  <div>
                    <div class="label">Current Material</div>
                    <select id="materialSource">${usedOptions}</select>
                  </div>
                  <div>
                    <div class="label">Switch To</div>
                    <select id="materialTarget">${targetOptions}</select>
                  </div>
                  <div class="inline-actions">
                    <button class="small alt" onclick="bk.switchMaterial()">Switch</button>
                    <button class="small warn" onclick="bk.removeMaterial()">Remove</button>
                  </div>
                </div>
                <div class="inline-actions" style="margin-top:14px;">
                  <button class="small alt" onclick="bk.hideValidMaterials()">Hide Valid</button>
                  <button class="small" onclick="bk.restoreValidMaterials()">Restore</button>
                </div>
                <div class="hint">Switch dan Remove hanya berlaku pada group/component terpilih. Tidak mengubah atau menghapus material dari model secara global.</div>
              `;

              return `
                <div class="stack">
                  ${panel('materialList', 'Material List', `${payload.material_count} material`, listBody)}
                  ${panel('materialActions', 'Selected Object Actions', 'switch / remove / hide valid', actionsBody)}
                </div>
              `;
            }

            function renderCurrent() {
              const payload = state.payload;
              if (!payload) return;

              document.getElementById('tab-component-btn').classList.toggle('active', state.tab === 'component');
              document.getElementById('tab-materials-btn').classList.toggle('active', state.tab === 'materials');

              const content = document.getElementById('content');
              if (!payload.ok) {
                content.innerHTML = `<div class="panel"><div class="panel-body" style="display:block;padding-top:18px;border-top:none;"><div class="empty">${escapeHtml(payload.message)}</div></div></div>`;
                return;
              }

              content.innerHTML = state.tab === 'component'
                ? renderComponentTab(payload)
                : renderMaterialsTab(payload);

              const sourceSelect = document.getElementById('materialSource');
              if (sourceSelect && sourceSelect.options.length > 0 && !sourceSelect.value) {
                sourceSelect.value = payload.materials[0] ? payload.materials[0].name : '';
              }
            }

            window.BKComponentTracker = {
              render(payload) {
                state.payload = payload;
                renderCurrent();
              }
            };

            window.sketchup.ready();
          </script>
        </body>
        </html>
      HTML
    end
  end
end

# Loaded by Berkah Studio, which owns the consolidated Extensions menu.
