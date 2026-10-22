module BerkahStudio
  module MaterialScheduler
    module Undo
      def self.wrap(op_name)
        model = Sketchup.active_model
        begin
          model.start_operation(op_name, true)
          res = yield
          model.commit_operation
          res
        rescue => e
          model.abort_operation
          Logger.error(:undo_wrap_abort, message: e.message, op: op_name)
          raise e
        end
      end
    end
  end
end
