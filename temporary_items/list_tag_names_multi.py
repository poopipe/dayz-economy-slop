"""List unique <tag name="..."> values from one or more types XML files."""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

paths = [Path(p) for p in sys.argv[1:]]
if not paths:
    raise SystemExit("Usage: list_tag_names_multi.py <file> [file...]")

all_names = set()
per_file = {}
for path in paths:
    root = ET.parse(path).getroot()
    names = {t.get("name") for t in root.iter("tag") if t.get("name")}
    per_file[str(path)] = sorted(names)
    all_names |= names

for path, names in per_file.items():
    print(f"=== {Path(path).name} ({len(names)}) ===")
    for name in names:
        print(name)
    print()

combined = sorted(all_names)
print(f"=== combined unique ({len(combined)}) ===")
for name in combined:
    print(name)
