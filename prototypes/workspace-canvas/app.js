(() => {
  'use strict';

  const phases = [
    { id: 'brief', name: 'Brief', round: 'B1', done: true },
    { id: 'survey', name: 'Site Survey', round: 'S1', done: true },
    { id: 'design', name: 'Design 3D', round: 'D2' },
    { id: 'drawing', name: 'Construction Drawing', round: 'CD Mall' },
    { id: 'site', name: 'Site', round: 'V1' }
  ];

  const initialState = {
    selectedPhase: 'design',
    filter: 'all',
    zoom: 1,
    pan: { x: 40, y: 32 },
    frames: [
      { id: 'workspace', name: 'Workspace', x: 40, y: 55, w: 540, h: 430, isDefault: true },
      { id: 'material', name: 'Material', x: 620, y: 55, w: 430, h: 430 },
      { id: 'site-frame', name: 'Site', x: 1090, y: 55, w: 390, h: 430 }
    ],
    blocks: [
      { id: 'b1', frameId: 'workspace', x: 65, y: 125, w: 230, h: 110, type: 'heading', text: 'Living room direction', phase: 'design', round: 'D2', starred: true },
      { id: 'b2', frameId: 'workspace', x: 320, y: 125, w: 230, h: 125, type: 'feedback', text: 'Prefer the warmer wall tone from option B, but keep the lighter sofa.', phase: 'design', round: 'D2', feedback: true },
      { id: 'b3', frameId: 'workspace', x: 65, y: 265, w: 245, h: 122, type: 'feedback', text: 'D1: TV wall felt too busy. Remove the upper cabinet and simplify the lighting.', phase: 'design', round: 'D1', feedback: true },
      { id: 'b4', frameId: 'workspace', x: 330, y: 280, w: 210, h: 92, type: 'text', text: 'Keep circulation to the garden clear.', phase: null, round: null },
      { id: 'b5', frameId: 'material', x: 642, y: 125, w: 385, h: 165, type: 'image', text: 'Warm oak · honed limestone · linen', phase: 'design', round: 'D2' },
      { id: 'b6', frameId: 'material', x: 642, y: 310, w: 270, h: 118, type: 'checklist', text: 'Confirm stain sample under evening light', phase: 'design', round: 'D2' },
      { id: 'b7', frameId: 'site-frame', x: 1112, y: 125, w: 330, h: 118, type: 'bullet', text: 'Existing beam is 40 mm lower than drawing', phase: 'site', round: 'V1' },
      { id: 'b8', frameId: 'site-frame', x: 1112, y: 265, w: 300, h: 110, type: 'text', text: 'Recheck curtain pocket before ceiling close-up.', phase: 'drawing', round: 'CD Mall' }
    ]
  };

  const clone = value => JSON.parse(JSON.stringify(value));
  const STORAGE_KEY = 'sf-workspace-canvas-prototype';
  function load() {
    try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (saved && Array.isArray(saved.blocks) && Array.isArray(saved.frames)) return saved; } catch (_) { /* start from the sample */ }
    return clone(initialState);
  }
  let state = load();
  let activeEditor = null;
  let interaction = null;
  let toastTimer = null;
  const isNarrow = () => window.matchMedia('(max-width: 650px)').matches;
  const byId = id => document.getElementById(id);
  const world = byId('world');
  const viewport = byId('canvasViewport');

  function phaseById(id) { return phases.find(phase => phase.id === id); }
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

  function renderPhaseStrip() {
    byId('phaseStrip').innerHTML = phases.map(phase => `<button class="phase-button ${phase.done ? 'done' : ''} ${phase.id === state.selectedPhase ? 'active' : ''}" data-phase="${phase.id}">${phase.name}</button>`).join('');
    const selected = phaseById(state.selectedPhase);
    byId('roundChip').textContent = selected.round;
    document.querySelector('#detailsDrawer .section-kicker').textContent = `${selected.name.toUpperCase()} · ${selected.round}`;
  }

  function renderFilters() {
    const current = phaseById(state.selectedPhase);
    const filters = [
      ['all', 'All'], ['general', 'General'], ['phase', current.name], ['starred', '★ Starred'], ['feedback', 'Client feedback']
    ];
    byId('filters').innerHTML = filters.map(([id, label]) => `<button class="filter-button ${state.filter === id ? 'active' : ''}" data-filter="${id}">${label}</button>`).join('');
  }

  function blockMatches(block) {
    if (state.filter === 'all') return true;
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
      ? (block.image
        ? `<img class="block-image" src="${escapeHtml(block.image)}" alt="Pasted reference">`
        : `<div class="block-image image-placeholder">${escapeHtml(block.text)}</div>`)
      : `${block.type === 'checklist' ? `<label class="check"><input type="checkbox" data-action="tick" ${block.done ? 'checked' : ''}></label>` : ''}<div class="block-content ${block.done ? 'done' : ''}" contenteditable="true" spellcheck="false">${escapeHtml(block.text)}</div>`;
    const style = mobile ? '' : `left:${block.x}px;top:${block.y}px;width:${block.w}px;height:${block.h}px;`;
    return `<article class="block ${blockMatches(block) ? '' : 'dimmed'}" data-block-id="${block.id}" data-type="${block.type}" style="${style}">
      <div class="block-top">
        <span class="drag-handle" title="Drag block">⠿</span>
        ${phase ? `<span class="chip phase">${escapeHtml(phase.name)} · ${escapeHtml(block.round || phase.round)}</span>` : `<span class="chip">General</span>`}
        ${(block.feedback || block.type === 'feedback') ? '<span class="chip feedback">Client feedback</span>' : ''}
        <button class="star-button ${block.starred ? 'starred' : ''}" data-action="star" title="Starred">★</button>
        <button class="block-menu" data-action="delete-block" title="Delete block">×</button>
      </div>
      ${content}
      <div class="block-footer"><select class="phase-select" aria-label="Set phase label">${phaseOptions(block)}</select><span>${block.type === 'feedback' ? 'Client · just now' : 'Studio team'}</span></div>
      <span class="resize-handle" data-resize="block" title="Resize"></span>
    </article>`;
  }

  function renderWorld() {
    const mobile = isNarrow();
    if (mobile) {
      world.innerHTML = state.frames.map(frame => {
        const children = state.blocks.filter(block => block.frameId === frame.id).map(block => blockMarkup(block, true)).join('');
        return `<section class="frame ${frame.isDefault ? 'default' : ''}" data-frame-id="${frame.id}">
          ${frameHeader(frame)}<div class="frame-mobile-body">${children || '<small>No blocks yet.</small>'}</div>
        </section>`;
      }).join('') + looseFrameMarkup();
      world.style.transform = 'none';
    } else {
      world.innerHTML = state.frames.map(frame => `<section class="frame ${frame.isDefault ? 'default' : ''}" data-frame-id="${frame.id}" style="left:${frame.x}px;top:${frame.y}px;width:${frame.w}px;height:${frame.h}px;">${frameHeader(frame)}<span class="resize-handle" data-resize="frame"></span></section>`).join('') + state.blocks.map(block => blockMarkup(block)).join('');
      applyTransform();
    }
  }

  function frameHeader(frame) {
    return `<div class="frame-header"><span class="frame-name" contenteditable="true" spellcheck="false">${escapeHtml(frame.name)}</span>${frame.isDefault ? '<span class="frame-badge">DEFAULT</span>' : ''}<div class="frame-actions"><button data-action="add-in-frame" title="Add block">＋</button><button data-action="delete-frame" title="Delete frame">×</button></div></div>`;
  }

  function looseFrameMarkup() {
    const loose = state.blocks.filter(block => !block.frameId);
    if (!loose.length) return '';
    return `<section class="frame loose-frame"><div class="frame-header"><span class="frame-name">Loose blocks</span></div><div class="frame-mobile-body">${loose.map(block => blockMarkup(block, true)).join('')}</div></section>`;
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

  /** A new block goes under the frame's lowest block, so it never lands on top of another one. */
  function defaultPosition(frameId) {
    const frame = state.frames.find(item => item.id === frameId);
    if (!frame) return { x: 350, y: 240 };
    const bottom = state.blocks.filter(item => item.frameId === frameId).reduce((max, item) => Math.max(max, item.y + item.h), frame.y + 54);
    return { x: frame.x + 25, y: bottom + 16 };
  }

  /** A frame grows to hold every block placed in it. */
  function fitFrame(frameId) {
    const frame = state.frames.find(item => item.id === frameId);
    if (!frame) return;
    for (const block of state.blocks.filter(item => item.frameId === frameId)) {
      frame.w = Math.max(frame.w, block.x + block.w - frame.x + 20);
      frame.h = Math.max(frame.h, block.y + block.h - frame.y + 20);
    }
  }

  function addBlock({ frameId = 'workspace', x, y, type = 'text', text = '' } = {}) {
    const position = x == null ? defaultPosition(frameId) : { x, y };
    const phase = phaseById(state.selectedPhase);
    const block = { id: uid('block'), frameId, x: position.x, y: position.y, w: 235, h: type === 'image' ? 170 : 105, type, text, phase: phase.id, round: phase.round, feedback: type === 'feedback', starred: false };
    state.blocks.push(block);
    fitFrame(frameId);
    render();
    requestAnimationFrame(() => {
      const element = document.querySelector(`[data-block-id="${block.id}"] .block-content`);
      if (element) { element.focus(); placeCaretAtEnd(element); }
    });
    return block;
  }

  function addFrame() {
    const index = state.frames.length;
    const frame = { id: uid('frame'), name: 'New topic', x: 120 + index * 45, y: 540 + (index % 2) * 50, w: 390, h: 300 };
    state.frames.push(frame);
    render();
    requestAnimationFrame(() => {
      const name = document.querySelector(`[data-frame-id="${frame.id}"] .frame-name`);
      name?.focus();
      if (name) document.execCommand('selectAll', false, null);
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
    if (!text) { notify('Add the client feedback first.'); return; }
    addBlock({ frameId: 'workspace', type: 'feedback', text });
    byId('answerText').value = '';
    closeAnswerDialog();
    notify('Client feedback added to the default Workspace frame.');
  }

  function openAnswerDialog() {
    const phase = phaseById(state.selectedPhase);
    document.querySelector('#answerDialog .section-kicker').textContent = `CLIENT ANSWERED · ${phase.name.toUpperCase()} · ${phase.round}`;
    byId('answerDialog').hidden = false; setTimeout(() => byId('answerText').focus(), 0); }
  function closeAnswerDialog() { byId('answerDialog').hidden = true; }
  function openDrawer() { byId('drawerScrim').hidden = false; byId('detailsDrawer').classList.add('open'); byId('detailsDrawer').setAttribute('aria-hidden', 'false'); }
  function closeDrawer() { byId('drawerScrim').hidden = true; byId('detailsDrawer').classList.remove('open'); byId('detailsDrawer').setAttribute('aria-hidden', 'true'); }

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

  function pointInFrame(x, y, ignoredFrameId) {
    return [...state.frames].reverse().find(frame => frame.id !== ignoredFrameId && x >= frame.x && x <= frame.x + frame.w && y >= frame.y && y <= frame.y + frame.h)?.id || null;
  }

  function startPointer(event) {
    if (isNarrow() || event.button !== 0) return;
    const resize = event.target.closest('[data-resize]');
    const blockElement = event.target.closest('[data-block-id]');
    const frameElement = event.target.closest('[data-frame-id]');
    const blockHandle = event.target.closest('.drag-handle');
    const frameHandle = event.target.closest('.frame-header');
    const worldPoint = { x: (event.clientX - viewport.getBoundingClientRect().left - state.pan.x) / state.zoom, y: (event.clientY - viewport.getBoundingClientRect().top - state.pan.y) / state.zoom };

    if (resize && blockElement) {
      const item = state.blocks.find(block => block.id === blockElement.dataset.blockId);
      interaction = { kind: 'resize-block', item, startX: event.clientX, startY: event.clientY, w: item.w, h: item.h };
    } else if (resize && frameElement) {
      const item = state.frames.find(frame => frame.id === frameElement.dataset.frameId);
      interaction = { kind: 'resize-frame', item, startX: event.clientX, startY: event.clientY, w: item.w, h: item.h };
    } else if (blockHandle && blockElement) {
      const item = state.blocks.find(block => block.id === blockElement.dataset.blockId);
      interaction = { kind: 'drag-block', item, dx: worldPoint.x - item.x, dy: worldPoint.y - item.y };
    } else if (frameHandle && frameElement && !event.target.closest('button, [contenteditable]')) {
      const item = state.frames.find(frame => frame.id === frameElement.dataset.frameId);
      interaction = { kind: 'drag-frame', item, dx: worldPoint.x - item.x, dy: worldPoint.y - item.y, children: state.blocks.filter(block => block.frameId === item.id).map(block => ({ block, x: block.x, y: block.y })) };
    } else if (!event.target.closest('button, select, [contenteditable], .block')) {
      interaction = { kind: 'pan', startX: event.clientX, startY: event.clientY, x: state.pan.x, y: state.pan.y };
      viewport.classList.add('panning');
    }
    if (interaction) { event.preventDefault(); viewport.setPointerCapture(event.pointerId); }
  }

  function movePointer(event) {
    if (!interaction) return;
    const rect = viewport.getBoundingClientRect();
    const worldX = (event.clientX - rect.left - state.pan.x) / state.zoom;
    const worldY = (event.clientY - rect.top - state.pan.y) / state.zoom;
    if (interaction.kind === 'pan') {
      state.pan.x = interaction.x + event.clientX - interaction.startX;
      state.pan.y = interaction.y + event.clientY - interaction.startY;
      applyTransform();
    } else if (interaction.kind === 'drag-block') {
      interaction.item.x = Math.max(0, worldX - interaction.dx);
      interaction.item.y = Math.max(0, worldY - interaction.dy);
      const element = document.querySelector(`[data-block-id="${interaction.item.id}"]`);
      element.style.left = `${interaction.item.x}px`; element.style.top = `${interaction.item.y}px`;
    } else if (interaction.kind === 'drag-frame') {
      const oldX = interaction.item.x, oldY = interaction.item.y;
      interaction.item.x = Math.max(0, worldX - interaction.dx);
      interaction.item.y = Math.max(0, worldY - interaction.dy);
      const deltaX = interaction.item.x - oldX, deltaY = interaction.item.y - oldY;
      interaction.children.forEach(({ block }) => { block.x += deltaX; block.y += deltaY; const element = document.querySelector(`[data-block-id="${block.id}"]`); element.style.left = `${block.x}px`; element.style.top = `${block.y}px`; });
      const element = document.querySelector(`[data-frame-id="${interaction.item.id}"]`);
      element.style.left = `${interaction.item.x}px`; element.style.top = `${interaction.item.y}px`;
    } else if (interaction.kind.startsWith('resize')) {
      const dx = (event.clientX - interaction.startX) / state.zoom;
      const dy = (event.clientY - interaction.startY) / state.zoom;
      const isFrame = interaction.kind === 'resize-frame';
      interaction.item.w = Math.max(isFrame ? 260 : 190, interaction.w + dx);
      interaction.item.h = Math.max(isFrame ? 210 : 74, interaction.h + dy);
      const key = isFrame ? 'frameId' : 'blockId';
      const element = document.querySelector(`[data-${isFrame ? 'frame' : 'block'}-id="${interaction.item.id}"]`);
      element.style.width = `${interaction.item.w}px`; element.style.height = `${interaction.item.h}px`;
    }
  }

  function endPointer() {
    if (!interaction) return;
    if (interaction.kind === 'drag-block') {
      const block = interaction.item;
      block.frameId = pointInFrame(block.x + block.w / 2, block.y + block.h / 2, null);
      notify(block.frameId ? `Moved into ${state.frames.find(frame => frame.id === block.frameId).name}.` : 'Block is now free on the canvas.');
      if (block.frameId) { fitFrame(block.frameId); render(); }
    }
    interaction = null;
    viewport.classList.remove('panning');
    save();
  }

  function showSlashMenu(editor) {
    activeEditor = editor;
    const rect = editor.getBoundingClientRect();
    const menu = byId('slashMenu');
    menu.style.left = `${Math.min(window.innerWidth - 230, Math.max(8, rect.left))}px`;
    menu.style.top = `${Math.min(window.innerHeight - 300, rect.bottom + 5)}px`;
    menu.hidden = false;
  }
  function hideSlashMenu() { byId('slashMenu').hidden = true; activeEditor = null; }

  viewport.addEventListener('pointerdown', startPointer);
  viewport.addEventListener('pointermove', movePointer);
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('wheel', event => {
    if (isNarrow()) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    setZoom(state.zoom * (event.deltaY > 0 ? .9 : 1.1), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  viewport.addEventListener('dblclick', event => {
    if (isNarrow() || event.target.closest('.block, .frame-header')) return;
    const rect = viewport.getBoundingClientRect();
    const x = (event.clientX - rect.left - state.pan.x) / state.zoom;
    const y = (event.clientY - rect.top - state.pan.y) / state.zoom;
    addBlock({ frameId: pointInFrame(x, y, null), x, y });
  });

  world.addEventListener('input', event => {
    const blockElement = event.target.closest('[data-block-id]');
    const frameElement = event.target.closest('[data-frame-id]');
    if (event.target.classList.contains('block-content') && blockElement) {
      const block = state.blocks.find(item => item.id === blockElement.dataset.blockId);
      block.text = event.target.textContent;
      if (block.text.trim().endsWith('/')) showSlashMenu(event.target); else if (activeEditor === event.target) hideSlashMenu();
    }
    if (event.target.classList.contains('frame-name') && frameElement) {
      const frame = state.frames.find(item => item.id === frameElement.dataset.frameId);
      frame.name = event.target.textContent.trim() || 'Untitled';
    }
    save();
  });

  world.addEventListener('keydown', event => {
    if (!event.target.classList.contains('block-content')) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const block = state.blocks.find(item => item.id === event.target.closest('[data-block-id]').dataset.blockId);
      addBlock({ frameId: block.frameId, x: block.x, y: block.y + block.h + 16 });
    }
    if (event.key === 'Escape') hideSlashMenu();
  });

  world.addEventListener('paste', event => {
    const image = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
    if (!image) return;
    event.preventDefault();
    const file = image.getAsFile();
    const reader = new FileReader();
    const sourceBlock = event.target.closest('[data-block-id]');
    reader.onload = () => {
      const source = state.blocks.find(item => item.id === sourceBlock?.dataset.blockId);
      const created = addBlock({ frameId: source?.frameId || 'workspace', x: source?.x, y: source ? source.y + source.h + 16 : undefined, type: 'image', text: 'Pasted image' });
      created.image = reader.result;
      render();
    };
    reader.readAsDataURL(file);
  });

  world.addEventListener('click', event => {
    const blockElement = event.target.closest('[data-block-id]');
    const frameElement = event.target.closest('[data-frame-id]');
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'tick' && blockElement) {
      const block = state.blocks.find(item => item.id === blockElement.dataset.blockId); block.done = event.target.checked; render();
    } else if (action === 'star' && blockElement) {
      const block = state.blocks.find(item => item.id === blockElement.dataset.blockId); block.starred = !block.starred; render();
    } else if (action === 'delete-block' && blockElement) {
      state.blocks = state.blocks.filter(item => item.id !== blockElement.dataset.blockId); render(); notify('Block deleted.');
    } else if (action === 'add-in-frame' && frameElement) {
      addBlock({ frameId: frameElement.dataset.frameId });
    } else if (action === 'delete-frame' && frameElement) {
      const frame = state.frames.find(item => item.id === frameElement.dataset.frameId);
      if (frame.isDefault) { notify('Workspace is the default frame and cannot be deleted.'); return; }
      state.blocks.filter(item => item.frameId === frame.id).forEach(item => { item.frameId = null; });
      state.frames = state.frames.filter(item => item.id !== frame.id); render(); notify('Frame deleted; its blocks remain loose.');
    }
  });

  world.addEventListener('change', event => {
    if (!event.target.classList.contains('phase-select')) return;
    const block = state.blocks.find(item => item.id === event.target.closest('[data-block-id]').dataset.blockId);
    block.phase = event.target.value || null;
    block.round = block.phase ? phaseById(block.phase).round : null;
    render();
  });

  byId('slashMenu').addEventListener('click', event => {
    const button = event.target.closest('[data-type]');
    if (!button || !activeEditor) return;
    const block = state.blocks.find(item => item.id === activeEditor.closest('[data-block-id]').dataset.blockId);
    block.type = button.dataset.type;
    block.feedback = block.type === 'feedback';
    block.text = block.text.replace(/\/$/, '').trim();
    hideSlashMenu(); render();
  });
  document.addEventListener('pointerdown', event => { if (!event.target.closest('#slashMenu, .block-content')) hideSlashMenu(); });
  byId('phaseStrip').addEventListener('click', event => { const button = event.target.closest('[data-phase]'); if (button) { state.selectedPhase = button.dataset.phase; render(); notify(`New blocks will use ${phaseById(state.selectedPhase).name} · ${phaseById(state.selectedPhase).round}.`); } });
  byId('filters').addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (button) { state.filter = button.dataset.filter; render(); } });
  byId('newFrameButton').addEventListener('click', addFrame);
  byId('newBlockButton').addEventListener('click', () => addBlock());
  byId('zoomIn').addEventListener('click', () => setZoom(state.zoom + .1));
  byId('zoomOut').addEventListener('click', () => setZoom(state.zoom - .1));
  byId('resetSample').addEventListener('click', () => { state = clone(initialState); render(); notify('Sample content restored.'); });
  byId('zoomReset').addEventListener('click', () => { state.zoom = 1; state.pan = { x: 40, y: 32 }; applyTransform(); save(); });
  byId('fitCanvas').addEventListener('click', () => { state.zoom = Math.min(.8, (viewport.clientWidth - 60) / 1500); state.pan = { x: 25, y: 25 }; applyTransform(); save(); });
  byId('phaseDetailsButton').addEventListener('click', openDrawer);
  byId('closeDrawer').addEventListener('click', closeDrawer);
  byId('drawerScrim').addEventListener('click', closeDrawer);
  byId('clientAnsweredButton').addEventListener('click', openAnswerDialog);
  byId('closeAnswer').addEventListener('click', closeAnswerDialog);
  byId('cancelAnswer').addEventListener('click', closeAnswerDialog);
  byId('saveAnswer').addEventListener('click', clientAnswered);
  byId('sendButton').addEventListener('click', () => notify('Prototype only: no message was sent.'));
  window.addEventListener('resize', render);

  render();
})();
