module BerkahStudio
  module MaterialScheduler
    module EventBus
      @subs = Hash.new { |h, k| h[k] = [] }

      def self.subscribe(evt, &blk)
        @subs[evt] << blk
      end

      def self.clear(evt = nil)
        if evt
          @subs[evt] = []
        else
          @subs.clear
        end
      end

      def self.publish(evt, payload = {})
        @subs[evt].each do |blk|
          begin
            blk.call(payload)
          rescue => e
            Logger.warn(:event_bus_error, event: evt, message: e.message)
          end
        end
      end
    end
  end
end
