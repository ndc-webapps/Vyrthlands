import { itemIcon, itemName, ITEMS } from '../items';
import { Inventory, HOTBAR_SIZE } from '../inventory';
import { Atlas } from '../textures';
import { SkillDef } from '../skills';
import { GameMode } from '../types';

// 7x6 pixel heart, drawn once per state (original pixel art)
const HEART_GRID = [
  '.XX.XX.',
  'XXXXXXX',
  'XXXXXXX',
  '.XXXXX.',
  '..XXX..',
  '...X...',
];

function heartDataUrl(state: 'full' | 'half' | 'empty'): string {
  const s = 3;
  const c = document.createElement('canvas');
  c.width = 7 * s; c.height = 6 * s;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) {
    if (HEART_GRID[y][x] !== 'X') continue;
    let color = '#3a1216'; // empty: dark socket
    if (state === 'full' || (state === 'half' && x < 4)) color = y < 2 && x < 3 ? '#ff6a7a' : '#e0254a';
    ctx.fillStyle = color;
    ctx.fillRect(x * s, y * s, s, s);
  }
  return c.toDataURL();
}

// 7x6 pixel meat shank for the vitality (hunger) row
const SHANK_GRID = [
  '..XXXX.',
  '.XXXXXX',
  '.XXXXX.',
  'BXXXX..',
  'BB.....',
  'B......',
];

function shankDataUrl(state: 'full' | 'half' | 'empty'): string {
  const s = 3;
  const c = document.createElement('canvas');
  c.width = 7 * s; c.height = 6 * s;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) {
    const cell = SHANK_GRID[y][x];
    if (cell === '.') continue;
    let color = '#2c2018'; // empty socket
    if (state === 'full' || (state === 'half' && x < 4)) {
      color = cell === 'B' ? '#d8d0c0' : y < 2 ? '#c87840' : '#a85a28'; // bone + roast
    }
    ctx.fillStyle = color;
    ctx.fillRect(x * s, y * s, s, s);
  }
  return c.toDataURL();
}

export class HUD {
  private hudEl = document.getElementById('hud')!;
  private hotbarEl = document.getElementById('hotbar')!;
  private nameEl = document.getElementById('selected-block-name')!;
  private modeEl = document.getElementById('mode-badge')!;
  private healthBarEl = document.getElementById('health-bar')!;
  private healthFillEl = document.getElementById('health-fill')!;
  private heartsEl = document.getElementById('hearts-row')!;
  private dayEl = document.getElementById('day-indicator')!;
  private manaBarEl = document.getElementById('mana-bar')!;
  private manaFillEl = document.getElementById('mana-fill')!;
  private toastEl = document.getElementById('toast')!;
  private slots: HTMLElement[] = [];
  private toastTimer = 0;
  private heartImgs: HTMLImageElement[] = [];
  private heartUrls = { full: heartDataUrl('full'), half: heartDataUrl('half'), empty: heartDataUrl('empty') };
  private vitalityEl = document.getElementById('vitality-row')!;
  private shankImgs: HTMLImageElement[] = [];
  private shankUrls = { full: shankDataUrl('full'), half: shankDataUrl('half'), empty: shankDataUrl('empty') };

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
  /** Touch/click on a skill slot (mobile casting). */
  onSkillTap: ((index: number) => void) | null = null;

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
      el.addEventListener('click', () => this.onSkillTap?.(i));
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
    this.healthBarEl.classList.add('hidden'); // legacy bar replaced by hearts
    this.heartsEl.classList.toggle('hidden', mode !== 'survival');
    this.vitalityEl.classList.toggle('hidden', mode !== 'survival');
    this.manaBarEl.classList.toggle('hidden', mode !== 'survival');
    this.dayEl.classList.remove('hidden');
    if (this.heartImgs.length === 0) {
      for (let i = 0; i < 10; i++) {
        const img = document.createElement('img');
        img.className = 'heart';
        this.heartsEl.appendChild(img);
        this.heartImgs.push(img);
        const sh = document.createElement('img');
        sh.className = 'heart';
        this.vitalityEl.appendChild(sh);
        this.shankImgs.push(sh);
      }
    }
  }

  /** Hunger/vitality row: 10 meat shanks, half granularity. */
  setVitality(fraction: number): void {
    const halves = Math.round(Math.max(0, Math.min(1, fraction)) * 20);
    for (let i = 0; i < 10; i++) {
      const img = this.shankImgs[i];
      if (!img) continue;
      img.src = halves >= i * 2 + 2 ? this.shankUrls.full : halves === i * 2 + 1 ? this.shankUrls.half : this.shankUrls.empty;
    }
  }

  /** Classic hearts: 10 hearts = full health, half-heart granularity. */
  setHealth(fraction: number): void {
    this.healthFillEl.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    const halves = Math.round(Math.max(0, Math.min(1, fraction)) * 20);
    for (let i = 0; i < 10; i++) {
      const img = this.heartImgs[i];
      if (!img) continue;
      img.src = halves >= i * 2 + 2 ? this.heartUrls.full : halves === i * 2 + 1 ? this.heartUrls.half : this.heartUrls.empty;
    }
  }

  /** Sun/moon clock in the corner. t in [0,1), one full day. */
  setTimeOfDay(t: number, night: boolean, day = 0): void {
    const mins = Math.floor(t * 24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    this.dayEl.textContent = `${day > 0 ? `Day ${day} · ` : ''}${night ? '☾' : '☀'} ${hh}:${mm}`;
    this.dayEl.dataset.night = night ? '1' : '0';
  }

  private coordsEl = document.getElementById('coords')!;
  /** Position readout under the clock. */
  setCoords(x: number, y: number, z: number): void {
    this.coordsEl.textContent = `${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)}`;
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
