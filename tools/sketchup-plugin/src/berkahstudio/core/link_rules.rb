# frozen_string_literal: true

require 'uri'

module BerkahStudio
  module MaterialScheduler
    # Pure rules of the schedule link (WO-SKETCHUP-02). No SketchUp calls here, so they run under plain Ruby
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
