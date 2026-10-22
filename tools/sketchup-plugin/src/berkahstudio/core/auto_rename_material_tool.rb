# frozen_string_literal: true

module BerkahStudio
  module MaterialScheduler
    # Activate first, then click a painted surface and choose its category.
    class AutoRenameMaterialTool
      def self.activate
        Sketchup.active_model.select_tool(new)
      end

      def activate
        @cancelled = false
        @pending = false
        text = StudioflowClient.connected? ? 'Klik permukaan untuk memberi kode dari jadwal StudioFlow.' : 'Klik permukaan untuk memberi kode pada materialnya (belum tersambung ke StudioFlow).'
        Sketchup.set_status_text(text)
      end

      def deactivate(view)
        @cancelled = true
        Sketchup.set_status_text('')
      end

      def onCancel(reason, view)
        Sketchup.active_model.select_tool(nil)
      end

      def onLButtonDown(flags, x, y, view)
        return if @pending

        picker = view.pick_helper
        picker.do_pick(x, y)
        model = Sketchup.active_model
        material = MaterialOps.material_from_pick(picker, view, x, y, model)
        unless material
          Sketchup.set_status_text('Klik permukaan yang memiliki material; Esc untuk batal.')
          return
        end

        @pending = true
        # Leave the mouse callback before opening a modal dialog. Claim the
        # timer first because modal windows can re-enter one-shot timers.
        handled = false
        UI.start_timer(0.1, false) do
          next if handled
          handled = true
          next if @cancelled || Sketchup.active_model != model

          begin
            model.select_tool(nil)
            next unless material.valid?
            # Connected: the code comes from the Product Schedule. Offline: the old prefix picker, material not linked.
            if StudioflowClient.connected?(model)
              ScheduleLink.on_material(material, model)
            else
              MaterialOps.prompt_auto_rename(material, model)
            end
          rescue => error
            Logger.error(:material_picker_failed, message: error.message)
            UI.messagebox("Rename material gagal:\n#{error.message}")
          end
        end
      rescue => error
        @pending = false
        Logger.error(:material_picker_failed, message: error.message)
        Sketchup.set_status_text("Rename material gagal: #{error.message}")
      end
    end
  end
end
