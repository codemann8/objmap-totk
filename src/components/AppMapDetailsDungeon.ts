import * as L from 'leaflet';
import Component from 'vue-class-component';

import AppMapDetailsBase from '@/components/AppMapDetailsBase';
import ObjectInfo from '@/components/ObjectInfo';
import { MapMarkerDungeon } from '@/MapMarker';
import {
  MapMgr,
  ObjectMinData,
} from '@/services/MapMgr';
import { MsgMgr } from '@/services/MsgMgr';

// Cache: maps dungeon ID (e.g. "Dungeon132") to the first matching crystal ObjectMinData.
// null means we looked and found no crystal for that dungeon.
let crystalCache: Map<string, ObjectMinData | null> | null = null;

async function getCrystalForDungeon(dungeonId: string): Promise<ObjectMinData | null> {
  if (!crystalCache) {
    crystalCache = new Map();
    const allCrystals = await MapMgr.getInstance().getObjs('MainField', '', 'actor:FldObj_ZonauShrine_KeyCrystal');
    // For each crystal, fetch full data to read DungeonIndexStr.
    // Use Promise.all to parallelise.
    const fullData = await Promise.all(
      allCrystals.map(c => MapMgr.getInstance().getObjByObjId(c.objid))
    );
    for (let i = 0; i < allCrystals.length; i++) {
      const full = fullData[i];
      if (!full || !full.data.Dynamic) continue;
      const did = full.data.Dynamic.DungeonIndexStr as string | undefined;
      if (!did) continue;
      // Only store the first crystal per dungeon (user requirement: show at most 1).
      if (!crystalCache.has(did)) {
        crystalCache.set(did, allCrystals[i]);
      }
    }
  }
  return crystalCache.get(dungeonId) || null;
}

@Component({
  components: {
    ObjectInfo,
  },
})
export default class AppMapDetailsDungeon extends AppMapDetailsBase<MapMarkerDungeon> {
  private id = '';
  private sub = '';
  private bgmObjs: ObjectMinData[] = [];
  private tboxObjs: ObjectMinData[] = [];
  private enemies: ObjectMinData[] = [];
  private weapons: ObjectMinData[] = [];
  private items: ObjectMinData[] = [];
  private iceChunks: ObjectMinData[] = [];
  private thinIce: ObjectMinData[] = [];
  private pos: number[] = [];
  private checked: { [key: string]: boolean } = {};
  private crystalMarkers: (L.Marker | L.Polyline)[] = [];
  private crystalObj: ObjectMinData | null = null;

  protected init() {
    // Clean up any existing crystal markers from a previous init.
    this.crystalMarkers.forEach(m => m.remove());
    this.crystalMarkers = [];
    this.crystalObj = null;

    this.id = this.marker.data.lm.getMessageId();
    this.sub = MsgMgr.getInstance().getMsgWithFile('StaticMsg/Dungeon', this.id + '_sub');

    MapMgr.getInstance().getObjs('MainField', '', 'actor:^"BGM_Shrine"').then(d => {
      const target = this.marker.data.lm.getXYZ();
      let best: ObjectMinData | null = null;
      let bestDist = Infinity;
      for (const obj of d) {
        const dx = obj.pos[0] - target[0];
        const dy = obj.pos[1] - target[1];
        const dz = obj.pos[2] - target[2];
        const dist = dx * dx + dy * dy + dz * dz;
        if (dist < bestDist) {
          best = obj;
          bestDist = dist;
        }
      }
      this.bgmObjs = best ? [best] : [];
      this.updateChecked(this.bgmObjs);
    });
    MapMgr.getInstance().getObjs('SmallDungeon', this.id, 'actor:^"TBox_"').then(d => {
      this.tboxObjs = d;
      this.updateChecked(d);
    });
    MapMgr.getInstance().getObjs('SmallDungeon', this.id, 'actor:^"Enemy_"').then(d => {
      this.enemies = d;
      this.updateChecked(d);
    });
    MapMgr.getInstance().getObjs('SmallDungeon', this.id, 'actor:^"Weapon_"').then(d => {
      this.weapons = d;
      this.updateChecked(d);
    });
    MapMgr.getInstance().getObjs('SmallDungeon', this.id, '(IceFruit OR FireFruit OR BombFruit OR ElectricalFruit OR Item_Ore_B OR Obj_ArrowBundle) NOT Enemy NOT Tbox)').then(d => {
      this.items = d;
      this.updateChecked(d);
    });
    MapMgr.getInstance().getObjs('SmallDungeon', this.id, 'actor:IceWall').then(d => {
      this.iceChunks = d;
      this.updateChecked(d);
    });
    MapMgr.getInstance().getObjs('SmallDungeon', this.id, 'actor:ThinFilmBoard').then(d => {
      this.thinIce = d;
      this.updateChecked(d);
    });
    this.pos = this.marker.data.lm.getXYZ();
    this.initCrystalMarker();
  }

  private async initCrystalMarker() {
    const crystal = await getCrystalForDungeon(this.id);
    if (!crystal) return;
    this.crystalObj = crystal;

    const map = this.marker.data.mb;
    const shrinePos: [number, number] = [this.pos[2], this.pos[0]];
    const crystalPos: [number, number] = [crystal.pos[2], crystal.pos[0]];

    // Draw connecting line from shrine to crystal.
    const line = L.polyline([shrinePos, crystalPos], {
      color: 'springgreen',
      weight: 2,
      opacity: 0.8,
    }).addTo(map.m);
    this.crystalMarkers.push(line);

    // Place a crystal icon marker at the crystal location.
    const icon = L.icon({
      iconUrl: '/icons/shrine_crystal.svg',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    const marker = L.marker(crystalPos, { icon })
      .bindTooltip('Shrine Crystal', { pane: 'front2' })
      .addTo(map.m);
    marker.on('click', (e: any) => {
      L.DomEvent.stopPropagation(e);
      this.$parent.$emit('AppMap:open-obj-no-temp-marker', crystal);
    });
    marker.on('add', () => {
      const el = marker.getElement();
      if (el) el.style.cursor = 'pointer';
    });
    this.crystalMarkers.push(marker);
  }

  private beforeDestroy() {
    this.crystalMarkers.forEach(m => m.remove());
    this.crystalMarkers = [];
  }

  private openCrystalObj() {
    if (this.crystalObj) {
      this.$parent.$emit('AppMap:open-obj-no-temp-marker', this.crystalObj);
    }
  }

  private mounted() {
    this.$on('AppMap:update-search-markers', (args: any) => {
      if (args && args.hash_id) {
        this.$set(this.checked, args.hash_id, !this.checked[args.hash_id]);
        const appMap: any = this.$parent;
        if (appMap && typeof appMap.$emit === 'function') {
          appMap.$emit('AppMap:update-search-markers', args);
        }
      }
    });
  }

  private updateChecked(objs: ObjectMinData[]) {
    const appMap: any = this.$parent;
    for (const obj of objs) {
      if (this.checked[obj.hash_id] === undefined) {
        const value = appMap && appMap.checklists
          ? appMap.checklists.isMarked(obj.hash_id)
          : false;
        this.$set(this.checked, obj.hash_id, value);
      }
    }
  }

  private isChecked(obj: ObjectMinData) {
    return !!this.checked[obj.hash_id];
  }

  private openContainingCave() {
    const appMap: any = this.$parent;
    if (appMap && typeof appMap.$emit === 'function') {
      appMap.$emit('AppMap:open-cave-from-shrine', this.bgmObjs[0]);
    }
  }
}
