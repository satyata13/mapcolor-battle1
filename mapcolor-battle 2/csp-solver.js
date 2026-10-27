/* csp-solver.js — map colouring as a Constraint Satisfaction Problem.
 *
 *   Variables   : the regions that are still uncoloured
 *   Domains     : the palette colours (Red, Blue, Green, Yellow — or fewer, from Settings)
 *   Constraints : two neighbouring regions must have different colours
 *
 * Regions already coloured (locked) by players are fixed assignments: the solver never
 * changes them, it only searches for colours for the remaining regions.
 */
const CSP = (() => {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const METHODS = {
    bt: 'Backtracking Search',
    fc: 'Backtracking + Forward Checking'
  };

  /** Colours a region may take right now: palette colours not used by any coloured neighbour. */
  function legalColors(map, board, colors, id) {
    return colors.filter(c => map.adjacency[id].every(n => board[n].color !== c));
  }

  /**
   * Builds the CSP for the current board. Variables are ordered once by degree (most
   * neighbours first, ties alphabetical) so Backtracking and Forward Checking explore
   * in exactly the same order and their statistics are directly comparable.
   */
  function createProblem(map, board, colors) {
    const fixed = {};
    Object.keys(map.regions).forEach(id => { if (board[id].color) fixed[id] = board[id].color; });
    const variables = Object.keys(map.regions)
      .filter(id => !fixed[id])
      .sort((a, b) => map.adjacency[b].length - map.adjacency[a].length || a.localeCompare(b));
    return { neighbors: map.adjacency, colors: colors.slice(), variables, fixed };
  }

  /**
   * Solves the problem with the chosen method:
   *   'bt'  — plain backtracking: check constraints against assigned neighbours before assigning.
   *   'fc'  — backtracking + forward checking: after each assignment remove the colour from the
   *           domains of unassigned neighbours; an empty domain (wipeout) triggers an immediate backtrack.
   * Statistics: nodes = assignments made, backtracks = assignments retracted,
   * checks = neighbour comparisons, wipeouts = empty domains detected.
   * With trace:true every step is recorded for the "Show AI Steps" animation.
   */
  function solve(problem, { method = 'fc', trace = false, maxTrace = 5000 } = {}) {
    const { neighbors, colors, variables } = problem;
    const stats = { nodes: 0, backtracks: 0, checks: 0, wipeouts: 0 };
    const steps = [];
    const log = trace ? step => { if (steps.length < maxTrace) steps.push(step); } : () => {};
    const assignment = { ...problem.fixed };
    const useFC = method !== 'bt';
    const domains = {};
    const t0 = now();

    // Initial forward check from the locked regions: prune their colours from neighbouring domains.
    let feasible = true;
    if (useFC) {
      for (const v of variables) {
        domains[v] = colors.filter(c => neighbors[v].every(n => {
          if (!(n in problem.fixed)) return true;
          stats.checks++;
          return problem.fixed[n] !== c;
        }));
        if (!domains[v].length) {
          stats.wipeouts++;
          log({ type: 'wipeout', v });
          feasible = false;
        }
      }
    }

    // Next variable: the first unassigned region in the fixed degree order.
    const selectVariable = () => variables.find(v => !(v in assignment));

    // Plain backtracking constraint check: no assigned neighbour may already hold colour c.
    const consistent = (v, c) => neighbors[v].every(n => {
      if (!(n in assignment)) return true;
      stats.checks++;
      return assignment[n] !== c;
    });

    // Forward checking: prune c from unassigned neighbours. Returns the removals so they can be
    // restored on backtrack, and whether some neighbour's domain was wiped out.
    const forwardCheck = (v, c) => {
      const removed = [];
      for (const n of neighbors[v]) {
        if (n in assignment) continue;
        stats.checks++;
        if (!domains[n].includes(c)) continue;
        domains[n] = domains[n].filter(x => x !== c);
        removed.push(n);
        log({ type: 'prune', v: n, c, by: v });
        if (!domains[n].length) {
          stats.wipeouts++;
          log({ type: 'wipeout', v: n });
          return { removed, wiped: true };
        }
      }
      return { removed, wiped: false };
    };

    // Undo forward-checking removals, keeping the palette's value order.
    const restore = (removed, c) => {
      removed.forEach(n => { domains[n] = colors.filter(x => x === c || domains[n].includes(x)); });
    };

    const search = () => {
      const v = selectVariable();
      if (!v) return true;
      for (const c of useFC ? domains[v].slice() : colors) {
        if (!useFC && !consistent(v, c)) {
          log({ type: 'reject', v, c });
          continue;
        }
        stats.nodes++;
        assignment[v] = c;
        log({ type: 'assign', v, c });
        if (useFC) {
          const { removed, wiped } = forwardCheck(v, c);
          if (!wiped && search()) return true;
          restore(removed, c);
        } else if (search()) {
          return true;
        }
        delete assignment[v];
        stats.backtracks++;
        log({ type: 'backtrack', v, c });
      }
      return false;
    };

    const solved = feasible && search();
    return {
      method,
      methodName: METHODS[method],
      solved,
      assignment: solved ? assignment : null,
      stats,
      steps,
      truncated: steps.length >= maxTrace,
      timeMs: now() - t0
    };
  }

  /** True when every pair of neighbours in a complete assignment has different colours. */
  function isValidColoring(map, assignment) {
    return Object.keys(map.regions).every(id =>
      assignment[id] && map.adjacency[id].every(n => assignment[n] !== assignment[id]));
  }

  /**
   * AI hint for the board. Target = the given uncoloured region, or the uncoloured region with the
   * fewest legal colours. The suggested colour comes from a full forward-checking solution, so it
   * keeps the rest of the map solvable; if no full solution exists any legal colour is offered instead.
   */
  function hint(map, board, colors, regionId) {
    const open = Object.keys(map.regions).filter(id => !board[id].color);
    if (!open.length) return { region: null };
    const legalOf = id => legalColors(map, board, colors, id);
    const target = regionId && !board[regionId].color ? regionId
      : open.reduce((best, id) => {
          const n = legalOf(id).length;
          return n && (!best || n < legalOf(best).length) ? id : best;
        }, null) || open[0];
    const result = solve(createProblem(map, board, colors), { method: 'fc' });
    const legal = legalOf(target);
    return {
      region: target,
      color: result.solved ? result.assignment[target] : legal[0] || null,
      safe: result.solved,
      legal,
      result
    };
  }

  /** Runs Backtracking and Forward Checking on the same problem; time is averaged over several runs. */
  function compare(map, board, colors, runs = 25) {
    const problem = createProblem(map, board, colors);
    return ['bt', 'fc'].map(method => {
      const first = solve(problem, { method });
      let total = first.timeMs;
      for (let i = 1; i < runs; i++) total += solve(problem, { method }).timeMs;
      return { ...first, timeMs: total / runs, runs };
    });
  }

  return { METHODS, legalColors, createProblem, solve, isValidColoring, hint, compare };
})();

if (typeof module !== 'undefined') module.exports = { CSP };
