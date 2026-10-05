"""DayZ types.xml format helpers: standard vs Namalsk."""

from __future__ import annotations

import copy
import re
import xml.etree.ElementTree as ET
from typing import Any

TIER_NAME_RE = re.compile(r'^Tier(\d+)$', re.IGNORECASE)
TIER_USER_RE = re.compile(r'^Tier(\d+)$', re.IGNORECASE)

# Standard usage -> Namalsk economy tag (forward)
USAGE_TO_NAMALSK_TAG = {
    'Coast': 'fishing',
    'ContaminatedArea': 'military',
    'Farm': 'farm',
    'Firefighter': 'firefighter',
    'Historical': 'civilian',
    'Hunting': 'hunting',
    'Industrial': 'industrial',
    'Lunapark': 'civilian',
    'Medic': 'medical',
    'Military': 'military',
    'Office': 'civilian',
    'Police': 'police',
    'Prison': 'police',
    'School': 'civilian',
    'SeasonalEvent': 'seasonalevent',
    'Town': 'civilian',
    'Village': 'civilian',
}

# Namalsk economy tag -> one canonical standard usage (reverse)
NAMALSK_TAG_TO_CANONICAL_USAGE = {
    'civilian': 'Town',
    'farm': 'Farm',
    'firefighter': 'Firefighter',
    'fishing': 'Coast',
    'hunting': 'Hunting',
    'industrial': 'Industrial',
    'medical': 'Medic',
    'military': 'Military',
    'police': 'Police',
    'seaice': 'Coast',
    'seasonalevent': 'SeasonalEvent',
}

KNOWN_NAMALSK_TAGS = tuple(sorted(NAMALSK_TAG_TO_CANONICAL_USAGE.keys()))

_USAGE_TO_NAMALSK_LOWER = {k.lower(): v for k, v in USAGE_TO_NAMALSK_TAG.items()}


def expand_tier_user_attr(user_value: str) -> list[str]:
    """Expand Namalsk value user='Tier234' into ['Tier2', 'Tier3', 'Tier4']."""
    if not user_value:
        return []
    match = TIER_USER_RE.match(str(user_value).strip())
    if not match:
        return [str(user_value).strip()]
    digits = match.group(1)
    return [f'Tier{digit}' for digit in digits]


def collapse_tier_values(value_names: list[str]) -> tuple[str | None, list[str]]:
    """
    Collapse standard TierN names into one Namalsk user attr.

    Returns (user_attr_or_None, non_tier_names).
    Example: Tier2, Tier3, Tier4 -> ('Tier234', []).
    """
    tiers: list[int] = []
    non_tier: list[str] = []
    for name in value_names:
        if not name:
            continue
        match = TIER_NAME_RE.match(str(name).strip())
        if match:
            tiers.append(int(match.group(1)))
        else:
            non_tier.append(str(name))
    if not tiers:
        return None, non_tier
    tiers = sorted(set(tiers))
    return 'Tier' + ''.join(str(t) for t in tiers), non_tier


def usage_name_to_namalsk_tag(usage_name: str) -> str | None:
    """Standard usage name -> Namalsk tag, or None if unmapped."""
    if not usage_name:
        return None
    return _USAGE_TO_NAMALSK_LOWER.get(str(usage_name).strip().lower())


def namalsk_tag_to_canonical_usage(tag_name: str) -> str | None:
    """Namalsk tag -> canonical standard usage, or None if unknown."""
    if not tag_name:
        return None
    return NAMALSK_TAG_TO_CANONICAL_USAGE.get(str(tag_name).strip().lower())


def derive_namalsk_tags_from_usages(usage_names: list[str]) -> tuple[list[str], list[str]]:
    """
    Derive unique Namalsk tags from standard usages.

    Returns (tags, unmapped_usage_names).
    """
    tags: list[str] = []
    seen = set()
    unmapped: list[str] = []
    for usage in usage_names:
        if not usage:
            continue
        tag = usage_name_to_namalsk_tag(usage)
        if tag is None:
            unmapped.append(str(usage))
            continue
        if tag in seen:
            continue
        seen.add(tag)
        tags.append(tag)
    return tags, unmapped


def derive_usages_from_namalsk_tags(tag_names: list[str]) -> tuple[list[str], list[str]]:
    """
    Derive canonical standard usages from Namalsk tags.

    Returns (usages, unknown_tag_names).
    """
    usages: list[str] = []
    seen = set()
    unknown: list[str] = []
    for tag in tag_names:
        if not tag:
            continue
        usage = namalsk_tag_to_canonical_usage(tag)
        if usage is None:
            unknown.append(str(tag))
            continue
        key = usage.lower()
        if key in seen:
            continue
        seen.add(key)
        usages.append(usage)
    return usages, unknown


def resolve_usage_canonical(name: str, usage_canonical: dict[str, str] | None) -> str:
    """Map a usage/tag name to canonical usageflag casing when known."""
    if not name:
        return name
    if usage_canonical:
        canonical = usage_canonical.get(name.lower())
        if canonical:
            return canonical
    return name


def _iter_named_children(type_elem, tag: str):
    for child in type_elem.findall(tag):
        yield child


def detect_types_format(root) -> str:
    """
    Detect types XML dialect for a document root.

    Returns 'standard', 'namalsk', or 'mixed'.
    """
    has_standard = False
    has_namalsk = False

    for type_elem in root.findall('type'):
        for value in _iter_named_children(type_elem, 'value'):
            if value.get('user') is not None:
                has_namalsk = True
            if value.get('name') is not None:
                has_standard = True

        usages = list(_iter_named_children(type_elem, 'usage'))
        tags = list(_iter_named_children(type_elem, 'tag'))
        has_named_usage = any(u.get('name') for u in usages)
        has_empty_usage = any(
            u.get('name') is None and not (u.text and u.text.strip())
            for u in usages
        )
        has_named_tag = any(t.get('name') for t in tags)

        if has_named_usage:
            has_standard = True
        # Empty <usage /> plus tags is a Namalsk signal (economy tags as <tag>).
        if has_empty_usage and has_named_tag:
            has_namalsk = True

    if has_standard and has_namalsk:
        return 'mixed'
    if has_namalsk:
        return 'namalsk'
    return 'standard'


def _as_list(value: Any) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def extract_namalsk_tag_names(elem: dict) -> list[str]:
    """Pull economy tag names from an extracted element dict's tag children."""
    names: list[str] = []
    seen = set()
    for tag in _as_list(elem.get('tag')):
        if not isinstance(tag, dict):
            continue
        tag_name = tag.get('name')
        if not tag_name:
            continue
        key = str(tag_name).lower()
        if key in seen:
            continue
        seen.add(key)
        names.append(str(tag_name).lower())
    return names


def normalize_type_element_to_standard(
    elem: dict,
    fmt: str,
    usage_canonical: dict[str, str] | None = None,
) -> dict:
    """
    Convert an extracted type element dict toward the DB shape.

    fmt: 'standard' | 'namalsk'

    For Namalsk: expands value/@user, extracts economy tags into _namalsk_tags,
    does not put those tags into DayZ tag/usage lists. If no named usages are
    present, fills usages from reverse canonical map.
    """
    result = copy.deepcopy(elem)
    if fmt != 'namalsk':
        # Drop empty usage placeholders if present; keep standard fields as-is.
        usages = _as_list(result.get('usage'))
        named_usages = [
            u for u in usages
            if isinstance(u, dict) and u.get('name')
        ]
        if named_usages:
            result['usage'] = named_usages
        elif 'usage' in result:
            del result['usage']
        result.pop('_namalsk_tags', None)
        return result

    # --- Namalsk ---
    new_values: list[dict] = []
    for value in _as_list(result.get('value')):
        if not isinstance(value, dict):
            continue
        if 'user' in value and value.get('user') is not None:
            for tier_name in expand_tier_user_attr(str(value['user'])):
                new_values.append({'name': tier_name})
        elif value.get('name') is not None:
            new_values.append({'name': value['name']})
    if new_values:
        result['value'] = new_values
    else:
        result.pop('value', None)

    namalsk_tags = extract_namalsk_tag_names(result)
    result['_namalsk_tags'] = namalsk_tags

    # Economy tags must not become DayZ shelves/floor tags.
    result.pop('tag', None)

    named_usages = [
        u for u in _as_list(result.get('usage'))
        if isinstance(u, dict) and u.get('name')
    ]
    if named_usages:
        result['usage'] = [
            {'name': resolve_usage_canonical(str(u['name']), usage_canonical)}
            for u in named_usages
        ]
    elif namalsk_tags:
        usages, _unknown = derive_usages_from_namalsk_tags(namalsk_tags)
        filled = []
        for usage_name in usages:
            filled.append({
                'name': resolve_usage_canonical(usage_name, usage_canonical)
            })
        if filled:
            result['usage'] = filled
        else:
            result.pop('usage', None)
    else:
        result.pop('usage', None)

    return result


def _child_from_named_dict(tag: str, value: Any) -> ET.Element | None:
    if isinstance(value, dict):
        child = ET.Element(tag)
        for key, val in value.items():
            if key == '_text':
                child.text = str(val) if val else None
            else:
                child.set(key, str(val))
        return child
    if isinstance(value, str):
        child = ET.Element(tag)
        child.text = value
        return child
    return None


def _names_from_named_list(items: list) -> list[str]:
    names = []
    for item in items:
        if isinstance(item, dict) and item.get('name') is not None:
            names.append(str(item['name']))
        elif isinstance(item, str):
            names.append(item)
    return names


def resolve_namalsk_export_tags(
    namalsk_tag_names: list[str] | None,
    usage_names: list[str] | None,
    warnings: list | None = None,
    element_name: str | None = None,
) -> list[str]:
    """Prefer stored namalsk tags; else derive from usages."""
    if warnings is None:
        warnings = []
    stored = [str(t).lower() for t in (namalsk_tag_names or []) if t]
    if stored:
        # Dedupe preserving order
        seen = set()
        out = []
        for t in stored:
            if t in seen:
                continue
            seen.add(t)
            out.append(t)
        return out

    tags, unmapped = derive_namalsk_tags_from_usages(usage_names or [])
    if unmapped:
        warnings.append(
            f"{element_name or '?'}: unmapped usages for Namalsk export: {', '.join(unmapped)}"
        )
    return tags


def resolve_standard_export_usages(
    usage_names: list[str] | None,
    namalsk_tag_names: list[str] | None,
    warnings: list | None = None,
    element_name: str | None = None,
) -> list[str]:
    """Prefer stored usages; else derive from namalsk tags."""
    if warnings is None:
        warnings = []
    stored = [str(u) for u in (usage_names or []) if u]
    if stored:
        seen = set()
        out = []
        for u in stored:
            key = u.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(u)
        return out

    usages, unknown = derive_usages_from_namalsk_tags(namalsk_tag_names or [])
    if unknown:
        warnings.append(
            f"{element_name or '?'}: unknown namalsk tags for standard export: {', '.join(unknown)}"
        )
    if not usages and (namalsk_tag_names or usage_names):
        warnings.append(
            f"{element_name or '?'}: no standard usages available for export"
        )
    return usages


def append_namalsk_type_children(elem: ET.Element, data_dict: dict, warnings: list | None = None) -> None:
    """
    Append Namalsk-format children to an existing <type> element.

    Expects scalar fields (nominal, …) and flags to already be on elem.
    Order: empty usage, value user, category, namalsk economy tags.
    Native DayZ tags (shelves/floor) are omitted.
    """
    if warnings is None:
        warnings = []

    name_value = data_dict.get('name')

    categories = _as_list(data_dict.get('category'))
    usages = _as_list(data_dict.get('usage'))
    values = _as_list(data_dict.get('value'))
    namalsk_tags = data_dict.get('_namalsk_tags') or data_dict.get('namalsk_tags') or []
    if isinstance(namalsk_tags, str):
        namalsk_tags = [namalsk_tags]

    elem.append(ET.Element('usage'))

    value_names = []
    for value in values:
        if isinstance(value, dict) and value.get('name') is not None:
            value_names.append(str(value['name']))
        elif isinstance(value, str):
            value_names.append(value)
    user_attr, non_tier = collapse_tier_values(value_names)
    if non_tier:
        warnings.append(
            f"{name_value or '?'}: non-tier valueflags omitted from Namalsk export: {', '.join(non_tier)}"
        )
    if user_attr:
        value_elem = ET.Element('value')
        value_elem.set('user', user_attr)
        elem.append(value_elem)

    for cat in categories:
        child = _child_from_named_dict('category', cat)
        if child is not None:
            elem.append(child)

    export_tags = resolve_namalsk_export_tags(
        list(namalsk_tags),
        _names_from_named_list(usages),
        warnings=warnings,
        element_name=str(name_value) if name_value else None,
    )
    for tag_name in export_tags:
        tag_elem = ET.Element('tag')
        tag_elem.set('name', tag_name)
        elem.append(tag_elem)
