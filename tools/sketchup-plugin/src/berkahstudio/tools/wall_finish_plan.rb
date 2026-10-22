# Maintained and loaded by the Berkah Studio extension.
require 'sketchup'

module BK
  module WallFinishPlan
    extend self

    MENU_NAME = 'BK Wall Finish Plan'.freeze
    MATERIAL_DICT = 'BKWallFinishMaterial'.freeze
    ANNOTATION_DICT = 'BKWallFinishAnnotation'.freeze
    ANNOTATION_GROUP_NAME = 'BK Wall Finish Plan Labels'.freeze
    DEFAULT_OFFSET = 450.mm
    DEFAULT_STAGGER = 220.mm
    MIN_WALL_AREA = 0.15.m * 0.15.m

    def activate
      register_menu
    end

    def register_menu
      return if @menu_loaded

      submenu = UI.menu('Plugins').add_submenu(MENU_NAME)
      submenu.add_item('Generate Labels From Selection') { generate_labels_from_selection }
      submenu.add_item('Edit Selected Material Info') { edit_selected_material_info }
      submenu.add_item('Clear Generated Labels') { clear_generated_labels }
      submenu.add_separator
      submenu.add_item('Help') { show_help }

      @menu_loaded = true
    end

    def generate_labels_from_selection
      model = Sketchup.active_model
      walls = collect_wall_faces(model.selection.to_a)
      if walls.empty?
        UI.messagebox('Pilih face dinding, group, atau component yang berisi bidang dinding vertikal.')
        return
      end

      model.start_operation('Generate Wall Finish Plan', true)
      label_group = find_or_create_annotation_group(model)
      clear_group_entities(label_group)

      generated = 0
      skipped = 0

      walls.each_with_index do |wall, index|
        label = wall_label_text(wall[:face])
        if label.empty?
          skipped += 1
          next
        end

        create_label(label_group.entities, wall, label, index)
        generated += 1
      end

      model.commit_operation

      UI.messagebox("Wall finish plan selesai.\nLabel dibuat: #{generated}\nFace dilewati: #{skipped}")
    rescue => error
      model.abort_operation if model
      UI.messagebox("BK Wall Finish Plan error:\n#{error.message}")
    end

    def edit_selected_material_info
      materials = selected_materials_from_selection
      if materials.empty?
        UI.messagebox('Pilih face/group/component yang punya material dulu.')
        return
      end
      if materials.length > 1
        UI.messagebox('Selection memuat lebih dari satu material. Pilih area yang hanya punya satu material agar keterangan mudah diatur.')
        return
      end

      material = materials.first
      prompts = ['Code', 'Description', 'Label Text Override']
      defaults = [
        material_code(material),
        material_description(material),
        material_label_override(material)
      ]
      input = UI.inputbox(prompts, defaults, "Material Info: #{material_display_name(material)}")
      return unless input

      code = input[0].to_s.strip
      description = input[1].to_s.strip
      label_text = input[2].to_s.strip

      material.set_attribute(MATERIAL_DICT, 'code', code)
      material.set_attribute(MATERIAL_DICT, 'description', description)
      material.set_attribute(MATERIAL_DICT, 'label_text', label_text)

      UI.messagebox("Info material tersimpan untuk '#{material_display_name(material)}'.")
    rescue => error
      UI.messagebox("Gagal menyimpan info material:\n#{error.message}")
    end

    def clear_generated_labels
      model = Sketchup.active_model
      group = find_annotation_group(model)
      unless group
        UI.messagebox('Belum ada label wall finish yang dibuat plugin ini.')
        return
      end

      model.start_operation('Clear Wall Finish Labels', true)
      group.erase!
      model.commit_operation
      UI.messagebox('Label wall finish yang dibuat plugin ini sudah dihapus.')
    rescue => error
      model.abort_operation if model
      UI.messagebox("Gagal menghapus label:\n#{error.message}")
    end

    def show_help
      UI.messagebox(
        "Alur pakai:\n" \
        "1. Beri material pada face dinding di model.\n" \
        "2. Kalau perlu, pilih satu material lalu jalankan 'Edit Selected Material Info' untuk isi code/keterangan.\n" \
        "3. Pilih face, group, atau component dinding.\n" \
        "4. Jalankan 'Generate Labels From Selection'.\n\n" \
        "Catatan:\n" \
        "- Plugin hanya membaca face vertikal.\n" \
        "- Label dibuat sebagai Text + leader di group '#{ANNOTATION_GROUP_NAME}'.\n" \
        "- Jika info material kosong, plugin memakai nama material sebagai label."
      )
    end

    private

    def collect_wall_faces(selection)
      walls = []
      seen_faces = {}

      selection.each do |entity|
        traverse_entity(entity, IDENTITY, walls, seen_faces)
      end

      walls
    end

    def traverse_entity(entity, transformation, walls, seen_faces)
      return unless entity.valid?
      return if hidden_entity?(entity)

      case entity
      when Sketchup::Face
        world_normal = entity.normal.transform(transformation)
        return unless vertical_face?(world_normal)
        return if entity.area(transformation) <= MIN_WALL_AREA

        key = [entity.persistent_id, transformation.to_a.join(',')]
        return if seen_faces[key]

        walls << {
          face: entity,
          transformation: transformation,
          center: transformed_face_center(entity, transformation),
          normal: normalized_horizontal(world_normal),
          size: transformed_face_size(entity, transformation)
        }
        seen_faces[key] = true
      when Sketchup::Group
        entity.entities.each do |child|
          traverse_entity(child, transformation * entity.transformation, walls, seen_faces)
        end
      when Sketchup::ComponentInstance
        entity.definition.entities.each do |child|
          traverse_entity(child, transformation * entity.transformation, walls, seen_faces)
        end
      end
    end

    def create_label(entities, wall, label, index)
      anchor = wall[:center]
      normal = wall[:normal]
      size = wall[:size]

      base_offset = [DEFAULT_OFFSET, size * 0.65].max
      side_shift = (index % 5) * DEFAULT_STAGGER
      side_vector = sideways_vector(normal)
      text_vector = normal.clone
      text_vector.length = base_offset
      if side_shift > 0 && side_vector.length > 0.001
        side_vector.length = side_shift
        text_vector = text_vector + side_vector
      end

      text = entities.add_text(label, anchor, text_vector)
      text.set_attribute(ANNOTATION_DICT, 'generated', true)
    end

    def wall_label_text(face)
      front = format_material_label(face.material)
      back = format_material_label(face.back_material)
      parts = []
      parts << "F: #{front}" unless front.empty?
      parts << "B: #{back}" unless back.empty? || back == front
      parts.join("\n")
    end

    def format_material_label(material)
      return '' unless material

      override = material_label_override(material)
      return override unless override.empty?

      code = material_code(material)
      description = material_description(material)
      fallback = material_display_name(material)

      return [code, description].reject(&:empty?).join(' - ') unless code.empty? && description.empty?
      return code unless code.empty?
      return description unless description.empty?

      fallback
    end

    def material_code(material)
      value = material.get_attribute(MATERIAL_DICT, 'code', '').to_s.strip
      return value unless value.empty?

      if defined?(BerkahStudio::MaterialScheduler::MaterialMetadata)
        metadata_code = BerkahStudio::MaterialScheduler::MaterialMetadata.read(material)['code'].to_s.strip
        return metadata_code unless metadata_code.empty?
      end

      name = material_display_name(material)
      match = name.match(/\A([A-Za-z]{1,5}[-\s]?\d{1,3}[A-Za-z]?)\b/)
      match ? match[1].gsub(/\s+/, '') : ''
    end

    def material_description(material)
      value = material.get_attribute(MATERIAL_DICT, 'description', '').to_s.strip
      return value unless value.empty?

      if defined?(BerkahStudio::MaterialScheduler::MaterialMetadata)
        metadata = BerkahStudio::MaterialScheduler::MaterialMetadata.read(material)
        return BerkahStudio::MaterialScheduler::MaterialMetadata.description(metadata)
      end

      ''
    end

    def material_label_override(material)
      material.get_attribute(MATERIAL_DICT, 'label_text', '').to_s.strip
    end

    def selected_materials_from_selection
      materials = []
      collect_wall_faces(Sketchup.active_model.selection.to_a).each do |wall|
        face = wall[:face]
        [face.material, face.back_material].compact.each do |material|
          materials << material unless materials.include?(material)
        end
      end
      materials
    end

    def vertical_face?(normal)
      normal = normal.normalize
      normal.z.abs < 0.15
    end

    def normalized_horizontal(vector)
      horizontal = Geom::Vector3d.new(vector.x, vector.y, 0.0)
      if horizontal.length <= 0.001
        horizontal = Geom::Vector3d.new(1, 0, 0)
      end
      horizontal.normalize
    end

    def sideways_vector(normal)
      Geom::Vector3d.new(-normal.y, normal.x, 0.0)
    end

    def transformed_face_center(face, transformation)
      points = face.vertices.map { |vertex| vertex.position.transform(transformation) }
      average_point(points)
    end

    def transformed_face_size(face, transformation)
      points = face.vertices.map { |vertex| vertex.position.transform(transformation) }
      bounds = Geom::BoundingBox.new
      points.each { |point| bounds.add(point) }
      [bounds.width, bounds.height, bounds.depth].max
    end

    def average_point(points)
      count = points.length.to_f
      x = points.sum(&:x) / count
      y = points.sum(&:y) / count
      z = points.sum(&:z) / count
      Geom::Point3d.new(x, y, z)
    end

    def material_display_name(material)
      return '' unless material

      if material.respond_to?(:display_name)
        material.display_name.to_s.strip
      else
        material.name.to_s.strip
      end
    end

    def hidden_entity?(entity)
      entity.hidden? || (entity.respond_to?(:layer) && entity.layer && !entity.layer.visible?)
    end

    def clear_group_entities(group)
      group.entities.to_a.each(&:erase!)
    end

    def find_annotation_group(model)
      model.entities.grep(Sketchup::Group).find do |group|
        group.name == ANNOTATION_GROUP_NAME
      end
    end

    def find_or_create_annotation_group(model)
      group = find_annotation_group(model)
      return group if group&.valid?

      group = model.entities.add_group
      group.name = ANNOTATION_GROUP_NAME
      group.set_attribute(ANNOTATION_DICT, 'generated_group', true)
      group
    end

    IDENTITY = Geom::Transformation.new.freeze
  end
end

# Loaded by Berkah Studio, which owns the consolidated Extensions menu.
