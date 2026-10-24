# frozen_string_literal: true

require 'rbconfig'

ROOT = File.expand_path('..', __dir__)
RUBY_FILES = %w[src dev test].flat_map { |dir| Dir.glob(File.join(ROOT, dir, '**', '*.rb')) }.sort.freeze
TEST_FILES = Dir.glob(File.join(__dir__, '*_test.rb')).sort.freeze

failures = []

RUBY_FILES.each do |path|
  failures << "syntax: #{path}" unless system(RbConfig.ruby, '-wc', path)
end

TEST_FILES.each do |path|
  failures << "test: #{path}" unless system(RbConfig.ruby, '-I', File.join(__dir__, 'support'), path)
end

if failures.empty?
  puts "PASS: #{RUBY_FILES.length} Ruby files parsed; #{TEST_FILES.length} test files passed."
else
  warn "FAIL:\n- #{failures.join("\n- ")}"
  exit 1
end
