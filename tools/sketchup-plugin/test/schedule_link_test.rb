# frozen_string_literal: true

require 'minitest/autorun'
require_relative 'support/fake_sketchup'
require_relative '../src/berkahstudio/core/link_rules'
require_relative '../src/berkahstudio/core/studioflow_client'
require_relative 'support/fake_studioflow'

module BerkahStudio
  module MaterialScheduler
    module Undo
      def self.wrap(_name)
        yield
      end
    end

    module MaterialMetadata
      def self.apply_code(*) = nil
    end

    module ModelScanner
      def self.invalidate_cache = nil
    end

    module EventBus
      def self.publish(*) = nil
    end

    module Logger
      def self.error(*) = nil
    end
  end
end

require_relative '../src/berkahstudio/core/schedule_link'

class ScheduleLinkTest < Minitest::Test
  Link = BerkahStudio::MaterialScheduler::ScheduleLink
  Client = BerkahStudio::MaterialScheduler::StudioflowClient
  TOKEN = "sfk_#{'a' * 12}_#{'B' * 43}".freeze

  def setup
    Sketchup.reset!
    UI.reset!
    FakeStudioflow.install(Client)
    @model = Sketchup.active_model
    @model.set_attribute(Link::DICT, 'studioflow_project_id', 'project-1')
    @model.set_attribute(Link::DICT, 'studioflow_project_name', 'Rumah Contoh')
    Sketchup.write_default(Client::PREFS, Client::TOKEN_KEY, TOKEN)
  end

  def teardown
    FakeStudioflow.uninstall
  end

  def entry(id: 'entry-1', code: 'PL-01', title: 'HPL Putih', category: 'HPL')
    {
      'id' => id,
      'code' => code,
      'section' => 'MATERIAL',
      'category' => category,
      'prefix' => 'PL',
      'title' => title,
      'options' => []
    }
  end

  def schedule(entries: [entry])
    {
      'project' => { 'id' => 'project-1', 'name' => 'Rumah Contoh' },
      'entries' => entries,
      'categoryChoices' => [{ 'section' => 'MATERIAL', 'category' => 'HPL' }]
    }
  end

  def test_connects_model_to_a_project
    @model.set_attribute(Link::DICT, 'studioflow_project_id', '')
    UI.queue_inputbox(['https://studioflow.example.test', TOKEN], ['1. Rumah Contoh'])
    FakeStudioflow.enqueue(FakeStudioflow.ok([{ 'id' => 'project-1', 'name' => 'Rumah Contoh', 'canApply' => true }]))

    Link.connect

    assert_equal 'project-1', Client.project_id(@model)
    assert_equal 'Rumah Contoh', Client.project_name(@model)
    call = FakeStudioflow.calls.fetch(0)
    assert_equal [:get, 'projects', nil, nil], [call.method, call.path, call.body, call.idempotency_key]
  end

  def test_picks_and_links_an_existing_item
    material = @model.materials.add('Plywood putih')
    UI.queue_inputbox(['HPL'], ['PL-01 · HPL Putih'])
    FakeStudioflow.enqueue(FakeStudioflow.ok(schedule))

    Link.on_material(material, @model)

    assert_equal 'PL-01', material.name
    assert_equal 'entry-1', material.get_attribute(Link::DICT, Link::ENTRY_KEY)
    assert_equal 'project-1', material.get_attribute(Link::DICT, Link::PROJECT_KEY)
    assert_equal [:get, 'projects/project-1/schedule'], FakeStudioflow.calls.map { |call| [call.method, call.path] }.first
  end

  def test_new_item_retry_reuses_one_idempotency_key
    material = @model.materials.add('Plywood baru')
    UI.queue_inputbox(['HPL'], ['(Item baru di HPL)'])
    UI.queue_messagebox(IDYES)
    FakeStudioflow.enqueue(FakeStudioflow.ok(schedule(entries: [])), FakeStudioflow.network_error)

    Link.on_material(material, @model)

    pending = Link.pending(material)
    refute_nil pending
    UI.queue_messagebox(IDYES)
    FakeStudioflow.enqueue(FakeStudioflow.ok({ 'entryId' => 'entry-new', 'code' => 'PL-02', 'category' => 'HPL', 'prefix' => 'PL' }))

    Link.on_material(material, @model)

    creates = FakeStudioflow.calls.select { |call| call.path.end_with?('/entries') }
    assert_equal 2, creates.length
    assert_equal 1, creates.map(&:idempotency_key).uniq.length
    assert_equal creates.first.body, creates.last.body
    assert_nil Link.pending(material)
    assert_equal 'entry-new', material.get_attribute(Link::DICT, Link::ENTRY_KEY)
    assert_equal 'PL-02', material.name
  end

  def test_refreshes_linked_material_name
    material = @model.materials.add('PL-01')
    material.set_attribute(Link::DICT, Link::PROJECT_KEY, 'project-1')
    material.set_attribute(Link::DICT, Link::ENTRY_KEY, 'entry-1')
    UI.queue_messagebox(IDYES)
    FakeStudioflow.enqueue(FakeStudioflow.ok(schedule(entries: [entry(code: 'PL-03')])))

    Link.refresh_codes

    assert_equal 'PL-03', material.name
    assert_equal 'PL-03', material.get_attribute(Link::DICT, Link::CODE_KEY)
  end

  def test_stale_link_is_left_untouched_when_user_leaves_it
    material = @model.materials.add('PL-01')
    material.set_attribute(Link::DICT, Link::PROJECT_KEY, 'project-1')
    material.set_attribute(Link::DICT, Link::ENTRY_KEY, 'deleted-entry')
    material.set_attribute(Link::DICT, Link::CODE_KEY, 'PL-01')
    UI.queue_inputbox(['Biarkan (jangan tautkan)'])
    FakeStudioflow.enqueue(FakeStudioflow.ok(schedule))

    Link.on_material(material, @model)

    assert_equal 'deleted-entry', material.get_attribute(Link::DICT, Link::ENTRY_KEY)
    assert UI.messages.any? { |message| message.include?('sudah dihapus dari jadwal') }
  end

  def test_other_project_link_requires_confirmation_and_stays_when_refused
    material = @model.materials.add('PL-01')
    material.set_attribute(Link::DICT, Link::PROJECT_KEY, 'project-2')
    material.set_attribute(Link::DICT, Link::ENTRY_KEY, 'entry-1')
    UI.queue_messagebox(IDNO)
    FakeStudioflow.enqueue(FakeStudioflow.ok(schedule))

    Link.on_material(material, @model)

    assert_equal 'project-2', material.get_attribute(Link::DICT, Link::PROJECT_KEY)
    assert UI.messages.any? { |message| message.include?('proyek StudioFlow lain') }
  end

  def test_server_error_is_shown_to_the_user
    material = @model.materials.add('Plywood putih')
    FakeStudioflow.enqueue(FakeStudioflow.error('MODULE_DISABLED', 'Modul SketchUp sedang nonaktif.'))

    Link.on_material(material, @model)

    assert UI.messages.any? { |message| message.include?('MODULE_DISABLED') && message.include?('Modul SketchUp sedang nonaktif.') }
  end
end
