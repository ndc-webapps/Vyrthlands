import { BLOCKS, BLOCK_SWATCH, HOTBAR_BLOCKS } from '../blocks';
import { GameMode } from '../types';

export class HUD {
  private hudEl = document.getElementById('hud')!;
  private hotbarEl = document.getElementById('hotbar')!;
  private nameEl = document.getElementById('selected-block-name')!;
  private modeEl = document.getElementById('mode-badge')!;
  private healthBarEl = document.getElementById('health-bar')!;
  private healthFillEl = document.getElementById('health-fill')!;
  private toastEl = document.getElementById('toast')!;
  private slots: HTMLElement[] = [];
  private toastTimer = 0;

  selectedIndex = 0;

  constructor() {
    this.hotbarEl.innerHTML = '';
    HOTBAR_BLOCKS.forEach((blockId, i) => {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.innerHTML = `<div class="swatch" style="background:${BLOCK_SWATCH[blockId]}"></div><span class="key">${i + 1}</span>`;
      slot.addEventListener('click', () => this.select(i));
      this.hotbarEl.appendChild(slot);
      this.slots.push(slot);
    });
    this.select(0);
  }

  show(): void { this.hudEl.classList.remove('hidden'); }
  hide(): void { this.hudEl.classList.add('hidden'); }

  select(i: number): void {
    if (i < 0 || i >= HOTBAR_BLOCKS.length) return;
    this.selectedIndex = i;
    this.slots.forEach((s, j) => s.classList.toggle('active', j === i));
    this.nameEl.textContent = BLOCKS[HOTBAR_BLOCKS[i]].name;
    this.nameEl.classList.remove('pop');
    void this.nameEl.offsetWidth; // restart animation
    this.nameEl.classList.add('pop');
  }

  scroll(delta: number): void {
    const n = HOTBAR_BLOCKS.length;
    this.select(((this.selectedIndex + delta) % n + n) % n);
  }

  selectedBlock(): number {
    return HOTBAR_BLOCKS[this.selectedIndex];
  }

  setMode(mode: GameMode): void {
    this.modeEl.textContent = mode === 'creative' ? 'Creative' : 'Survival';
    this.modeEl.dataset.mode = mode;
    this.healthBarEl.classList.toggle('hidden', mode !== 'survival');
  }

  setHealth(fraction: number): void {
    this.healthFillEl.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
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
