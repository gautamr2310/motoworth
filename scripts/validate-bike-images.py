import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
cat=json.loads((root/"data/catalogue.v2.json").read_text()) if (root/"data/catalogue.v2.json").exists() else None
db=json.loads((root/"data/bike_images.v1.json").read_text())
print("Registry records:",len(db["models"]))
print("Verified:",sum(x["status"]=="verified" for x in db["models"].values()))
