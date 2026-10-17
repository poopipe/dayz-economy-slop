"""List unique <tag name="..."> values from a types.xml file."""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

path = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else r"C:\Users\malcolm\src\github\namalsk\Mission Files\hardcore.namalsk\db\types.xml"
)
root = ET.parse(path).getroot()
names = sorted({t.get("name") for t in root.iter("tag") if t.get("name")})
out = Path(__file__).with_name("tag_names.txt")
out.write_text("\n".join(names) + f"\n---\n{len(names)} unique\n", encoding="utf-8")
print(out)
for name in names:
    print(name)
print("---")
print(f"{len(names)} unique")
