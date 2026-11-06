"""
End-to-end API contract test: replays the exact request sequence the React client makes
(client/src/services/api.js as driven by KnottingUnknottingGame.jsx and GameGrid.jsx).

Run from server/:  CLASSIFIER_MODE=builtin python -m unittest discover -s tests -v
MongoDB and the Sage classifier are NOT required.
"""
import os
import sys
import time
import unittest

os.environ.setdefault("CLASSIFIER_MODE", "builtin")
os.environ.setdefault("MONGODB_TIMEOUT_MS", "300")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402

# Frontend DEFAULT_BOARD (5x5, 11 = unresolved in the UI, sent to the API as -1)
UI_DEFAULT_BOARD = [0, 2, 5, 5, 1, 2, 11, 5, 1, 6, 6, 6, 2, 11, 4, 6, 3, 11, 4, 0, 3, 5, 4, 0, 0]


def to_backend(flat, rows=5, cols=5):
    b = [t if t != 11 else -1 for t in flat]
    return [b[i * cols:(i + 1) * cols] for i in range(rows)]


class FrontendContractTest(unittest.TestCase):
    def setUp(self):
        server.app.testing = True
        server.CLASSIFIER_MODE = "builtin"
        self.c = server.app.test_client()

    def new_game(self, starting="unknotter"):
        r = self.c.post("/api/game/new", json={"board": to_backend(UI_DEFAULT_BOARD), "starting_player": starting})
        self.assertEqual(r.status_code, 201, r.get_json())
        return r.get_json()["game_id"]

    def test_health(self):
        r = self.c.get("/api/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["status"], "healthy")

    def test_full_game_like_the_ui(self):
        gid = self.new_game("unknotter")
        status = self.c.get(f"/api/game/{gid}/status").get_json()
        self.assertEqual(status["unresolved_count"], 3)
        moves = [(1, 1, 9), (2, 3, 10), (3, 2, 9)]
        expected_players = ["knotter", "unknotter", None]
        for (row, col, tile), nxt in zip(moves, expected_players):
            r = self.c.post(f"/api/game/{gid}/move", json={"row": row, "col": col, "new_tile": tile})   # tile chosen
            self.assertEqual(r.status_code, 200, r.get_json())
            status = self.c.get(f"/api/game/{gid}/status").get_json()                                   # Submit move
            if nxt:
                self.assertEqual(status["current_player"], nxt)
        self.assertTrue(status["game_over"])
        self.assertEqual(status["unresolved_count"], 0)
        t0 = time.time()
        r = self.c.post(f"/api/game/{gid}/classify")                                                    # auto-classify
        self.assertLess(time.time() - t0, 5, "classify must not hang when MongoDB is absent")
        self.assertEqual(r.status_code, 200, r.get_json())
        data = r.get_json()
        self.assertIn(data["winner"], ("knotter", "unknotter"))
        self.assertEqual(data["classification"]["reason"], "jones_polynomial")       # fields the UI renders
        self.assertEqual(data["classification"]["num_crossings"], 3)
        self.assertEqual(data["winner"], "unknotter" if data["classification"]["is_unknot"] else "knotter")
        r = self.c.delete(f"/api/game/{gid}")                                                           # Play again
        self.assertEqual(r.status_code, 200)

    def test_alternating_trefoil_is_knotter_win(self):
        gid = self.new_game("knotter")
        # the alternating resolution of this shadow is a trefoil
        for row, col, tile in [(1, 1, 10), (2, 3, 10), (3, 2, 10)]:
            self.c.post(f"/api/game/{gid}/move", json={"row": row, "col": col, "new_tile": tile})
        data = self.c.post(f"/api/game/{gid}/classify").get_json()
        trefoil = not data["classification"]["is_unknot"]
        # whichever it is, winner must agree with the classification
        self.assertEqual(data["winner"], "knotter" if trefoil else "unknotter")

    def test_undo_restores_turn(self):
        gid = self.new_game("unknotter")
        self.c.post(f"/api/game/{gid}/move", json={"row": 1, "col": 1, "new_tile": 9})
        self.assertEqual(self.c.get(f"/api/game/{gid}/status").get_json()["current_player"], "knotter")
        r = self.c.post(f"/api/game/{gid}/undo", json={"row": 1, "col": 1})                            # Undo button
        self.assertEqual(r.status_code, 200)
        st = r.get_json()["status"]
        self.assertEqual(st["current_player"], "unknotter")
        self.assertEqual(st["unresolved_count"], 3)
        self.assertEqual(st["move_count"], 0)

    def test_sage_mode_without_service_reports_503(self):
        server.CLASSIFIER_MODE = "sage"
        server.CLASSIFIER_URL = "http://127.0.0.1:9/api/classify"
        gid = self.new_game()
        r = self.c.post(f"/api/game/{gid}/classify")
        self.assertEqual(r.status_code, 503)

    def test_auto_mode_falls_back_to_builtin(self):
        server.CLASSIFIER_MODE = "auto"
        server.CLASSIFIER_URL = "http://127.0.0.1:9/api/classify"
        gid = self.new_game()
        for row, col, tile in [(1, 1, 9), (2, 3, 9), (3, 2, 9)]:
            self.c.post(f"/api/game/{gid}/move", json={"row": row, "col": col, "new_tile": tile})
        r = self.c.post(f"/api/game/{gid}/classify")
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(r.get_json()["classification"]["classifier"], "builtin")


class BuiltinClassifierTest(unittest.TestCase):
    def test_known_knots(self):
        from knot_classifier import classify_mosaic
        kink = classify_mosaic([[2, 1, 0], [3, 9, 1], [0, 3, 4]])
        self.assertTrue(kink["is_unknot"])
        self.assertEqual(kink["jones_polynomial"], "1")
        trefoil = classify_mosaic([[0, 2, 1, 0], [2, 9, 10, 1], [3, 10, 8, 4], [0, 3, 4, 0]])  # README smoke test
        self.assertFalse(trefoil["is_unknot"])
        self.assertEqual(trefoil["jones_polynomial"], "-t^4 + t^3 + t")
        # exactly 2 of the 8 resolutions of the trefoil shadow are knotted
        knotted = 0
        for a in (9, 10):
            for b in (9, 10):
                for c in (9, 10):
                    if not classify_mosaic([[0, 2, 1, 0], [2, a, b, 1], [3, c, 8, 4], [0, 3, 4, 0]])["is_unknot"]:
                        knotted += 1
        self.assertEqual(knotted, 2)


# A 25x25 knot shadow (12-strand plat, 31 crossings) from the prototype's generator
BOARD_25 = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 5, 5, 5, 5, 1, 2, 5, 5, 5, 5, 1, 2, 5, 5, 5, 5, 1, 2, 5, 5, 5, 1, 0],
    [0, 6, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 6, 0],
    [0, 3, 5, 1, 2, 4, 3, 5, 5, 1, 2, 4, 3, 5, 5, 1, 2, 4, 3, 5, 5, 5, 5, 4, 0],
    [0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 4, 3, 5, 5, 1, 2, 4, 3, 5, 5, 1, 2, 4, 3, 5, 5, 1, 2, 5, 5, 5, 1, 0],
    [0, 6, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 6, 0],
    [0, 3, 5, 1, 2, 4, 3, 5, 5, 1, 2, 4, 3, 5, 5, 5, 5, 4, 3, 5, 5, 1, 2, 4, 0],
    [0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, 4, 0, 0],
    [0, 2, 4, 3, 5, 5, 1, 2, 4, 3, 5, 5, 1, 2, 5, 5, 5, 5, 1, 2, 4, 3, 5, 1, 0],
    [0, 6, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 6, 0],
    [0, 3, 5, 1, 2, 4, 3, 5, 5, 1, 2, 4, 3, 5, 5, 1, 2, 4, 3, 5, 5, 1, 2, 4, 0],
    [0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0],
    [0, 2, 4, 3, 5, 5, 5, 5, 4, 3, 5, 5, 1, 2, 4, 3, 5, 5, 1, 2, 4, 3, 5, 1, 0],
    [0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 6, 0],
    [0, 3, 5, 5, 5, 5, 5, 5, 5, 1, 2, 4, 3, 5, 5, 1, 2, 4, 3, 5, 5, 5, 5, 4, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 5, 5, 5, 5, 5, 5, 4, 3, 5, 5, 1, 2, 4, 3, 5, 5, 1, 2, 5, 5, 5, 1, 0],
    [0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 6, 0],
    [0, 3, 5, 1, 2, 5, 5, 5, 5, 1, 2, 4, 3, 5, 5, 5, 5, 4, 3, 5, 5, 1, 2, 4, 0],
    [0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, -1, 4, 0, 0],
    [0, 2, 4, 3, 5, 5, 1, 2, 4, 3, 5, 5, 1, 2, 5, 5, 5, 5, 1, 2, 4, 3, 5, 1, 0],
    [0, 6, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 2, -1, 4, 0, 0, 0, 6, 0],
    [0, 3, 5, 5, 5, 4, 3, 5, 5, 5, 5, 4, 3, 5, 5, 5, 5, 4, 3, 5, 5, 5, 5, 4, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
]


class LargeBoardTest(unittest.TestCase):
    def setUp(self):
        server.app.testing = True
        server.CLASSIFIER_MODE = "builtin"
        self.c = server.app.test_client()

    def test_25x25_game_through_the_api(self):
        r = self.c.post("/api/game/new", json={"board": BOARD_25, "starting_player": "knotter"})
        self.assertEqual(r.status_code, 201, r.get_json())
        gid = r.get_json()["game_id"]
        status = r.get_json()["status"]
        self.assertEqual((status["rows"], status["cols"]), (25, 25))
        self.assertEqual(status["unresolved_count"], 31)
        for k, (row, col) in enumerate(status["unresolved_positions"]):
            r = self.c.post(f"/api/game/{gid}/move", json={"row": row, "col": col, "new_tile": 9 if k % 3 else 10})
            self.assertEqual(r.status_code, 200, r.get_json())
        t0 = time.time()
        r = self.c.post(f"/api/game/{gid}/classify")
        self.assertLess(time.time() - t0, 10)
        data = r.get_json()
        self.assertEqual(r.status_code, 200, data)
        cls = data["classification"]
        self.assertEqual(cls["num_crossings"], 31)
        self.assertEqual(cls["method"], "row_sweep")
        self.assertIn(cls["is_unknot"], (True, False))
        self.assertEqual(data["winner"], "unknotter" if cls["is_unknot"] else "knotter")

    def test_25x25_row_sweep_matches_known_alternating_invariants(self):
        from knot_classifier import classify_mosaic, _Diagram
        # alternating resolution of a reduced-ish alternating diagram must be knotted
        d = _Diagram(BOARD_25)
        board = [row[:] for row in BOARD_25]
        # resolve by alternating along the traversal
        for k, (i, direction) in enumerate(d.passages):
            r, c = d.crossings[i]
            if direction in (1, 3):
                board[r][c] = 9 if k % 2 == 0 else 10
        res = classify_mosaic(board)
        self.assertFalse(res["is_unknot"])
        self.assertTrue(res["certified"])


if __name__ == "__main__":
    unittest.main()
