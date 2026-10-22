require 'set'

module BerkahStudio
  module MaterialScheduler
    module ModelScanner
      @cached_results = nil
      @last_scan_time = nil
      @cache_ttl = 15 # seconds

      def self.invalidate_cache
        @cached_results = nil
        @last_scan_time = nil
      end

      def self.generate_uuid
        hex = "0123456789abcdef"
        r = Array.new(36)
        36.times do |i|
          if i == 8 || i == 13 || i == 18 || i == 23
            r[i] = '-'
          elsif i == 14
            r[i] = '4'
          elsif i == 19
            r[i] = hex[rand(4) + 8]
          else
            r[i] = hex[rand(16)]
          end
        end
        r.join
      end

      def self.scan(force = false)
        if @cached_results && !force && @last_scan_time && (Time.now - @last_scan_time < @cache_ttl)
          return @cached_results
        end

        model = Sketchup.active_model
        registered_prefixes = PrefixRegistry.list

        # Material usage accumulator
        m_stats = Hash.new do |h, k|
          h[k] = { face_count: 0, backface_count: 0, area: 0.0, layers: Set.new, parents: Set.new }
        end

        # FF&E usage accumulator
        f_stats = Hash.new do |h, k|
          h[k] = { instance_count: 0, definition_names: Set.new, layers: Set.new, locations: Set.new }
        end

        # Uncoded components
        uncoded_f_stats = Hash.new do |h, k|
          h[k] = { instance_count: 0, layers: Set.new, locations: Set.new }
        end

        # Cache of definition-space material stats
        def_cache = {}

        # Helper to get area scale factor of a transformation matrix
        get_area_scale = lambda do |t|
          begin
            det = t.to_a[0] * (t.to_a[5] * t.to_a[10] - t.to_a[6] * t.to_a[9]) -
                  t.to_a[4] * (t.to_a[1] * t.to_a[10] - t.to_a[2] * t.to_a[9]) +
                  t.to_a[8] * (t.to_a[1] * t.to_a[6] - t.to_a[2] * t.to_a[5])
            det.abs ** (2.0 / 3.0)
          rescue
            1.0
          end
        end

        # Recursive scanner
        # Recursive scanner
        scan_entities = lambda do |entities, trans, parent_mat, parent_name, depth, current_m_stats|
          entities.each do |e|
            if e.is_a?(Sketchup::Face)
              # Calculate area in world coordinates
              area_sq_inch = 0.0
              begin
                area_sq_inch = e.area(trans)
              rescue
                area_sq_inch = e.area
              end
              area_sq_m = area_sq_inch * 0.00064516

              # Front material
              m = e.material || parent_mat
              m_name = (m && m.valid?) ? m.name : :default
              current_m_stats[m_name][:face_count] += 1
              current_m_stats[m_name][:area] += area_sq_m
              current_m_stats[m_name][:layers] << e.layer.name
              current_m_stats[m_name][:parents] << parent_name if parent_name

              # Back material
              mb = e.back_material
              if mb && mb.valid?
                mb_name = mb.name
                current_m_stats[mb_name][:backface_count] += 1
                current_m_stats[mb_name][:area] += area_sq_m
                current_m_stats[mb_name][:layers] << e.layer.name
                current_m_stats[mb_name][:parents] << parent_name if parent_name
              end

            elsif e.is_a?(Sketchup::Group)
              t = trans * e.transformation rescue trans
              m = e.material || parent_mat

              g_name = e.name.to_s.strip
              # Only count top-level groups as potential FF&E items (depth == 0)
              if depth == 0 && !g_name.empty?
                cleaned_code = RulesEngine.clean_product_code(g_name)
                if cleaned_code
                  f_stats[cleaned_code][:instance_count] += 1
                  f_stats[cleaned_code][:definition_names] << "Group: #{g_name}"
                  f_stats[cleaned_code][:layers] << e.layer.name
                else
                  uncoded_f_stats[g_name][:instance_count] += 1
                  uncoded_f_stats[g_name][:layers] << e.layer.name
                end
              end

              scan_entities.call(e.entities, t, m, g_name.empty? ? parent_name : g_name, depth + 1, current_m_stats)

            elsif e.is_a?(Sketchup::ComponentInstance)
              d = e.definition
              next unless d
              t = trans * e.transformation rescue trans
              m = e.material || parent_mat

              inst_name = e.name.to_s.strip
              def_name = d.name.to_s.strip
              # Instance name takes priority; fallback to definition name
              name_to_check = inst_name.empty? ? def_name : inst_name
              cleaned_code = RulesEngine.clean_product_code(name_to_check)

              # Only count top-level component instances as FF&E items (depth == 0)
              if depth == 0
                if cleaned_code
                  f_stats[cleaned_code][:instance_count] += 1
                  f_stats[cleaned_code][:definition_names] << def_name
                  f_stats[cleaned_code][:layers] << e.layer.name
                else
                  uncoded_f_stats[def_name][:instance_count] += 1
                  uncoded_f_stats[def_name][:layers] << e.layer.name
                end
              end

              if def_cache.key?(d)
                cached = def_cache[d]
                inst_t = begin; e.transformation; rescue; Geom::Transformation.new; end
                scale = get_area_scale.call(inst_t)

                cached[:explicit].each do |cached_m_name, c_stat|
                  current_m_stats[cached_m_name][:face_count] += c_stat[:face_count]
                  current_m_stats[cached_m_name][:backface_count] += c_stat[:backface_count]
                  current_m_stats[cached_m_name][:area] += c_stat[:area] * scale
                  current_m_stats[cached_m_name][:layers] << e.layer.name
                  current_m_stats[cached_m_name][:parents] << def_name
                end

                c_default = cached[:default]
                if c_default[:face_count] > 0 || c_default[:backface_count] > 0
                  inherited_m_name = (m && m.valid?) ? m.name : :default
                  current_m_stats[inherited_m_name][:face_count] += c_default[:face_count]
                  current_m_stats[inherited_m_name][:backface_count] += c_default[:backface_count]
                  current_m_stats[inherited_m_name][:area] += c_default[:area] * scale
                  current_m_stats[inherited_m_name][:layers] << e.layer.name
                  current_m_stats[inherited_m_name][:parents] << def_name
                end
              else
                # Isolate this definition's stats using a separate hash
                def_m_stats = Hash.new { |h, k| h[k] = { face_count: 0, backface_count: 0, area: 0.0, layers: Set.new, parents: Set.new } }

                scan_entities.call(d.entities, Geom::Transformation.new, nil, def_name, depth + 1, def_m_stats)

                explicit_cache = {}
                default_cache_entry = { face_count: 0, backface_count: 0, area: 0.0 }

                def_m_stats.each do |cached_m_name, c_stat|
                  if cached_m_name == :default
                    default_cache_entry[:face_count] = c_stat[:face_count]
                    default_cache_entry[:backface_count] = c_stat[:backface_count]
                    default_cache_entry[:area] = c_stat[:area]
                  else
                    explicit_cache[cached_m_name] = {
                      face_count: c_stat[:face_count],
                      backface_count: c_stat[:backface_count],
                      area: c_stat[:area]
                    }
                  end
                end

                def_cache[d] = {
                  explicit: explicit_cache,
                  default: default_cache_entry
                }

                # Restore and merge
                inst_t = begin; e.transformation; rescue; Geom::Transformation.new; end
                scale = get_area_scale.call(inst_t)
                def_m_stats.each do |cached_m_name, c_stat|
                  target_m_name = cached_m_name
                  if cached_m_name == :default
                    target_m_name = (m && m.valid?) ? m.name : :default
                  end

                  current_m_stats[target_m_name][:face_count] += c_stat[:face_count]
                  current_m_stats[target_m_name][:backface_count] += c_stat[:backface_count]
                  current_m_stats[target_m_name][:area] += c_stat[:area] * scale
                  current_m_stats[target_m_name][:layers] << e.layer.name
                  current_m_stats[target_m_name][:parents] << def_name
                end
              end
            end
          end
        end

        begin
          scan_entities.call(model.entities, Geom::Transformation.new, nil, nil, 0, m_stats)
        rescue => e
          Logger.error(:scan_failed, message: e.message, backtrace: e.backtrace.first(5))
        end

        # Classify materials into buckets
        coded_mats = []
        dirty_mats = []
        uncoded_mats = []
        unused_mats = []

        used_names = m_stats.keys.select { |k| k != :default }
        all_materials = model.materials.to_a

        all_materials.each do |m|
          name = m.name
          is_used = used_names.include?(name)

          # UUIDs identify a material across renames and merges.
          MaterialMetadata.ensure_uuid(m)

          if !is_used
            unused_mats << name
            next
          end

          # Determine bucket
          if RulesEngine.is_registered_code?(name, registered_prefixes)
            coded_mats << name
          elsif RulesEngine.format_valid?(name)
            uncoded_mats << name
          elsif (dirty_info = RulesEngine.parse_dirty(name))
            prefix = dirty_info[0]
            if registered_prefixes.key?(prefix)
              dirty_mats << name
            else
              uncoded_mats << name
            end
          else
            uncoded_mats << name
          end
        end

        # Format Material details
        materials_detail = {}
        m_stats.each do |m_name, stat|
          next if m_name == :default
          m = model.materials[m_name]
          uuid = m ? MaterialMetadata.ensure_uuid(m) : nil
          metadata = m ? MaterialMetadata.payload(m) : {}
          materials_detail[m_name] = {
            uuid: uuid,
            face_count: stat[:face_count],
            backface_count: stat[:backface_count],
            area: stat[:area].round(3),
            layers: stat[:layers].to_a,
            parents: stat[:parents].to_a,
            metadata: metadata,
            material_type: metadata['material_type'],
            product_name: metadata['product_name'],
            brand: metadata['brand'],
            finish: metadata['finish'],
            initials_type: metadata['initials_type'],
            location_notes: metadata['location_notes'],
            notes: metadata['notes'],
          display_description: metadata['display_description']
          }
        end

        # Junk is intentionally limited to materials used in the model. Unused
        # swatches remain in their own bucket so the renaming queue stays focused.
        junk_mats = (dirty_mats + uncoded_mats).sort
        junk_mats.each do |name|
          detail = materials_detail[name]
          next unless detail
          detail[:junk_reason] = if dirty_mats.include?(name)
                                   'Code format needs cleanup'
                                 elsif RulesEngine.format_valid?(name)
                                   'Prefix is not registered'
                                 else
                                   'Not a registered material code'
                                 end
        end

        # Format FF&E details
        ffe_detail = {}
        f_stats.each do |code, stat|
          ffe_detail[code] = {
            instance_count: stat[:instance_count],
            definition_names: stat[:definition_names].to_a,
            layers: stat[:layers].to_a,
            locations: stat[:locations].to_a
          }
        end

        uncoded_ffe_detail = {}
        uncoded_f_stats.each do |name, stat|
          uncoded_ffe_detail[name] = {
            instance_count: stat[:instance_count],
            layers: stat[:layers].to_a,
            locations: stat[:locations].to_a
          }
        end

        @cached_results = {
          materials: {
            coded: coded_mats.sort,
            dirty: dirty_mats.sort,
            uncoded: uncoded_mats.sort,
            junk: junk_mats,
            unused: unused_mats.sort,
            details: materials_detail
          },
          ffe: {
            coded: ffe_detail,
            uncoded: uncoded_ffe_detail
          }
        }
        @last_scan_time = Time.now
        @cached_results
      end

      # Identifies duplicate materials using name parsing and visual settings
      def self.detect_duplicates
        model = Sketchup.active_model
        mats = model.materials.to_a

        # Group by Cleaned Name
        by_name = Hash.new { |h, k| h[k] = [] }
        mats.each do |m|
          cleaned = m.name.downcase
                         .gsub(/copy|final|new|old|_temp|\(\d+\)/i, '')
                         .gsub(/\d+$/, '')
                         .gsub(/\s+/, '')
          next if cleaned.empty?
          by_name[cleaned] << m.name
        end
        name_duplicates = by_name.values.select { |arr| arr.size > 1 }

        # Group by Visual (Texture Path or Solid Color)
        by_visual = Hash.new { |h, k| h[k] = [] }
        mats.each do |m|
          begin
            if m.texture
              key = "tex_#{File.basename(m.texture.filename).downcase}"
            else
              c = m.color
              key = "col_#{c.red}_#{c.green}_#{c.blue}"
            end
            by_visual[key] << m.name
          rescue
            # Skip un-inspectable materials
          end
        end
        visual_duplicates = by_visual.values.select { |arr| arr.size > 1 }

        { name: name_duplicates, visual: visual_duplicates }
      end
    end
  end
end
