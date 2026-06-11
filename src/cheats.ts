import * as THREE from 'three';
import { Item } from './items';
import { Block } from './blocks';
import { Inventory } from './inventory';
import { Player } from './player';
import { MobManager } from './mobs';
import { Environment } from './environment';
import { ActiveEffects } from './skills';
import { RoleId } from './roles';

/**
 * Chat cheat codes (classic GTA III code words, Vyrthlands effects).
 * Locked until the player types /admincheat101 in chat.
 */

export interface CheatContext {
  player: Player;
  inventory: Inventory;
  mobs: MobManager;
  env: Environment;
  effects: ActiveEffects;
  setHealth(frac: number): void;
  setVitality(frac: number): void;
  cycleRole(): RoleId;
  spawnHostiles(count: number): number;
  spawnBoss(): string | null;
}

export interface Cheat {
  desc: string;
  run(ctx: CheatContext): string; // returns the system chat line
}

export const ADMIN_CODE = '/admincheat101';

export const CHEATS: Record<string, Cheat> = {
  GUNSGUNSGUNS: {
    desc: 'All weapons',
    run: (ctx) => {
      const gear: [number, number][] = [
        [Item.Sword, 250], [Item.Dagger, 180], [Item.Staff, 200], [Item.Blaster, 200],
        [Item.Wand, 220], [Item.CrystalPickaxe, 600], [Item.StoneAxe, 130], [Item.Shovel, 100],
      ];
      for (const [item, dura] of gear) ctx.inventory.add(item, 1, dura);
      return 'Armory delivered: every weapon and tool.';
    },
  },
  GESUNDHEIT: {
    desc: 'Full health',
    run: (ctx) => { ctx.setHealth(1); ctx.setVitality(1); return 'Health restored. Bless you.'; },
  },
  TORTOISE: {
    desc: 'Full armor',
    run: (ctx) => {
      ctx.inventory.equip.head = { item: Item.IronHelmet, count: 1 };
      ctx.inventory.equip.body = { item: Item.IronChestplate, count: 1 };
      ctx.inventory.equip.legs = { item: Item.IronLeggings, count: 1 };
      ctx.inventory.equip.boots = { item: Item.IronBoots, count: 1 };
      return 'Full iron armor equipped.';
    },
  },
  IFIWEREARICHMAN: {
    desc: 'Riches',
    run: (ctx) => {
      ctx.inventory.add(Item.GoldIngot, 99);
      ctx.inventory.add(Item.IronIngot, 99);
      ctx.inventory.add(Item.CrystalShard, 99);
      ctx.inventory.add(Block.Planks, 99);
      return 'Riches rain from the sky.';
    },
  },
  MOREPOLICEPLEASE: {
    desc: 'Spawn hunters',
    run: (ctx) => `${ctx.spawnHostiles(5)} hunters answered the call.`,
  },
  NOPOLICEPLEASE: {
    desc: 'Clear all enemies',
    run: (ctx) => { ctx.mobs.clear(); return 'The land falls silent. All enemies gone.'; },
  },
  NOBODYLIKESME: {
    desc: 'Everything hunts you',
    run: (ctx) => {
      for (const m of ctx.mobs.mobs) { m.aggro = true; m.provoked = true; }
      return `${ctx.mobs.mobs.length} creatures now hate you personally.`;
    },
  },
  ITSALLGOINGMAAAD: {
    desc: 'Horde madness',
    run: (ctx) => `Madness! ${ctx.spawnHostiles(10)} creatures swarm in.`,
  },
  BANGBANGBANG: {
    desc: 'Detonate nearby enemies',
    run: (ctx) => {
      const near = ctx.mobs.mobs.filter((m) => m.pos.distanceTo(ctx.player.position) < 25);
      for (const m of near) ctx.mobs.damage(m, 9999, new THREE.Vector3(0, 1, 0));
      return `BOOM. ${near.length} enemies detonated (loot dropped).`;
    },
  },
  GIVEUSATANK: {
    desc: 'Spawn a boss',
    run: (ctx) => {
      const name = ctx.spawnBoss();
      return name ? `A wild ${name} has been delivered. Good luck.` : 'No boss lives in this realm.';
    },
  },
  CHITTYCHITTYBB: {
    desc: 'Flight',
    run: (ctx) => { ctx.player.flying = !ctx.player.flying; ctx.player.velocity.y = 0; return ctx.player.flying ? 'You are flying. Even in survival.' : 'Flight disabled.'; },
  },
  CORNERSLIKEMAD: {
    desc: 'Speed burst (60s)',
    run: (ctx) => { ctx.effects.speedT = 60; return 'You corner like mad for 60 seconds.'; },
  },
  TIMEFLIESWHENYOU: {
    desc: 'Hyper speed (120s)',
    run: (ctx) => { ctx.effects.speedT = 120; return 'Time flies. So do you. 120 seconds.'; },
  },
  MADWEATHER: {
    desc: 'Fast clock',
    run: (ctx) => {
      ctx.env.timeScale = ctx.env.timeScale === 1 ? 10 : 1;
      return ctx.env.timeScale === 10 ? 'The sun races across the sky (10x clock).' : 'Clock back to normal.';
    },
  },
  BOOOOORING: {
    desc: 'Reset speed/clock',
    run: (ctx) => { ctx.effects.speedT = 0; ctx.env.timeScale = 1; return 'Everything back to boring normal.'; },
  },
  SKINCANCERFORME: {
    desc: 'Sunny noon',
    run: (ctx) => { ctx.env.setTime(0.3); ctx.env.setFogScale(1); return 'Blazing noon sunshine.'; },
  },
  ILIKESCOTLAND: {
    desc: 'Overcast dusk',
    run: (ctx) => { ctx.env.setTime(0.45); return 'Grey overcast skies.'; },
  },
  ILOVESCOTLAND: {
    desc: 'Gloomy evening',
    run: (ctx) => { ctx.env.setTime(0.52); ctx.env.setFogScale(0.7); return 'Gloomy, drizzly evening.'; },
  },
  PEASOUP: {
    desc: 'Dense fog',
    run: (ctx) => { ctx.env.setFogScale(0.35); return 'Pea-soup fog rolls in.'; },
  },
  ILIKEDRESSINGUP: {
    desc: 'Switch role',
    run: (ctx) => `You are now a ${ctx.cycleRole()}.`,
  },
  NASTYLIMBSCHEAT: {
    desc: '???',
    run: () => 'Vyrthlands is a family realm. Nothing so gruesome here.',
  },
  ANICESETOFWHEELS: {
    desc: '???',
    run: () => 'No cars in Vyrthlands. Have you tried a Longneck Titan?',
  },
};

/** Run a chat line through the cheat system. Returns system lines to print. */
export function handleCheatLine(line: string, state: { unlocked: boolean }, ctx: () => CheatContext | null): string[] | null {
  const text = line.trim();
  if (text.toLowerCase() === ADMIN_CODE) {
    state.unlocked = !state.unlocked;
    return [state.unlocked
      ? 'Admin cheats UNLOCKED. Type /cheats for the list. Type /admincheat101 again to lock.'
      : 'Admin cheats locked.'];
  }
  if (!text.startsWith('/')) {
    // bare cheat words also work once unlocked (classic style)
    const code = text.replace(/\s+/g, '').toUpperCase();
    if (state.unlocked && CHEATS[code]) {
      const c = ctx();
      return c ? [CHEATS[code].run(c)] : ['Start a world first.'];
    }
    return null; // normal chat message
  }
  const cmd = text.slice(1).replace(/\s+/g, '').toUpperCase();
  if (cmd === 'CHEATS') {
    if (!state.unlocked) return ['Cheats are locked. You know the code… (/admincheat101)'];
    return ['Cheat codes: ' + Object.keys(CHEATS).join(', ')];
  }
  if (CHEATS[cmd]) {
    if (!state.unlocked) return ['Cheats are locked. Type /admincheat101 first.'];
    const c = ctx();
    return c ? [CHEATS[cmd].run(c)] : ['Start a world first.'];
  }
  return [`Unknown command: ${text}`];
}
