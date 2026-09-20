"""Tests for shared active project helpers and new-project APIs."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import active_project


class ActiveProjectHelpersTest(unittest.TestCase):
    def test_get_db_path_for_mission(self):
        path = active_project.get_db_path_for_mission(r'E:\Servers\A\mpmissions\mission.x')
        self.assertTrue(path.replace('\\', '/').endswith('mission.x/type-editor-db-v2/editor_data_v2.db'))

    def test_guess_profile_dir(self):
        profile = active_project.guess_profile_dir(r'E:\Servers\A\mpmissions\mission.x')
        self.assertEqual(Path(profile), Path(r'E:\Servers\A\profile'))

    def test_set_and_get_active_project(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp) / 'data'
            project_file = data_dir / 'active_project.json'
            with mock.patch.object(active_project, 'DATA_DIR', data_dir), \
                 mock.patch.object(active_project, 'ACTIVE_PROJECT_FILE', project_file):
                saved = active_project.set_active_project(
                    str(Path(tmp) / 'mission'),
                    db_file_path=None,
                    profile_dir=None,
                )
                loaded = active_project.get_active_project()
                self.assertIsNotNone(loaded)
                self.assertEqual(loaded['mission_dir'], saved['mission_dir'])
                self.assertTrue(loaded['db_file_path'].endswith('editor_data_v2.db'))
                self.assertTrue(project_file.exists())


class EconomyNewProjectApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from economy_editor_app import app
        cls.app = app
        cls.client = app.test_client()

    def test_new_project_creates_mission_and_db(self):
        with tempfile.TemporaryDirectory() as tmp:
            mission_dir = Path(tmp) / 'mpmissions' / 'empty.test'
            mission_dir.mkdir(parents=True)
            data_dir = Path(tmp) / 'data'
            project_file = data_dir / 'active_project.json'
            with mock.patch.object(active_project, 'DATA_DIR', data_dir), \
                 mock.patch.object(active_project, 'ACTIVE_PROJECT_FILE', project_file):
                response = self.client.post(
                    '/api/new-project',
                    data=json.dumps({
                        'mission_dir': str(mission_dir),
                        'import_xml': False,
                        'overwrite_db': False,
                    }),
                    content_type='application/json',
                )
                payload = response.get_json()
                self.assertEqual(response.status_code, 200, payload)
                self.assertTrue(payload['success'])
                self.assertTrue(Path(payload['db_file_path']).exists())
                self.assertFalse(payload['created_mission_dir'])
                self.assertTrue(payload['created_db'])

                # Second create without overwrite should conflict
                conflict = self.client.post(
                    '/api/new-project',
                    data=json.dumps({
                        'mission_dir': str(mission_dir),
                        'import_xml': False,
                        'overwrite_db': False,
                    }),
                    content_type='application/json',
                )
                self.assertEqual(conflict.status_code, 409)

    def test_new_project_requires_existing_mission(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / 'missing.mission'
            response = self.client.post(
                '/api/new-project',
                data=json.dumps({
                    'mission_dir': str(missing),
                    'import_xml': False,
                }),
                content_type='application/json',
            )
            self.assertEqual(response.status_code, 404)


class MapViewerNewProjectApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from map_viewer_app import app
        cls.app = app
        cls.client = app.test_client()

    def test_new_project_creates_mission_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            mission_dir = Path(tmp) / 'mpmissions' / 'dayzOffline.test'
            mission_dir.mkdir(parents=True)
            data_dir = Path(tmp) / 'data'
            project_file = data_dir / 'active_project.json'
            with mock.patch.object(active_project, 'DATA_DIR', data_dir), \
                 mock.patch.object(active_project, 'ACTIVE_PROJECT_FILE', project_file):
                response = self.client.post(
                    '/api/new-project',
                    data=json.dumps({
                        'mission_dir': str(mission_dir),
                    }),
                    content_type='application/json',
                )
                payload = response.get_json()
                self.assertEqual(response.status_code, 200, payload)
                self.assertTrue(payload['success'])
                self.assertFalse(payload['created_mission_dir'])

                active = self.client.get('/api/active-project').get_json()
                self.assertTrue(active['success'])
                self.assertEqual(Path(active['project']['mission_dir']), mission_dir.resolve())


if __name__ == '__main__':
    unittest.main()
