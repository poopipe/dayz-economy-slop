import unittest

from map_data_adapters import (
    GROUPS_ADAPTER,
    indexed_identity_parts,
    stable_marker_id,
)


class MapDataAdaptersTests(unittest.TestCase):
    def test_stable_marker_id_is_deterministic(self):
        left = stable_marker_id("groups", "foo", 1, 2, 3)
        right = stable_marker_id("groups", "foo", 1, 2, 3)
        self.assertEqual(left, right)
        self.assertTrue(left.startswith("groups:"))

    def test_stable_marker_id_changes_when_identity_changes(self):
        left = stable_marker_id("groups", "foo", 1, 2, 3)
        right = stable_marker_id("groups", "foo", 1, 2, 4)
        self.assertNotEqual(left, right)

    def test_adapter_add_source_id(self):
        payload = {"name": "Example"}
        GROUPS_ADAPTER.add_source_id(payload, *indexed_identity_parts("Example", 10, 20, index_chain=(0,)))
        self.assertIn("sourceId", payload)
        self.assertTrue(payload["sourceId"].startswith("groups:"))

    def test_indexed_identity_parts_appends_indices(self):
        parts = indexed_identity_parts("name", 1, index_chain=(2, 3))
        self.assertEqual(parts, ("name", 1, 2, 3))


if __name__ == "__main__":
    unittest.main()
