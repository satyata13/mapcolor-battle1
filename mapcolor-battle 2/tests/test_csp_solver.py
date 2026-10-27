"""test_csp_solver.py — tests for the Python CSP solver (csp_solver.py).

Run from the project folder:  python3 -m unittest discover tests
The maps' adjacency lists are read from maps.js, so Python and JavaScript solve the same graphs.
Expected statistics are the ones the JavaScript solver reports, so both implementations must agree.
"""
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import csp_solver  # noqa: E402

ALL_COLORS = ['red', 'blue', 'green', 'yellow']


def load_adjacency():
    """Adjacency list of every map in maps.js, keyed by map id."""
    text = (ROOT / 'maps.js').read_text()
    blocks = re.findall(r"id: '(\w+)'.*?adjacency: (\{.*?\n    \})", text, re.S)
    return {map_id: json.loads(re.sub(r'(\w+):', r'"\1":', block).replace("'", '"')) for map_id, block in blocks}


MAPS = load_adjacency()


def board(map_id, **locked):
    return {region: locked.get(region) for region in MAPS[map_id]}


class SolverTests(unittest.TestCase):
    def solve(self, map_id, colors=ALL_COLORS, method='fc', trace=False, **locked):
        b = board(map_id, **locked)
        return csp_solver.solve(csp_solver.create_problem(MAPS[map_id], b, colors), method, trace)

    def test_maps_loaded(self):
        self.assertEqual({m: len(a) for m, a in MAPS.items()}, {'australia': 7, 'india': 23, 'usa': 22})

    def test_valid_coloring_every_map_and_method(self):
        for map_id in MAPS:
            for method in ('bt', 'fc'):
                r = self.solve(map_id, method=method)
                self.assertTrue(r['solved'], (map_id, method))
                self.assertTrue(csp_solver.is_valid_coloring(MAPS[map_id], r['assignment']), (map_id, method))

    def test_same_statistics_as_javascript(self):
        expected = {
            ('australia', 'bt'): {'nodes': 7, 'backtracks': 0, 'checks': 20, 'wipeouts': 0},
            ('australia', 'fc'): {'nodes': 7, 'backtracks': 0, 'checks': 9, 'wipeouts': 0},
            ('india', 'bt'): {'nodes': 23, 'backtracks': 0, 'checks': 95, 'wipeouts': 0},
            ('india', 'fc'): {'nodes': 23, 'backtracks': 0, 'checks': 46, 'wipeouts': 0},
            ('usa', 'bt'): {'nodes': 22, 'backtracks': 0, 'checks': 92, 'wipeouts': 0},
            ('usa', 'fc'): {'nodes': 22, 'backtracks': 0, 'checks': 48, 'wipeouts': 0},
        }
        for (map_id, method), stats in expected.items():
            self.assertEqual(self.solve(map_id, method=method)['stats'], stats, (map_id, method))

    def test_locked_regions_respected(self):
        r = self.solve('india', UP='red', MP='blue')
        self.assertTrue(r['solved'])
        self.assertEqual((r['assignment']['UP'], r['assignment']['MP']), ('red', 'blue'))
        self.assertTrue(csp_solver.is_valid_coloring(MAPS['india'], r['assignment']))

    def test_forward_checking_detects_wipeout(self):
        triangle = {'A': ['B', 'C'], 'B': ['A', 'C'], 'C': ['A', 'B']}
        b = {r: None for r in triangle}
        r = csp_solver.solve(csp_solver.create_problem(triangle, b, ['red', 'blue']), 'fc', True)
        self.assertFalse(r['solved'])
        self.assertGreater(r['stats']['wipeouts'], 0)
        self.assertGreater(r['stats']['backtracks'], 0)
        self.assertIn('wipeout', [s['type'] for s in r['steps']])

    def test_locked_neighbours_prune_before_search(self):
        locked = dict(NT='red', NSW='blue', WA='green')
        r3 = self.solve('australia', ['red', 'blue', 'green'], **locked)
        self.assertEqual((r3['solved'], r3['stats']['nodes'], r3['stats']['wipeouts']), (False, 0, 1))
        r4 = self.solve('australia', **locked)
        self.assertEqual(r4['assignment']['SA'], 'yellow')

    def test_backtracking_restores_state(self):
        for method, stats in (('bt', {'nodes': 197, 'backtracks': 177, 'checks': 1812, 'wipeouts': 0}),
                              ('fc', {'nodes': 21, 'backtracks': 1, 'checks': 63, 'wipeouts': 1})):
            r = self.solve('usa', method=method, trace=True, WA='yellow', CA='blue')
            self.assertEqual(r['stats'], stats, method)
            self.assertTrue(csp_solver.is_valid_coloring(MAPS['usa'], r['assignment']))
            assigned = set()
            for step in r['steps']:
                if step['type'] == 'assign':
                    self.assertNotIn(step['v'], assigned)
                    assigned.add(step['v'])
                elif step['type'] == 'backtrack':
                    assigned.discard(step['v'])
            self.assertEqual(len(assigned), 20)

    def test_impossible_coloring_reports_failure(self):
        for method in ('bt', 'fc'):
            r = self.solve('australia', ['red', 'blue'], method=method)
            self.assertFalse(r['solved'])
            self.assertIsNone(r['assignment'])

    def test_hint_keeps_map_solvable(self):
        b = board('usa', CO='red')
        h = csp_solver.hint(MAPS['usa'], b, ALL_COLORS, 'KS')
        self.assertEqual(h['region'], 'KS')
        self.assertTrue(h['safe'])
        self.assertNotEqual(h['color'], 'red')
        self.assertIn(h['color'], h['legal'])
        self.assertNotEqual(csp_solver.hint(MAPS['usa'], b, ALL_COLORS, 'CO')['region'], 'CO')

    def test_compare_runs_both_methods(self):
        bt, fc = csp_solver.compare(MAPS['india'], board('india'), ALL_COLORS, runs=3)
        self.assertEqual((bt['method'], fc['method']), ('bt', 'fc'))
        self.assertTrue(bt['solved'] and fc['solved'])
        self.assertEqual(bt['runs'], 3)


if __name__ == '__main__':
    unittest.main()
