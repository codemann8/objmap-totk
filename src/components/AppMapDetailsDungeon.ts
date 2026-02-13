import Component from 'vue-class-component';

import AppMapDetailsBase from '@/components/AppMapDetailsBase';
import ObjectInfo from '@/components/ObjectInfo';
import { MapMarkerDungeon } from '@/MapMarker';
import {
  MapMgr,
  ObjectMinData,
} from '@/services/MapMgr';
import { MsgMgr } from '@/services/MsgMgr';

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
  private iceChunks: ObjectMinData[] = [];
  private thinIce: ObjectMinData[] = [];
  private pos: number[] = [];
  private checked: { [key: string]: boolean } = {};

  protected init() {
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
    MapMgr.getInstance().getObjs('SmallDungeon', this.id, 'actor:IceWall*').then(d => {
      this.iceChunks = d;
      this.updateChecked(d);
    });
    MapMgr.getInstance().getObjs('SmallDungeon', this.id, 'actor:ThinFilmBoard').then(d => {
      this.thinIce = d;
      this.updateChecked(d);
    });
    this.pos = this.marker.data.lm.getXYZ();
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
}
