# frozen_string_literal: true

require 'minitest/autorun'
require_relative 'support/fake_sketchup'

class DevLoaderTest < Minitest::Test
  LOADER = File.expand_path('../dev/berkahstudio_dev.rb', __dir__)

  def setup
    Sketchup.reset!
    UI.reset!
    Object.send(:remove_const, :BerkahStudio) if defined?(BerkahStudio)
    Object.send(:remove_const, :SOURCE_PATH) if defined?(SOURCE_PATH)
  end

  def teardown
    Object.send(:remove_const, :BerkahStudio) if defined?(BerkahStudio)
    Object.send(:remove_const, :SOURCE_PATH) if defined?(SOURCE_PATH)
  end

  def test_refuses_to_register_beside_an_installed_copy
    Object.const_set(:BerkahStudio, Module.new)
    BerkahStudio.const_set(:VERSION, '1.3.0')

    load LOADER

    assert_empty Sketchup.registered_extensions
    assert UI.messages.any? { |message| message.include?('versi .rbz masih terpasang') && message.include?('Hapus') }
  end

  def test_registers_the_extension_directly_from_the_checkout_source
    source = File.expand_path('../src', __dir__).tr('\\', '/')
    loader = File.read(LOADER).sub('C:/path/to/studioflow-rebuild/tools/sketchup-plugin/src', source)

    eval(loader, TOPLEVEL_BINDING, LOADER)

    extension, enabled = Sketchup.registered_extensions.fetch(0)
    assert enabled
    assert_equal 'Berkah Studio (Development)', extension.name
    assert_equal File.join(source, 'berkahstudio', 'init'), extension.path
    assert_empty UI.messages
  end
end
