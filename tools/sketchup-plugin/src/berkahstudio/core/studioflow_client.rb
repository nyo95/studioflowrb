# frozen_string_literal: true

require 'json'
require 'securerandom'

module BerkahStudio
  module MaterialScheduler
    # Talks to the StudioFlow SketchUp module (WO-SKETCHUP-01 Stage 1b, contract docs/apps/sketchup/CONTRACT.md).
    # The token is kept in SketchUp's preferences, never in the package; the project id is kept on the model.
    module StudioflowClient
      PREFS = 'BerkahStudio'.freeze
      TOKEN_KEY = 'studioflow_token'.freeze
      SERVER_KEY = 'studioflow_server'.freeze
      DEFAULT_SERVER = 'http://localhost:3001'.freeze
      API_PATH = '/api/integrations/v1/sketchup/'.freeze
      TOKEN_FORMAT = /\Asfk_[a-f0-9]{12}_[A-Za-z0-9_-]{43}\z/.freeze
      MODEL_DICT = 'BerkahStudio'.freeze
      @requests = []

      def self.server
        value = Sketchup.read_default(PREFS, SERVER_KEY, DEFAULT_SERVER).to_s.strip
        value.empty? ? DEFAULT_SERVER : value.chomp('/')
      end

      def self.token
        Sketchup.read_default(PREFS, TOKEN_KEY, '').to_s.strip
      end

      def self.save_connection(server, token)
        Sketchup.write_default(PREFS, SERVER_KEY, server.to_s.strip.chomp('/'))
        Sketchup.write_default(PREFS, TOKEN_KEY, token.to_s.strip)
      end

      def self.forget_token
        Sketchup.write_default(PREFS, TOKEN_KEY, '')
      end

      def self.valid_token?(value)
        !!(value.to_s.strip =~ TOKEN_FORMAT)
      end

      def self.project_id(model = Sketchup.active_model)
        model.get_attribute(MODEL_DICT, 'studioflow_project_id').to_s
      end

      def self.project_name(model = Sketchup.active_model)
        model.get_attribute(MODEL_DICT, 'studioflow_project_name').to_s
      end

      def self.connected?(model = Sketchup.active_model)
        valid_token?(token) && !project_id(model).empty?
      end

      def self.list_projects(&done)
        request(:get, 'projects', nil, &done)
      end

      def self.schedule(project_id, &done)
        request(:get, "projects/#{project_id}/schedule", nil, &done)
      end

      def self.resolve(project_id, entry_ids, &done)
        request(:post, "projects/#{project_id}/resolve", { entryIds: entry_ids }, &done)
      end

      # The Idempotency-Key makes a retried click safe: StudioFlow replays the first answer instead of a second item.
      def self.create_entry(project_id, section, category, confirm_new_category = false, &done)
        body = { section: section, category: category }
        body[:confirmNewCategory] = true if confirm_new_category
        request(:post, "projects/#{project_id}/entries", body, SecureRandom.uuid, &done)
      end

      # Calls back on the main thread, outside the HTTP callback, with (data, nil) or (nil, error).
      # error is { code:, message: }; a network failure has code 'NETWORK'.
      def self.request(method, path, body, idempotency_key = nil, &done)
        url = "#{server}#{API_PATH}#{path}"
        verb = method == :post ? Sketchup::Http::POST : Sketchup::Http::GET
        req = Sketchup::Http::Request.new(url, verb)
        headers = { 'Authorization' => "Bearer #{token}", 'Accept' => 'application/json' }
        headers['Content-Type'] = 'application/json' if body
        headers['Idempotency-Key'] = idempotency_key if idempotency_key
        req.headers = headers
        req.body = JSON.generate(body) if body
        @requests << req # keep a reference until it answers
        req.start do |_request, response|
          @requests.delete(req)
          data, error = parse(response)
          UI.start_timer(0, false) { finish(done, data, error) }
        end
      rescue => e
        Logger.error(:studioflow_request_failed, message: e.message)
        UI.start_timer(0, false) { done.call(nil, { code: 'NETWORK', message: e.message }) }
      end

      # A failure inside the follow-up (a rename refused by SketchUp, for example) is shown, not lost in a timer.
      def self.finish(done, data, error)
        done.call(data, error)
      rescue => e
        Logger.error(:studioflow_followup_failed, message: e.message)
        UI.messagebox("Berkah Studio: langkah setelah StudioFlow menjawab gagal:\n#{e.message}")
      end

      def self.parse(response)
        status = response ? response.status_code.to_i : 0
        return [nil, { code: 'NETWORK', message: "StudioFlow tidak bisa dihubungi di #{server}." }] if status.zero?

        payload = JSON.parse(response.body.to_s)
        return [payload['data'], nil] if payload['ok'] == true

        error = payload['error'] || {}
        [nil, { code: error['code'].to_s, message: (error['safeMessage'] || error['message'] || "HTTP #{status}").to_s }]
      rescue JSON::ParserError
        [nil, { code: 'BAD_RESPONSE', message: "StudioFlow menjawab HTTP #{status} yang tidak bisa dibaca." }]
      end

      # Plain words for the messages the user is most likely to meet.
      def self.explain(error)
        case error[:code]
        when 'NETWORK' then "#{error[:message]}\nPeriksa alamat server dan pastikan StudioFlow berjalan."
        when 'INTEGRATION_TOKEN_INVALID'
          "Token StudioFlow tidak berlaku lagi. Buat token baru di StudioFlow (Account > Integration tokens), lalu Sambung ke StudioFlow lagi."
        when 'MODULE_DISABLED', 'PERMISSION_DENIED', 'INTEGRATION_SCOPE_DENIED'
          "Akses ditolak StudioFlow (#{error[:code]}): #{error[:message]}\nModul SketchUp harus aktif dan token perlu izin SketchUp."
        else "#{error[:code]}: #{error[:message]}"
        end
      end
    end
  end
end
