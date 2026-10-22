module BerkahStudio
  module MaterialScheduler
    module WebLauncher

      # Opens the web schedule:
      # 1. Checks if web server is reachable
      # 2. Syncs model data (also receives any pending merge actions from web)
      # 3. Opens browser to the project page
      def self.open_web_schedule
        config       = ApiClient.get_config
        api_key      = config['api_key']
        if api_key.nil? || api_key.strip.empty?
          UI.messagebox("BerkahStudio: No API key configured. Please link this model from StudioFlow first.")
          return
        end
        project_id   = config['project_id']

        server_url   = config['server_url'] || config['base_url'] || 'http://localhost:3000'
        health_ep    = "#{server_url.chomp('/')}/api/health"

        Sketchup.status_text = 'Berkah Studio: Checking web server...'

        request = Sketchup::Http::Request.new(health_ep, Sketchup::Http::GET)
        request.headers = {
          'Authorization' => "Bearer #{api_key}"
        }

        request.start do |_req, response|
          begin
            if response && response.status_code == 200
              Sketchup.status_text = 'Berkah Studio: Syncing model data...'
              ApiClient.sync(
                lambda { |res|
                  pid = res['projectId'] || project_id
                  url        = "#{server_url.chomp('/')}/projects/#{pid}/sketchup"
                  Sketchup.status_text = 'Berkah Studio: Sync complete. Opening browser...'
                  UI.openURL(url)
                },
                lambda { |err|
                  UI.messagebox("Sync failed: #{err}\n\nOpening web schedule anyway.")
                  pid = project_id.to_s.empty? ? "" : "/projects/#{project_id}/sketchup"
                  UI.openURL("#{server_url.chomp('/')}#{pid}")
                }
              )
            else
              UI.messagebox(
                "Cannot reach StudioFlow at #{server_url}.\n\n" \
                "Check the server address and that StudioFlow is running."
              )
              Sketchup.status_text = 'Berkah Studio: Web server not reachable.'
            end
          rescue => e
            UI.messagebox("Connection error: #{e.message}")
            Sketchup.status_text = 'Berkah Studio: Connection failed.'
          end
        end
      end

      # Sync + Purge:
      # Called by the toolbar "Sync + Purge" button.
      # 1. Syncs model → web receives pending merge actions
      # 2. Merge actions are applied natively (MaterialOps.merge_code)
      # 3. Purges all unused materials from the model
      def self.sync_to_studioflow
        config     = ApiClient.get_config
        api_key    = config['api_key']
        if api_key.nil? || api_key.strip.empty?
          UI.messagebox("BerkahStudio: No API key configured. Please link this model from StudioFlow first.")
          return
        end

        server_url = config['server_url'] || config['base_url'] || 'http://localhost:3000'
        health_ep  = "#{server_url.chomp('/')}/api/health"

        Sketchup.status_text = 'Berkah Studio: Checking web server for pending changes...'

        request = Sketchup::Http::Request.new(health_ep, Sketchup::Http::GET)
        request.headers = {
          'Authorization' => "Bearer #{api_key}"
        }

        request.start do |_req, response|
          begin
            if response && response.status_code == 200
              Sketchup.status_text = 'Berkah Studio: Syncing material schedule...'

              ApiClient.sync(
                lambda { |res|
                  merge_count = res['applied_merge_count'] || 0
                  synced_count = res['synced_material_count'] || 0
                  ModelScanner.scan(true)

                  if merge_count > 0
                    Sketchup.status_text = "Berkah Studio: Synced #{synced_count} material(s); applied #{merge_count} merge(s)."
                    UI.messagebox(
                      "Sync complete.\n\n" \
                      "• Applied #{merge_count} material merge action(s) from web\n\n" \
                      "Unused materials were not deleted."
                    )
                  else
                    Sketchup.status_text = 'Berkah Studio: Model synced — no pending merges.'
                    UI.messagebox(
                      "Sync complete.\n\n" \
                      "• No pending merge actions from web\n\n" \
                      "Unused materials were not deleted."
                    )
                  end
                },
                lambda { |err|
                  Sketchup.status_text = 'Berkah Studio: Sync failed.'
                  UI.messagebox("Sync failed: #{err}")
                }
              )
            else
              UI.messagebox(
                "Cannot reach StudioFlow at #{server_url}.\n\n" \
                "Check the server address and that StudioFlow is running."
              )
              Sketchup.status_text = 'Berkah Studio: Web server not reachable.'
            end
          rescue => e
            UI.messagebox("Connection error: #{e.message}")
            Sketchup.status_text = 'Berkah Studio: Connection failed.'
          end
        end
      end

      # Kept for existing toolbar scripts and older UI builds.
      def self.sync_and_purge
        sync_to_studioflow
      end

    end
  end
end
