# frozen_string_literal: true

# Plain-Ruby tests of the schedule link rules (WO-SKETCHUP-02, WO-SKETCHUP-03): ruby tools/sketchup-plugin/test/link_rules_test.rb
require 'minitest/autorun'
require_relative '../src/berkahstudio/core/link_rules'
require_relative '../src/berkahstudio/core/rules_engine'

class LinkRulesTest < Minitest::Test
  Rules = BerkahStudio::MaterialScheduler::LinkRules

  def test_code_spellings_are_one_key_and_suffixed_names_are_not_codes
    assert_equal 'SO-1', Rules.code_key(' so - 001 ')
    assert_equal Rules.code_key('SO-01'), Rules.code_key('SO-1')
    assert_nil Rules.code_key('PL-01-B')
    assert_nil Rules.code_key('PL-01 copy')
  end

  def test_classify_never_trusts_a_code_only_the_stored_ids
    ids = %w[e-new]
    assert_equal :unlinked, Rules.classify('', '', 'p1', ids)
    assert_equal :other_project, Rules.classify('p2', 'e-new', 'p1', ids)
    # ST-01 was deleted and a new ST-01 was made: the old entry id is stale even if the name matches the new code.
    assert_equal :stale, Rules.classify('p1', 'e-old', 'p1', ids)
    assert_equal :linked, Rules.classify('p1', 'e-new', 'p1', ids)
  end

  def test_refresh_gives_a_name_wanted_twice_to_nobody
    rows = [
      { key: 1, name: 'HP-01', target: 'PL-01' },
      { key: 2, name: 'HP-01 alt', target: 'PL-01' },
      { key: 3, name: 'HP-02', target: 'PL-02' }
    ]
    plan = Rules.refresh_plan(rows, { 'HP-01' => 1, 'HP-01 alt' => 2, 'HP-02' => 3 })
    assert_equal [3], plan[:renames].map { |row| row[:key] }
    assert_equal [1, 2], plan[:conflicts].map { |row| row[:key] }.sort
  end

  def test_refresh_does_not_take_a_name_held_by_a_material_that_stays
    rows = [{ key: 1, name: 'Kayu', target: 'PL-03' }]
    plan = Rules.refresh_plan(rows, { 'Kayu' => 1, 'PL-03' => 9 })
    assert_empty plan[:renames]
    assert_equal [1], plan[:conflicts].map { |row| row[:key] }
  end

  def test_refresh_swaps_two_codes
    rows = [{ key: 1, name: 'PL-01', target: 'PL-02' }, { key: 2, name: 'PL-02', target: 'PL-01' }]
    plan = Rules.refresh_plan(rows, { 'PL-01' => 1, 'PL-02' => 2 })
    assert_equal [1, 2], plan[:renames].map { |row| row[:key] }
    assert_empty plan[:conflicts]
  end

  def test_refresh_chain_blocks_when_the_holder_is_itself_blocked
    rows = [
      { key: 1, name: 'A', target: 'PL-02' },
      { key: 2, name: 'PL-02', target: 'PL-05' },
      { key: 3, name: 'B', target: 'PL-05' }
    ]
    plan = Rules.refresh_plan(rows, { 'A' => 1, 'PL-02' => 2, 'B' => 3 })
    assert_empty plan[:renames]
    assert_equal [1, 2, 3], plan[:conflicts].map { |row| row[:key] }.sort
  end

  def test_refresh_keeps_stale_links_out_of_renames
    rows = [{ key: 1, name: 'ST-01', target: nil }, { key: 2, name: 'ST-02', target: 'ST-02' }]
    plan = Rules.refresh_plan(rows, { 'ST-01' => 1, 'ST-02' => 2 })
    assert_equal [1], plan[:stale].map { |row| row[:key] }
    assert_empty plan[:renames]
    assert_empty plan[:conflicts]
  end

  def test_server_check
    assert_equal :ok, Rules.server_check('https://studioflow.example.com')
    assert_equal :ok, Rules.server_check('http://localhost:3001')
    assert_equal :ok, Rules.server_check('http://127.0.0.1:3001')
    assert_equal :warn, Rules.server_check('http://192.168.1.20:3001')
    assert_equal :warn, Rules.server_check('http://10.0.0.5')
    assert_equal :warn, Rules.server_check('http://172.20.1.1')
    assert_equal :warn, Rules.server_check('http://studio-server')
    assert_equal :warn, Rules.server_check('http://studio.local')
    assert_equal :refuse, Rules.server_check('http://172.32.0.1')
    assert_equal :refuse, Rules.server_check('http://studioflow.example.com')
    assert_equal :refuse, Rules.server_check('ftp://192.168.1.2')
    assert_equal :refuse, Rules.server_check('localhost:3001')
  end

  def test_pending_requests_expire_inside_the_replay_window
    now = Time.at(1_800_000_000)
    assert Rules.pending_fresh?({ 'at' => now.to_i - 3600 }, now)
    refute Rules.pending_fresh?({ 'at' => now.to_i - (24 * 3600) }, now)
    refute Rules.pending_fresh?({}, now)
    assert Rules.keep_pending?('NETWORK')
    assert Rules.keep_pending?('IDEMPOTENCY_IN_PROGRESS')
    refute Rules.keep_pending?('PROJECT_ARCHIVED')
  end

  A = { 'id' => 'a', 'label' => 'A', 'isFinal' => false }.freeze
  B = { 'id' => 'b', 'label' => 'B', 'isFinal' => true }.freeze
  C = { 'id' => 'c', 'label' => 'C', 'isFinal' => false }.freeze

  def test_names_follow_the_final_decision_and_never_guess_an_option
    assert_equal 'PL-02', Rules.expected_name('PL-02', [], nil), 'item without options'
    assert_equal 'PL-02', Rules.expected_name('PL-02', [A], nil), 'item-only link, one option'
    assert_nil Rules.expected_name('PL-02', [A, B, C], nil), 'old item-only link to alternatives keeps its name'
    assert_equal 'PL-02', Rules.expected_name('PL-02', [A, B, C], 'b'), 'final option'
    assert_equal 'PL-02-A', Rules.expected_name('PL-02', [A, B, C], 'a')
    assert_equal 'PL-02-C', Rules.expected_name('PL-02', [A, C], 'c'), 'nothing final yet: every alternative has its letter'
    assert_equal 'PL-02', Rules.expected_name('PL-02', [A], 'a'), 'only option'
    assert_nil Rules.expected_name('PL-02', [A, B], 'gone'), 'deleted option keeps the name'
  end

  def test_final_moving_from_a_to_b_swaps_the_names
    before = [A.merge('isFinal' => true), B.merge('isFinal' => false)]
    after = [A, B]
    rows = [
      { key: 1, name: Rules.expected_name('PL-02', before, 'a'), target: Rules.expected_name('PL-02', after, 'a') },
      { key: 2, name: Rules.expected_name('PL-02', before, 'b'), target: Rules.expected_name('PL-02', after, 'b') }
    ]
    assert_equal [['PL-02', 'PL-02-A'], ['PL-02-B', 'PL-02']], rows.map { |row| [row[:name], row[:target]] }
    plan = Rules.refresh_plan(rows, { 'PL-02' => 1, 'PL-02-B' => 2 })
    assert_equal [1, 2], plan[:renames].map { |row| row[:key] }
  end

  def test_status
    assert_equal [:no_spec, nil], Rules.link_status([], nil)
    assert_equal [:option_not_chosen, 'B'], Rules.link_status([A, B], nil)
    assert_equal [:final, 'B'], Rules.link_status([A, B], 'b')
    assert_equal [:not_final, 'B'], Rules.link_status([A, B], 'a')
    assert_equal [:alternative, nil], Rules.link_status([A, C], 'a')
    assert_equal [:only_option, nil], Rules.link_status([A], 'a')
    assert_equal [:option_missing, 'B'], Rules.link_status([A, B], 'x')
  end

  def test_merge_only_by_official_entry_and_option_id
    link = ->(project, entry, option = nil) { { project_id: project, entry_id: entry, option_id: option } }
    assert Rules.merge_candidate?(link.('p1', 'e1', 'a'), link.('p1', 'e1', 'a'), 'p1', 3)
    refute Rules.merge_candidate?(link.('p1', 'e1', 'a'), link.('p1', 'e1', 'b'), 'p1', 3), 'two alternatives'
    refute Rules.merge_candidate?(link.('p1', 'e1'), link.('p1', 'e1'), 'p1', 2), 'item-only links to an item with alternatives'
    assert Rules.merge_candidate?(link.('p1', 'e1'), link.('p1', 'e1'), 'p1', 1)
    refute Rules.merge_candidate?(link.('p1', 'e1'), link.('p1', 'e1', 'a'), 'p1', 1), 'one has an option, the other not'
    refute Rules.merge_candidate?(link.('p1', 'e1', 'a'), link.('p2', 'e1', 'a'), 'p1', 1), 'another project'
    refute Rules.merge_candidate?(link.('p1', '', nil), link.('p1', '', nil), 'p1', 0), 'unlinked, even with the same code'
  end

  def test_spread_corners
    rectangle_with_extra_vertex = [[0, 0, 0], [50, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]]
    corners = Rules.spread_corners(rectangle_with_extra_vertex)
    assert_operator Rules.area(*corners.map { |index| rectangle_with_extra_vertex[index] }), :>=, 1999
    assert_nil Rules.spread_corners([[0, 0, 0], [1, 0, 0], [2, 0, 0]])
  end

  def test_component_tracker_accepts_option_names
    engine = BerkahStudio::MaterialScheduler::RulesEngine
    assert engine.is_registered_code?('PL-02-B', { 'PL' => 'HPL' })
    assert_nil engine.parse_dirty('PL-02-B')
    assert_equal 'PL', engine.prefix_for_code('PL-02-B')
    assert engine.parse_dirty('PL-02 copy')
  end
end
