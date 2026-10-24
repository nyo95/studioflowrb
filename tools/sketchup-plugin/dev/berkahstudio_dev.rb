# frozen_string_literal: true

require 'sketchup.rb'
require 'extensions.rb'

# Edit only this line after copying this file into SketchUp's Plugins folder.
SOURCE_PATH = 'C:/path/to/studioflow-rebuild/tools/sketchup-plugin/src'.freeze

if defined?(BerkahStudio::VERSION)
  UI.messagebox(
    'Berkah Studio versi .rbz masih terpasang. Hapus atau nonaktifkan versi itu, ' \
    'lalu mulai ulang SketchUp sebelum memakai berkahstudio_dev.rb.'
  )
else
  init_path = File.join(SOURCE_PATH, 'berkahstudio', 'init.rb')
  if File.file?(init_path)
    extension = SketchupExtension.new('Berkah Studio (Development)', init_path.delete_suffix('.rb'))
    extension.version = 'development'
    extension.description = 'Berkah Studio loaded directly from a development checkout'
    extension.creator = 'Berkah Studio'
    Sketchup.register_extension(extension, true)
  else
    UI.messagebox(
      "Berkah Studio development source tidak ditemukan di:\n#{SOURCE_PATH}\n\n" \
      'Edit SOURCE_PATH di berkahstudio_dev.rb, lalu mulai ulang SketchUp.'
    )
  end
end
