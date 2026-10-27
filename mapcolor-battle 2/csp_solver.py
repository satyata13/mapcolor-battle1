"""csp_solver.py — map colouring as a Constraint Satisfaction Problem, solved in Python.

    Variables   : the regions that are still uncoloured
    Domains     : the palette colours (Red, Blue, Green, Yellow — or fewer, from Settings)
    Constraints : two neighbouring regions must have different colours

Regions already coloured (locked) by players are fixed assignments: the solver never changes
them, it only searches for colours for the remaining regions. The game sends each request to
this module through app.py; results use the same JSON shape as csp-solver.js.
"""
import time

METHODS = {
    'bt': 'Backtracking Search',
    'fc': 'Backtracking + Forward Checking',
}


def legal_colors(adjacency, board, colors, region):
    """Colours a region may take right now: palette colours not used by any coloured neighbour."""
    return [c for c in colors if all(board[n] != c for n in adjacency[region])]


def create_problem(adjacency, board, colors):
    """Builds the CSP for the current board. Variables are ordered once by degree (most neighbours
    first, ties alphabetical) so Backtracking and Forward Checking explore in the same order."""
    fixed = {region: color for region, color in board.items() if color}
    variables = sorted((r for r in board if r not in fixed), key=lambda r: (-len(adjacency[r]), r))
    return {'neighbors': adjacency, 'colors': list(colors), 'variables': variables, 'fixed': fixed}


def solve(problem, method='fc', trace=False, max_trace=5000):
    """Solves the problem with the chosen method:
      'bt' — plain backtracking: check constraints against assigned neighbours before assigning.
      'fc' — backtracking + forward checking: after each assignment remove the colour from the
             domains of unassigned neighbours; an empty domain (wipeout) triggers an immediate backtrack.
    Statistics: nodes = assignments made, backtracks = assignments retracted,
    checks = neighbour comparisons, wipeouts = empty domains detected.
    With trace=True every step is recorded for the "Show AI Steps" animation.
    """
    neighbors, colors, variables, fixed = (problem[k] for k in ('neighbors', 'colors', 'variables', 'fixed'))
    stats = {'nodes': 0, 'backtracks': 0, 'checks': 0, 'wipeouts': 0}
    steps = []
    assignment = dict(fixed)
    use_fc = method != 'bt'
    domains = {}
    t0 = time.perf_counter()

    def log(step):
        if trace and len(steps) < max_trace:
            steps.append(step)

    def allowed_by_fixed(v, c):
        for n in neighbors[v]:
            if n in fixed:
                stats['checks'] += 1
                if fixed[n] == c:
                    return False
        return True

    # Initial forward check from the locked regions: prune their colours from neighbouring domains.
    feasible = True
    if use_fc:
        for v in variables:
            domains[v] = [c for c in colors if allowed_by_fixed(v, c)]
            if not domains[v]:
                stats['wipeouts'] += 1
                log({'type': 'wipeout', 'v': v})
                feasible = False

    def select_variable():
        """Next variable: the first unassigned region in the fixed degree order."""
        return next((v for v in variables if v not in assignment), None)

    def consistent(v, c):
        """Plain backtracking constraint check: no assigned neighbour may already hold colour c."""
        for n in neighbors[v]:
            if n in assignment:
                stats['checks'] += 1
                if assignment[n] == c:
                    return False
        return True

    def forward_check(v, c):
        """Prune c from unassigned neighbours. Returns the removals (to restore on backtrack)
        and whether some neighbour's domain was wiped out."""
        removed = []
        for n in neighbors[v]:
            if n in assignment:
                continue
            stats['checks'] += 1
            if c not in domains[n]:
                continue
            domains[n] = [x for x in domains[n] if x != c]
            removed.append(n)
            log({'type': 'prune', 'v': n, 'c': c, 'by': v})
            if not domains[n]:
                stats['wipeouts'] += 1
                log({'type': 'wipeout', 'v': n})
                return removed, True
        return removed, False

    def restore(removed, c):
        """Undo forward-checking removals, keeping the palette's value order."""
        for n in removed:
            domains[n] = [x for x in colors if x == c or x in domains[n]]

    def search():
        v = select_variable()
        if v is None:
            return True
        for c in (list(domains[v]) if use_fc else colors):
            if not use_fc and not consistent(v, c):
                log({'type': 'reject', 'v': v, 'c': c})
                continue
            stats['nodes'] += 1
            assignment[v] = c
            log({'type': 'assign', 'v': v, 'c': c})
            if use_fc:
                removed, wiped = forward_check(v, c)
                if not wiped and search():
                    return True
                restore(removed, c)
            elif search():
                return True
            del assignment[v]
            stats['backtracks'] += 1
            log({'type': 'backtrack', 'v': v, 'c': c})
        return False

    solved = feasible and search()
    return {
        'method': method,
        'methodName': METHODS[method],
        'solved': solved,
        'assignment': assignment if solved else None,
        'stats': stats,
        'steps': steps,
        'truncated': len(steps) >= max_trace,
        'timeMs': (time.perf_counter() - t0) * 1000,
    }


def is_valid_coloring(adjacency, assignment):
    """True when every region is coloured and every pair of neighbours has different colours."""
    return all(assignment.get(r) and all(assignment.get(n) != assignment[r] for n in adjacency[r])
               for r in adjacency)


def hint(adjacency, board, colors, region=None):
    """AI hint. Target = the given uncoloured region, or the uncoloured region with the fewest legal
    colours. The suggested colour comes from a full forward-checking solution, so it keeps the rest
    of the map solvable; if no full solution exists any legal colour is offered instead."""
    open_regions = [r for r in board if not board[r]]
    if not open_regions:
        return {'region': None}
    if region and not board.get(region):
        target = region
    else:
        playable = [r for r in open_regions if legal_colors(adjacency, board, colors, r)]
        target = min(playable, key=lambda r: len(legal_colors(adjacency, board, colors, r))) if playable else open_regions[0]
    result = solve(create_problem(adjacency, board, colors), 'fc')
    legal = legal_colors(adjacency, board, colors, target)
    return {
        'region': target,
        'color': result['assignment'][target] if result['solved'] else (legal[0] if legal else None),
        'safe': result['solved'],
        'legal': legal,
        'result': result,
    }


def compare(adjacency, board, colors, runs=25):
    """Runs Backtracking and Forward Checking on the same problem; time is averaged over several runs."""
    problem = create_problem(adjacency, board, colors)
    results = []
    for method in ('bt', 'fc'):
        first = solve(problem, method)
        total = first['timeMs'] + sum(solve(problem, method)['timeMs'] for _ in range(runs - 1))
        results.append({**first, 'timeMs': total / runs, 'runs': runs})
    return results
