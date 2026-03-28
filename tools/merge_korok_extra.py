#!/usr/bin/env python3
"""Merge korok_extra.json data into static.json."""
import json
from pathlib import Path

root = Path(__file__).parent.parent
static_path = root / 'public' / 'game_files' / 'map_summary' / 'MainField' / 'static.json'
extra_path = root / 'korok_extra.json'

static = json.load(open(static_path, 'r'))
extra = json.load(open(extra_path, 'r'))

merged = 0
for korok in static['markers']['Korok']:
    hid = korok['hash_id']
    if hid in extra:
        e = extra[hid]
        if 'origin_pos' in e:
            korok['origin_pos'] = e['origin_pos']
            merged += 1
        if 'friend_hash_id' in e:
            korok['friend_hash_id'] = e['friend_hash_id']

with open(static_path, 'w') as f:
    json.dump(static, f, ensure_ascii=False)

print(f"Merged {merged} origin positions into static.json")
