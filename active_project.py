"""Shared active project state for Economy Editor and Map Viewer."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / 'data'
ACTIVE_PROJECT_FILE = DATA_DIR / 'active_project.json'


def get_db_path_for_mission(mission_dir: str) -> str:
    """Return the standard Economy Editor DB path for a mission folder."""
    return str(Path(mission_dir) / 'type-editor-db-v2' / 'editor_data_v2.db')


def guess_profile_dir(mission_dir: str) -> str:
    """Guess DayZ profile directory from a mission directory path."""
    try:
        mission_path = Path(mission_dir)
        if mission_path.parent and mission_path.parent.parent:
            return str(mission_path.parent.parent / 'profile')
    except Exception:
        pass
    return ''


def get_active_project() -> dict | None:
    """Load the shared active project, or None if unset/invalid."""
    if not ACTIVE_PROJECT_FILE.exists():
        return None
    try:
        with open(ACTIVE_PROJECT_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return None
        mission_dir = (data.get('mission_dir') or '').strip()
        if not mission_dir:
            return None
        return {
            'mission_dir': mission_dir,
            'db_file_path': (data.get('db_file_path') or '').strip() or get_db_path_for_mission(mission_dir),
            'profile_dir': (data.get('profile_dir') or '').strip() or guess_profile_dir(mission_dir),
            'updated_at': data.get('updated_at'),
        }
    except Exception:
        return None


def set_active_project(
    mission_dir: str,
    db_file_path: str | None = None,
    profile_dir: str | None = None,
) -> dict:
    """Persist the shared active project and return the saved payload."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    mission_dir = str(Path(mission_dir))
    payload = {
        'mission_dir': mission_dir,
        'db_file_path': (db_file_path or '').strip() or get_db_path_for_mission(mission_dir),
        'profile_dir': profile_dir if profile_dir is not None else guess_profile_dir(mission_dir),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }
    with open(ACTIVE_PROJECT_FILE, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2)
    return payload
