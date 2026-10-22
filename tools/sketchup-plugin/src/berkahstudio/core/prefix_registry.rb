require 'json'
require 'fileutils'

module BerkahStudio
  module MaterialScheduler
    module PrefixRegistry
      @file_path = File.join(File.expand_path('../..', __FILE__), 'types.json')
      @backup_dir = File.join(File.expand_path('../..', __FILE__), 'backups')

      def self.list
        ensure_file_exists
        begin
          JSON.parse(File.read(@file_path))
        rescue => e
          Logger.error(:prefix_registry_read_fail, message: e.message)
          {}
        end
      end

      def self.save(hash)
        # Validate and clean hash
        cleaned = {}
        hash.each do |k, v|
          prefix = k.to_s.upcase.strip
          label = v.to_s.strip
          next if prefix.empty? || label.empty?
          next unless prefix =~ /^[A-Z]+$/
          cleaned[prefix] = label
        end

        backup!

        begin
          File.write(@file_path, JSON.pretty_generate(cleaned))
          Logger.info(:prefix_registry_saved, count: cleaned.size)
          EventBus.publish(:data_changed)
          true
        rescue => e
          Logger.error(:prefix_registry_save_fail, message: e.message)
          false
        end
      end

      def self.category_for(prefix)
        prefix = prefix.to_s.upcase.strip
        list[prefix]
      end

      def self.ensure_file_exists
        unless File.exist?(@file_path)
          default_registry = {
            "PT" => "Paint",
            "HT" => "Homogeneous Tile",
            "WD" => "Wood",
            "GL" => "Glass",
            "MT" => "Metal",
            "PL" => "High Pressure Laminate",
            "CT" => "Ceramic Tile",
            "ST" => "Stone",
            "F" => "Fabric",
            "SO" => "Solid Surface",
            "ACR" => "Acrylic",
            "SPR" => "Spray Paint",
            "TER" => "Terrazzo",
            "MSC" => "Miscellaneous"
          }
          begin
            FileUtils.mkdir_p(File.dirname(@file_path))
            File.write(@file_path, JSON.pretty_generate(default_registry))
          rescue => e
            Logger.error(:prefix_registry_create_fail, message: e.message)
          end
        end
      end

      def self.backup!
        return unless File.exist?(@file_path)
        begin
          FileUtils.mkdir_p(@backup_dir)
          timestamp = Time.now.strftime('%Y%m%d_%H%M%S')
          backup_path = File.join(@backup_dir, "types_#{timestamp}.json")
          FileUtils.cp(@file_path, backup_path)

          # Clean up old backups (keep only last 10)
          backups = Dir[File.join(@backup_dir, 'types_*.json')].sort
          if backups.size > 10
            backups.first(backups.size - 10).each { |f| File.delete(f) rescue nil }
          end
        rescue => e
          Logger.warn(:prefix_registry_backup_fail, message: e.message)
        end
      end
    end
  end
end
