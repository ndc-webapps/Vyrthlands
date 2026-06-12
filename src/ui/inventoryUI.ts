import { Inventory, EQUIP_KEYS, PACK_SIZE, HOTBAR_SIZE } from '../inventory';
import { itemIcon, itemName, ITEMS } from '../items';
import { Recipe, Station, recipesFor, canCraft, craft } from '../crafting';
import { RoleDef, PlayerStats } from '../roles';
import { ROLE_SKILLS, SKILLS } from '../skills';
import { Atlas } from '../textures';

export type InvTab = 'backpack' | 'crafting' | 'character';

const STATION_LABEL: Record<Station, string> = {
  none: 'Personal Crafting',
  workbench: 'Workbench',
  smelter: 'Smelter',
};

/** Tabbed overlay: Backpack / Crafting / Character.
 *  Items move by drag-and-drop (mouse or touch) or click-then-click. */
export class InventoryUI {
  private root = document.getElementById('inv-overlay')!;
  private inv: Inventory | null = null;
  private tab: InvTab = 'backpack';
  private station: Station = 'none';
  private pickedRef: string | null = null;
  private role: RoleDef | null = null;
  private stats: PlayerStats | null = null;
  private smeltJob: { recipe: Recipe; t: number } | null = null;
  private dragGhost: HTMLElement | null = null;
  private suppressClick = false;

  onClose: (() => void) | null = null;
  onCraft: ((recipe: Recipe) => void) | null = null;

  constructor(private atlas: Atlas) {}

  bind(inv: Inventory, role: RoleDef, stats: PlayerStats): void {
    this.inv = inv;
    this.role = role;
    this.stats = stats;
    this.smeltJob = null;
  }

  isOpen(): boolean { return !this.root.classList.contains('hidden'); }

  open(tab: InvTab, station: Station = 'none'): void {
    this.tab = tab;
    this.station = station;
    this.pickedRef = null;
    this.root.classList.remove('hidden');
    this.render();
  }

  close(): void {
    this.root.classList.add('hidden');
    this.pickedRef = null;
    this.onClose?.();
  }

  /** Tick timed smelter jobs. */
  update(dt: number): void {
    if (!this.smeltJob || !this.inv) return;
    this.smeltJob.t -= dt;
    const bar = this.root.querySelector('#smelt-fill') as HTMLElement | null;
    if (bar) bar.style.width = `${(1 - this.smeltJob.t / this.smeltJob.recipe.time) * 100}%`;
    if (this.smeltJob.t <= 0) {
      const r = this.smeltJob.recipe;
      this.smeltJob = null;
      craft(this.inv, r);
      this.onCraft?.(r);
      if (this.isOpen()) this.render();
    }
  }

  // ---------- rendering ----------
  private render(): void {
    if (!this.inv) return;
    this.root.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'inv-panel';

    const tabs = document.createElement('div');
    tabs.className = 'inv-tabs';
    for (const t of ['backpack', 'crafting', 'character'] as InvTab[]) {
      const b = document.createElement('button');
      b.textContent = t === 'backpack' ? 'Backpack' : t === 'crafting' ? STATION_LABEL[this.station] : 'Character';
      b.className = this.tab === t ? 'active' : '';
      b.addEventListener('click', () => { this.tab = t; this.render(); });
      tabs.appendChild(b);
    }
    const close = document.createElement('button');
    close.textContent = '✕';
    close.className = 'inv-close';
    close.addEventListener('click', () => this.close());
    tabs.appendChild(close);
    panel.appendChild(tabs);

    const body = document.createElement('div');
    body.className = 'inv-body';
    if (this.tab === 'backpack') this.renderBackpack(body);
    else if (this.tab === 'crafting') this.renderCrafting(body);
    else this.renderCharacter(body);
    panel.appendChild(body);

    this.root.appendChild(panel);
  }

  private slotEl(ref: string, label?: string): HTMLElement {
    const s = this.inv!.getAt(ref);
    const el = document.createElement('div');
    el.className = 'inv-slot' + (this.pickedRef === ref ? ' picked' : '');
    el.dataset.ref = ref;
    if (s) {
      el.appendChild(this.iconClone(s.item, 32));
      if (s.count > 1 && Number.isFinite(s.count)) {
        const c = document.createElement('span');
        c.className = 'count';
        c.textContent = String(s.count);
        el.appendChild(c);
      }
      const t = ITEMS[s.item]?.tool;
      if (t && s.durability != null && Number.isFinite(t.durability)) {
        const d = document.createElement('div');
        d.className = 'dura';
        d.innerHTML = `<div style="width:${(s.durability / t.durability) * 100}%"></div>`;
        el.appendChild(d);
      }
      el.title = itemName(s.item);
    } else if (label) {
      const l = document.createElement('span');
      l.className = 'slot-label';
      l.textContent = label;
      el.appendChild(l);
    }
    el.addEventListener('click', () => {
      if (this.suppressClick) return; // a drag just ended on this slot
      if (this.pickedRef === null) {
        if (this.inv!.getAt(ref)) this.pickedRef = ref;
      } else {
        this.inv!.moveOrSwap(this.pickedRef, ref);
        this.pickedRef = null;
      }
      this.render();
    });
    el.addEventListener('pointerdown', (e) => this.beginDrag(e, ref, el));
    return el;
  }

  /** Drag-and-drop between slots (mouse or touch). Short taps without
   *  movement fall through to the click-then-click flow above. */
  private beginDrag(e: PointerEvent, ref: string, el: HTMLElement): void {
    if (!this.inv?.getAt(ref)) return;
    const startX = e.clientX, startY = e.clientY;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 7) {
        started = true;
        const s = this.inv!.getAt(ref);
        if (!s) return;
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.appendChild(this.iconClone(s.item, 36));
        document.body.appendChild(ghost);
        this.dragGhost = ghost;
        el.classList.add('picked');
      }
      if (started && this.dragGhost) {
        this.dragGhost.style.left = `${ev.clientX - 18}px`;
        this.dragGhost.style.top = `${ev.clientY - 18}px`;
      }
      if (started) ev.preventDefault();
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!started) return; // plain click — handled by the click listener
      this.dragGhost?.remove();
      this.dragGhost = null;
      this.suppressClick = true;
      window.setTimeout(() => { this.suppressClick = false; }, 0);
      const target = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)
        ?.closest?.('.inv-slot') as HTMLElement | null;
      const toRef = target?.dataset.ref;
      if (toRef && toRef !== ref) this.inv!.moveOrSwap(ref, toRef);
      this.pickedRef = null;
      this.render();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  private iconClone(item: number, size: number): HTMLCanvasElement {
    const src = itemIcon(item, this.atlas, size);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    c.getContext('2d')!.drawImage(src, 0, 0);
    return c;
  }

  private renderBackpack(body: HTMLElement): void {
    const wrap = document.createElement('div');
    wrap.className = 'bp-wrap';

    // equipment column
    const eq = document.createElement('div');
    eq.className = 'equip-col';
    const eqTitle = document.createElement('h3');
    eqTitle.textContent = 'Equipment';
    eq.appendChild(eqTitle);
    for (const k of EQUIP_KEYS) {
      eq.appendChild(this.slotEl(`e:${k}`, k));
    }
    wrap.appendChild(eq);

    // pack grid + hotbar
    const right = document.createElement('div');
    right.className = 'pack-col';
    const packTitle = document.createElement('h3');
    packTitle.textContent = 'Backpack';
    right.appendChild(packTitle);
    const grid = document.createElement('div');
    grid.className = 'inv-grid';
    for (let i = 0; i < PACK_SIZE; i++) grid.appendChild(this.slotEl(`p${i}`));
    right.appendChild(grid);
    const hbTitle = document.createElement('h3');
    hbTitle.textContent = 'Hotbar';
    right.appendChild(hbTitle);
    const hb = document.createElement('div');
    hb.className = 'inv-grid';
    for (let i = 0; i < HOTBAR_SIZE; i++) hb.appendChild(this.slotEl(`h${i}`));
    right.appendChild(hb);
    wrap.appendChild(right);

    body.appendChild(wrap);
  }

  private renderCrafting(body: HTMLElement): void {
    const list = document.createElement('div');
    list.className = 'recipe-list';
    for (const recipe of recipesFor(this.station)) {
      const ok = canCraft(this.inv!, recipe);
      const row = document.createElement('div');
      row.className = 'recipe' + (ok ? '' : ' locked');

      row.appendChild(this.iconClone(recipe.output.item, 32));

      const info = document.createElement('div');
      info.className = 'recipe-info';
      const name = document.createElement('div');
      name.className = 'recipe-name';
      name.textContent = `${itemName(recipe.output.item)}${recipe.output.count > 1 ? ` ×${recipe.output.count}` : ''}`;
      const ing = document.createElement('div');
      ing.className = 'recipe-ing';
      ing.textContent = recipe.inputs.map((i) => `${i.count}× ${itemName(i.item)}`).join('  ·  ');
      info.appendChild(name);
      info.appendChild(ing);
      row.appendChild(info);

      const btn = document.createElement('button');
      const isSmelt = recipe.time > 0;
      const busy = this.smeltJob !== null;
      btn.textContent = isSmelt ? 'Smelt' : 'Craft';
      btn.disabled = !ok || (isSmelt && busy);
      btn.addEventListener('click', () => {
        if (isSmelt) {
          if (!canCraft(this.inv!, recipe)) return;
          this.smeltJob = { recipe, t: recipe.time };
          this.render();
        } else if (craft(this.inv!, recipe)) {
          this.onCraft?.(recipe);
          this.render();
        }
      });
      row.appendChild(btn);
      list.appendChild(row);
    }

    if (this.smeltJob) {
      const prog = document.createElement('div');
      prog.className = 'smelt-progress';
      prog.innerHTML = `<span>Smelting ${itemName(this.smeltJob.recipe.output.item)}…</span><div class="smelt-bar"><div id="smelt-fill"></div></div>`;
      body.appendChild(prog);
    }
    body.appendChild(list);
  }

  private renderCharacter(body: HTMLElement): void {
    if (!this.role || !this.stats) return;
    const wrap = document.createElement('div');
    wrap.className = 'char-wrap';
    const skills = ROLE_SKILLS[this.role.id].map((id) => SKILLS[id]);
    wrap.innerHTML = `
      <h3>${this.role.name}</h3>
      <p class="char-desc">${this.role.desc}</p>
      <div class="stat-list">
        <div><span>Max Health</span><b>${Math.round(this.stats.maxHealth * 100)}</b></div>
        <div><span>Move Speed</span><b>${Math.round(this.stats.speedMult * 100)}%</b></div>
        <div><span>Mining Speed</span><b>${Math.round(this.stats.miningMult * 100)}%</b></div>
        <div><span>Regeneration</span><b>${(this.stats.regenPerSec * 100).toFixed(1)}/s</b></div>
        <div><span>Mana</span><b>${this.stats.manaMax}</b></div>
        <div><span>Stamina</span><b>100 (soon)</b></div>
      </div>
      <h3>Active Skills</h3>
      <div class="char-skills">
        ${skills.map((s, i) => `<button class="skill-btn" disabled><span>${i === 0 ? 'Q' : 'E'}</span>${s.name}</button>`).join('')}
      </div>
      <p class="char-desc">Character skins equip in the Backpack tab — slots are ready, skins coming soon.</p>
    `;
    body.appendChild(wrap);
  }
}
