import Vue from 'vue';

import Component from 'vue-class-component';

import { rankUpEnemyForHardMode } from '@/level_scaling';
import { ObjectMinData } from '@/services/MapMgr';
import { MsgMgr } from '@/services/MsgMgr';
import { Settings } from '@/util/settings';

@Component
export default class MixinUtil extends Vue {
  private getLocationNameFromObj(obj: any): string {
    if (!obj)
      return '';

    if (typeof obj.location === 'string' && obj.location)
      return obj.location;

    const nestedDynamicLocation = obj.data && obj.data.Dynamic
      ? obj.data.Dynamic.LocationName
      : undefined;
    if (typeof nestedDynamicLocation === 'string' && nestedDynamicLocation)
      return nestedDynamicLocation;

    const dynamicLocation = obj.Dynamic
      ? obj.Dynamic.LocationName
      : undefined;
    if (typeof dynamicLocation === 'string' && dynamicLocation)
      return dynamicLocation;

    return '';
  }

  getResolvedMapNameForObj(obj: ObjectMinData | any) {
    const mapName = obj && obj.map_name ? obj.map_name : '';
    if (typeof mapName === 'string' && mapName.startsWith('Cave__'))
      return mapName;

    const locationName = this.getLocationNameFromObj(obj);
    if (locationName.startsWith('Cave_'))
      return `Cave__${locationName}`;

    return mapName;
  }

  getName(name: string) {
    if (Settings.getInstance().useActorNames)
      return name;
    return MsgMgr.getInstance().getName(name) || name;
  }

  getRankedUpActorNameForObj(obj: ObjectMinData) {
    if (!Settings.getInstance().hardMode || obj.disable_rankup_for_hard_mode)
      return obj.name;
    return rankUpEnemyForHardMode(obj.name);
  }

  getMapNameForObj(obj: ObjectMinData) {
    const resolvedMapName = this.getResolvedMapNameForObj(obj);

    if (obj.map_type == 'SmallDungeon') {
      const uiName = MsgMgr.getInstance().getMsg(`StaticMsg/Dungeon:${obj.map_name}`);
      return `${uiName} (${obj.map_name})`;
    }

    if (obj.map_type == 'MainFieldDungeon') {
      const uiName = MsgMgr.getInstance().getMsg(`StaticMsg/LocationMarker:${obj.map_name}`);
      return `${uiName} (${obj.map_name})`;
    }

    return resolvedMapName;
  }

  getMapStaticStringForObj(obj: ObjectMinData) {
    return obj.map_static ? 'Static' : 'Dynamic';
  }

  isActuallyRankedUp(obj: ObjectMinData) {
    return this.getRankedUpActorNameForObj(obj) != obj.name;
  }

  formatObjId(xid: string) {
    const id = BigInt(xid);
    if (!Settings.getInstance().useHexForHashIds)
      return id.toString(10);
    return '0x' + id.toString(16).padStart(16, '0');
  }
}
