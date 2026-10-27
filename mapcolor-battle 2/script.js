/* script.js — MapColor Battle game engine (rules, turns, scoring, ownership, undo) and browser UI. */

const COLOR_INFO = {
  red: { name: 'Red', hex: '#ff4d5e' },
  blue: { name: 'Blue', hex: '#3b82f6' },
  green: { name: 'Green', hex: '#22c55e' },
  yellow: { name: 'Yellow', hex: '#facc15' }
};
const ALL_COLORS = Object.keys(COLOR_INFO);
const POINTS = { valid: 10, invalid: -5 };

/* ------------------------------------------------------------------------------------------
 * Engine — pure game rules, no DOM. Every region stores { color, owner, locked }.
 * A successful move locks the region to its owner for the rest of the game.
 * ---------------------------------------------------------------------------------------- */
const Engine = (() => {
  const clone = o => JSON.parse(JSON.stringify(o));
  const regionName = (state, id) => MAPS[state.mapId].regions[id];
  const colorName = c => COLOR_INFO[c].name;

  function createGame(mapId, players, numColors = 4) {
    const board = {};
    Object.keys(MAPS[mapId].regions).forEach(id => { board[id] = { color: null, owner: null, locked: false }; });
    return {
      mapId,
      colors: ALL_COLORS.slice(0, numColors),
      players: players.map(p => ({ name: p.name, avatar: p.avatar, score: 0, valid: 0, invalid: 0 })),
      current: 0,
      board,
      history: [],
      violations: 0,
      over: false,
      endReason: null,
      undo: null // snapshot taken before the latest valid move (one level only)
    };
  }

  function record(state, region, color, result, detail) {
    state.history.push({ n: state.history.length + 1, player: state.current, region, color, result, detail });
  }

  /**
   * Validates and applies a move by the current player.
   * Statuses: 'locked' (region already owned, nothing changes), 'invalid' (adjacency conflict,
   * −5 and the turn stays), 'valid' (+10, region locked to the player, turn passes).
   */
  function attemptMove(state, id, color) {
    const map = MAPS[state.mapId];
    if (state.over) return { status: 'over', message: 'The game is over. Restart or choose another map.' };
    if (!map.regions[id]) return { status: 'rejected', message: 'Unknown region.' };
    const cell = state.board[id];
    if (cell.locked) {
      const owner = state.players[cell.owner];
      return {
        status: 'locked',
        message: `This region (${regionName(state, id)}) is already colored by ${owner.name} (P${cell.owner + 1}) and cannot be changed.`
      };
    }
    if (!state.colors.includes(color)) return { status: 'rejected', message: 'Pick a color from the palette.' };

    const player = state.players[state.current];
    const conflicts = map.adjacency[id].filter(n => state.board[n].color === color);
    if (conflicts.length) {
      player.score += POINTS.invalid;
      player.invalid++;
      state.violations++;
      const names = conflicts.map(n => regionName(state, n)).join(' and ');
      const message = `${regionName(state, id)} cannot be ${colorName(color)} because it is adjacent to ${names}, which ${conflicts.length > 1 ? 'are' : 'is'} ${colorName(color)}.`;
      record(state, id, color, 'invalid', message);
      state.undo = null; // the opponent acted after the last valid move, so it can no longer be taken back
      return { status: 'invalid', conflicts, message };
    }

    const snapshot = clone({ ...state, undo: null });
    state.board[id] = { color, owner: state.current, locked: true };
    player.score += POINTS.valid;
    player.valid++;
    const message = `${player.name} colored ${regionName(state, id)} ${colorName(color)}.`;
    record(state, id, color, 'valid', message);
    state.current = 1 - state.current;
    state.undo = snapshot;
    checkGameOver(state);
    return { status: 'valid', message };
  }

  /** The game ends when every region is colored or no uncolored region has a legal color left. */
  function checkGameOver(state) {
    const map = MAPS[state.mapId];
    const open = Object.keys(map.regions).filter(id => !state.board[id].color);
    if (!open.length) state.endReason = 'complete';
    else if (open.every(id => !CSP.legalColors(map, state.board, state.colors, id).length)) state.endReason = 'stuck';
    state.over = !!state.endReason;
    if (state.over) state.undo = null;
    return state.over;
  }

  /** Turn timer ran out: no points change, the turn passes. */
  function timeout(state) {
    record(state, null, null, 'timeout', `${state.players[state.current].name} ran out of time.`);
    state.current = 1 - state.current;
    state.undo = null;
  }

  /**
   * Undo rule: only the latest valid move can be taken back, and only before the opponent acts
   * (no invalid attempt or timeout since). It restores the exact previous state — the mover's region
   * becomes uncolored, scores and counters revert and the turn returns to the mover. One level only,
   * so undo can never touch a region owned by the other player.
   */
  function undo(state) {
    if (!state.undo) return false;
    Object.assign(state, state.undo);
    return true;
  }

  /** 0 or 1 for the winner, −1 for a draw. */
  function winner(state) {
    const [a, b] = state.players.map(p => p.score);
    return a === b ? -1 : a > b ? 0 : 1;
  }

  return { createGame, attemptMove, checkGameOver, timeout, undo, winner };
})();

/* ------------------------------------------------------------------------------------------
 * Browser UI
 * ---------------------------------------------------------------------------------------- */
function initUI() {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const UNCOLORED = '#16284d';
  const PLAYER_COLORS = ['#22d3ee', '#ff4fd8'];
  const AVATARS = ['🦊', '🐼', '🦁', '🐯', '🐸', '🐙', '🦉', '🐲', '🐺', '🦄'];
  const STEP_DELAY = { slow: 650, normal: 280, fast: 80 };

  const settings = { numColors: 4, timer: 30, speed: 'normal', sound: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('mapcolor-settings')) || {}); } catch (e) { /* storage unavailable */ }
  const saveSettings = () => { try { localStorage.setItem('mapcolor-settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } };

  const ui = {
    mapId: 'australia',
    players: [{ name: 'Player 1', avatar: AVATARS[0] }, { name: 'Player 2', avatar: AVATARS[1] }],
    state: null,
    selected: null,
    armedColor: null,
    hintColor: null,
    hintTarget: null,
    conflicts: [],
    remaining: 0,
    lastTick: performance.now(),
    ai: { preview: null, flash: null, timer: null }
  };
  const map = () => MAPS[ui.state.mapId];

  /* ---------- sound ---------- */
  let audio = null;
  const SOUNDS = {
    valid: [[660, 0], [880, 0.08]],
    invalid: [[190, 0, 0.28, 'square']],
    locked: [[260, 0, 0.12, 'triangle']],
    win: [[523, 0], [659, 0.13], [784, 0.26], [1047, 0.39, 0.35]]
  };
  function play(name) {
    if (!settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      SOUNDS[name].forEach(([freq, at, dur = 0.14, type = 'sine']) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const t = audio.currentTime + at;
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(audio.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      });
    } catch (e) { /* audio unavailable */ }
  }

  /* ---------- toasts & modals ---------- */
  const TOAST_ICONS = { success: '✓', error: '!', info: 'i', warn: '🔒' };
  function toast(type, title, text) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type]}</span><div><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
    $('#toasts').prepend(el);
    [...$('#toasts').children].slice(3).forEach(old => old.remove());
    setTimeout(() => el.classList.add('out'), type === 'error' ? 4200 : 3000);
    setTimeout(() => el.remove(), type === 'error' ? 4600 : 3400);
  }

  const openModal = id => $(id).classList.add('open');
  const closeModal = el => el.classList.remove('open');
  const modalOpen = () => !!$('.modal.open');
  function confirmAction(title, text, onYes) {
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    $('#confirm-yes').onclick = () => { closeModal($('#modal-confirm')); onYes(); };
    openModal('#modal-confirm');
  }

  /* ---------- menu ---------- */
  function previewSvg(m) {
    const geo = buildMapGeometry(m);
    const board = {};
    Object.keys(m.regions).forEach(id => { board[id] = { color: null }; });
    const colors = CSP.solve(CSP.createProblem(m, board, ALL_COLORS)).assignment;
    const paths = Object.keys(m.regions).map(id =>
      `<path d="${geo.regions[id].d}" fill="${COLOR_INFO[colors[id]].hex}"/>`).join('');
    return `<svg class="map-preview" viewBox="-3 -3 ${geo.width + 6} ${geo.height + 6}" aria-hidden="true">${paths}</svg>`;
  }

  function renderMenu() {
    $('#map-cards').innerHTML = Object.values(MAPS).map(m => `
      <button class="map-card${m.id === ui.mapId ? ' selected' : ''}" data-map="${m.id}" aria-pressed="${m.id === ui.mapId}">
        <span class="map-check">✓</span>
        <div class="map-preview-wrap">${previewSvg(m)}</div>
        <div class="map-card-info">
          <h3>${m.name}</h3>
          <p>${m.tagline}</p>
          <div class="map-meta"><span class="region-count">${Object.keys(m.regions).length} regions</span><span class="tag">Simplified</span></div>
        </div>
      </button>`).join('');
    ui.players.forEach((p, i) => {
      $(`#avatar-${i}`).textContent = p.avatar;
      $(`#name-${i}`).value = p.name;
    });
  }

  function showScreen(name) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === `screen-${name}`));
    window.scrollTo(0, 0);
  }

  function startGame(mapId) {
    clearAI(true);
    ui.state = Engine.createGame(mapId, ui.players, settings.numColors);
    ui.selected = ui.armedColor = ui.hintColor = null;
    ui.conflicts = [];
    ui.remaining = settings.timer * 1000;
    buildBoard();
    $('#compare-body').innerHTML = '<tr><td colspan="3" class="muted">Run the comparison to measure both algorithms on the current board.</td></tr>';
    showScreen('game');
    refresh();
  }

  /* ---------- board ---------- */
  function labelMarkup(id, geo, m) {
    const r = geo.regions[id];
    const small = r.cells < 4;
    let lines = [id];
    if (m.labelNames) {
      const words = m.regions[id].split(' ');
      lines = words.length > 1 && m.regions[id].length > 10
        ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')]
        : [m.regions[id]];
    }
    const size = small ? 6 : m.labelNames ? 8.5 : 9;
    const top = -(lines.length - 1) * size * 0.55 - (small ? 0 : 3);
    const text = lines.map((l, i) => `<tspan x="0" y="${(top + i * size * 1.1).toFixed(1)}">${esc(l)}</tspan>`).join('');
    const by = top + (lines.length - 1) * size * 1.1 + size * 1.05;
    return `<g class="label${small ? ' small' : ''}" data-id="${id}" transform="translate(${r.labelX.toFixed(1)},${r.labelY.toFixed(1)})">
      <text class="label-text" font-size="${size}">${text}</text>
      <g class="badge" transform="translate(0,${by.toFixed(1)})"><rect x="-10" y="-5.5" width="20" height="11" rx="5.5"/><text font-size="7.5" y="2.7">P1</text></g>
    </g>`;
  }

  function buildBoard() {
    const m = map();
    const geo = buildMapGeometry(m);
    const ids = Object.keys(m.regions);
    const svg = $('#map-svg');
    svg.setAttribute('viewBox', `-6 -6 ${geo.width + 12} ${geo.height + 12}`);
    svg.innerHTML = `
      <defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <g class="regions">${ids.map(id => `<path class="region" data-id="${id}" d="${geo.regions[id].d}" style="fill:${UNCOLORED}"><title>${esc(m.regions[id])}</title></path>`).join('')}</g>
      <g class="labels">${ids.map(id => labelMarkup(id, geo, m)).join('')}</g>`;
    $('#map-chip').textContent = `${m.name} · ${ids.length} regions`;
    $('#map-note').textContent = m.note;
  }

  function updateMap() {
    const m = map();
    const { board } = ui.state;
    const neighbors = ui.selected ? m.adjacency[ui.selected] : [];
    const group = $('#map-svg .regions');
    $$('#map-svg .region').forEach(path => {
      const id = path.dataset.id;
      const cell = board[id];
      const ai = !cell.color && ui.ai.preview && ui.ai.preview[id];
      const color = cell.color || ai;
      path.style.fill = color ? COLOR_INFO[color].hex : UNCOLORED;
      path.classList.toggle('colored', !!cell.color);
      path.classList.toggle('ai', !!ai);
      path.classList.toggle('selected', id === ui.selected);
      path.classList.toggle('neighbor', neighbors.includes(id));
      path.classList.toggle('conflict', ui.conflicts.includes(id));
      path.classList.toggle('flash', id === ui.ai.flash);
      path.querySelector('title').textContent = `${m.regions[id]} — ${cell.color ? `${COLOR_INFO[cell.color].name}, owned by ${ui.state.players[cell.owner].name}` : 'uncolored'}`;
    });
    // Draw highlighted outlines last so they sit on top of neighbouring borders.
    [...neighbors, ...ui.conflicts, ui.selected].forEach(id => {
      if (id) group.appendChild(group.querySelector(`[data-id="${id}"]`));
    });
    $$('#map-svg .label').forEach(label => {
      const cell = board[label.dataset.id];
      const ai = !cell.color && ui.ai.preview && ui.ai.preview[label.dataset.id];
      const badge = label.querySelector('.badge');
      badge.classList.toggle('show', cell.owner !== null || !!ai);
      badge.querySelector('text').textContent = cell.owner !== null ? `P${cell.owner + 1}` : 'AI';
      badge.querySelector('rect').style.fill = cell.owner !== null ? PLAYER_COLORS[cell.owner] : '#a78bfa';
      label.classList.toggle('on-color', !!(cell.color || ai));
    });
  }

  /* ---------- panels ---------- */
  function renderPlayers() {
    const { state } = ui;
    state.players.forEach((p, i) => {
      const card = $(`#pcard-${i}`);
      card.classList.toggle('active', i === state.current && !state.over);
      card.querySelector('[data-avatar]').textContent = p.avatar;
      card.querySelector('[data-name]').textContent = p.name;
      card.querySelector('[data-score]').textContent = p.score;
      card.querySelector('[data-valid]').textContent = p.valid;
      card.querySelector('[data-invalid]').textContent = p.invalid;
    });
    const turn = $('#turn-name');
    turn.textContent = state.over ? 'Game Over' : `${state.players[state.current].name}'s Turn`;
    turn.style.color = state.over ? '' : PLAYER_COLORS[state.current];
    $('#turn-panel').dataset.player = state.current;
    const undoBtn = $('#btn-undo');
    undoBtn.disabled = !state.undo;
    undoBtn.title = state.undo ? `Take back ${state.players[1 - state.current].name}'s last move` : 'Only the latest move can be undone, before the opponent acts';
  }

  function renderTimer() {
    const total = settings.timer * 1000;
    const timer = $('#timer');
    timer.classList.toggle('off', !total);
    if (!total) { $('#timer-text').textContent = '∞'; return; }
    const secs = Math.max(0, Math.ceil(ui.remaining / 1000));
    $('#timer-text').textContent = secs;
    $('#timer-ring').style.strokeDashoffset = (163.4 * (1 - Math.max(0, ui.remaining) / total)).toFixed(1);
    timer.classList.toggle('warn', secs <= 5 && !ui.state.over);
  }

  function renderPalette() {
    const { state } = ui;
    const sel = ui.selected && !state.board[ui.selected].locked ? ui.selected : null;
    const legal = sel ? CSP.legalColors(map(), state.board, state.colors, sel) : state.colors;
    $('#palette').innerHTML = state.colors.map((c, i) => `
      <button class="color-btn${ui.armedColor === c ? ' armed' : ''}${legal.includes(c) ? '' : ' illegal'}${ui.hintColor === c ? ' hinted' : ''}"
        data-color="${c}" style="--c:${COLOR_INFO[c].hex}" aria-label="${COLOR_INFO[c].name}">
        <span class="swatch"></span><span class="color-name">${COLOR_INFO[c].name}</span><kbd>${i + 1}</kbd>
      </button>`).join('');
    $('#palette-hint').textContent = state.over ? 'The game is over.'
      : sel ? `Pick a color for ${map().regions[sel]}. Crossed-out colors clash with a neighbor.`
      : ui.armedColor ? `${COLOR_INFO[ui.armedColor].name} armed — click any uncolored region.`
      : 'Select an uncolored region, then a color (or pick a color first).';
  }

  function chip(id) {
    const cell = ui.state.board[id];
    const dot = cell.color ? `<i style="background:${COLOR_INFO[cell.color].hex}"></i>` : '<i class="empty"></i>';
    return `<button class="chip" data-select="${id}" title="${esc(map().regions[id])}">${dot}${id}</button>`;
  }

  function renderRegionInfo() {
    const box = $('#region-info');
    const id = ui.selected;
    if (!id) {
      box.innerHTML = '<p class="muted">Click any region on the map to inspect it.</p>';
      return;
    }
    const m = map();
    const { state } = ui;
    const cell = state.board[id];
    const legal = CSP.legalColors(m, state.board, state.colors, id);
    const owner = cell.owner !== null ? state.players[cell.owner] : null;
    const status = cell.locked
      ? `<span class="status-badge locked" style="--pc:${PLAYER_COLORS[cell.owner]}">🔒 Locked · P${cell.owner + 1}</span>`
      : legal.length ? '<span class="status-badge open">Uncolored · Selected</span>' : '<span class="status-badge dead">No legal color</span>';
    box.innerHTML = `
      <div class="region-head">
        <span class="region-swatch" style="background:${cell.color ? COLOR_INFO[cell.color].hex : UNCOLORED}"></span>
        <div><h3>${esc(m.regions[id])}</h3><span class="muted">${id}</span></div>
      </div>
      <dl class="region-facts">
        <dt>Status</dt><dd>${status}</dd>
        <dt>Owner</dt><dd>${owner ? `<b style="color:${PLAYER_COLORS[cell.owner]}">${esc(owner.name)}</b>` : '—'}</dd>
        <dt>Color</dt><dd>${cell.color ? COLOR_INFO[cell.color].name : '—'}</dd>
        <dt>Neighbors</dt><dd class="chips">${m.adjacency[id].map(chip).join('') || '<span class="muted">None (island)</span>'}</dd>
        <dt>Legal colors</dt><dd class="chips">${cell.locked ? '<span class="muted">Locked region</span>'
          : legal.map(c => `<span class="chip"><i style="background:${COLOR_INFO[c].hex}"></i>${COLOR_INFO[c].name}</span>`).join('') || '<span class="bad">None left</span>'}</dd>
      </dl>
      ${cell.locked ? `<p class="locked-note">This region is already colored by ${esc(owner.name)} and cannot be changed.</p>` : ''}`;
  }

  const RESULT_LABEL = { valid: 'Valid +10', invalid: 'Invalid −5', timeout: 'Time out' };
  function renderHistory() {
    const { state } = ui;
    $('#history-body').innerHTML = state.history.slice().reverse().map(h => `
      <tr class="${h.result}" title="${esc(h.detail)}">
        <td>${h.n}</td>
        <td><span class="pdot" style="background:${PLAYER_COLORS[h.player]}"></span>${esc(state.players[h.player].name)}</td>
        <td>${h.region ? esc(map().regions[h.region]) : '—'}</td>
        <td>${h.color ? `<span class="cdot" style="background:${COLOR_INFO[h.color].hex}"></span>${COLOR_INFO[h.color].name}` : '—'}</td>
        <td><span class="result-pill ${h.result}">${RESULT_LABEL[h.result]}</span></td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">No moves yet.</td></tr>';
    $('#history-count').textContent = `${state.history.length} entries`;
  }

  function renderStatus() {
    const { state } = ui;
    const ids = Object.keys(state.board);
    const last = state.history[state.history.length - 1];
    const latest = $('#status-latest');
    latest.textContent = last ? last.detail : `${state.players[0].name} starts. Pick any region.`;
    latest.className = last ? last.result : '';
    $('#status-colored').textContent = `${ids.filter(id => state.board[id].color).length} / ${ids.length}`;
    $('#status-conflicts').textContent = state.violations;
  }

  function refresh() {
    renderPlayers();
    renderTimer();
    updateMap();
    renderPalette();
    renderRegionInfo();
    renderHistory();
    renderStatus();
  }

  /* ---------- gameplay ---------- */
  function handleMove(id, color) {
    clearAI();
    const { state } = ui;
    const result = Engine.attemptMove(state, id, color);
    ui.hintColor = null;
    ui.conflicts = result.status === 'invalid' ? [id, ...result.conflicts] : [];
    if (result.status === 'valid') {
      ui.selected = null;
      ui.remaining = settings.timer * 1000;
      play('valid');
      toast('success', 'Valid Move! +10', result.message);
      const panel = $('#turn-panel');
      panel.classList.remove('turn-change');
      void panel.offsetWidth; // restart the CSS animation
      panel.classList.add('turn-change');
    } else if (result.status === 'invalid') {
      play('invalid');
      toast('error', 'Invalid Move! −5 points', result.message);
      $('#map-stage').classList.remove('shake');
      void $('#map-stage').offsetWidth;
      $('#map-stage').classList.add('shake');
    } else if (result.status === 'locked') {
      play('locked');
      toast('warn', 'Region Locked', result.message);
    } else {
      toast('info', 'Not allowed', result.message);
    }
    refresh();
    if (state.over) setTimeout(showGameOver, 900);
  }

  function onRegionClick(id) {
    clearAI();
    const cell = ui.state.board[id];
    ui.conflicts = [];
    ui.selected = id;
    if (cell.locked) {
      ui.armedColor = null;
      handleMove(id, null); // reports the lock; never changes the region
      return;
    }
    if (ui.armedColor && !ui.state.over) {
      const color = ui.armedColor;
      ui.armedColor = null;
      handleMove(id, color);
      return;
    }
    if (ui.hintColor && ui.hintTarget !== id) ui.hintColor = null;
    refresh();
  }

  function onColorClick(color) {
    if (ui.state.over || !ui.state.colors.includes(color)) return;
    if (ui.selected && !ui.state.board[ui.selected].locked) {
      handleMove(ui.selected, color);
      return;
    }
    ui.armedColor = ui.armedColor === color ? null : color;
    refresh();
  }

  function showGameOver() {
    const { state } = ui;
    if (!state.over) return;
    const w = Engine.winner(state);
    play('win');
    const totals = state.players.reduce((t, p) => ({ valid: t.valid + p.valid, invalid: t.invalid + p.invalid }), { valid: 0, invalid: 0 });
    const open = Object.keys(state.board).filter(id => !state.board[id].color).length;
    $('#go-title').textContent = w === -1 ? "It's a Draw!" : `${state.players[w].name} Wins!`;
    $('#go-reason').textContent = state.endReason === 'complete'
      ? `Every region of ${map().name} has been colored.`
      : `No legal moves remain — ${open} region${open > 1 ? 's' : ''} cannot take any color.`;
    $('#go-players').innerHTML = state.players.map((p, i) => `
      <div class="go-player${i === w ? ' winner' : ''}" style="--pc:${PLAYER_COLORS[i]}">
        ${i === w ? '<span class="crown">👑</span>' : ''}
        <div class="go-avatar">${p.avatar}</div>
        <div class="go-name">${esc(p.name)}</div>
        <div class="go-score">${p.score}<small> pts</small></div>
        <div class="go-sub">${p.valid} valid · ${p.invalid} invalid</div>
      </div>`).join('<div class="go-vs">VS</div>');
    $('#go-valid').textContent = totals.valid;
    $('#go-invalid').textContent = totals.invalid;
    $('#go-regions').textContent = `${Object.keys(state.board).length - open} / ${Object.keys(state.board).length}`;
    $('#confetti').innerHTML = Array.from({ length: 70 }, () => {
      const c = ['#22d3ee', '#ff4fd8', '#a78bfa', '#facc15', '#3b82f6', '#22c55e'][Math.floor(Math.random() * 6)];
      return `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${c};animation-delay:${(Math.random() * 2.5).toFixed(2)}s;animation-duration:${(2.8 + Math.random() * 2.2).toFixed(2)}s;transform:rotate(${Math.floor(Math.random() * 360)}deg)"></i>`;
    }).join('');
    openModal('#modal-gameover');
  }

  /* ---------- AI solver ---------- */
  // AI requests go to the Python solver (app.py + csp_solver.py) when the page is served by app.py.
  // Otherwise — GitHub Pages, another static server, or index.html opened directly — the same
  // algorithms run in the browser from csp-solver.js.
  let pythonAvailable = location.protocol.startsWith('http');
  async function runAI(action, extra, inBrowser) {
    if (pythonAvailable) {
      try {
        const res = await fetch(`api/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adjacency: map().adjacency,
            board: Object.fromEntries(Object.entries(ui.state.board).map(([id, cell]) => [id, cell.color])),
            colors: ui.state.colors,
            ...extra
          })
        });
        if (res.ok) return { data: await res.json(), engine: 'Python' };
      } catch (e) { /* no Python server running */ }
      pythonAvailable = false;
    }
    return { data: inBrowser(), engine: 'JavaScript' };
  }

  function showAIStats(result, action, engine) {
    $('#ai-algo').textContent = `${result.methodName} · ${engine}`;
    $('#ai-nodes').textContent = result.stats.nodes;
    $('#ai-backtracks').textContent = result.stats.backtracks;
    $('#ai-checks').textContent = result.stats.checks;
    $('#ai-wipeouts').textContent = result.stats.wipeouts;
    $('#ai-time').textContent = `${result.timeMs.toFixed(3)} ms`;
    setAIStatus(result.solved ? 'ok' : 'fail', `${action}: ${result.solved ? 'solution found' : 'no solution'}`);
  }

  function setAIStatus(kind, text) {
    const el = $('#ai-status');
    el.className = `ai-status ${kind}`;
    el.textContent = text;
  }

  function clearAI(resetStats) {
    clearInterval(ui.ai.timer);
    ui.ai = { preview: null, flash: null, timer: null };
    if (resetStats) {
      ['#ai-nodes', '#ai-backtracks', '#ai-checks', '#ai-wipeouts', '#ai-time'].forEach(s => { $(s).textContent = '—'; });
      $('#ai-algo').textContent = CSP.METHODS[$('#algo').value];
      setAIStatus('idle', 'Idle');
      $('#ai-log').textContent = 'The AI works on a copy of the board. It never scores or locks regions.';
    }
  }

  const openRegions = () => Object.keys(ui.state.board).filter(id => !ui.state.board[id].color);
  const runSolver = trace => CSP.solve(CSP.createProblem(map(), ui.state.board, ui.state.colors), { method: $('#algo').value, trace });

  function failureText() {
    return `No valid coloring exists for the ${openRegions().length} remaining regions with ${ui.state.colors.length} colors and the current locked regions.`;
  }

  async function solveWithAI() {
    clearAI();
    if (!openRegions().length) { toast('info', 'Nothing to solve', 'Every region is already colored.'); return; }
    const { data: result, engine } = await runAI('solve', { method: $('#algo').value }, () => runSolver(false));
    showAIStats(result, 'Solve', engine);
    if (result.solved) {
      ui.ai.preview = result.assignment;
      $('#ai-log').textContent = `Preview of a complete valid coloring (purple “AI” badges). Not scored — click the map or Reset AI to hide it.`;
    } else {
      $('#ai-log').textContent = failureText();
      toast('error', 'AI: No Solution', failureText());
    }
    refresh();
  }

  function describeStep(s) {
    const n = id => map().regions[id];
    const c = s.c && COLOR_INFO[s.c].name;
    return {
      assign: `Assign ${n(s.v)} → ${c}`,
      reject: `Check fails: ${n(s.v)} cannot be ${c}`,
      prune: `Forward check: remove ${c} from ${n(s.v)} (neighbor of ${s.by && n(s.by)})`,
      wipeout: `Domain wipeout: ${n(s.v)} has no colors left → backtrack`,
      backtrack: `Backtrack: undo ${n(s.v)} = ${c}`
    }[s.type];
  }

  async function showSteps() {
    clearAI();
    if (!openRegions().length) { toast('info', 'Nothing to solve', 'Every region is already colored.'); return; }
    const { data: result, engine } = await runAI('solve', { method: $('#algo').value, trace: true }, () => runSolver(true));
    showAIStats(result, 'Steps', engine);
    setAIStatus('run', 'Visualizing search…');
    ui.ai.preview = {};
    let i = 0;
    ui.ai.timer = setInterval(() => {
      if (i >= result.steps.length) {
        clearInterval(ui.ai.timer);
        ui.ai.flash = null;
        setAIStatus(result.solved ? 'ok' : 'fail', result.solved ? 'Steps: solution found' : 'Steps: no solution');
        $('#ai-log').textContent = result.solved
          ? `Done in ${result.steps.length} steps${result.truncated ? ' (trace truncated)' : ''}. Preview stays until you click the map or Reset AI.`
          : failureText();
        updateMap();
        return;
      }
      const s = result.steps[i++];
      if (s.type === 'assign') ui.ai.preview[s.v] = s.c;
      if (s.type === 'backtrack') delete ui.ai.preview[s.v];
      ui.ai.flash = s.type === 'wipeout' || s.type === 'reject' ? s.v : null;
      $('#ai-log').textContent = `Step ${i}/${result.steps.length} · ${describeStep(s)}`;
      updateMap();
    }, STEP_DELAY[settings.speed]);
  }

  async function getHint() {
    clearAI();
    const { state } = ui;
    const { data: h, engine } = await runAI('hint', { region: ui.selected }, () => CSP.hint(map(), state.board, state.colors, ui.selected));
    if (!h.region) { toast('info', 'No hint', 'Every region is already colored.'); return; }
    showAIStats(h.result, 'Hint', engine);
    ui.selected = h.region;
    ui.conflicts = [];
    const name = map().regions[h.region];
    if (!h.color) {
      toast('error', 'AI Hint', `${name} has no legal color left.`);
    } else {
      ui.hintColor = h.color;
      ui.hintTarget = h.region;
      const text = `Color ${name} ${COLOR_INFO[h.color].name}${h.safe ? ' — this keeps the whole map solvable.' : ' — legal now, but the remaining map can no longer be fully colored.'}`;
      toast('info', 'AI Hint', text);
      $('#ai-log').textContent = `Hint: ${text} Legal now: ${h.legal.map(c => COLOR_INFO[c].name).join(', ')}.`;
    }
    refresh();
  }

  async function runComparison() {
    const { data: results, engine } = await runAI('compare', {}, () => CSP.compare(map(), ui.state.board, ui.state.colors));
    const row = (label, f) => `<tr><th>${label}</th>${results.map(r => `<td>${f(r)}</td>`).join('')}</tr>`;
    $('#compare-body').innerHTML = [
      row('Result', r => r.solved ? '<span class="good">Solved</span>' : '<span class="bad">No solution</span>'),
      row('Search nodes', r => r.stats.nodes),
      row('Backtracks', r => r.stats.backtracks),
      row('Constraint checks', r => r.stats.checks),
      row('Domain wipeouts', r => r.stats.wipeouts),
      row('Avg. time', r => `${r.timeMs.toFixed(4)} ms`)
    ].join('');
    $('#compare-note').textContent = `Same problem (${openRegions().length} open regions, ${ui.state.colors.length} colors, locked regions fixed), same degree-based variable order and color order. Time averaged over ${results[0].runs} runs, measured in ${engine}.`;
  }

  /* ---------- timer ---------- */
  setInterval(() => {
    const t = performance.now();
    const dt = t - ui.lastTick;
    ui.lastTick = t;
    const { state } = ui;
    if (!state || state.over || !settings.timer || !$('#screen-game').classList.contains('active') || modalOpen() || document.hidden) return;
    ui.remaining -= dt;
    if (ui.remaining <= 0) {
      const name = state.players[state.current].name;
      Engine.timeout(state);
      ui.remaining = settings.timer * 1000;
      ui.selected = ui.armedColor = ui.hintColor = null;
      toast('info', "Time's up!", `${name} ran out of time. ${state.players[state.current].name}'s turn.`);
      refresh();
    } else {
      renderTimer();
    }
  }, 200);

  /* ---------- events ---------- */
  $('#map-cards').addEventListener('click', e => {
    const card = e.target.closest('[data-map]');
    if (!card) return;
    ui.mapId = card.dataset.map;
    renderMenu();
  });
  [0, 1].forEach(i => {
    $(`#name-${i}`).addEventListener('input', e => { ui.players[i].name = e.target.value; });
    $(`#avatar-${i}`).addEventListener('click', () => {
      const p = ui.players[i];
      let next = (AVATARS.indexOf(p.avatar) + 1) % AVATARS.length;
      if (AVATARS[next] === ui.players[1 - i].avatar) next = (next + 1) % AVATARS.length;
      p.avatar = AVATARS[next];
      renderMenu();
    });
  });
  $('#btn-start').addEventListener('click', () => {
    ui.players.forEach((p, i) => { p.name = p.name.trim() || `Player ${i + 1}`; });
    if (ui.players[0].name === ui.players[1].name) ui.players[1].name += ' 2';
    startGame(ui.mapId);
  });

  $('#map-svg').addEventListener('click', e => {
    const region = e.target.closest('.region');
    if (region) onRegionClick(region.dataset.id);
  });
  $('#palette').addEventListener('click', e => {
    const btn = e.target.closest('[data-color]');
    if (btn) onColorClick(btn.dataset.color);
  });
  $('#region-info').addEventListener('click', e => {
    const chipBtn = e.target.closest('[data-select]');
    if (chipBtn) onRegionClick(chipBtn.dataset.select);
  });

  $('#btn-hint').addEventListener('click', getHint);
  $('#btn-solve').addEventListener('click', solveWithAI);
  $('#btn-steps').addEventListener('click', showSteps);
  $('#btn-reset-ai').addEventListener('click', () => { clearAI(true); refresh(); });
  $('#algo').addEventListener('change', () => { $('#ai-algo').textContent = CSP.METHODS[$('#algo').value]; });
  $('#btn-compare').addEventListener('click', runComparison);

  $('#btn-undo').addEventListener('click', () => {
    const mover = ui.state.players[1 - ui.state.current].name;
    if (!Engine.undo(ui.state)) return;
    clearAI();
    ui.selected = ui.armedColor = ui.hintColor = null;
    ui.conflicts = [];
    ui.remaining = settings.timer * 1000;
    toast('info', 'Move undone', `${mover}'s last move was taken back. It is ${mover}'s turn again.`);
    refresh();
  });
  $('#btn-restart').addEventListener('click', () => confirmAction('Restart game?',
    'All region colors, ownership, scores and history on this map will be cleared.', () => startGame(ui.state.mapId)));
  $('#btn-new').addEventListener('click', () => {
    const toMenu = () => { clearAI(true); showScreen('menu'); renderMenu(); };
    if (ui.state.history.length && !ui.state.over) confirmAction('Leave this game?', 'The current game will be discarded.', toMenu);
    else toMenu();
  });
  $('#go-again').addEventListener('click', () => { closeModal($('#modal-gameover')); startGame(ui.state.mapId); });
  $('#go-maps').addEventListener('click', () => { closeModal($('#modal-gameover')); showScreen('menu'); renderMenu(); });

  $$('[data-open]').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.open)));
  $$('.modal').forEach(modal => modal.addEventListener('click', e => {
    if (e.target === modal || e.target.closest('[data-close]')) closeModal(modal);
  }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { $$('.modal.open').forEach(closeModal); return; }
    if (e.target.matches('input, select') || modalOpen() || !ui.state || !$('#screen-game').classList.contains('active')) return;
    const color = ui.state.colors[Number(e.key) - 1];
    if (color) onColorClick(color);
  });

  // Settings
  const bindSetting = (sel, key, parse) => {
    const el = $(sel);
    el[el.type === 'checkbox' ? 'checked' : 'value'] = settings[key];
    el.addEventListener('change', () => {
      settings[key] = parse(el.type === 'checkbox' ? el.checked : el.value);
      saveSettings();
      if (key === 'timer' && ui.state) { ui.remaining = settings.timer * 1000; renderTimer(); }
    });
  };
  bindSetting('#set-colors', 'numColors', Number);
  bindSetting('#set-timer', 'timer', Number);
  bindSetting('#set-speed', 'speed', String);
  bindSetting('#set-sound', 'sound', Boolean);
  $('#algo').innerHTML = Object.entries(CSP.METHODS).map(([k, v]) => `<option value="${k}"${k === 'fc' ? ' selected' : ''}>${v}</option>`).join('');

  renderMenu();
  clearAI(true);
}

// The UI starts only on the game page (tests/tests.html loads this file just for the Engine).
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('screen-game')) initUI(); });
}
if (typeof module !== 'undefined') module.exports = { Engine, COLOR_INFO, ALL_COLORS, POINTS };
