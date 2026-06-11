# Vyrthlands

Browser voxel survival RPG. Floating-islands theme with glowing Sky Crystal blocks. NOT a Minecraft clone — no Minecraft assets, names, or copied UI.

## Stack
- Vite + TypeScript + Three.js (no framework)
- Backend: Express + node:sqlite + ws ([server/index.js](server/index.js)) — accounts, friend servers (invite codes), per-player cloud progress, shared world edits, WS presence
- Guest mode: localStorage saves, works without backend

## Run
- `npm install`
- `npm run server` — backend on :8081 (db: server/vyrthlands.db)
- `npm run dev` — dev server (vite proxies /api and /ws to :8081)
- `npm run build` — typecheck (tsc) + production build

## Architecture
- [src/config.ts](src/config.ts) — all tunable constants (world size, physics, keys)
- [src/blocks.ts](src/blocks.ts) — block registry (colors, solidity, glow), hotbar order
- [src/world/world.ts](src/world/world.ts) — chunk storage (flat Uint8Array per 16xHx16 column), terrain gen (fbm noise, floating islands, trees), edit tracking
- [src/world/chunkMesher.ts](src/world/chunkMesher.ts) — face-culled merged geometry per chunk, 3 buckets: opaque / glow (unlit) / water (transparent)
- [src/world/worldRenderer.ts](src/world/worldRenderer.ts) — chunk mesh lifecycle, dirty-chunk rebuilds, disposal
- [src/player.ts](src/player.ts) — FPS controller, AABB-vs-voxel collision (per-axis), fly toggle
- [src/raycast.ts](src/raycast.ts) — DDA voxel raycast for block picking
- [src/environment.ts](src/environment.ts) — day/night cycle, sky/fog color, sun light, clouds
- [src/save.ts](src/save.ts) — localStorage save/load (seed + edits diff + player pos)
- [src/ui/hud.ts](src/ui/hud.ts) + [src/ui/style.css](src/ui/style.css) — hotbar, crosshair, menus, toasts
- [src/main.ts](src/main.ts) — orchestrator: scene, input wiring, game loop

## Rules
- Keep modules separated as above; no giant files.
- Performance first: merged chunk meshes only, never per-cube meshes.
- Saves store only the edit diff, never full world data.
- World regenerates deterministically from seed.
