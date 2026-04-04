"""Adapter helpers for map-viewer XML/JSON data normalization."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Dict, Iterable


def stable_marker_id(prefix: str, *parts: Any) -> str:
    """Create a stable, content-derived identifier for editable entities."""
    joined = "|".join("" if p is None else str(p) for p in parts)
    digest = hashlib.sha1(joined.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}:{digest}"


@dataclass(frozen=True)
class MarkerAdapter:
    """Base adapter API for normalized map-viewer marker payloads."""

    prefix: str

    def add_source_id(self, payload: Dict[str, Any], *identity_parts: Any) -> Dict[str, Any]:
        payload["sourceId"] = stable_marker_id(self.prefix, *identity_parts)
        return payload


GROUPS_ADAPTER = MarkerAdapter(prefix="groups")
EVENT_SPAWNS_ADAPTER = MarkerAdapter(prefix="event_spawns")
EFFECT_AREAS_ADAPTER = MarkerAdapter(prefix="effect_areas")
TERRITORY_ZONES_ADAPTER = MarkerAdapter(prefix="territory_zones")
PLAYER_SPAWNS_ADAPTER = MarkerAdapter(prefix="player_spawns")


def indexed_identity_parts(*parts: Any, index_chain: Iterable[int]) -> tuple[Any, ...]:
    """Compose stable identity parts with source indices at the end."""
    return (*parts, *tuple(index_chain))
