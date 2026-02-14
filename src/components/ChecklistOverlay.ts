import Vue from 'vue';
import Component from 'vue-class-component';
import { Checklists } from '@/util/Checklist';

interface Totals {
  marked: number;
  total: number;
}

@Component
export default class ChecklistOverlay extends Vue {
  private checklists: Checklists = new Checklists();
  private lists: any[] = [];

  private pollTimer: number | undefined = undefined;
  private pollIndex: number = 0;
  private noChangeStreak: number = 0;
  private lastTotals: Totals = { marked: -1, total: -1 };
  private destroyed: boolean = false;

  private readonly pollBackoffMs: number[] = [
    5000,
    10000,
    20000,
    40000,
    80000,
    160000,
    320000,
    640000,
    900000,
  ];
  private readonly maxPollMs: number = 900000;

  async mounted() {
    document.body.classList.add('tracker-page');
    document.title = 'TotK Object Tracker';
    await this.refreshOnce(true);
  }

  beforeDestroy() {
    this.destroyed = true;
    this.stopPolling();
    document.body.classList.remove('tracker-page');
  }

  private stopPolling() {
    if (this.pollTimer !== undefined) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private scheduleNext() {
    if (this.destroyed) {
      return;
    }
    const base = this.pollBackoffMs[this.pollIndex] || this.pollBackoffMs[0];
    const jitter = 0.9 + Math.random() * 0.2;
    const delay = Math.min(Math.round(base * jitter), this.maxPollMs);
    this.pollTimer = window.setTimeout(() => this.refreshOnce(false), delay);
  }

  private async refreshOnce(initial: boolean) {
    if (this.destroyed) {
      return;
    }
    try {
      if (initial) {
        await this.initFromDb();
      } else {
        await this.refreshFromDb();
      }

      this.lists = this.getSortedLists();

      const totals = this.calculateTotals();
      const changed = totals.marked !== this.lastTotals.marked || totals.total !== this.lastTotals.total;

      if (changed) {
        this.pollIndex = 0;
        this.noChangeStreak = 0;
        this.lastTotals = totals;
      } else {
        this.noChangeStreak += 1;
        if (this.noChangeStreak >= 2) {
          this.noChangeStreak = 0;
          this.pollIndex = Math.min(this.pollIndex + 1, this.pollBackoffMs.length - 1);
        }
      }
    } catch (e) {
      this.noChangeStreak += 1;
      if (this.noChangeStreak >= 2) {
        this.noChangeStreak = 0;
        this.pollIndex = Math.min(this.pollIndex + 1, this.pollBackoffMs.length - 1);
      }
    } finally {
      this.scheduleNext();
    }
  }

  private async initFromDb() {
    await this.checklists.db.init();
    this.checklists.marked = await this.checklists.db.all();
    this.checklists.lists = await this.checklists.db.listGetAll();
    this.normalizeOrder();
  }

  private async refreshFromDb() {
    if (!this.checklists.db.db) {
      await this.checklists.db.init();
    }
    this.checklists.marked = await this.checklists.db.all();
    this.checklists.lists = await this.checklists.db.listGetAll();
    this.normalizeOrder();
  }

  private normalizeOrder() {
    if (!this.checklists.lists || this.checklists.lists.length === 0) {
      return;
    }

    this.checklists.lists.forEach((list: any, idx: number) => {
      if (list.order === undefined) {
        list.order = idx;
      }
    });

    this.checklists.lists.sort((a: any, b: any) => {
      const ao = (a.order === undefined) ? 0 : a.order;
      const bo = (b.order === undefined) ? 0 : b.order;
      if (ao !== bo) {
        return ao - bo;
      }
      const aid = (a.id === undefined || a.id === null) ? 0 : a.id;
      const bid = (b.id === undefined || b.id === null) ? 0 : b.id;
      return aid - bid;
    });
  }

  private getSortedLists() {
    if (!this.checklists.lists) {
      return [];
    }
    return [...this.checklists.lists];
  }

  private calculateTotals(): Totals {
    let marked = 0;
    let total = 0;

    if (!this.checklists.lists) {
      return { marked, total };
    }

    for (const list of this.checklists.lists) {
      const items = list.items ? Object.values(list.items) : [];
      total += items.length;
      for (const item of items) {
        if (this.checklists.isMarked(item.hash_id)) {
          marked += 1;
        }
      }
    }

    return { marked, total };
  }

  private listTotals(list: any): Totals {
    const items: any[] = list && list.items ? Object.values(list.items) : [];
    const total = items.length;
    let marked = 0;
    for (const item of items) {
      if (this.checklists.isMarked(item.hash_id)) {
        marked += 1;
      }
    }
    return { marked, total };
  }

  private formatMeta(marked: number, total: number) {
    if (total === 0) {
      return '(0 / 0) 0%';
    }
    const percent = (100 * marked / total).toFixed(2);
    return `${marked} / ${total} (${percent}%)`;
  }

  private formatCounts(marked: number, total: number) {
    return `(${marked} / ${total})`;
  }

  private formatPercent(marked: number, total: number) {
    if (total === 0) {
      return '0%';
    }
    const percent = (100 * marked / total).toFixed(2);
    return `${percent}%`;
  }

  get overallMeta() {
    const totals = this.calculateTotals();
    return this.formatMeta(totals.marked, totals.total);
  }

  get overallCounts() {
    const totals = this.calculateTotals();
    return this.formatCounts(totals.marked, totals.total);
  }

  get overallPercent() {
    const totals = this.calculateTotals();
    return this.formatPercent(totals.marked, totals.total);
  }

  meta(list: any) {
    const totals = this.listTotals(list);
    return this.formatMeta(totals.marked, totals.total);
  }

  listCounts(list: any) {
    const totals = this.listTotals(list);
    return this.formatCounts(totals.marked, totals.total);
  }

  listPercent(list: any) {
    const totals = this.listTotals(list);
    return this.formatPercent(totals.marked, totals.total);
  }
}
