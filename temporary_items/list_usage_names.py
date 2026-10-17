"""List unique <usage name="..."> values from a types.xml file."""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

path = Path(sys.argv[1])
root = ET.parse(path).getroot()
names = sorted({u.get("name") for u in root.iter("usage") if u.get("name")})
for name in names:
    print(name)
print("---")
print(f"{len(names)} unique")
