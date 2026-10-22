require 'json'
require 'securerandom'

module BerkahStudio
  module MaterialScheduler
    # Keeps schedule data independent from the SketchUp material name.
    module MaterialMetadata
      DICTIONARY = 'BerkahStudio'.freeze
      UUID_KEY = 'uuid'.freeze
      SCHEDULE_KEY = 'material_schedule'.freeze
      FIELDS = %w[
        material_type
        product_name
        brand
        finish
        initials_type
        location_notes
        notes
      ].freeze

      def self.ensure_uuid(material)
        uuid = material.get_attribute(DICTIONARY, UUID_KEY).to_s.strip
        return uuid unless uuid.empty?

        uuid = SecureRandom.uuid
        material.set_attribute(DICTIONARY, UUID_KEY, uuid)
        uuid
      end

      def self.read(material)
        raw = material.get_attribute(DICTIONARY, SCHEDULE_KEY, '{}')
        data = raw.is_a?(Hash) ? raw : JSON.parse(raw.to_s)
        data.is_a?(Hash) ? data.transform_keys(&:to_s) : {}
      rescue JSON::ParserError, TypeError
        {}
      end

      def self.write(material, patch)
        data = read(material)

        FIELDS.each do |field|
          next unless patch.key?(field) || patch.key?(field.to_sym)

          value = patch[field] || patch[field.to_sym]
          value = value.to_s.strip unless value.nil?
          value.nil? || value.empty? ? data.delete(field) : data[field] = value
        end

        data['updated_at'] = Time.now.utc.strftime('%Y-%m-%dT%H:%M:%SZ')
        material.set_attribute(DICTIONARY, SCHEDULE_KEY, JSON.generate(data))
        data
      end

      def self.apply_code(material, code)
        base, suffix = RulesEngine.split_suffix(code)
        canonical = RulesEngine.canonical(base)
        return read(material) unless canonical

        canonical += suffix

        prefix = RulesEngine.prefix_for_code(canonical)
        data = read(material)
        data['code'] = canonical
        data['prefix'] = prefix
        data['material_type'] ||= PrefixRegistry.category_for(prefix)
        data['updated_at'] = Time.now.utc.strftime('%Y-%m-%dT%H:%M:%SZ')
        material.set_attribute(DICTIONARY, SCHEDULE_KEY, JSON.generate(data))
        data
      end

      def self.clear_code(material)
        data = read(material)
        data.delete('code')
        data.delete('prefix')
        data['updated_at'] = Time.now.utc.strftime('%Y-%m-%dT%H:%M:%SZ')
        material.set_attribute(DICTIONARY, SCHEDULE_KEY, JSON.generate(data))
        data
      end

      def self.description(data)
        %w[material_type brand product_name finish initials_type].map do |field|
          value = data[field].to_s.strip
          value unless value.empty?
        end.compact.join(' | ')
      end

      def self.payload(material)
        data = read(material)
        FIELDS.each_with_object({}) do |field, result|
          value = data[field].to_s.strip
          result[field] = value unless value.empty?
        end.merge(
          'display_description' => description(data),
          'updated_at' => data['updated_at']
        ).compact
      end
    end
  end
end
