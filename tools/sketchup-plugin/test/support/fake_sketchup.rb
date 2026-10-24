# frozen_string_literal: true

MB_YESNO = 4 unless defined?(MB_YESNO)
MB_YESNOCANCEL = 3 unless defined?(MB_YESNOCANCEL)
IDYES = 6 unless defined?(IDYES)
IDNO = 7 unless defined?(IDNO)
IDCANCEL = 2 unless defined?(IDCANCEL)

class SketchupExtension
  attr_accessor :version, :description, :creator, :copyright
  attr_reader :name, :path

  def initialize(name, path)
    @name = name
    @path = path
  end
end

module Sketchup
  class Material
    attr_accessor :name, :color, :texture
    attr_reader :entityID

    def initialize(name, entity_id)
      @name = name
      @entityID = entity_id
      @attributes = {}
      @valid = true
    end

    def get_attribute(dictionary, key, default = nil)
      @attributes.fetch([dictionary, key], default)
    end

    def set_attribute(dictionary, key, value)
      @attributes[[dictionary, key]] = value
    end

    def delete_attribute(dictionary, key)
      @attributes.delete([dictionary, key])
    end

    def valid?
      @valid
    end
  end

  class Materials
    include Enumerable

    def initialize
      @items = []
      @next_id = 1
    end

    def add(name)
      material = Material.new(name, @next_id)
      @next_id += 1
      @items << material
      material
    end

    def each(&block)
      @items.each(&block)
    end

    def [](name)
      @items.find { |material| material.name == name }
    end
  end

  class Face
    attr_accessor :material, :back_material

    def initialize(material = nil, back_material = nil)
      @material = material
      @back_material = back_material
    end

    def valid?
      true
    end
  end

  class Selection
    include Enumerable

    def initialize
      @items = []
    end

    def add(item)
      @items << item
    end

    def each(&block)
      @items.each(&block)
    end
  end

  class Model
    attr_reader :materials, :selection, :entities

    def initialize
      @materials = Materials.new
      @selection = Selection.new
      @entities = []
      @attributes = {}
    end

    def get_attribute(dictionary, key, default = nil)
      @attributes.fetch([dictionary, key], default)
    end

    def set_attribute(dictionary, key, value)
      @attributes[[dictionary, key]] = value
    end

    def start_operation(*) = true
    def commit_operation = true
    def abort_operation = true
  end

  class << self
    attr_accessor :active_model
    attr_reader :registered_extensions, :status_texts

    def reset!
      @active_model = Model.new
      @registered_extensions = []
      @defaults = {}
      @loaded_files = {}
      @status_texts = []
    end

    def register_extension(extension, enabled)
      @registered_extensions << [extension, enabled]
    end

    def read_default(section, key, default = nil)
      @defaults.fetch([section, key], default)
    end

    def write_default(section, key, value)
      @defaults[[section, key]] = value
    end

    def set_status_text(text)
      @status_texts << text
    end

    def file_loaded?(path)
      @loaded_files.key?(path)
    end

    def file_loaded(path)
      @loaded_files[path] = true
    end
  end
end

module UI
  class HtmlDialog
    attr_reader :events

    def initialize(*)
      @events = []
      UI.dialogs << self
    end

    def method_missing(name, *args, &block)
      @events << [name, args, block]
      nil
    end

    def respond_to_missing?(_name, _include_private = false)
      true
    end
  end

  class Command
    attr_accessor :tooltip, :status_bar_text, :small_icon, :large_icon

    def initialize(_name, &action)
      @action = action
    end
  end

  class Toolbar
    def initialize(_name); end
    def add_item(_command); end
    def show; end
  end

  class Menu
    def add_submenu(_name) = self
    def add_item(_name, &_action); end
    def add_separator; end
  end

  class << self
    attr_reader :messages, :inputboxes, :dialogs

    def reset!
      @messages = []
      @inputboxes = []
      @dialogs = []
      @message_answers = []
      @input_answers = []
    end

    def queue_messagebox(*answers)
      @message_answers.concat(answers)
    end

    def queue_inputbox(*answers)
      @input_answers.concat(answers)
    end

    def messagebox(message, *_args)
      @messages << message
      @message_answers.empty? ? IDYES : @message_answers.shift
    end

    def inputbox(*args)
      @inputboxes << args
      @input_answers.shift
    end

    def start_timer(_seconds, _repeat, &block)
      block.call
    end

    def menu(_name)
      Menu.new
    end
  end
end

module Kernel
  def file_loaded?(path)
    Sketchup.file_loaded?(path)
  end

  def file_loaded(path)
    Sketchup.file_loaded(path)
  end
end

Sketchup.reset!
UI.reset!
$LOADED_FEATURES << 'sketchup.rb' unless $LOADED_FEATURES.include?('sketchup.rb')
$LOADED_FEATURES << 'extensions.rb' unless $LOADED_FEATURES.include?('extensions.rb')
