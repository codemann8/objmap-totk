#!/usr/bin/env python3
"""
Fetch origin positions and friend-pair links for all koroks.

Produces korok_extra.json with entries like:
  {
    "0xc7a6a3a3ac49a14c": {
      "origin_pos": [X, Y, Z],           // where the challenge starts (if different)
      "friend_hash_id": "0x..."           // paired ProgressKeeper hash_id (Korok Friends only)
    }
  }

Usage:
  python tools/gen_korok_extra.py

Requires the radar API at https://radar-totk.zeldamods.org to be accessible.
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


def get_obj(hash_id):
    return api_get(f"/obj_by_hash/{hash_id}")


def get_gen_group(map_type, map_name, hash_id):
    return api_get(f"/obj/{map_type}/{map_name}/{hash_id}/gen_group")


def compute_origin(korok_type, gen_group):
    """Return the origin position [X, Y, Z] based on korok type, or None if same as completion."""
    if not gen_group:
        return None

    if korok_type == "Korok Friends":
        # Origin is where the KorokCarryPassenger_Pair is
        passenger = [o for o in gen_group if o["name"] == "KorokCarryPassenger_Pair"]
        if passenger:
            return passenger[0]["pos"]

    elif korok_type == "Flower Trail":
        # Origin is the first flower in sequence
        flowers = [o for o in gen_group if "Obj_Plant_Korok" in o["name"]]
        if flowers:
            return flowers[0]["pos"]

    elif korok_type == "Land on Target":
        # Origin is the starting block
        starts = [o for o in gen_group if "KorokStartingBlock" in o["name"]]
        if starts:
            return starts[0]["pos"]

    elif korok_type == "Moving Lights":
        # Origin is the first light/firefly position
        lights = [o for o in gen_group
                  if "Korok" in o["name"] and "Insect" in o["name"]]
        if lights:
            return lights[0]["pos"]

    elif korok_type == "Offering Plate":
        # Origin is the plate itself
        plates = [o for o in gen_group if "OfferingPlate" in o["name"]]
        if plates:
            return plates[0]["pos"]

    return None


def find_friend_pair(hash_id, gen_group):
    """For Korok Friends, find the other KorokCarryProgressKeeper hash_id."""
    if not gen_group:
        return None
    keepers = [o for o in gen_group
               if o["name"] == "KorokCarryProgressKeeper" and o["hash_id"] != hash_id]
    if keepers:
        return keepers[0]["hash_id"]
    return None


def main():
    static_path = ROOT / "public" / "game_files" / "map_summary" / "MainField" / "static.json"
    static = json.load(open(static_path, "r"))
    koroks = static["markers"]["Korok"]

    print(f"Processing {len(koroks)} koroks...")

    extra = {}
    errors = []

    for i, korok in enumerate(koroks):
        kid = korok["id"]
        hash_id = korok["hash_id"]

        if (i + 1) % 50 == 0:
            print(f"  [{i+1}/{len(koroks)}] {kid}...")

        # Get full object data for korok_type and actual map_type/map_name
        obj = get_obj(hash_id)
        if not obj:
            errors.append((kid, hash_id, "failed to fetch object"))
            time.sleep(0.1)
            continue

        korok_type = obj.get("korok_type", "")
        map_type = obj["map_type"]
        map_name = obj["map_name"]

        # Get gen_group for origin position and friend pair
        gg = get_gen_group(map_type, map_name, hash_id)
        if gg is None:
            errors.append((kid, hash_id, "failed to fetch gen_group"))
            time.sleep(0.1)
            continue

        entry = {}

        # Compute origin position
        origin = compute_origin(korok_type, gg)
        if origin:
            # Only store if meaningfully different from Translate
            tx, ty, tz = korok["Translate"]["X"], korok["Translate"]["Y"], korok["Translate"]["Z"]
            dist_sq = (origin[0]-tx)**2 + (origin[1]-ty)**2 + (origin[2]-tz)**2
            if dist_sq > 25:  # more than 5 units away
                entry["origin_pos"] = [round(origin[0], 2), round(origin[1], 2), round(origin[2], 2)]

        # Find friend pair
        if korok_type == "Korok Friends":
            friend = find_friend_pair(hash_id, gg)
            if friend:
                entry["friend_hash_id"] = friend

        if entry:
            extra[hash_id] = entry

        # Rate limit
        time.sleep(0.05)

    out_path = ROOT / "korok_extra.json"
    with open(out_path, "w") as f:
        json.dump(extra, f, indent=2, ensure_ascii=False)

    print(f"\nDone! Wrote {len(extra)} entries to {out_path}")
    if errors:
        print(f"Errors ({len(errors)}):")
        for kid, hid, err in errors:
            print(f"  {kid} ({hid}): {err}")


if __name__ == "__main__":
    main()
