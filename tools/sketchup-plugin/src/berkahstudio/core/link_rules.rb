# frozen_string_literal: true

require 'uri'

module BerkahStudio
  module MaterialScheduler
    # Pure rules of the schedule link (WO-SKETCHUP-02, WO-SKETCHUP-03). No SketchUp calls here, so they run under plain Ruby
    # (tools/sketchup-plugin/test/link_rules_test.rb). A code (ST-01) is a label that StudioFlow may give to another
    # item later; identity is always the project id + entry id stored on the material.
    module LinkRules
      # The integration kit replays an Idempotency-Key for 24 hours; resume only well inside that window.
      PENDING_MAX_AGE = 23 * 60 * 60
      # Answers after which StudioFlow may still hold the item: keep the key so the next click can replay it.
      UNSURE_ERRORS = %w[NETWORK BAD_RESPONSE IDEMPOTENCY_IN_PROGRESS].freeze

      # SO-1, SO-001, so-01 and SO-01 are one code: prefix case-insensitive, leading zeros ignored.
      def self.code_key(name)
        match = name.to_s.strip.match(/\A([A-Za-z]+)\s*-\s*0*(\d+)\z/)
        match ? "#{match[1].upcase}-#{match[2].to_i}" : nil
      end

      # :unlinked, :other_project (linked to a project that is not this model's), :stale (the entry is no longer in
      # this project's schedule) or :linked.
      def self.classify(project_id, entry_id, model_project_id, entry_ids)
        return :unlinked if entry_id.to_s.empty?
        return :other_project if project_id.to_s != model_project_id.to_s
        return :stale unless entry_ids.include?(entry_id.to_s)

        :linked
      end

      # rows: [{ key:, name:, target: }] for every linked material, target = the item's current code, nil when the item
      # is gone. holders: { name => key } of every material in the model. A name wanted by two materials, or held by a
      # material that keeps its name, goes to nobody. Returns { renames:, conflicts:, stale: } (rows).
      def self.refresh_plan(rows, holders)
        stale = rows.select { |row| row[:target].nil? }
        moving = rows.reject { |row| row[:target].nil? || row[:target] == row[:name] }
        conflicts = []
        loop do
          leaving = moving.map { |row| row[:key] }
          wanted = moving.group_by { |row| row[:target] }
          blocked = moving.select do |row|
            holder = holders[row[:target]]
            wanted[row[:target]].length > 1 || (holder && holder != row[:key] && !leaving.include?(holder))
          end
          break if blocked.empty?

          conflicts.concat(blocked)
          moving -= blocked
        end
        { renames: moving, conflicts: conflicts, stale: stale }
      end

      # :ok, :warn (plain http inside a local or private network) or :refuse. The token travels in every request,
      # so plain http is accepted only where it does not leave the office network (owner, 2026-10-22).
      def self.server_check(url)
        uri = URI.parse(url.to_s.strip)
        return :refuse unless uri.host && !uri.host.empty?
        return :ok if uri.scheme == 'https'
        return :refuse unless uri.scheme == 'http'

        host = uri.host.downcase.delete_prefix('[').delete_suffix(']')
        return :ok if host == 'localhost' || host == '::1' || host.start_with?('127.')

        private_host?(host) ? :warn : :refuse
      rescue URI::InvalidURIError
        :refuse
      end

      def self.private_host?(host)
        return true if host.end_with?('.local') || !host.include?('.')

        octets = host.split('.').map { |part| Integer(part, 10) rescue nil }
        return false unless octets.length == 4 && octets.all? { |value| value && value.between?(0, 255) }

        octets[0] == 10 || (octets[0] == 172 && octets[1].between?(16, 31)) || (octets[0] == 192 && octets[1] == 168)
      end

      # Owner D1 (WO-SKETCHUP-03): the plain code for the final option, the only option or an item without options;
      # CODE-<letter> for a non-final alternative. nil = leave the name as it is (an old item-only link to an item with
      # alternatives, or an option that was deleted): no option is ever guessed.
      def self.expected_name(code, options, option_id)
        options ||= []
        return options.length <= 1 ? code : nil if option_id.to_s.empty?

        option = options.find { |row| row['id'] == option_id }
        return nil unless option
        return code if option['isFinal'] || options.length == 1

        "#{code}-#{option['label']}"
      end

      # [state, final option label or nil]. States: :no_spec, :single (item-only link, one option), :option_not_chosen,
      # :option_missing, :final, :only_option, :not_final (another option is final), :alternative (nothing final yet).
      def self.link_status(options, option_id)
        options ||= []
        final = options.find { |row| row['isFinal'] }
        if option_id.to_s.empty?
          return [:no_spec, nil] if options.empty?
          return [:single, final && final['label']] if options.length == 1

          return [:option_not_chosen, final && final['label']]
        end
        option = options.find { |row| row['id'] == option_id }
        return [:option_missing, final && final['label']] unless option
        return [:final, option['label']] if option['isFinal']
        return [:not_final, final['label']] if final
        return [:only_option, nil] if options.length == 1

        [:alternative, nil]
      end

      # Merge only what the Schedule says is one specification (owner, 2026-10-22): the same project, the same entry and
      # the same option id; two item-only links only when that item has at most one option. Never by name or code.
      # a, b: { project_id:, entry_id:, option_id: }.
      def self.merge_candidate?(a, b, project_id, option_count)
        return false unless a[:project_id].to_s == project_id.to_s && b[:project_id].to_s == project_id.to_s
        return false if a[:entry_id].to_s.empty? || a[:entry_id].to_s != b[:entry_id].to_s

        a_option = a[:option_id].to_s
        b_option = b[:option_id].to_s
        return a_option == b_option if !a_option.empty? || !b_option.empty?

        option_count <= 1
      end

      # Three well-spread corners of a face (indexes into points), so a texture position can be carried over exactly;
      # nil when the face has no three corners that span an area. points: [[x, y, z], ...].
      def self.spread_corners(points)
        return nil if points.length < 3

        first = 0
        second = (1...points.length).max_by { |index| distance(points[first], points[index]) }
        third = (0...points.length).max_by { |index| area(points[first], points[second], points[index]) }
        area(points[first], points[second], points[third]) > 1e-6 ? [first, second, third] : nil
      end

      def self.distance(a, b)
        Math.sqrt(a.zip(b).sum { |x, y| (x - y)**2 })
      end

      def self.area(a, b, c)
        u = b.zip(a).map { |x, y| x - y }
        v = c.zip(a).map { |x, y| x - y }
        cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        Math.sqrt(cross.sum { |value| value**2 }) / 2.0
      end

      def self.pending_fresh?(pending, now)
        at = pending.is_a?(Hash) ? pending['at'].to_i : 0
        at.positive? && now.to_i - at <= PENDING_MAX_AGE
      end

      def self.keep_pending?(error_code)
        UNSURE_ERRORS.include?(error_code.to_s)
      end
    end
  end
end
