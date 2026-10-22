require 'json'
require 'base64'
require 'uri'

module BerkahStudio
  module MaterialScheduler
    module ApiClient
      CONFIG_FILE = File.join(File.expand_path('../..', __FILE__), 'config.json')
      CREDENTIAL_NAMESPACE = 'BerkahStudio'.freeze
      CREDENTIAL_KEY = 'studioflow_api_key'.freeze
      @active_request = nil
      @config_cache = nil

      def self.get_config
        return @config_cache if @config_cache

        defaults = {
          'project_id' => '',
          'base_url' => 'http://localhost:3000',
          'server_url' => 'http://localhost:3000',
          'last_sync' => nil,
          'auto_sync' => false
        }
        data = {}
        if File.exist?(CONFIG_FILE)
          begin
            data = JSON.parse(File.read(CONFIG_FILE))
          rescue => e
            Logger.warn(:config_load_failed, message: e.message)
          end
        end

        legacy_api_key = data.delete('api_key').to_s.strip
        api_key = Sketchup.read_default(CREDENTIAL_NAMESPACE, CREDENTIAL_KEY, '').to_s.strip
        if api_key.empty? && !legacy_api_key.empty?
          Sketchup.write_default(CREDENTIAL_NAMESPACE, CREDENTIAL_KEY, legacy_api_key)
          api_key = legacy_api_key
          Logger.info(:api_key_migrated_to_preferences)
        end

        @config_cache = defaults.merge(data).merge('api_key' => api_key)
        # Remove legacy plaintext credentials from the distributable config file.
        write_config_file(@config_cache) unless legacy_api_key.empty?
        @config_cache
      end

      def self.save_config(config)
        api_key = config['api_key'].to_s.strip
        Sketchup.write_default(CREDENTIAL_NAMESPACE, CREDENTIAL_KEY, api_key)
        @config_cache = config.reject { |key, _| key == 'api_key' }.merge('api_key' => api_key)
        begin
          write_config_file(@config_cache)
          true
        rescue => e
          Logger.error(:config_save_failed, message: e.message)
          false
        end
      end

      def self.write_config_file(config)
        persisted = config.reject { |key, _| key == 'api_key' }
        File.write(CONFIG_FILE, JSON.pretty_generate(persisted))
      end

      def self.get_project_name
        model = Sketchup.active_model
        proj_name = model.get_attribute('BerkahStudio', 'project_name')
        if proj_name.nil? || proj_name.empty?
          path = model.path
          proj_name = path.empty? ? 'Untitled Model' : File.basename(path, '.*')
          model.set_attribute('BerkahStudio', 'project_name', proj_name) unless path.empty?
        end
        proj_name
      end

      def self.sync(on_success = nil, on_error = nil)
        if @active_request
          on_error.call('A StudioFlow sync is already in progress.') if on_error
          return
        end

        config = get_config
        api_key = config['api_key']
        if api_key.nil? || api_key.strip.empty?
          UI.messagebox("BerkahStudio: No API key configured. Please link this model from StudioFlow first.")
          on_error.call("No API key configured") if on_error
          return
        end

        server_url = config['server_url'] || config['base_url'] || 'http://localhost:3000'
        sync_endpoint = "#{server_url.chomp('/')}/api/sketchup/sync"

        # 1. Gather scan data
        scan_results = ModelScanner.scan(true) # force refresh scan

        # 2. Get active model name
        project_name = self.get_project_name

        # Only active, clean, registered material codes can enter StudioFlow.
        materials_payload = []
        scan_results[:materials][:coded].each do |code|
          details = scan_results[:materials][:details][code] || {}
          next if details[:uuid].to_s.strip.empty?

          materials_payload << {
            uuid: details[:uuid],
            code: code,
            area: details[:area] || 0.0,
            face_count: details[:face_count] || 0,
            backface_count: details[:backface_count] || 0,
            layers: details[:layers] || [],
            parents: details[:parents] || [],
            brand: details[:brand],
            product_name: details[:product_name],
            finish: details[:finish],
            location_notes: details[:location_notes],
            metadata: details[:metadata] || {}
          }
        end

        # FF&E follows the same rule: only components with clean codes sync.
        ffe_payload = []
        scan_results[:ffe][:coded].each do |code, details|
          ffe_payload << {
            code: code,
            instance_count: details[:instance_count] || 0,
            definition_names: details[:definition_names] || [],
            layers: details[:layers] || [],
            locations: details[:locations] || []
          }
        end
        # Swatches remain local until StudioFlow exposes a dedicated image endpoint.
        payload = {
          project_name: project_name,
          materials: materials_payload,
          ffe: ffe_payload
        }

        request = Sketchup::Http::Request.new(sync_endpoint, Sketchup::Http::POST)
        request.headers = {
          'Content-Type' => 'application/json',
          'Authorization' => "Bearer #{api_key}"
        }
        request.body = payload.to_json

        @active_request = request # Keep reference to prevent GC

        request.start do |req, response|
          begin
            if response.status_code == 200 || response.status_code == 201
              res_body = JSON.parse(response.body)
              if res_body['success']
                config['last_sync'] = Time.now.strftime('%Y-%m-%d %H:%M:%S')
                save_config(config)
                applied_merge_count = 0

                # Process pending merge commands from web
                merge_actions = res_body['merge_actions']
                if merge_actions.is_a?(Array) && !merge_actions.empty?
                  any_merged = false
                  executed_ids = []

                  merge_actions.each do |action|
                    action_id = action['id']
                    source = action['source']
                    target = action['target']
                    next unless source && target && action_id

                    success = MaterialOps.merge_materials(source, target)
                    if success
                      any_merged = true
                      executed_ids << action_id
                    end
                  end

                  if any_merged
                    applied_merge_count = executed_ids.length
                    # A successful merge does not authorize deleting unrelated unused materials.
                    ModelScanner.scan(true)
                    EventBus.publish(:data_changed)

                    # Confirm execution to server
                    confirm_endpoint = "#{server_url.chomp('/')}/api/sketchup/merge/confirm"
                    confirm_payload = {
                      projectId: res_body['projectId'],
                      actionIds: executed_ids
                    }.to_json

                    confirm_req = Sketchup::Http::Request.new(confirm_endpoint, Sketchup::Http::POST)
                    confirm_req.headers = {
                      'Content-Type' => 'application/json',
                      'Authorization' => "Bearer #{api_key}"
                    }
                    confirm_req.body = confirm_payload
                    confirm_req.start do |c_req, c_res|
                      if c_res && c_res.status_code >= 200 && c_res.status_code < 300
                        Logger.info(:merge_confirmed, message: "Confirmed #{executed_ids.length} merges.")
                      else
                        Logger.warn(:merge_confirm_failed, status: c_res&.status_code, count: executed_ids.length)
                      end
                    end
                  end
                end

                res_body['synced_material_count'] = materials_payload.length
                res_body['applied_merge_count'] = applied_merge_count
                on_success.call(res_body) if on_success
              else
                on_error.call(res_body['error'] || 'Server failed to process sync') if on_error
              end
            else
              on_error.call("HTTP Error: #{response.status_code}. Response: #{response.body.to_s[0, 100]}") if on_error
            end
          rescue => e
            on_error.call("Failed to parse sync response: #{e.message}") if on_error
          ensure
            @active_request = nil
          end
        end
      end

      def self.pull(on_success = nil, on_error = nil)
        config = get_config
        api_key = config['api_key']
        if api_key.nil? || api_key.strip.empty?
          UI.messagebox("BerkahStudio: No API key configured. Please link this model from StudioFlow first.")
          on_error.call("No API key configured") if on_error
          return
        end

        server_url = config['server_url'] || config['base_url'] || 'http://localhost:3000'

        project_name = self.get_project_name

        # Encode project name safely for query string
        escaped_project_name = URI.encode_www_form_component(project_name)
        pull_endpoint = "#{server_url.chomp('/')}/api/sketchup/sync?project_name=#{escaped_project_name}"

        request = Sketchup::Http::Request.new(pull_endpoint, Sketchup::Http::GET)
        request.headers = {
          'Authorization' => "Bearer #{api_key}"
        }
        @active_request = request

        request.start do |req, response|
          begin
            if response.status_code == 200 || response.status_code == 201
              res_body = JSON.parse(response.body)
              if res_body['success']
                on_success.call(res_body) if on_success
              else
                on_error.call(res_body['error'] || 'Server failed to process pull') if on_error
              end
            else
              on_error.call("HTTP Error: #{response.status_code}. Response: #{response.body.to_s[0, 100]}") if on_error
            end
          rescue => e
            on_error.call("Failed to parse pull response: #{e.message}") if on_error
          ensure
            @active_request = nil
          end
        end
      end
    end
  end
end
