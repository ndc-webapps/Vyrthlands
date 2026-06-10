import { itemIcon, itemName, ITEMS } from '../items';
import { Inventory, HOTBAR_SIZE } from '../inventory';
import { Atlas } from '../textures';
import { SkillDef } from '../skills';
import { GameMode } from '../types';

export class HUD {
  private hudEl = document.getElementById('hud')!;
  private hotbarEl = document.getElementById('hotbar')!;
  private nameEl = document.getElementById('selected-block-name')!;
  private modeEl = document.getElementById('mode-badge')!;
  private healthBarEl = document.getElementById('health-bar')!;
  private healthFillEl = document.getElementById('health-fill')!;
  private manaBarEl = document.getElementById('mana-bar')!;
  private manaFillEl = document.getElementById('mana-fill')!;
  private toastEl = document.getElementById('toast')!;
  private slots: HTMLElement[] = [];
  private toastTimer = 0;

  private inv: Inventory | null = null;
  onSelect: ((itemId: number | null) => void) | null = null;

  constructor(private atlas: Atlas) {}

  /** Attach an inventory; HUD re-renders on every inventory change. */
  bind(inv: Inventory): void {
    this.inv = inv;
    inv.onChange = () => this.refresh();
    this.buildSlots();
    this.refresh();
  }

  private buildSlots(): void {
    this.hotbarEl.innerHTML = '';
    this.slots = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.innerHTML = `<span class="key">${(i + 1) % 10}</span><span class="count"></span><div class="dura hidden"><div></div></div>`;
      slot.addEventListener('click', () => this.select(i));
      this.hotbarEl.appendChild(slot);
      this.slots.push(slot);
    }
  }

  refresh(): void {
    if (!this.inv) return;
    this.slots.forEach((el, i) => {
      const s = this.inv!.hotbar[i];
      el.querySelector('canvas')?.remove();
      const countEl = el.querySelector('.count') as HTMLElement;
      const duraEl = el.querySelector('.dura') as HTMLElement;
      duraEl.classList.add('hidden');
      if (s) {
        const icon = itemIcon(s.item, this.atlas, 36);
        const clone = icon.cloneNode(true) as HTMLCanvasElement;
        clone.getContext('2d')!.drawImage(icon, 0, 0);
        clone.className = 'swatch';
        el.insertBefore(clone, el.firstChild);
        countEl.textContent = s.count > 1 && Number.isFinite(s.count) ? String(s.count) : '';
        const t = ITEMS[s.item]?.tool;
        if (t && s.durability != null && Number.isFinite(t.durability)) {
          duraEl.classList.remove('hidden');
          (duraEl.firstElementChild as HTMLElement).style.width = `${(s.durability / t.durability) * 100}%`;
        }
      } else {
        countEl.textContent = '';
      }
      el.classList.toggle('active', i === this.inv!.selected);
    });
  }

  show(): void { this.hudEl.classList.remove('hidden'); }
  hide(): void { this.hudEl.classList.add('hidden'); }

  select(i: number): void {
    if (!this.inv || i < 0 || i >= HOTBAR_SIZE) return;
    this.inv.selected = i;
    this.refresh();
    const s = this.inv.hotbar[i];
    this.nameEl.textContent = s ? itemName(s.item) : '';
    this.nameEl.classList.remove('pop');
    void this.nameEl.offsetWidth;
    this.nameEl.classList.add('pop');
    this.onSelect?.(s ? s.item : null);
  }

  selectDigit(digit: number): void {
    this.select(digit === 0 ? 9 : digit - 1);
  }

  scroll(delta: number): void {
    if (!this.inv) return;
    this.select(((this.inv.selected + delta) % HOTBAR_SIZE + HOTBAR_SIZE) % HOTBAR_SIZE);
  }

  setBreakProgress(fraction: number): void {
    const bar = document.getElementById('break-progress')!;
    if (fraction <= 0) {
      bar.classList.add('hidden');
    } else {
      bar.classList.remove('hidden');
      (bar.firstElementChild as HTMLElement).style.width = `${Math.min(1, fraction) * 100}%`;
    }
  }

  private skillEls: HTMLElement[] = [];

  /** Render the two role skills with Q / R key labels. */
  setSkills(skills: SkillDef[], visible: boolean): void {
    const bar = document.getElementById('skill-bar')!;
    bar.classList.toggle('hidden', !visible);
    bar.innerHTML = '';
    this.skillEls = [];
    const keys = ['Q', 'E'];  // R also triggers slot 2 (see main.ts)
    skills.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'skill-slot';
      el.title = `${s.name} — ${s.desc} (${s.manaCost} mana)`;
      el.innerHTML = `
        <span class="rune" style="color:${s.color}">${s.rune}</span>
        <span class="key">${keys[i]}</span>
        <span class="cost">${s.manaCost}</span>
        <div class="cd"></div>`;
      bar.appendChild(el);
      this.skillEls.push(el);
    });
  }

  /** fraction 0 = ready, 1 = full cooldown remaining. */
  setSkillCooldown(i: number, fraction: number): void {
    const el = this.skillEls[i];
    if (!el) return;
    (el.querySelector('.cd') as HTMLElement).style.height = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    el.classList.toggle('ready', fraction <= 0);
  }

  setMode(mode: GameMode, roleName?: string): void {
    this.modeEl.textContent = (mode === 'creative' ? 'Creative' : 'Survival') + (roleName ? ` · ${roleName}` : '');
    this.modeEl.dataset.mode = mode;
    this.healthBarEl.classList.toggle('hidden', mode !== 'survival');
    this.manaBarEl.classList.toggle('hidden', mode !== 'survival');
  }

  setHealth(fraction: number): void {
    this.healthFillEl.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  }

  setMana(fraction: number): void {
    this.manaFillEl.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('hidden');
    this.toastEl.classList.remove('pop');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('pop');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), 2200);
  }
}
