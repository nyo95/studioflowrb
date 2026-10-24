# frozen_string_literal: true

require 'minitest/autorun'

class ReloadCoverageTest < Minitest::Test
  PLUGIN = File.expand_path('..', __dir__)
  SOURCE = File.join(PLUGIN, 'src', 'berkahstudio')
  INIT = File.join(SOURCE, 'init.rb')

  def test_reload_list_names_every_ruby_source_file
    source_files = Dir.glob(File.join(SOURCE, '**', '*.rb')).map { |path| path.delete_prefix("#{SOURCE}/") }
    deliberately_excluded = ['init.rb']
    reload_files = File.read(INIT).scan(/load File\.join\(ROOT, '([^']+\.rb)'\)/).flatten

    assert_equal [], (source_files - deliberately_excluded - reload_files).sort,
                 'Add every new Ruby source to MaterialScheduler.reload, or document why it is deliberately excluded.'
    assert_equal [], (reload_files - source_files).sort, 'Reload list contains a file that does not exist.'
  end
end
