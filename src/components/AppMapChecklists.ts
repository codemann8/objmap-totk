import Vue from 'vue';
import { Prop, Watch } from 'vue-property-decorator';
import Component from 'vue-class-component';
import { Settings } from '@/util/settings';
import { MapMgr, ObjectMinData } from '@/services/MapMgr';
import { MsgMgr } from '@/services/MsgMgr';
import * as ui from '@/util/ui';
import AppMapChecklistItem from '@/components/AppMapChecklistItem';
import draggable from 'vuedraggable';

// @ts-ignore
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';


@Component({
  components: {
    AppMapChecklistItem,
    DynamicScroller,
    DynamicScrollerItem,
    draggable
  },
})
export default class AppMapChecklists extends Vue {
  @Prop()
  private lists!: any[];

  private activeList: number = -1;
  private xlist: any = {};
  private bus!: any;
  private localLists: any[] = [];

  created() {
    // EventBus used here as there is an intermediate component
    //   that does not forward events from the child to the parent
    this.bus = new Vue();
    this.bus.$on('AppMap:search-on-hash', (value: string) => {
      this.$parent.$emit('AppMap:search-on-hash', value);
    });
    this.bus.$on('AppMap:search-on-value', (value: string) => {
      this.$parent.$emit('AppMap:search-on-value', value);
    });
    this.bus.$on('AppMap:update-search-markers', (value: any) => {
      this.$parent.$emit('AppMap:update-search-markers', value);
    });
    this.activeList = -1;
    this.xlist = {};
    this.localLists = this.lists ? [...this.lists] : [];
  }

  @Watch('lists', { deep: true })
  onListsChange() {
    this.localLists = this.lists ? [...this.lists] : [];
  }

  back() {
    this.activeList = -1;
    this.xlist = {};
  }
  checkopen(list: any) {
    this.activeList = list.id;
    this.xlist = list;
    this.$nextTick();
  }
  markedLength(list: any) {
    return Object.values(list.items).filter((item: any) => item.marked).length
  }

  length(list: any) {
    return Object.keys(list.items).length;
  }

  meta(list: any) {
    const total = this.length(list);
    if (total == 0) {
      return `0 / 0`;
    }
    const marked = this.markedLength(list);
    const percent = (100 * marked / total).toFixed(2);
    return `${marked} / ${total} (${percent}%)`
  }

  percent(list: any) {
    const n = this.markedLength(list)
    return (100 * n / this.length(list)).toFixed(2);
  }

  show(list: any) {
    this.$parent.$emit('AppMap:search-add-group', { name: list.name, query: list.query });
  }

  remove(list: any) {
    this.$parent.$emit('AppMap:checklist-remove', list)
    this.back();
  }
  reset() {
    this.$parent.$emit('AppMap:checklist-reset')
  }
  create() {
    this.$parent.$emit('AppMap:checklist-create')
  }

  reorder() {
    const ids = this.localLists.map((list: any) => list.id).filter((id: any) => id !== undefined);
    this.$parent.$emit('AppMap:checklist-reorder', { ids });
  }

  changeName(list: any) {
    this.$parent.$emit('AppMap:update-checklist-name', { id: list.id, name: list.name, });
  }

  changeQuery(list: any) {
    this.$parent.$emit('AppMap:update-checklist-query', { id: list.id, query: list.query });
  }

}

