import json
import sys

with open(r"C:\Users\ROG STRIX\.gemini\antigravity\brain\8b2e484a-a9f1-4c86-a79d-d16ecf16bb0f\.system_generated\steps\489\output.txt", "r") as f:
    data = json.load(f)

for table in data["tables"]:
    if table["name"] == "public.cashier_queue":
        print(json.dumps(table, indent=2))
        break
