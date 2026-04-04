import tempfile
import unittest
from pathlib import Path

try:
    from map_viewer_app import app, resolve_mission_path
except ModuleNotFoundError as exc:
    app = None
    resolve_mission_path = None
    _IMPORT_ERROR = exc
else:
    _IMPORT_ERROR = None


class MapViewerApiHelpersTests(unittest.TestCase):
    @unittest.skipIf(_IMPORT_ERROR is not None, f"Skipping helper tests: {_IMPORT_ERROR}")
    def test_resolve_mission_path_returns_error_for_missing_input(self):
        with app.test_request_context("/api/groups"):
            err, mission_path = resolve_mission_path("")
            self.assertIsNotNone(err)
            self.assertIsNone(mission_path)

    @unittest.skipIf(_IMPORT_ERROR is not None, f"Skipping helper tests: {_IMPORT_ERROR}")
    def test_resolve_mission_path_returns_path_when_exists(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            with app.test_request_context("/api/groups"):
                err, mission_path = resolve_mission_path(tmp_dir)
                self.assertIsNone(err)
                self.assertIsInstance(mission_path, Path)
                self.assertEqual(mission_path, Path(tmp_dir))


if __name__ == "__main__":
    unittest.main()
