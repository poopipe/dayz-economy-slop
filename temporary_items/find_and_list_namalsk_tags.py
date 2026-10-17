"""Find types*.xml under Namalsk mission db and list tag names."""
import xml.etree.ElementTree as ET
from pathlib import Path

db = Path(r"C:\Users\malcolm\src\github\namalsk\Mission Files\hardcore.namalsk\db")
# Also search mission root in case types_dzn lives elsewhere
mission = db.parent

candidates = []
for base in (db, mission):
    if not base.exists():
        continue
    for p in base.rglob("types*.xml"):
        name = p.name.lower()
        if name == "types.xml" or "types_dzn" in name or name.startswith("types_dzn"):
            candidates.append(p)

# Prefer unique paths
seen = set()
files = []
for p in sorted(candidates):
    key = str(p.resolve())
    if key in seen:
        continue
    seen.add(key)
    files.append(p)

print("Found files:")
for p in files:
    print(f"  {p}")

if not files:
    raise SystemExit("No matching types files found")

# Focus on types.xml and anything with dzn in the name
wanted = [p for p in files if p.name.lower() == "types.xml" or "dzn" in p.name.lower()]
if not wanted:
    wanted = files

all_names = set()
for path in wanted:
    root = ET.parse(path).getroot()
    names = sorted({t.get("name") for t in root.iter("tag") if t.get("name")})
    all_names |= set(names)
    print(f"\n=== {path.name} ({len(names)}) ===")
    for name in names:
        print(name)

combined = sorted(all_names)
print(f"\n=== combined unique ({len(combined)}) ===")
for name in combined:
    print(name)
