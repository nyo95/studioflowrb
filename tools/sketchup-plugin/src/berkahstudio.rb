# berkahstudio.rb - Extension Loader for Berkah Studio Plugin
require 'sketchup.rb'
require 'extensions.rb'

module BerkahStudio
  VERSION = '1.2.1'.freeze

  # Ensure the extension is only registered once
  unless defined?(@extension)
    @extension = SketchupExtension.new('Berkah Studio', 'berkahstudio/init')
    @extension.version = VERSION
    @extension.description = 'Material codes from the StudioFlow Product Schedule, Component Tracker and Wall Finish Labels'
    @extension.creator = 'Berkah Studio'
    @extension.copyright = '2026 Berkah Studio'
    Sketchup.register_extension(@extension, true)
  end
end
