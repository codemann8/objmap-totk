import Component from 'vue-class-component';

import AppMapDetailsBase from '@/components/AppMapDetailsBase';
import ObjectInfo from '@/components/ObjectInfo';
import { MapMarkerGenericLocationMarker } from '@/MapMarker';
import { ObjectMinData } from '@/services/MapMgr';

@Component({
  components: {
    ObjectInfo,
  },
})
export default class AppMapDetailsLandmark extends AppMapDetailsBase<MapMarkerGenericLocationMarker> {
  private objs: ObjectMinData[] = [];
  private pos: number[] = [];
  private checked: { [key: string]: boolean } = {};

  protected init() {
    // The marker's obj is a fabricated ObjectMinData for itself.
    const obj = (this.marker.data as any).obj as ObjectMinData;
    this.objs = [obj];
    this.updateChecked(this.objs);
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
