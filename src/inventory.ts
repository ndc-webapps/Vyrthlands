import { itemStack, ITEMS } from './items';
import { HOTBAR_BLOCKS } from './blocks';

export interface Slot {
  item: number;
  count: number;
  durability?: number; // remaining uses for tools
}

export const HOTBAR_SIZE = 10;
export const PACK_SIZE = 30;
export const EQUIP_KEYS = ['head', 'body', 'legs', 'boots', 'weapon', 'offhand', 'accessory'] as const;
export type EquipKey = typeof EQUIP_KEYS[number];

/** Backpack + hotbar + equipment. Creative mode = infinite palette, nothing consumed. */
export class Inventory {
  hotbar: (Slot | null)[] = new Array(HOTBAR_SIZE).fill(null);
  pack: (Slot | null)[] = new Array(PACK_SIZE).fill(null);
  equip: Record<EquipKey, Slot | null> = {
    head: null, body: null, legs: null, boots: null, weapon: null, offhand: null, accessory: null,
  };
  selected = 0;
  onChange: (() => void) | null = null;

  constructor(public creative: boolean) {
    if (creative) {
      HOTBAR_BLOCKS.forEach((b, i) => { this.hotbar[i] = { item: b, count: Infinity }; });
    }
  }

  private notify(): void { this.onChange?.(); }

  selectedSlot(): Slot | null {
    return this.hotbar[this.selected];
  }

  /** Add items; returns count that did NOT fit. */
  add(item: number, count: number, durability?: number): number {
    if (this.creative) return 0;
    const max = itemStack(item);
    const lists = [this.hotbar, this.pack];
    // stack onto existing
    if (max > 1) {
      for (const list of lists) {
        for (const slot of list) {
          if (slot && slot.item === item && slot.count < max && count > 0) {
            const take = Math.min(max - slot.count, count);
            slot.count += take;
            count -= take;
          }
        }
      }
    }
    // fill empty slots
    for (const list of lists) {
      for (let i = 0; i < list.length && count > 0; i++) {
        if (!list[i]) {
          const take = Math.min(max, count);
          list[i] = { item, count: take, durability };
          count -= take;
        }
      }
    }
    this.notify();
    return count;
  }

  countOf(item: number): number {
    let n = 0;
    for (const slot of [...this.hotbar, ...this.pack]) {
      if (slot && slot.item === item) n += slot.count;
    }
    return n;
  }

  /** Remove n of item across slots. Returns true if fully removed. */
  remove(item: number, n: number): boolean {
    if (this.countOf(item) < n) return false;
    for (const list of [this.hotbar, this.pack]) {
      for (let i = 0; i < list.length && n > 0; i++) {
        const slot = list[i];
        if (slot && slot.item === item) {
          const take = Math.min(slot.count, n);
          slot.count -= take;
          n -= take;
          if (slot.count <= 0) list[i] = null;
        }
      }
    }
    this.notify();
    return true;
  }

  /** Consume 1 from the selected hotbar slot (placing a block). */
  consumeSelected(): void {
    if (this.creative) return;
    const slot = this.hotbar[this.selected];
    if (!slot) return;
    slot.count--;
    if (slot.count <= 0) this.hotbar[this.selected] = null;
    this.notify();
  }

  /** Wear the selected tool by 1. Returns true if the tool just broke. */
  damageSelectedTool(): boolean {
    if (this.creative) return false;
    const slot = this.hotbar[this.selected];
    if (!slot || !ITEMS[slot.item]?.tool || slot.durability == null) return false;
    slot.durability--;
    if (slot.durability <= 0) {
      this.hotbar[this.selected] = null;
      this.notify();
      return true;
    }
    this.notify();
    return false;
  }

  // ---------- slot addressing for UI ("h0".."h9", "p0".."p29", "e:head"...) ----------
  getAt(ref: string): Slot | null {
    if (ref.startsWith('h')) return this.hotbar[Number(ref.slice(1))];
    if (ref.startsWith('p')) return this.pack[Number(ref.slice(1))];
    return this.equip[ref.slice(2) as EquipKey];
  }

  setAt(ref: string, slot: Slot | null): void {
    if (ref.startsWith('h')) this.hotbar[Number(ref.slice(1))] = slot;
    else if (ref.startsWith('p')) this.pack[Number(ref.slice(1))] = slot;
    else this.equip[ref.slice(2) as EquipKey] = slot;
    this.notify();
  }

  /** Whether an item may sit in a slot ref (armor gates equip slots). */
  private allowedAt(ref: string, slot: Slot | null): boolean {
    if (slot === null || !ref.startsWith('e:')) return true;
    const key = ref.slice(2) as EquipKey;
    const def = ITEMS[slot.item];
    if (key === 'head' || key === 'body' || key === 'legs' || key === 'boots') return def?.slot === key;
    if (key === 'weapon') return !!def?.tool;
    return true; // offhand / accessory take anything
  }

  /** Total damage reduction from equipped armor (capped). */
  totalArmor(): number {
    let a = 0;
    for (const k of EQUIP_KEYS) {
      const s = this.equip[k];
      if (s) a += ITEMS[s.item]?.armor ?? 0;
    }
    return Math.min(0.6, a);
  }

  /** Click-move: swap or merge between two slot refs. */
  moveOrSwap(from: string, to: string): void {
    if (from === to) return;
    const a = this.getAt(from);
    const b = this.getAt(to);
    if (!this.allowedAt(to, a) || !this.allowedAt(from, b)) return;
    if (a && b && a.item === b.item && itemStack(a.item) > 1) {
      const max = itemStack(a.item);
      const take = Math.min(max - b.count, a.count);
      b.count += take;
      a.count -= take;
      this.setAt(from, a.count > 0 ? a : null);
      this.setAt(to, b);
    } else {
      this.setAt(from, b);
      this.setAt(to, a);
    }
  }

  // ---------- persistence ----------
  serialize(): unknown {
    if (this.creative) return null;
    const enc = (s: Slot | null) => (s ? [s.item, s.count, s.durability ?? -1] : null);
    return {
      hotbar: this.hotbar.map(enc),
      pack: this.pack.map(enc),
      equip: Object.fromEntries(EQUIP_KEYS.map((k) => [k, enc(this.equip[k])])),
      selected: this.selected,
    };
  }

  load(data: any): void {
    if (!data || this.creative) return;
    const dec = (v: any): Slot | null =>
      Array.isArray(v) ? { item: v[0], count: v[1], durability: v[2] >= 0 ? v[2] : undefined } : null;
    if (Array.isArray(data.hotbar)) this.hotbar = data.hotbar.slice(0, HOTBAR_SIZE).map(dec);
    while (this.hotbar.length < HOTBAR_SIZE) this.hotbar.push(null);
    if (Array.isArray(data.pack)) this.pack = data.pack.slice(0, PACK_SIZE).map(dec);
    while (this.pack.length < PACK_SIZE) this.pack.push(null);
    for (const k of EQUIP_KEYS) this.equip[k] = dec(data.equip?.[k]);
    this.selected = data.selected ?? 0;
    this.notify();
  }
}
