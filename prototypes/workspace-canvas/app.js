(() => {
  'use strict';

  const phases = [
    { id: 'brief', name: 'Brief', round: 'B1', status: 'Done', done: true },
    { id: 'survey', name: 'Site Survey', round: 'S1', status: 'Done', done: true },
    { id: 'design', name: 'Design 3D', round: 'D2', status: 'D2 · with client 4d', current: true, state: 'With client' },
    { id: 'drawing', name: 'Construction Drawing', round: 'CD Mall', status: 'CD Mall · in progress', current: true, state: 'In progress' },
    { id: 'site', name: 'Site', round: 'V1', status: 'Not started', state: 'Not started' }
  ];

  const GRID = 8;          // every position and width lands on this grid
  const SNAP = 10;         // within this distance an edge locks onto another edge
  const GAP = 16;          // the spacing a card snaps to when stacked under or beside another
  const FRAME_PAD = 16;    // inner padding a frame keeps around its cards
  const FRAME_HEAD = 44;   // frame header height

  const icon = {
    grip: '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'
  };

  const initialState = {
    selectedPhase: 'design',
    filter: 'all',
    zoom: 1,
    pan: { x: 32, y: 28 },
    frames: [
      { id: 'workspace', name: 'Workspace', x: 32, y: 32, w: 552, h: 400, isDefault: true },
      { id: 'material', name: 'Material', x: 616, y: 32, w: 432, h: 400 },
      { id: 'site-frame', name: 'Site', x: 1080, y: 32, w: 384, h: 400 }
    ],
    blocks: [
      { id: 'b1', frameId: 'workspace', x: 48, y: 88, w: 248, type: 'heading', text: 'Living room direction', phase: 'design', round: 'D2', starred: true },
      { id: 'b2', frameId: 'workspace', x: 312, y: 88, w: 256, type: 'feedback', text: 'Prefer the warmer wall tone from option B, but keep the lighter sofa.', phase: 'design', round: 'D2', feedback: true },
      { id: 'b3', frameId: 'workspace', x: 48, y: 216, w: 248, type: 'feedback', text: 'TV wall felt too busy. Remove the upper cabinet and simplify the lighting.', phase: 'design', round: 'D1', feedback: true },
      { id: 'b4', frameId: 'workspace', x: 312, y: 248, w: 256, type: 'text', text: 'Keep circulation to the garden clear.', phase: null, round: null },
      { id: 'b5', frameId: 'material', x: 632, y: 88, w: 400, h: 176, type: 'image', text: 'Warm oak · honed limestone · linen', phase: 'design', round: 'D2' },
      { id: 'b6', frameId: 'material', x: 632, y: 280, w: 288, type: 'checklist', text: 'Confirm stain sample under evening light', phase: 'design', round: 'D2' },
      { id: 'b7', frameId: 'site-frame', x: 1096, y: 88, w: 352, type: 'bullet', text: 'Existing beam is 40 mm lower than drawing', phase: 'site', round: 'V1' },
      { id: 'b8', frameId: 'site-frame', x: 1096, y: 200, w: 320, type: 'text', text: 'Recheck curtain pocket before ceiling close-up.', phase: 'drawing', round: 'CD Mall' }
    ]
  };

  const STORAGE_KEY = 'sf-workspace-canvas-prototype-v2';
  const clone = value => JSON.parse(JSON.stringify(value));
  function load() {
    try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (saved && Array.isArray(saved.blocks) && Array.isArray(saved.frames)) return saved; } catch (_) { /* start from the sample */ }
    return clone(initialState);
  }
  let state = load();
  let activeEditor = null;
  let interaction = null;
  let toastTimer = null;
  let spaceDown = false;
  const isNarrow = () => window.matchMedia('(max-width: 650px)').matches;
  const byId = id => document.getElementById(id);
  const world = byId('world');
  const viewport = byId('canvasViewport');
  const snapGrid = value => Math.round(value / GRID) * GRID;

  function phaseById(id) { return phases.find(phase => phase.id === id); }
  function blockById(id) { return state.blocks.find(block => block.id === id); }
  function frameById(id) { return state.frames.find(frame => frame.id === id); }
  function uid(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }
  function notify(message) {
    const toast = byId('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* prototype works without persistence */ }
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  function renderPhaseStrip() {
    byId('phaseStrip').innerHTML = phases.map(phase => `<button class="phase-step ${phase.done ? 'done' : ''} ${phase.current ? 'current' : ''} ${phase.id === state.selectedPhase ? 'active' : ''}" data-phase="${phase.id}"><i class="ring"></i><span class="pname">${phase.name}</span><small>${phase.status}</small></button>`).join('');
    const selected = phaseById(state.selectedPhase);
    byId('roundChip').textContent = selected.round;
    const badge = byId('stateBadge');
    badge.textContent = selected.state || 'Done';
    badge.hidden = !selected.state;
    document.querySelector('#detailsDrawer .section-kicker').textContent = `${selected.name} · ${selected.round}`;
  }

  function renderFilters() {
    const current = phaseById(state.selectedPhase);
    const filters = [['all', 'All'], ['general', 'General'], ['phase', current.name], ['starred', 'Starred'], ['feedback', 'Client feedback']];
    byId('filters').innerHTML = filters.map(([id, label]) => `<button class="filter-button ${state.filter === id ? 'active' : ''}" data-filter="${id}">${label}</button>`).join('');
  }

  function blockMatches(block) {
    if (state.filter === 'general') return !block.phase;
    if (state.filter === 'phase') return block.phase === state.selectedPhase;
    if (state.filter === 'starred') return block.starred;
    if (state.filter === 'feedback') return block.feedback || block.type === 'feedback';
    return true;
  }

  function phaseOptions(block) {
    return `<option value="">General</option>${phases.map(phase => `<option value="${phase.id}" ${block.phase === phase.id ? 'selected' : ''}>${phase.name}</option>`).join('')}`;
  }

  function blockMarkup(block, mobile = false) {
    const phase = phaseById(block.phase);
    const content = block.type === 'image'
      ? (block.image ? `<img class="block-image" src="${escapeHtml(block.image)}" alt="Pasted reference">` : `<div class="block-image image-placeholder">${escapeHtml(block.text)}</div>`)
      : `${block.type === 'checklist' ? `<label class="check"><input type="checkbox" data-action="tick" ${block.done ? 'checked' : ''}></label>` : ''}<div class="block-content ${block.done ? 'done' : ''}" contenteditable="true" spellcheck="false">${escapeHtml(block.text)}</div>`;
    // Only an image keeps a set height; every other card grows and shrinks with what is written in it.
    const style = mobile ? '' : `left:${block.x}px;top:${block.y}px;width:${block.w}px;${block.type === 'image' ? `height:${block.h}px;` : ''}`;
    const feedback = block.feedback || block.type === 'feedback';
    return `<article class="block ${blockMatches(block) ? '' : 'dimmed'}" data-block-id="${block.id}" data-type="${block.type}" style="${style}">
      <div class="block-top">
        <span class="drag-handle" title="Drag to move">${icon.grip}</span>
        ${phase ? `<span class="chip">${escapeHtml(phase.name)} · ${escapeHtml(block.round || phase.round)}</span>` : '<span class="chip">General</span>'}
        ${feedback ? '<span class="chip feedback">Client feedback</span>' : ''}
        <span class="block-tools"><button class="${block.starred ? 'starred' : ''}" data-action="star" title="${block.starred ? 'Unstar' : 'Star'}">${icon.star}</button><button data-action="delete-block" title="Delete card">${icon.x}</button></span>
      </div>
      ${content}
      <div class="block-footer"><select class="phase-select" aria-label="Phase label">${phaseOptions(block)}</select><span>${feedback ? 'Client · today' : 'Ayu · today'}</span></div>
      <span class="resize-handle" data-resize="block" title="${block.type === 'image' ? 'Resize' : 'Drag to change the width'}"></span>
    </article>`;
  }

  function frameHeader(frame) {
    return `<div class="frame-header"><span class="frame-name" contenteditable="true" spellcheck="false">${escapeHtml(frame.name)}</span>${frame.isDefault ? '<span class="frame-badge">Default</span>' : ''}<div class="frame-actions"><button data-action="add-in-frame" title="Add card">${icon.plus}</button><button data-action="delete-frame" title="${frame.isDefault ? 'The default frame cannot be deleted' : 'Delete frame'}">${icon.x}</button></div></div>`;
  }

  function looseFrameMarkup() {
    const loose = state.blocks.filter(block => !block.frameId);
    if (!loose.length) return '';
    return `<section class="frame loose-frame"><div class="frame-header"><span class="frame-name">Loose cards</span></div><div class="frame-mobile-body">${loose.map(block => blockMarkup(block, true)).join('')}</div></section>`;
  }

  function renderWorld() {
    if (isNarrow()) {
      world.innerHTML = state.frames.map(frame => {
        const children = state.blocks.filter(block => block.frameId === frame.id).sort((a, b) => a.y - b.y || a.x - b.x).map(block => blockMarkup(block, true)).join('');
        return `<section class="frame ${frame.isDefault ? 'default' : ''}" data-frame-id="${frame.id}">${frameHeader(frame)}<div class="frame-mobile-body">${children || '<small>No cards yet.</small>'}</div></section>`;
      }).join('') + looseFrameMarkup();
      world.style.transform = 'none';
      return;
    }
    world.innerHTML = state.frames.map(frame => `<section class="frame ${frame.isDefault ? 'default' : ''}" data-frame-id="${frame.id}" style="left:${frame.x}px;top:${frame.y}px;width:${frame.w}px;height:${frame.h}px;">${frameHeader(frame)}<span class="resize-handle" data-resize="frame"></span></section>`).join('')
      + state.blocks.map(block => blockMarkup(block)).join('')
      + '<div class="guide v" hidden></div><div class="guide h" hidden></div>';
    applyTransform();
    syncLayout();
  }

  function render() {
    renderPhaseStrip();
    renderFilters();
    renderWorld();
    save();
  }

  function applyTransform() {
    world.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
    byId('zoomReset').textContent = `${Math.round(state.zoom * 100)}%`;
  }

  /** Reads each card's real height from the page, then grows every frame so it holds its cards. */
  function syncLayout() {
    if (isNarrow()) return;
    for (const element of world.querySelectorAll('[data-block-id]')) {
      const block = blockById(element.dataset.blockId);
      if (block) block.h = element.offsetHeight;
    }
    for (const frame of state.frames) {
      fitFrame(frame);
      const element = world.querySelector(`[data-frame-id="${frame.id}"]`);
      if (element) { element.style.width = `${frame.w}px`; element.style.height = `${frame.h}px`; }
    }
  }

  function fitFrame(frame) {
    for (const block of state.blocks.filter(item => item.frameId === frame.id)) {
      frame.w = Math.max(frame.w, snapGrid(block.x + block.w - frame.x + FRAME_PAD));
      frame.h = Math.max(frame.h, snapGrid(block.y + (block.h || 0) - frame.y + FRAME_PAD));
    }
  }

  // ── Snapping ──────────────────────────────────────────────────────────

  /**
   * Snaps a card or frame being moved: an edge within SNAP of another edge (left, right, top, bottom, or one GAP
   * beside/under it) locks to it and shows a guide; otherwise the position lands on the 8 px grid.
   */
  function snapPosition(item, rawX, rawY, others, insetTarget) {
    const w = item.w, h = item.h || 0;
    const best = { x: { d: SNAP + 1 }, y: { d: SNAP + 1 } };
    const tryX = (value, guide) => { const d = Math.abs(rawX - value); if (d < best.x.d) best.x = { d, value, guide }; };
    const tryY = (value, guide) => { const d = Math.abs(rawY - value); if (d < best.y.d) best.y = { d, value, guide }; };
    for (const other of others) {
      const oh = other.h || 0;
      tryX(other.x, other.x);                                   // left edges line up
      tryX(other.x + other.w - w, other.x + other.w);           // right edges line up
      tryX(other.x + other.w + GAP, other.x + other.w + GAP);   // sits beside it
      tryY(other.y, other.y);                                   // tops line up
      tryY(other.y + oh + GAP, other.y + oh + GAP);             // stacks under it
      tryY(other.y + oh - h, other.y + oh);                     // bottoms line up
    }
    if (insetTarget) { tryX(insetTarget.x + FRAME_PAD, insetTarget.x + FRAME_PAD); tryY(insetTarget.y + FRAME_HEAD + 12, null); }
    const x = best.x.d <= SNAP ? best.x.value : snapGrid(rawX);
    const y = best.y.d <= SNAP ? best.y.value : snapGrid(rawY);
    showGuides(best.x.d <= SNAP ? best.x.guide : null, best.y.d <= SNAP ? best.y.guide : null);
    return { x: Math.max(0, x), y: Math.max(0, y) };
  }

  function showGuides(x, y) {
    const v = world.querySelector('.guide.v'), h = world.querySelector('.guide.h');
    if (v) { v.hidden = x == null; if (x != null) v.style.left = `${x}px`; }
    if (h) { h.hidden = y == null; if (y != null) h.style.top = `${y}px`; }
  }

  // ── Creating ──────────────────────────────────────────────────────────

  /** A new card goes under the frame's lowest card, so it never lands on top of another one. */
  function defaultPosition(frameId) {
    const frame = frameById(frameId);
    if (!frame) return { x: 400, y: 480 };
    const bottom = state.blocks.filter(item => item.frameId === frameId).reduce((max, item) => Math.max(max, item.y + (item.h || 0)), frame.y + FRAME_HEAD - 4);
    return { x: frame.x + FRAME_PAD, y: snapGrid(bottom + GAP) };
  }

  function addBlock({ frameId = 'workspace', x, y, type = 'text', text = '' } = {}) {
    const position = x == null ? defaultPosition(frameId) : { x: snapGrid(x), y: snapGrid(y) };
    const phase = phaseById(state.selectedPhase);
    const block = { id: uid('block'), frameId, x: position.x, y: position.y, w: 256, h: type === 'image' ? 176 : 0, type, text, phase: phase.id, round: phase.round, feedback: type === 'feedback', starred: false };
    state.blocks.push(block);
    render();
    requestAnimationFrame(() => {
      const element = world.querySelector(`[data-block-id="${block.id}"] .block-content`);
      if (element) { element.focus(); placeCaretAtEnd(element); }
    });
    return block;
  }

  function addFrame() {
    const right = state.frames.reduce((max, frame) => Math.max(max, frame.x + frame.w), 0);
    const frame = { id: uid('frame'), name: 'New topic', x: snapGrid(right + 32), y: 32, w: 384, h: 240 };
    state.frames.push(frame);
    render();
    requestAnimationFrame(() => {
      const name = world.querySelector(`[data-frame-id="${frame.id}"] .frame-name`);
      if (name) { name.focus(); document.execCommand('selectAll', false, null); }
    });
  }

  function placeCaretAtEnd(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function clientAnswered() {
    const text = byId('answerText').value.trim();
    if (!text) { notify('Write what the client said first.'); return; }
    addBlock({ frameId: state.frames.find(frame => frame.isDefault).id, type: 'feedback', text });
    byId('answerText').value = '';
    closeAnswerDialog();
    notify('Client feedback added to the Workspace frame.');
  }

  function openAnswerDialog() {
    const phase = phaseById(state.selectedPhase);
    document.querySelector('#answerDialog .section-kicker').textContent = `Client answered · ${phase.name} · ${phase.round}`;
    byId('answerDialog').hidden = false;
    setTimeout(() => byId('answerText').focus(), 0);
  }
  function closeAnswerDialog() { byId('answerDialog').hidden = true; }
  function openDrawer() { byId('drawerScrim').hidden = false; byId('detailsDrawer').classList.add('open'); byId('detailsDrawer').setAttribute('aria-hidden', 'false'); }
  function closeDrawer() { byId('drawerScrim').hidden = true; byId('detailsDrawer').classList.remove('open'); byId('detailsDrawer').setAttribute('aria-hidden', 'true'); }

  // ── Pointer: middle-click pans, left-click moves and resizes ─────────

  function setZoom(next, originX = viewport.clientWidth / 2, originY = viewport.clientHeight / 2) {
    const previous = state.zoom;
    next = Math.max(.4, Math.min(1.6, next));
    const worldX = (originX - state.pan.x) / previous;
    const worldY = (originY - state.pan.y) / previous;
    state.pan.x = originX - worldX * next;
    state.pan.y = originY - worldY * next;
    state.zoom = next;
    applyTransform(); save();
  }

  function pointInFrame(x, y) {
    return [...state.frames].reverse().find(frame => x >= frame.x && x <= frame.x + frame.w && y >= frame.y && y <= frame.y + frame.h)?.id || null;
  }

  function toWorld(event) {
    const rect = viewport.getBoundingClientRect();
    return { x: (event.clientX - rect.left - state.pan.x) / state.zoom, y: (event.clientY - rect.top - state.pan.y) / state.zoom };
  }

  function startPointer(event) {
    if (isNarrow()) return;
    // The middle button (or Space + left) moves around the canvas from anywhere, even over a card.
    if (event.button === 1 || (event.button === 0 && spaceDown)) {
      event.preventDefault();
      interaction = { kind: 'pan', startX: event.clientX, startY: event.clientY, x: state.pan.x, y: state.pan.y };
      viewport.classList.add('panning');
      viewport.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const resize = event.target.closest('[data-resize]');
    const blockElement = event.target.closest('[data-block-id]');
    const frameElement = event.target.closest('[data-frame-id]');
    const point = toWorld(event);

    if (resize && blockElement) {
      const item = blockById(blockElement.dataset.blockId);
      interaction = { kind: 'resize-block', item, element: blockElement, startX: event.clientX, startY: event.clientY, w: item.w, h: item.h };
    } else if (resize && frameElement) {
      const item = frameById(frameElement.dataset.frameId);
      interaction = { kind: 'resize-frame', item, element: frameElement, startX: event.clientX, startY: event.clientY, w: item.w, h: item.h };
    } else if (event.target.closest('.drag-handle') && blockElement) {
      const item = blockById(blockElement.dataset.blockId);
      blockElement.classList.add('dragging');
      interaction = { kind: 'drag-block', item, element: blockElement, dx: point.x - item.x, dy: point.y - item.y };
    } else if (event.target.closest('.frame-header') && frameElement && !event.target.closest('button, [contenteditable]')) {
      const item = frameById(frameElement.dataset.frameId);
      interaction = { kind: 'drag-frame', item, element: frameElement, dx: point.x - item.x, dy: point.y - item.y, children: state.blocks.filter(block => block.frameId === item.id).map(block => ({ block, x: block.x, y: block.y })), startX: item.x, startY: item.y };
    }
    if (interaction) { event.preventDefault(); viewport.setPointerCapture(event.pointerId); }
  }

  function movePointer(event) {
    if (!interaction) return;
    const point = toWorld(event);
    if (interaction.kind === 'pan') {
      state.pan.x = interaction.x + event.clientX - interaction.startX;
      state.pan.y = interaction.y + event.clientY - interaction.startY;
      applyTransform();
    } else if (interaction.kind === 'drag-block') {
      const item = interaction.item;
      const target = frameById(pointInFrame(point.x, point.y));
      const others = state.blocks.filter(block => block !== item && (!target || block.frameId === target.id));
      const snapped = snapPosition(item, point.x - interaction.dx, point.y - interaction.dy, others, target);
      item.x = snapped.x; item.y = snapped.y;
      interaction.element.style.left = `${item.x}px`; interaction.element.style.top = `${item.y}px`;
    } else if (interaction.kind === 'drag-frame') {
      const item = interaction.item;
      const snapped = snapPosition(item, point.x - interaction.dx, point.y - interaction.dy, state.frames.filter(frame => frame !== item), null);
      item.x = snapped.x; item.y = snapped.y;
      interaction.element.style.left = `${item.x}px`; interaction.element.style.top = `${item.y}px`;
      for (const { block, x, y } of interaction.children) {
        block.x = x + item.x - interaction.startX; block.y = y + item.y - interaction.startY;
        const element = world.querySelector(`[data-block-id="${block.id}"]`);
        element.style.left = `${block.x}px`; element.style.top = `${block.y}px`;
      }
    } else if (interaction.kind === 'resize-block') {
      const item = interaction.item;
      item.w = Math.max(180, snapGrid(interaction.w + (event.clientX - interaction.startX) / state.zoom));
      interaction.element.style.width = `${item.w}px`;
      if (item.type === 'image') { item.h = Math.max(120, snapGrid(interaction.h + (event.clientY - interaction.startY) / state.zoom)); interaction.element.style.height = `${item.h}px`; }
    } else if (interaction.kind === 'resize-frame') {
      const item = interaction.item;
      item.w = Math.max(260, snapGrid(interaction.w + (event.clientX - interaction.startX) / state.zoom));
      item.h = Math.max(120, snapGrid(interaction.h + (event.clientY - interaction.startY) / state.zoom));
      interaction.element.style.width = `${item.w}px`; interaction.element.style.height = `${item.h}px`;
    }
  }

  function endPointer() {
    if (!interaction) return;
    const ended = interaction;
    interaction = null;
    viewport.classList.remove('panning');
    showGuides(null, null);
    if (ended.kind === 'drag-block') {
      const block = ended.item;
      const before = block.frameId;
      block.frameId = pointInFrame(block.x + block.w / 2, block.y + Math.min(block.h || 40, 40));
      if (block.frameId !== before) notify(block.frameId ? `Moved into ${frameById(block.frameId).name}.` : 'The card is now loose on the canvas.');
    }
    if (ended.kind === 'pan') { save(); return; }
    render();
  }

  // ── Slash menu ────────────────────────────────────────────────────────

  function showSlashMenu(editor) {
    activeEditor = editor;
    const rect = editor.getBoundingClientRect();
    const menu = byId('slashMenu');
    menu.style.left = `${Math.min(window.innerWidth - 250, Math.max(8, rect.left))}px`;
    menu.style.top = `${Math.min(window.innerHeight - 290, rect.bottom + 6)}px`;
    menu.hidden = false;
  }
  function hideSlashMenu() { byId('slashMenu').hidden = true; activeEditor = null; }

  // ── Events ────────────────────────────────────────────────────────────

  viewport.addEventListener('pointerdown', startPointer);
  viewport.addEventListener('pointermove', movePointer);
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  // Stop the browser's own middle-click autoscroll and paste-on-middle-click.
  viewport.addEventListener('mousedown', event => { if (event.button === 1) event.preventDefault(); });
  viewport.addEventListener('auxclick', event => { if (event.button === 1) event.preventDefault(); });
  viewport.addEventListener('wheel', event => {
    if (isNarrow()) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    setZoom(state.zoom * (event.deltaY > 0 ? .9 : 1.1), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  viewport.addEventListener('dblclick', event => {
    if (isNarrow() || event.target.closest('.block, .frame-header')) return;
    const point = toWorld(event);
    addBlock({ frameId: pointInFrame(point.x, point.y), x: point.x, y: point.y });
  });
  window.addEventListener('keydown', event => { if (event.code === 'Space' && !event.target.closest('[contenteditable], textarea, input')) { spaceDown = true; viewport.style.cursor = 'grab'; } });
  window.addEventListener('keyup', event => { if (event.code === 'Space') { spaceDown = false; viewport.style.cursor = ''; } });

  world.addEventListener('input', event => {
    const blockElement = event.target.closest('[data-block-id]');
    const frameElement = event.target.closest('[data-frame-id]');
    if (event.target.classList.contains('block-content') && blockElement) {
      const block = blockById(blockElement.dataset.blockId);
      block.text = event.target.textContent;
      if (block.text.trim().endsWith('/')) showSlashMenu(event.target); else if (activeEditor === event.target) hideSlashMenu();
      syncLayout(); // the card grows as it is written in, and its frame with it
    }
    if (event.target.classList.contains('frame-name') && frameElement) {
      frameById(frameElement.dataset.frameId).name = event.target.textContent.trim() || 'Untitled';
    }
    save();
  });

  world.addEventListener('keydown', event => {
    if (!event.target.classList.contains('block-content')) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const block = blockById(event.target.closest('[data-block-id]').dataset.blockId);
      addBlock({ frameId: block.frameId, x: block.x, y: block.y + (block.h || 0) + GAP });
    }
    if (event.key === 'Escape') hideSlashMenu();
  });

  world.addEventListener('paste', event => {
    const image = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
    if (!image) return;
    event.preventDefault();
    const reader = new FileReader();
    const sourceBlock = event.target.closest('[data-block-id]');
    reader.onload = () => {
      const source = blockById(sourceBlock?.dataset.blockId);
      const created = addBlock({ frameId: source?.frameId || 'workspace', x: source?.x, y: source ? source.y + (source.h || 0) + GAP : undefined, type: 'image', text: 'Pasted image' });
      created.image = reader.result;
      render();
    };
    reader.readAsDataURL(image.getAsFile());
  });

  world.addEventListener('click', event => {
    const blockElement = event.target.closest('[data-block-id]');
    const frameElement = event.target.closest('[data-frame-id]');
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'tick' && blockElement) {
      blockById(blockElement.dataset.blockId).done = event.target.checked; render();
    } else if (action === 'star' && blockElement) {
      const block = blockById(blockElement.dataset.blockId); block.starred = !block.starred; render();
    } else if (action === 'delete-block' && blockElement) {
      state.blocks = state.blocks.filter(item => item.id !== blockElement.dataset.blockId); render(); notify('Card deleted.');
    } else if (action === 'add-in-frame' && frameElement) {
      addBlock({ frameId: frameElement.dataset.frameId });
    } else if (action === 'delete-frame' && frameElement) {
      const frame = frameById(frameElement.dataset.frameId);
      if (frame.isDefault) { notify('Workspace is the default frame; it can be renamed or moved, not deleted.'); return; }
      state.blocks.filter(item => item.frameId === frame.id).forEach(item => { item.frameId = null; });
      state.frames = state.frames.filter(item => item.id !== frame.id); render(); notify('Frame deleted; its cards stay on the canvas.');
    }
  });

  world.addEventListener('change', event => {
    if (!event.target.classList.contains('phase-select')) return;
    const block = blockById(event.target.closest('[data-block-id]').dataset.blockId);
    block.phase = event.target.value || null;
    block.round = block.phase ? phaseById(block.phase).round : null;
    render();
  });

  byId('slashMenu').addEventListener('click', event => {
    const button = event.target.closest('[data-type]');
    if (!button || !activeEditor) return;
    const block = blockById(activeEditor.closest('[data-block-id]').dataset.blockId);
    block.type = button.dataset.type;
    block.feedback = block.type === 'feedback';
    block.text = block.text.replace(/\/\s*$/, '').trim();
    hideSlashMenu(); render();
  });
  document.addEventListener('pointerdown', event => { if (!event.target.closest('#slashMenu, .block-content')) hideSlashMenu(); });
  byId('phaseStrip').addEventListener('click', event => {
    const button = event.target.closest('[data-phase]');
    if (!button) return;
    state.selectedPhase = button.dataset.phase;
    render();
    const phase = phaseById(state.selectedPhase);
    notify(`New cards will be labelled ${phase.name} · ${phase.round}.`);
  });
  byId('filters').addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (button) { state.filter = button.dataset.filter; render(); } });
  byId('newFrameButton').addEventListener('click', addFrame);
  byId('newBlockButton').addEventListener('click', () => addBlock());
  byId('zoomIn').addEventListener('click', () => setZoom(state.zoom + .1));
  byId('zoomOut').addEventListener('click', () => setZoom(state.zoom - .1));
  byId('zoomReset').addEventListener('click', () => { state.zoom = 1; state.pan = { x: 32, y: 28 }; applyTransform(); save(); });
  byId('fitCanvas').addEventListener('click', () => {
    const right = Math.max(...state.frames.map(frame => frame.x + frame.w), ...state.blocks.map(block => block.x + block.w));
    state.zoom = Math.max(.4, Math.min(1, (viewport.clientWidth - 48) / right)); state.pan = { x: 24, y: 24 }; applyTransform(); save();
  });
  byId('resetSample').addEventListener('click', () => { state = clone(initialState); render(); notify('Sample content restored.'); });
  byId('phaseDetailsButton').addEventListener('click', openDrawer);
  byId('closeDrawer').addEventListener('click', closeDrawer);
  byId('drawerScrim').addEventListener('click', closeDrawer);
  byId('clientAnsweredButton').addEventListener('click', openAnswerDialog);
  byId('closeAnswer').addEventListener('click', closeAnswerDialog);
  byId('cancelAnswer').addEventListener('click', closeAnswerDialog);
  byId('saveAnswer').addEventListener('click', clientAnswered);
  byId('sendButton').addEventListener('click', () => notify('Prototype only: nothing was sent.'));
  window.addEventListener('resize', render);
  document.fonts?.ready.then(() => { if (!interaction) render(); });

  render();
})();
