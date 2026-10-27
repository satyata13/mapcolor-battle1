/* tests.js — automated checks for the maps, the CSP solver and the game engine.
 * Run with Node (`node tests/tests.js`) or open tests/tests.html in a browser.
 */
if (typeof require !== 'undefined' && typeof MAPS === 'undefined') {
  Object.assign(globalThis, require('../maps.js'), require('../csp-solver.js'), require('../script.js'));
}

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
const PLAYERS = [{ name: 'Alice', avatar: 'A' }, { name: 'Bob', avatar: 'B' }];
const emptyBoard = map => Object.fromEntries(Object.keys(map.regions).map(id => [id, { color: null }]));

/* ---------- maps ---------- */
Object.values(MAPS).forEach(map => {
  test(`${map.name}: adjacency list is symmetric and matches the drawn borders`, () => {
    const drawn = deriveGridAdjacency(map);
    Object.keys(map.regions).forEach(id => {
      const listed = map.adjacency[id];
      assert(listed, `${id} missing from adjacency list`);
      listed.forEach(n => assert(map.adjacency[n].includes(id), `${id}-${n} not symmetric`));
      assert(listed.length === drawn[id].size && listed.every(n => drawn[id].has(n)),
        `${id}: listed [${listed}] vs drawn [${[...drawn[id]]}]`);
    });
  });
  test(`${map.name}: every region has its own clickable SVG path and label`, () => {
    const geo = buildMapGeometry(map);
    Object.keys(map.regions).forEach(id => {
      assert(geo.regions[id] && /^M[\d.,LMZ]+$/.test(geo.regions[id].d), `${id} has no path`);
      assert(geo.regions[id].cells > 0, `${id} not drawn`);
    });
  });
});

/* ---------- 1. valid moves and alternating turns ---------- */
test('1. Both players make valid moves and turns alternate', () => {
  const g = Engine.createGame('australia', PLAYERS);
  assert(g.current === 0);
  assert(Engine.attemptMove(g, 'WA', 'red').status === 'valid');
  assert(g.current === 1, 'turn should pass to P2');
  assert(Engine.attemptMove(g, 'QLD', 'red').status === 'valid');
  assert(g.current === 0, 'turn should return to P1');
  assert(g.board.WA.owner === 0 && g.board.QLD.owner === 1);
});

/* ---------- 2 & 3. invalid moves and scoring ---------- */
test('2. A color used by a neighbor is rejected and both regions are reported', () => {
  const g = Engine.createGame('australia', PLAYERS);
  Engine.attemptMove(g, 'NT', 'blue');
  const r = Engine.attemptMove(g, 'QLD', 'blue');
  assert(r.status === 'invalid');
  assert(r.conflicts.length === 1 && r.conflicts[0] === 'NT');
  assert(r.message === 'Queensland cannot be Blue because it is adjacent to Northern Territory, which is Blue.', r.message);
  assert(g.board.QLD.color === null, 'rejected move must not color the region');
  assert(g.current === 1, 'turn stays with the player who made the invalid attempt');
});

test('3. Scores: +10 valid, −5 invalid; counters and violations update', () => {
  const g = Engine.createGame('australia', PLAYERS);
  Engine.attemptMove(g, 'NT', 'blue');      // P1 +10
  Engine.attemptMove(g, 'SA', 'blue');      // P2 −5 (SA borders NT)
  Engine.attemptMove(g, 'SA', 'green');     // P2 +10
  assert(g.players[0].score === 10 && g.players[0].valid === 1);
  assert(g.players[1].score === 5 && g.players[1].valid === 1 && g.players[1].invalid === 1);
  assert(g.violations === 1 && g.history.length === 3);
  assert(g.history.map(h => h.result).join() === 'valid,invalid,valid');
});

/* ---------- 4. locked regions ---------- */
test('4. A colored region is locked: no player can recolor it, even with repeated clicks', () => {
  const g = Engine.createGame('australia', PLAYERS);
  Engine.attemptMove(g, 'WA', 'red');
  const before = JSON.stringify(g);
  for (let i = 0; i < 5; i++) {
    ['red', 'blue', 'green', 'yellow', null].forEach(c => {
      const r = Engine.attemptMove(g, 'WA', c);
      assert(r.status === 'locked', 'expected locked');
      assert(r.message.includes('already colored by Alice'), r.message);
    });
    g.current = 1 - g.current; // try as both players
  }
  g.current = 1;
  assert(JSON.stringify(g) === before, 'locked attempts must not change the state');
});

/* ---------- 5. AI produces valid colorings ---------- */
Object.values(MAPS).forEach(map => {
  ['bt', 'fc'].forEach(method => {
    test(`5. ${map.name}: ${method.toUpperCase()} returns a coloring satisfying every constraint`, () => {
      const r = CSP.solve(CSP.createProblem(map, emptyBoard(map), ALL_COLORS), { method });
      assert(r.solved && CSP.isValidColoring(map, r.assignment), 'invalid coloring');
      assert(r.stats.nodes >= Object.keys(map.regions).length, 'nodes should count assignments');
    });
  });
});

test('5b. Solver respects locked regions and does not modify the game state', () => {
  const g = Engine.createGame('india', PLAYERS);
  Engine.attemptMove(g, 'UP', 'red');
  Engine.attemptMove(g, 'MP', 'blue');
  const before = JSON.stringify(g);
  const r = CSP.solve(CSP.createProblem(MAPS.india, g.board, g.colors));
  assert(r.solved && r.assignment.UP === 'red' && r.assignment.MP === 'blue');
  assert(CSP.isValidColoring(MAPS.india, r.assignment));
  assert(JSON.stringify(g) === before, 'solver must not touch the board or scores');
});

/* ---------- 6. forward checking detects empty domains ---------- */
test('6. Forward checking detects a domain wipeout and backtracks', () => {
  // Triangle with 2 colors: assigning A and B empties C's domain.
  const tri = { regions: { A: 'A', B: 'B', C: 'C' }, adjacency: { A: ['B', 'C'], B: ['A', 'C'], C: ['A', 'B'] } };
  const r = CSP.solve(CSP.createProblem(tri, emptyBoard(tri), ['red', 'blue']), { method: 'fc', trace: true });
  assert(!r.solved && r.stats.wipeouts > 0, 'wipeout expected');
  assert(r.steps.some(s => s.type === 'wipeout'), 'wipeout step expected');
  assert(r.stats.backtracks > 0, 'should backtrack after wipeout');
});

test('6b. Forward checking prunes locked neighbors\' colors before searching', () => {
  const board = emptyBoard(MAPS.australia);
  board.NT.color = 'red'; board.NSW.color = 'blue'; board.WA.color = 'green';
  // SA neighbors WA, NT, NSW → only yellow remains with 4 colors, nothing with 3.
  const r3 = CSP.solve(CSP.createProblem(MAPS.australia, board, ['red', 'blue', 'green']), { method: 'fc' });
  assert(!r3.solved && r3.stats.nodes === 0 && r3.stats.wipeouts === 1, 'SA domain should be empty before search');
  const r4 = CSP.solve(CSP.createProblem(MAPS.australia, board, ALL_COLORS), { method: 'fc' });
  assert(r4.solved && r4.assignment.SA === 'yellow');
});

/* ---------- 7. backtracking restores domains and assignments ---------- */
test('7. Backtracking restores domains and assignments correctly', () => {
  // USA with Washington=Yellow and California=Blue locked: the solver's first choices for Oregon and
  // its neighbours lead to dead ends, so both methods must backtrack and still return a valid answer.
  const board = emptyBoard(MAPS.usa);
  board.WA.color = 'yellow';
  board.CA.color = 'blue';
  const stats = {};
  ['bt', 'fc'].forEach(method => {
    const r = CSP.solve(CSP.createProblem(MAPS.usa, board, ALL_COLORS), { method, trace: true });
    assert(r.solved && CSP.isValidColoring(MAPS.usa, r.assignment), `${method}: valid result expected`);
    assert(r.stats.backtracks > 0, `${method}: this board needs backtracking`);
    assert(r.assignment.WA === 'yellow' && r.assignment.CA === 'blue', 'locked colors kept');
    // Replaying the trace: a region is only re-assigned after its previous value was retracted,
    // and the regions left assigned at the end are exactly the open regions.
    const assigned = new Set();
    r.steps.forEach(s => {
      if (s.type === 'assign') { assert(!assigned.has(s.v), `${s.v} assigned twice without backtrack`); assigned.add(s.v); }
      if (s.type === 'backtrack') assigned.delete(s.v);
    });
    assert(assigned.size === 20, 'final trace should leave all 20 open regions assigned');
    stats[method] = r.stats;
  });
  assert(stats.fc.backtracks < stats.bt.backtracks, 'forward checking should prune dead ends earlier');
  // Same problem solved twice gives identical results → no state leaks between runs.
  const p = CSP.createProblem(MAPS.usa, emptyBoard(MAPS.usa), ['red', 'blue', 'green', 'yellow']);
  const a = CSP.solve(p, { method: 'fc' });
  const b = CSP.solve(p, { method: 'fc' });
  assert(JSON.stringify(a.assignment) === JSON.stringify(b.assignment) && a.stats.nodes === b.stats.nodes);
});

/* ---------- 8. impossible colorings ---------- */
test('8. Impossible coloring reports failure (Australia with 2 colors) for BT and FC', () => {
  ['bt', 'fc'].forEach(method => {
    const r = CSP.solve(CSP.createProblem(MAPS.australia, emptyBoard(MAPS.australia), ['red', 'blue']), { method });
    assert(!r.solved && r.assignment === null, `${method} should fail`);
  });
});

test('8b. Hint offers a color that keeps the map solvable', () => {
  const g = Engine.createGame('usa', PLAYERS);
  Engine.attemptMove(g, 'CO', 'red');
  const h = CSP.hint(MAPS.usa, g.board, g.colors, 'KS');
  assert(h.region === 'KS' && h.safe && h.color !== 'red' && h.legal.includes(h.color));
  const locked = CSP.hint(MAPS.usa, g.board, g.colors, 'CO');
  assert(locked.region !== 'CO', 'hint never targets a locked region');
});

/* ---------- 9. restart and undo ---------- */
test('9. Undo restores the exact previous state; only one level and never after the opponent acts', () => {
  const g = Engine.createGame('australia', PLAYERS);
  Engine.attemptMove(g, 'WA', 'red');
  const afterFirst = JSON.stringify({ ...g, undo: null });
  Engine.attemptMove(g, 'NT', 'blue');
  assert(Engine.undo(g), 'undo should work right after a valid move');
  assert(JSON.stringify({ ...g, undo: null }) === afterFirst, 'state must match the pre-move snapshot');
  assert(g.current === 1 && g.board.NT.color === null && g.board.WA.owner === 0);
  assert(!Engine.undo(g), 'second undo would touch the other player\'s region');
  Engine.attemptMove(g, 'NT', 'blue');
  Engine.attemptMove(g, 'SA', 'blue'); // P1 invalid attempt
  assert(!Engine.undo(g), 'undo not allowed once the opponent acted');
});

test('9b. Restart (new game) clears colors, owners, scores, history and turn', () => {
  let g = Engine.createGame('india', PLAYERS);
  Engine.attemptMove(g, 'UP', 'red');
  Engine.attemptMove(g, 'BR', 'red');
  g = Engine.createGame(g.mapId, PLAYERS);
  assert(Object.values(g.board).every(c => c.color === null && c.owner === null && !c.locked));
  assert(g.players.every(p => p.score === 0 && p.valid === 0 && p.invalid === 0));
  assert(g.current === 0 && g.history.length === 0 && g.violations === 0);
});

/* ---------- game over ---------- */
test('Game ends when all regions are colored and the higher score wins', () => {
  const g = Engine.createGame('australia', PLAYERS);
  Engine.attemptMove(g, 'NT', 'red');
  Engine.attemptMove(g, 'SA', 'red');                      // P2 invalid → P2 ends a point behind
  Object.keys(g.board).forEach(id => {
    if (!g.board[id].color) Engine.attemptMove(g, id, CSP.hint(MAPS.australia, g.board, g.colors, id).color);
  });
  assert(g.over && g.endReason === 'complete');
  assert(g.history.filter(h => h.result === 'valid').length === 7);
  const w = Engine.winner(g);
  const [a, b] = g.players.map(p => p.score);
  assert(w === (a === b ? -1 : a > b ? 0 : 1));
});

test('Game ends when no legal moves remain (stuck board)', () => {
  const g = Engine.createGame('australia', PLAYERS, 2);   // red, blue only
  Engine.attemptMove(g, 'WA', 'red');
  Engine.attemptMove(g, 'NT', 'blue');                     // SA now borders red and blue
  Engine.attemptMove(g, 'QLD', 'red');                     // NSW: blocked by QLD red… still may take blue
  Engine.attemptMove(g, 'NSW', 'blue');
  Engine.attemptMove(g, 'VIC', 'red');
  Engine.attemptMove(g, 'TAS', 'red');
  assert(g.board.SA.color === null && CSP.legalColors(MAPS.australia, g.board, g.colors, 'SA').length === 0);
  assert(g.over && g.endReason === 'stuck', `expected stuck, got ${g.endReason}`);
  assert(Engine.attemptMove(g, 'SA', 'red').status === 'over');
});

test('Draw when scores are equal', () => {
  const g = Engine.createGame('australia', PLAYERS);
  g.players[0].score = g.players[1].score = 30;
  assert(Engine.winner(g) === -1);
});

test('Timeout passes the turn without changing scores', () => {
  const g = Engine.createGame('usa', PLAYERS);
  Engine.timeout(g);
  assert(g.current === 1 && g.players[0].score === 0 && g.history[0].result === 'timeout');
});

test('Algorithm comparison runs both methods on the same problem', () => {
  const [bt, fc] = CSP.compare(MAPS.india, emptyBoard(MAPS.india), ALL_COLORS, 3);
  assert(bt.method === 'bt' && fc.method === 'fc' && bt.solved && fc.solved);
  assert(bt.stats.checks > 0 && fc.stats.checks > 0 && bt.timeMs >= 0);
});

/* ---------- report ---------- */
const failed = results.filter(r => !r.ok);
const lines = results.map(r => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `\n      → ${r.error}`}`);
lines.push(`\n${results.length - failed.length}/${results.length} tests passed`);
if (typeof document !== 'undefined' && document.getElementById('out')) {
  document.getElementById('out').textContent = lines.join('\n');
  document.title = failed.length ? 'Tests: FAIL' : 'Tests: PASS';
} else {
  (typeof console !== 'undefined' ? console.log : print)(lines.join('\n'));
  if (failed.length && typeof process !== 'undefined') process.exitCode = 1;
}
