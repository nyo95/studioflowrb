# init.rb - Main Loader and Menu Registrations for Berkah Studio Plugin

module BerkahStudio
  module MaterialScheduler
    ROOT = File.expand_path('..', __FILE__) unless defined?(ROOT)
  end
end

# Require support utilities first
require_relative 'core/logger'
require_relative 'core/undo'
require_relative 'core/event_bus'
require_relative 'core/rules_engine'
require_relative 'core/prefix_registry'
require_relative 'core/material_metadata'

# Require scanner, operations and sync support
require_relative 'core/model_scanner'
require_relative 'core/web_launcher'
require_relative 'core/material_ops'
require_relative 'core/auto_rename_material_tool'
require_relative 'core/studioflow_client'
require_relative 'core/schedule_link'
require_relative 'core/csv_exporter'

# Require observers and API client
require_relative 'core/sync_service'
require_relative 'core/api_client'

# Consolidated tools: keep their proven engines, but expose them from one menu.
require_relative 'tools/component_tracker'
require_relative 'tools/wall_finish_plan'

# Menu registration and startup
unless file_loaded?(__FILE__)
  menu = UI.menu('Extensions').add_submenu('Berkah Studio')

  # ── Primary Tools ──────────────────────────────────────────────────────────
  menu.add_item('Component Tracker') {
    BK::ComponentTracker.show_dialog
  }
  menu.add_item('Auto-Rename Material...') {
    BerkahStudio::MaterialScheduler::AutoRenameMaterialTool.activate
  }
  menu.add_item('Generate Wall Finish Labels') {
    BK::WallFinishPlan.generate_labels_from_selection
  }
  menu.add_item('Edit Wall Finish Material Info') {
    BK::WallFinishPlan.edit_selected_material_info
  }
  menu.add_item('Clear Wall Finish Labels') {
    BK::WallFinishPlan.clear_generated_labels
  }

  # ── StudioFlow (WO-SKETCHUP-01 Stage 1b) ───────────────────────────────────
  menu.add_separator
  menu.add_item('Sambung ke StudioFlow...') {
    BerkahStudio::MaterialScheduler::ScheduleLink.connect
  }
  menu.add_item('Perbarui kode dari jadwal') {
    BerkahStudio::MaterialScheduler::ScheduleLink.refresh_codes
  }
  menu.add_item('Putuskan sambungan StudioFlow') {
    BerkahStudio::MaterialScheduler::ScheduleLink.disconnect
  }

  menu.add_separator
  menu.add_item('Reload Plugin') {
    BerkahStudio::MaterialScheduler.reload
  }

  file_loaded(__FILE__)
end

module BerkahStudio
  module MaterialScheduler
    def self.ensure_toolbar
      return @toolbar if @toolbar
      tb = UI::Toolbar.new('Berkah Studio')

      icons_dir = File.join(ROOT, 'icons')

      cmd_components = UI::Command.new('Components') { BK::ComponentTracker.show_dialog }
      cmd_components.tooltip = 'Component Tracker - inspect family, variant, and nested materials'
      cmd_components.status_bar_text = 'Open the component tracker for the selected object.'
      cmd_components.small_icon = File.join(icons_dir, 'audit.png')
      cmd_components.large_icon = File.join(icons_dir, 'audit.png')

      cmd_auto_rename = UI::Command.new('Auto-Rename') {
        AutoRenameMaterialTool.activate
      }
      cmd_auto_rename.tooltip = 'Auto-Rename Material — click a surface; the code comes from the StudioFlow schedule'
      cmd_auto_rename.status_bar_text = 'Klik permukaan: pilih item jadwal StudioFlow (atau kategori kalau belum tersambung).'
      cmd_auto_rename.small_icon = File.join(icons_dir, 'code.png')
      cmd_auto_rename.large_icon = File.join(icons_dir, 'code.png')

      # Wall finish labels share the same maintained engine as the menu.
      cmd_web = UI::Command.new('Wall Labels') {
        BK::WallFinishPlan.generate_labels_from_selection
      }
      cmd_web.tooltip = 'Wall Finish Labels - generate labels from selected wall faces'
      cmd_web.status_bar_text = 'Create wall finish labels from the current selection.'
      cmd_web.small_icon = File.join(icons_dir, 'code.png')
      cmd_web.large_icon = File.join(icons_dir, 'code.png')

      tb.add_item(cmd_components)
      tb.add_item(cmd_auto_rename)
      tb.add_item(cmd_web)
      tb.show
      @toolbar = tb
    end

    # Hot-reload helper — call from Ruby Console:
    #   BerkahStudio::MaterialScheduler.reload
    def self.reload
      SyncService.stop   rescue nil
      EventBus.clear     rescue nil
      ModelScanner.invalidate_cache rescue nil

      load File.join(ROOT, 'core/logger.rb')
      load File.join(ROOT, 'core/undo.rb')
      load File.join(ROOT, 'core/event_bus.rb')
      load File.join(ROOT, 'core/rules_engine.rb')
      load File.join(ROOT, 'core/prefix_registry.rb')
      load File.join(ROOT, 'core/material_metadata.rb')
      load File.join(ROOT, 'core/model_scanner.rb')
      load File.join(ROOT, 'core/web_launcher.rb')
      load File.join(ROOT, 'core/material_ops.rb')
      load File.join(ROOT, 'core/auto_rename_material_tool.rb')
      load File.join(ROOT, 'core/studioflow_client.rb')
      load File.join(ROOT, 'core/schedule_link.rb')
      load File.join(ROOT, 'core/csv_exporter.rb')
      load File.join(ROOT, 'core/sync_service.rb')
      load File.join(ROOT, 'core/api_client.rb')
      load File.join(ROOT, 'tools/component_tracker.rb')
      load File.join(ROOT, 'tools/wall_finish_plan.rb')

      SyncService.start
      Logger.info(:plugin_reloaded)
      puts '[BerkahStudio] Reload complete.'
    end
  end
end

# Bootstrap
BerkahStudio::MaterialScheduler::SyncService.start
BerkahStudio::MaterialScheduler::ensure_toolbar
BerkahStudio::MaterialScheduler::Logger.info(:plugin_initialized)
