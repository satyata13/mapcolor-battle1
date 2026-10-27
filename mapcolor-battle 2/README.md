# MapColor Battle

A two-player, same-computer map-coloring strategy game built with HTML5, CSS3, vanilla JavaScript, SVG and
**Python**. Players take turns coloring regions so that no two neighbors share a color. Behind the game is a
real **Constraint Satisfaction Problem (CSP)** solver with **Backtracking Search** and **Forward Checking**,
written in Python, which powers hints, auto-solve, a step-by-step search visualization and an algorithm
comparison.

Only Python 3 (standard library) and a browser are needed. No database, paid API or external package.

## Run it

From the project folder, start the Python server:

```bash
python3 app.py
```

Then open <http://localhost:8000>. The terminal shows each AI request handled by Python, and the AI Solver
panel shows `· Python` after the algorithm name.

`app.py` serves the game and answers the AI Solver panel through a small JSON API (`/api/solve`,
`/api/hint`, `/api/compare`) backed by `csp_solver.py`. When no Python server is available (GitHub Pages,
another static server, or `index.html` opened directly), the game still works: the same algorithms run in
the browser from `csp-solver.js`, and the panel shows `· JavaScript`.

Run the tests:

```bash
python3 -m unittest discover tests
```

For the game rules and the JavaScript solver, open `tests/tests.html` in the browser. The page title shows
`Tests: PASS` or `Tests: FAIL`.

## Files

| File | Responsibility |
|---|---|
| `app.py` | Python web server: serves the game and the AI API |
| `csp_solver.py` | Python CSP solver: model, Backtracking, Forward Checking, hints, statistics, comparison |
| `index.html` | Layout: menu and map selection, gameplay dashboard, sidebar, AI panel, history, comparison, modals |
| `style.css` | Dark navy and neon theme, animations, responsive layout (desktop, tablet, phone) |
| `script.js` | `Engine` (pure game rules: turns, scoring, locking, undo, game over), the browser UI, and the calls to the Python AI |
| `csp-solver.js` | The same CSP solver in JavaScript, used when the Python server is not running |
| `maps.js` | Map definitions, adjacency lists, and the lattice-to-SVG geometry builder |
| `tests/test_csp_solver.py` | 10 Python tests for `csp_solver.py`, including identical statistics to the JavaScript solver |
| `tests/tests.js` | 29 tests for the game rules, maps and JavaScript solver (browser or Node) |

## Game rules

1. Player 1 starts. On your turn, select **any** uncolored region and then pick a color. You can also pick
   the color first and then click a region. Keys `1`–`4` pick colors.
2. A move is valid only if no already-colored neighbor has the chosen color.
3. **Valid move: +10.** The region is locked to you and the turn passes.
4. **Invalid attempt: −5.** The move is rejected, the region and the clashing neighbor flash red, a red
   notification explains why (for example, *"Queensland cannot be Blue because it is adjacent to Northern
   Territory, which is Blue."*), the violation counter goes up, and it stays your turn.
5. **Permanent ownership.** A colored region cannot be recolored or cleared by anyone, including its owner.
   Clicking it shows *"This region (…) is already colored by … and cannot be changed."* Nothing changes, and
   there is no penalty.
6. **Turn timer** (optional: Off, 15, 30 or 60 s). When it runs out, the turn passes with no score change.
7. **Undo.** Only the latest valid move can be taken back, and only before the opponent acts (an invalid
   attempt or a timeout counts as acting). Undo restores the exact previous state: the region, scores,
   counters, history and turn. It is one level only, so it can never touch the other player's regions.
8. **Game over** when every region is colored, or when no uncolored region has a legal color left. The higher
   score wins. Equal scores are a draw.
9. **Restart** (after confirmation) clears all colors, owners, scores, history and the turn on the same map.
   **New Game** returns to map selection. **Settings** changes the number of colors (2–4, applied when a
   game starts or restarts), the turn timer, the AI animation speed and sound.

## Maps

All three maps are **simplified schematic maps**. Each one is drawn on a coarse grid, and tiny regions are
enlarged so they can still be clicked. Every map has its own explicit adjacency list. A test derives the
adjacency from the drawn borders and checks that it matches the list exactly, so the picture and the
constraints can never disagree.

| Map | Regions | Notes |
|---|---|---|
| Australia | 7 | WA, NT, SA, QLD, NSW, VIC, TAS. ACT is not shown. Tasmania has no neighbors. |
| India | 23 | 20 states plus grouped regions: J&K + Ladakh, Haryana + Delhi, and North-East (7 states). Goa and Sikkim are enlarged. |
| USA | 22 | The contiguous states west of the Mississippi. Corner-only contacts (Four Corners) are not borders. Eastern neighbors such as WI and IL are outside the map. |

Geometry: `buildMapGeometry()` traces each region's cell edges into closed loops, keeps only the corner
points, and rounds them by corner cutting (Chaikin). Points where three or more areas meet stay fixed, so
both sides of every shared border are smoothed the same way and neighboring paths fit together.

## AI: the CSP model

The solver is implemented in Python in `csp_solver.py`, and the game calls it through `app.py`.
`csp-solver.js` contains the same algorithms in JavaScript, line for line, so the game also works without
the Python server. Both produce identical search steps and statistics, and the Python tests check this.

* **Variables:** the uncolored regions.
* **Domains:** the palette colors (Red, Blue, Green, Yellow, or fewer).
* **Constraints:** neighboring regions must have different colors.
* **Locked regions** are fixed assignments. The solver works on a copy of the board, never changes the game
  state or ownership, and never awards points.

### Backtracking Search (`bt`)
Pick the next unassigned region and try each color in turn. Before assigning, check the color against every
already-assigned neighbor. If the check passes, assign it and recurse. If no color works, return failure so
the caller retracts its assignment (a backtrack) and tries its next color.

### Forward Checking (`fc`)
Initial domains are pruned by the locked neighbors. After each assignment, the color is removed from the
domains of all unassigned neighbors. If a domain becomes empty (**domain wipeout**), the solver backtracks
immediately, before descending further. The removed values are restored on backtrack, in palette order.

**Fair comparison:** `bt` and `fc` use the same static variable order (most neighbors first, ties
alphabetical) and the same color order. The comparison panel runs both on the current board and averages the
time over 25 runs.

**Statistics (all measured, none invented):** nodes = assignments made, backtracks = assignments retracted,
constraint checks = neighbor comparisons, wipeouts = empty domains detected, and execution time measured
where the search ran (`time.perf_counter()` in Python, `performance.now()` in the browser).

### AI controls
* **Get Hint:** for the selected uncolored region, or else the one with the fewest legal colors, suggests the color
  from a full Forward-Checking solution, so the rest of the map stays solvable. The palette button pulses. If
  no full solution exists, it offers a currently legal color and says so.
* **Solve with AI:** shows a complete valid coloring as a dashed preview with purple "AI" badges. It is not
  scored. If none exists, it shows *"No valid coloring exists for the N remaining regions with K colors…"*.
* **Show Steps:** animates the recorded trace: assign, check fail, forward-check prune, wipeout, backtrack.
* **Reset AI:** clears the preview, animation and statistics. Scores are untouched.

## Architecture

```
Browser                                                         Python (python3 app.py)
index.html ── loads ──> maps.js ──> csp-solver.js ──> script.js
                         MAPS          CSP (fallback)   Engine (pure rules)
                         geometry      solve/hint/      initUI(): panels, map SVG, events,
                         adjacency     compare          AI panel ── POST /api/solve ──────> app.py
                                                                     /api/hint            │
                                                                     /api/compare  <── csp_solver.py
                                                                     (JSON)            create_problem, solve,
                                                                                       hint, compare
```

Each AI request sends the map's adjacency list, the current board (locked colors) and the palette. Python
builds the CSP, runs the search and returns the result, statistics and step trace as JSON. The browser only
displays them.

The `Engine` has no DOM code. It works the same in the browser and in Node, which is why the tests can
check the real game rules. The game state stores, for each region, `{ color, owner, locked }`, along with
players, turn, history, violation count and a one-level undo snapshot.

## Tests and expected results

`python3 -m unittest discover tests` runs 10 checks on the Python solver: valid colorings on every map,
locked regions respected, wipeout detection, domain restoration on backtrack, failure on impossible
colorings, hints, comparison, and identical statistics to the JavaScript solver. All of them pass.

`tests/tests.html` (or `node tests/tests.js`) runs 29 checks on the game rules, maps and JavaScript solver,
and all of them pass:

| # | Scenario | Expected result |
|---|---|---|
| — | Maps: adjacency is symmetric and matches the drawn borders, and every region has a path | Pass for all 3 maps |
| 1 | P1 colors WA, P2 colors QLD | Both valid, the turn alternates 0 → 1 → 0, owners recorded |
| 2 | NT = Blue, then QLD = Blue | Rejected with the exact message above, QLD stays uncolored, the turn stays |
| 3 | Valid, invalid, valid | Scores 10 / 5, valid and invalid counters, 1 violation, 3 history rows |
| 4 | Recolor a locked region 25 times, as either player | Always `locked`, the state is byte-identical |
| 5 | BT and FC on all maps (4 colors) | A complete coloring where every constraint holds |
| 5b | Solve with UP and MP locked (India) | Locked colors kept, the game state is unchanged |
| 6 | Triangle graph with 2 colors (FC) | A wipeout is detected, a backtrack happens, failure is reported |
| 6b | Australia with WA, NT, NSW locked and 3 colors | SA's domain is empty before search: 0 nodes, 1 wipeout. With 4 colors, SA = Yellow |
| 7 | USA with WA = Yellow and CA = Blue locked | Both methods backtrack yet return a valid answer, the trace replays consistently, FC backtracks less |
| 8 | Australia with 2 colors (BT and FC) | `solved: false`, no crash |
| 8b | Hint for Kansas after Colorado = Red | A safe, legal, non-red color. A locked region is never the hint target |
| 9 | Undo after a valid move | Exact pre-move state, then a second undo is refused, and undo is refused after an opponent action |
| 9b | Restart | All colors, owners, scores, history and the turn are reset |
| — | Full game, stuck game (2 colors), draw, timeout, comparison | `complete` / `stuck` end reasons, winner and draw logic, timeout passes the turn |

Measured search statistics on an empty board (deterministic node, backtrack and check counts):

| Map | Colors | Backtracking: nodes / backtracks / checks | Forward Checking: nodes / backtracks / checks / wipeouts |
|---|---|---|---|
| Australia | 4 | 7 / 0 / 20 | 7 / 0 / 9 / 0 |
| India | 4 | 23 / 0 / 95 | 23 / 0 / 46 / 0 |
| USA | 4 | 22 / 0 / 92 | 22 / 0 / 48 / 0 |
| India | 3 | 423 / 423 / 2145 (no solution) | 87 / 87 / 330 / 36 (no solution) |
| USA | 3 | 366 / 366 / 1953 (no solution) | 162 / 162 / 462 / 54 (no solution) |
| USA, WA = Yellow and CA = Blue locked | 4 | 197 / 177 / 1812 | 21 / 1 / 63 / 1 |

India and the USA (west) are not 3-colorable, so with 3 colors the solver reports failure after exhausting
the search. Forward Checking reaches the same answer with far fewer nodes and checks.
