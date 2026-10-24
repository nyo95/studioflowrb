# frozen_string_literal: true

module FakeStudioflow
  Call = Struct.new(:method, :path, :body, :idempotency_key, keyword_init: true)

  class << self
    attr_reader :calls

    def install(client)
      @client = client
      @original_request = client.method(:request)
      reset!
      fake = self
      client.define_singleton_method(:request) do |method, path, body, idempotency_key = nil, &done|
        fake.request(method, path, body, idempotency_key, &done)
      end
    end

    def uninstall
      original = @original_request
      @client.define_singleton_method(:request) do |method, path, body, idempotency_key = nil, &done|
        original.call(method, path, body, idempotency_key, &done)
      end
    end

    def reset!
      @calls = []
      @responses = []
    end

    def enqueue(*envelopes)
      @responses.concat(envelopes)
    end

    def ok(data)
      { 'ok' => true, 'data' => data }
    end

    def error(code, safe_message)
      { 'ok' => false, 'error' => { 'kind' => 'request', 'code' => code, 'safeMessage' => safe_message } }
    end

    def network_error(message = 'connection lost')
      { '__network_error__' => message }
    end

    def request(method, path, body, idempotency_key, &done)
      @calls << Call.new(method: method, path: path, body: body, idempotency_key: idempotency_key)
      envelope = @responses.shift
      raise "No fake StudioFlow response queued for #{method} #{path}" unless envelope

      if envelope.key?('__network_error__')
        done.call(nil, { code: 'NETWORK', message: envelope['__network_error__'] })
      elsif envelope['ok'] == true
        done.call(envelope['data'], nil)
      else
        error = envelope.fetch('error')
        done.call(nil, { code: error.fetch('code'), message: error.fetch('safeMessage') })
      end
    end
  end
end
