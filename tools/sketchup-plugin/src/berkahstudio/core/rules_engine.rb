module BerkahStudio
  module MaterialScheduler
    module RulesEngine
      # StudioFlow's Product Schedule writes codes with at least two digits (PL-01, PL-12, PL-100).
      # PL-1 and PL-01 are the same code; the canonical form is the Schedule's.
      def self.canonical(code)
        return nil unless code.is_a?(String) && code.include?('-')
        pref, num = code.split('-', 2)
        return nil unless pref =~ /^[A-Z]+$/ && num =~ /^\d+$/
        '%s-%02d' % [pref.upcase, num.to_i]
      end

      def self.make_code(prefix, number)
        return nil unless prefix =~ /^[A-Z]+$/ && number.to_i > 0
        '%s-%02d' % [prefix.upcase, number.to_i]
      end

      def self.number_of(code)
        c = canonical(code)
        return nil unless c
        c.split('-', 2)[1].to_i
      end

      def self.prefix_for_code(code)
        c = canonical(code)
        return nil unless c
        c.split('-', 2)[0]
      end

      # Checks if name is exactly a valid code pattern (e.g. "PT-1")
      def self.format_valid?(name)
        return false unless name.is_a?(String)
        !!(name =~ /^[A-Z]+-\d+$/)
      end

      # Checks if name is a valid format AND the prefix is registered
      def self.is_registered_code?(name, registry)
        return false unless format_valid?(name)
        prefix = name.split('-', 2)[0]
        registry.key?(prefix)
      end

      # Parse a name to check if it's dirty (starts with a code pattern and has a suffix or spacing issues)
      # Returns [prefix, number, suffix] if dirty, nil otherwise
      def self.parse_dirty(name)
        return nil unless name.is_a?(String)
        # Matches e.g. "PT-1 copy", "PT-1(2)", "PT - 1", "pt-1"
        # We use \s* around the dash, and (.*) for the suffix so it catches purely spacing typos
        if name =~ /^([A-Z]+)\s*-\s*(\d+)(.*)$/i
          pref = $1.upcase
          num = $2.to_i
          suffix = $3

          # A clean code (PL-1 or PL-01) is not dirty
          return nil if name =~ /^[A-Z]+-\d+$/

          return [pref, num, suffix]
        end
        nil
      end

      # Strips unique-copy suffixes from a component/group name to recover base FF&E code.
      # e.g. "SF-01#2"       -> "SF-01"
      #      "Lamp-1 copy"   -> "Lamp-1"
      #      "Lamp-1 (2)"    -> "Lamp-1"
      #      "SF-01"         -> "SF-01"  (already clean)
      #      "random chair"  -> nil       (not a code at all)
      #
      # Returns the cleaned code string, or nil if the name is not recognizable as a product code.
      def self.clean_product_code(name)
        return nil unless name.is_a?(String) && name.include?('-')

        # Strip common SketchUp unique-copy suffixes:
        #   #N  (Make Unique adds this)
        #   (N)
        #   " copy", " copy N"
        #   trailing whitespace
        cleaned = name
          .gsub(/#\d+$/, '')          # SF-01#2 -> SF-01
          .gsub(/\(\d+\)\s*$/, '')   # SF-01 (2) -> SF-01
          .gsub(/\s+copy(\s+\d+)?\s*$/i, '')  # SF-01 copy -> SF-01
          .strip

        # After stripping, check if remaining string is a valid code
        # e.g. "SF-01", "Lamp-1", "TB-03"
        # Pattern: one or more word-chars, a dash, one or more digits
        if cleaned =~ /^([A-Za-z][A-Za-z0-9_]*)-(\d+)$/
          cleaned
        else
          nil
        end
      end
    end
  end
end
