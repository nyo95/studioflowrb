require 'fileutils'

module BerkahStudio
  module MaterialScheduler
    module SyncService
      @timer = nil
      @auto_sync_timer = nil
      @selection_obs = nil
      @materials_obs = nil
      @materials_changed_obs = nil
      @app_obs = nil
      @debounce_sec = 0.25
      @sw_refresh_until = Time.at(0)
      AUTO_SYNC_AVAILABLE = false unless defined?(AUTO_SYNC_AVAILABLE)

      def self.start
        attach_listeners
        EventBus.subscribe(:data_changed) do
          SyncService.trigger_auto_sync
        end
      end

      def self.debounce(&blk)
        UI.stop_timer(@timer) if @timer
        @timer = UI.start_timer(@debounce_sec, false) { blk.call }
      end

      def self.attach_listeners
        model = Sketchup.active_model

        # 1. Selection Observer
        unless @selection_obs
          @selection_obs = Class.new do
            def onSelectionBulkChange(sel)
              SyncService.selection_changed(sel)
            end
            def onSelectionCleared(sel)
              SyncService.selection_changed(sel)
            end
            def onSelectionAdded(sel, element)
              SyncService.selection_changed(sel)
            end
            def onSelectionRemoved(sel, element)
              SyncService.selection_changed(sel)
            end
          end.new
        end
        model.selection.remove_observer(@selection_obs) rescue nil
        model.selection.add_observer(@selection_obs)

        # 2. Materials Observer (current material / color picker)
        unless @materials_obs
          @materials_obs = Class.new(Sketchup::MaterialsObserver) do
            def onMaterialSetCurrent(materials, material)
              SyncService.material_selected(material)
            end
          end.new
        end
        model.materials.remove_observer(@materials_obs) rescue nil
        model.materials.add_observer(@materials_obs)

        # 3. Materials Changed Observer (invalidate scanner cache on edit/add/delete)
        unless @materials_changed_obs
          @materials_changed_obs = Class.new(Sketchup::MaterialsObserver) do
            def onMaterialAdd(materials, material)
              ModelScanner.invalidate_cache
              EventBus.publish(:data_changed)
            end
            def onMaterialRemove(materials, material)
              ModelScanner.invalidate_cache
              EventBus.publish(:data_changed)
            end
            def onMaterialRefuse(materials, material)
              ModelScanner.invalidate_cache
              EventBus.publish(:data_changed)
            end
            def onMaterialChange(materials, material)
              ModelScanner.invalidate_cache
              EventBus.publish(:data_changed)
            end
          end.new
        end
        model.materials.remove_observer(@materials_changed_obs) rescue nil
        model.materials.add_observer(@materials_changed_obs)

        # 4. App Observer (re-bind on model change)
        unless @app_obs
          @app_obs = Class.new(Sketchup::AppObserver) do
            def onNewModel(model)
              SyncService.model_changed(model)
            end
            def onOpenModel(model)
              SyncService.model_changed(model)
            end
          end.new
        end
        Sketchup.remove_observer(@app_obs) rescue nil
        Sketchup.add_observer(@app_obs)
      end

      def self.model_changed(model)
        Logger.info(:model_changed, title: model.title)
        ModelScanner.invalidate_cache
        attach_listeners
        EventBus.publish(:data_changed)
      end

      def self.stop
        model = Sketchup.active_model
        model.selection.remove_observer(@selection_obs) rescue nil if @selection_obs
        model.materials.remove_observer(@materials_obs) rescue nil if @materials_obs
        model.materials.remove_observer(@materials_changed_obs) rescue nil if @materials_changed_obs
        Sketchup.remove_observer(@app_obs) rescue nil if @app_obs

        UI.stop_timer(@timer) if @timer
        @timer = nil

        UI.stop_timer(@auto_sync_timer) if @auto_sync_timer
        @auto_sync_timer = nil

        @selection_obs = nil
        @materials_obs = nil
        @materials_changed_obs = nil
        @app_obs = nil
      end

      def self.allow_swatch_refresh_window(seconds = 3)
        @sw_refresh_until = Time.now + seconds.to_f
      end

      def self.material_selected(material)
        return unless material && material.valid?
        sw = swatch_for(material)
        EventBus.publish(:selected_material_info, {
          name: material.name,
          swatch: sw
        })
      end

      def self.selection_changed(sel)
        debounce do
          # NOTE: We only notify that selection changed — we do NOT push
          # a hierarchy here because we only have the top-level entity from
          # selection, not the full pick path (Face → Group → Component).
          # The Picker Tool (picker_tool.rb) provides the full path via PickHelper.
          # Here we just signal "something changed" so the Inspector can clear itself
          # if the user de-selects in the viewport.
          if sel.empty?
            EventBus.publish(:selection_changed, { hierarchy: [] })
          end
          # When selection is non-empty, do nothing — let user explicitly use Picker.
        end
      end

      def self.swatch_for(mat)
        return nil unless mat && mat.valid?

        begin
          if mat.texture
            dir = File.join(File.expand_path('../..', __FILE__), 'ui', 'tmp')
            FileUtils.mkdir_p(dir) unless Dir.exist?(dir)

            # Use UUID or entityID to prevent swatch cache collision when material is renamed
            uuid = mat.get_attribute('BerkahStudio', 'uuid')
            safe_id = uuid ? uuid : mat.entityID.to_s
            path = File.join(dir, "swatch_#{safe_id}.png")

            # Refresh if within the refresh window or if swatch doesn't exist
            allow_refresh = Time.now <= @sw_refresh_until
            if !File.exist?(path) || allow_refresh
              begin
                mat.texture.write(path)
              rescue => e
                Logger.warn(:swatch_write_error, material: mat.name, message: e.message)
              end
            end

            stamp = File.exist?(path) ? File.mtime(path).to_i : Time.now.to_i
            # We return path relative to the berkahstudio/ folder
            return { kind: 'texture', path: "ui/tmp/swatch_#{safe_id}.png", stamp: stamp }
          else
            c = mat.color
            return { kind: 'color', rgba: [c.red, c.green, c.blue, (c.alpha || 255)], stamp: Time.now.to_i }
          end
        rescue => e
          Logger.warn(:swatch_generation_failed, material: mat.name, message: e.message)
          nil
        end
      end

      # Off until the StudioFlow sketchup module exists (WO-SKETCHUP-01 Stage 1b): the old
      # /api/sketchup/sync route is not part of StudioFlow, so an auto-sync could only fail.
      def self.trigger_auto_sync
        return unless AUTO_SYNC_AVAILABLE
        config = ApiClient.get_config
        return unless config['auto_sync'] == true

        UI.stop_timer(@auto_sync_timer) if @auto_sync_timer

        # Debounce for 3 seconds of inactivity
        @auto_sync_timer = UI.start_timer(3.0, false) do
          @auto_sync_timer = nil

          ApiClient.sync(
            lambda { |_res| },
            lambda { |_err| }
          )
        end
      end
    end
  end
end
