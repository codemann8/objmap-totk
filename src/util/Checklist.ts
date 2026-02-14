import { openDB } from 'idb';

export interface ListItem {
  hash_id: string;
  name: string;
  map_name: string;
  map_type: string;
  pos: number[];
  marked: boolean;
}

interface List {
  id: number | undefined;
  name: string;
  query: string;
  items: { [key: string]: ListItem };
  order?: number;
}

interface ChecklistStore {
  values: { [key: string]: boolean };
  lists: List[];
  version: number;
  name: string;
}

export class Checklists {
  db: ChecklistDB;
  marked: { [key: string]: boolean };
  lists: List[];

  constructor() {
    this.db = new ChecklistDB();
    this.marked = {};
    this.lists = [];
  }

  async init() {
    await this.db.init();
    this.marked = await this.db.all();
    this.lists = await this.db.listGetAll();
    this.normalizeOrder();
  }

  async clear() {
    this.marked = {};
    this.lists = [];
    this.db.clear();
  }

  async create() {
    const newList = { name: 'New List', query: '', items: {}, order: this.nextOrder() } as List;
    const id = await this.db.listAdd(newList);
    const list = await this.db.listGet(id);
    this.lists.push(list);
  }

  async createFromSearch(label: string, query: string) {
    const newList = { name: label || 'New List', query: query || '', items: {}, order: this.nextOrder() } as List;
    const id = await this.db.listAdd(newList);
    const list = await this.db.listGet(id);
    this.lists.push(list);
    return list;
  }

  async reorder(ids: number[]) {
    const byId = new Map<number, List>();
    for (const list of this.lists) {
      if (list.id !== undefined)
        byId.set(list.id, list);
    }
    const ordered: List[] = [];
    ids.forEach((id, idx) => {
      const list = byId.get(id);
      if (list) {
        list.order = idx;
        ordered.push(list);
      }
    });
    // Append any lists not included in ids (safety)
    for (const list of this.lists) {
      if (list.id === undefined)
        continue;
      if (!ids.includes(list.id)) {
        list.order = ordered.length;
        ordered.push(list);
      }
    }
    this.lists = ordered;
    for (const list of this.lists) {
      await this.update(list);
    }
  }

  private normalizeOrder() {
    if (!this.lists || this.lists.length === 0)
      return;
    let needsUpdate = false;
    this.lists.forEach((list, idx) => {
      if (list.order === undefined) {
        list.order = idx;
        needsUpdate = true;
      }
    });
    this.lists.sort((a, b) => {
      const ao = (a.order === undefined) ? 0 : a.order;
      const bo = (b.order === undefined) ? 0 : b.order;
      if (ao !== bo)
        return ao - bo;
      const aid = (a.id === undefined || a.id === null) ? 0 : a.id;
      const bid = (b.id === undefined || b.id === null) ? 0 : b.id;
      return aid - bid;
    });
    if (needsUpdate) {
      for (const list of this.lists) {
        this.update(list);
      }
    }
  }

  private nextOrder(): number {
    if (!this.lists || this.lists.length === 0)
      return 0;
    return this.lists.reduce((max, list) => {
      const order = list.order === undefined ? 0 : list.order;
      return Math.max(max, order);
    }, 0) + 1;
  }

  async delete(id: number) {
    this.lists = this.lists.filter((list: any) => list.id != id);
    await this.db.listRemove(id);
  }

  read(id: number) {
    return this.lists.find((list: any) => list.id == id);
  }

  async update(list: List) {
    await this.db.listUpdate(list);
  }

  isMarked(hash_id: string) {
    let value = this.marked[hash_id];
    if (value === undefined) {
      value = false;
    }
    return value;
  }

  async setMarked(hash_id: string, value: boolean) {
    this.marked[hash_id] = value;
    this.db.setMarked(hash_id, value);
    for (const list of this.lists) {
      if (hash_id in list.items) {
        list.items[hash_id].marked = value;
        this.update(list);
      }
    }
    return value;
  }
}

export class ChecklistDB {
  name: string;
  version: number;
  hash: string;
  lists: string;
  listsIndex: string;
  db: any;

  constructor() {
    this.name = 'Checklist';
    this.version = 1;
    this.hash = 'hash';
    this.lists = 'lists';
    this.listsIndex = "listName";
    this.db = undefined;
  }

  async init() {
    const self = this;
    this.db = await openDB(this.name, this.version, {
      upgrade(db, oldVersion, newVersion, transaction, event) {
        db.createObjectStore(self.hash, {})
        const store = db.createObjectStore(self.lists, {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex(self.listsIndex, "name", { unique: false });
        console.log("checklist ready");
      },
      terminated() {
        console.log("terminated");
      },
    });
  }

  async import(data: ChecklistStore, replace: boolean = false) {
    if (replace) {
      await this.listRemoveAll();
      await this.hashClear();
    }
    for (const hash of Object.keys(data.values)) {
      this.db.put(this.hash, data.values[hash], hash);
    }
    for (const list of data.lists) {
      this.listAdd(list);
    }
  }

  async export(): Promise<ChecklistStore> {
    return {
      values: await this.all(),
      lists: await this.listGetAll(),
      version: this.version,
      name: this.name,
    }
  }

  async listAdd(list: any) {
    return this.db.put(this.lists, list);
  }

  async listGet(id: number) {
    return this.db.get(this.lists, id);
  }

  async listGetByName(name: string) {
    return this.db.getFromIndex(this.lists, this.listsIndex, name);
  }

  async listRemove(id: number) {
    return this.db.delete(this.lists, id);
  }

  async listUpdate(list: List) {
    return this.db.put(this.lists, list)
  }

  async listGetAll() {
    return this.db.getAll(this.lists);
  }

  async listRemoveAll() {
    this.db.clear(this.lists);
    return true;
  }

  // Plain Hashes
  async setMarked(hash_id: string, value: boolean) {
    return this.db.put(this.hash, value, hash_id);
  }

  async marked(hash_id: string) {
    return this.db.get(this.hash, hash_id);
  }

  async all() {
    return this.all_internal(this.hash);
  }

  async all_internal(storeName: string) {
    let cursor = await this.db.transaction(storeName).store.openCursor()
    let data: any = {};
    while (cursor) {
      data[cursor.key] = cursor.value;
      cursor = await cursor.continue();
    }
    return data;
  }

  async hashClear() {
    this.db.clear(this.hash)
    return true;
  }

  async clear() {
    await this.hashClear();
    await this.listRemoveAll();
  }
}
