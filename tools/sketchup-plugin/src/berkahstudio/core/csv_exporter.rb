module BerkahStudio
  module MaterialScheduler
    module CSVExporter
      def self.escape_csv(val)
        val = val.to_s
        if val.include?(',') || val.include?('"') || val.include?("\n") || val.include?("\r")
          '"' + val.gsub('"', '""') + '"'
        else
          val
        end
      end

      def self.export_materials(file_path)
        scan_results = ModelScanner.scan(true)
        coded_mats = scan_results[:materials][:coded]
        details = scan_results[:materials][:details]
        registered_prefixes = PrefixRegistry.list

        headers = ["Code", "Category", "Subcategory", "Brand", "Type", "Color", "Finish", "Vendor", "Remarks", "Area (m2)", "Face Count", "Location"]

        lines = []
        lines << headers.map { |h| escape_csv(h) }.join(',')

        coded_mats.each do |code|
          detail = details[code] || { face_count: 0, area: 0.0, layers: [] }
          prefix = RulesEngine.prefix_for_code(code)
          category = registered_prefixes[prefix] || ""

          row = [
            code,
            category,
            "", # Subcategory
            "", # Brand
            "", # Type
            "", # Color
            "", # Finish
            "", # Vendor
            "", # Remarks
            detail[:area],
            detail[:face_count],
            detail[:layers].join('; ')
          ]
          lines << row.map { |r| escape_csv(r) }.join(',')
        end

        File.write(file_path, lines.join("\n"))
        Logger.info(:csv_materials_exported, path: file_path, count: coded_mats.size)
        true
      rescue => e
        Logger.error(:csv_materials_export_failed, message: e.message)
        raise e
      end

      def self.export_ffe(file_path)
        scan_results = ModelScanner.scan(true)
        ffe_coded = scan_results[:ffe][:coded]

        headers = ["Code", "Category", "Description", "Brand", "Model", "Size", "Vendor", "Remarks", "Instance Count", "Location"]

        lines = []
        lines << headers.map { |h| escape_csv(h) }.join(',')

        ffe_coded.keys.sort.each do |code|
          detail = ffe_coded[code]

          row = [
            code,
            "", # Category
            detail[:definition_names].join('; '), # Description (default to component definitions)
            "", # Brand
            "", # Model
            "", # Size
            "", # Vendor
            "", # Remarks
            detail[:instance_count],
            detail[:layers].join('; ')
          ]
          lines << row.map { |r| escape_csv(r) }.join(',')
        end

        File.write(file_path, lines.join("\n"))
        Logger.info(:csv_ffe_exported, path: file_path, count: ffe_coded.size)
        true
      rescue => e
        Logger.error(:csv_ffe_export_failed, message: e.message)
        raise e
      end
    end
  end
end
