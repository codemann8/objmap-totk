#!/usr/bin/env python3
"""
Fetch Passenger hash_ids for ALL Korok Friend puzzles and update static.json.

Process all 900 koroks, identify Friends by API korok_type, then:
  - Fetch gen_group to get KorokCarryPassenger_Pair hash_id and position
  - Add friend_hash_id to existing ProgressKeeper entry
  - Add a new Passenger marker entry
  - Link both markers with friend_hash_id

This turns 900 korok markers into ~1000 (matching the game's count).
"""

import json
import time
import urllib.request
import urllib.parse
from pathlib import Path

RADAR_URL = "https://radar-totk.zeldamods.org"
ROOT = Path(__file__).parent.parent


def api_get(path):
    url = f"{RADAR_URL}{urllib.parse.quote(path, safe='/:@')}"
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "objmap-totk-tools/1.0",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return json.loads(resp.read())
    except Exception as e:
        print(f"  ERROR fetching {url}: {e}")
        return None


def main():
    static_path = ROOT / "public" / "game_files" / "map_summary" / "MainField" / "static.json"
    static = json.load(open(static_path, "r"))
    koroks = static["markers"]["Korok"]
    print(f"Processing {len(koroks)} koroks...")

    new_passengers = []
    errors = []
    friend_count = 0

    for i, korok in enumerate(koroks):
        kid = korok["id"]
        hash_id = korok["hash_id"]

        if (i + 1) % 100 == 0:
            print(f"  [{i+1}/{len(koroks)}] {kid}... (friends found so far: {friend_count})")

        # Get full object data to check korok_type
        obj = api_get(f"/obj_by_hash/{hash_id}")
        if not obj:
            errors.append((kid, hash_id, "failed to fetch object"))
            time.sleep(0.1)
            continue

        korok_type = obj.get("korok_type", "")
        if korok_type != "Korok Friends":
            time.sleep(0.02)
            continue

        friend_count += 1
        map_type = obj["map_type"]
        map_name = obj["map_name"]

        # Get gen_group
        gg = api_get(f"/obj/{map_type}/{map_name}/{hash_id}/gen_group")
        if gg is None:
            errors.append((kid, hash_id, "failed to fetch gen_group"))
            time.sleep(0.1)
            continue

        # Find the Passenger
        passengers = [o for o in gg if o["name"] == "KorokCarryPassenger_Pair"]
        if not passengers:
            errors.append((kid, hash_id, "no KorokCarryPassenger_Pair found"))
            time.sleep(0.05)
            continue

        passenger = passengers[0]
        passenger_hash = passenger["hash_id"]
        passenger_pos = passenger["pos"]

        # Add friend_hash_id to the existing ProgressKeeper entry
        korok["friend_hash_id"] = passenger_hash

        # Create new Passenger marker entry
        passenger_entry = {
            "id": kid,
            "Translate": {
                "X": round(passenger_pos[0], 2),
                "Y": round(passenger_pos[1], 2),
                "Z": round(passenger_pos[2], 2),
            },
            "hash_id": passenger_hash,
            "name": kid,
            "map_static": korok.get("map_static", 1),
            "map_name": korok["map_name"],
            "map_type": korok["map_type"],
            "friend_hash_id": hash_id,
        }
        new_passengers.append(passenger_entry)

        time.sleep(0.05)

    print(f"\nFound {friend_count} Korok Friends")
    print(f"Created {len(new_passengers)} Passenger entries")
    if errors:
        print(f"Errors ({len(errors)}):")
        for kid, hid, err in errors:
            print(f"  {kid} ({hid}): {err}")

    # Add new Passenger entries to the koroks list
    koroks.extend(new_passengers)
    print(f"Total koroks now: {len(koroks)}")

    # Save
    with open(static_path, "w") as f:
        json.dump(static, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote updated static.json")

    # Also save the pairing data separately for reference
    pairs = {}
    for p in new_passengers:
        pairs[p["hash_id"]] = p["friend_hash_id"]
        pairs[p["friend_hash_id"]] = p["hash_id"]
    with open(ROOT / "korok_friend_pairs.json", "w") as f:
        json.dump(pairs, f, indent=2)
    print(f"Wrote {len(pairs)} pair mappings to korok_friend_pairs.json")


if __name__ == "__main__":
    main()
