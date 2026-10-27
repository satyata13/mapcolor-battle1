"""app.py — runs MapColor Battle with its AI solver in Python.

Serves the game (index.html, CSS, JavaScript) and answers the AI Solver panel's requests with the
Python CSP solver in csp_solver.py. Uses only the Python standard library.

    python3 app.py          # then open http://localhost:8000
    python3 app.py 8080     # another port

API (POST, JSON body {adjacency, board, colors, method, trace, region}):
    /api/solve    Backtracking or Forward Checking on the current board (Solve with AI, Show Steps)
    /api/hint     a colour for one region that keeps the map solvable (Get Hint)
    /api/compare  both algorithms on the same board (Algorithm Comparison)
"""
import json
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import csp_solver

ROOT = Path(__file__).resolve().parent

ROUTES = {
    '/api/solve': lambda d: csp_solver.solve(
        csp_solver.create_problem(d['adjacency'], d['board'], d['colors']),
        d.get('method', 'fc'), bool(d.get('trace'))),
    '/api/hint': lambda d: csp_solver.hint(d['adjacency'], d['board'], d['colors'], d.get('region')),
    '/api/compare': lambda d: csp_solver.compare(d['adjacency'], d['board'], d['colors']),
}


class GameHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        route = ROUTES.get(self.path)
        if not route:
            self.send_error(404, 'Unknown API endpoint')
            return
        try:
            request = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            body = json.dumps(route(request)).encode()
        except (ValueError, KeyError, TypeError) as error:
            self.send_error(400, f'Bad request: {error}')
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(('', port), partial(GameHandler, directory=str(ROOT)))
    print(f'MapColor Battle running at http://localhost:{port}  (AI solver: Python) — press Ctrl+C to stop')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
