# Development Rules — ArrowTowerGuard

> Rules for any human or AI agent working in this Cocos Creator project. Companion docs:
> `PRD.md` (scope), `ARCHITECTURE.md` (structure), `DESIGN.md` (numbers), `TODO.md` (plan),
> `README.md` (run instructions). This file is the canonical agent guide for this project.

## Project type

Cocos Creator **3.8.8** · TypeScript · **landscape** · single-player MVP, targeting the
**WeChat mini-game** platform. Design resolution 1280 × 720.

This `ArrowTowerGuardCocos` folder is a standalone Cocos Creator project and the **single
source of truth**. All gameplay lives in `assets/scripts/`.

## Core gameplay

Horizontal 2D archer defense: player defends a castle on the left; monsters advance from the
right; player **taps a point** to fire an arrow toward it; kills drop gold; between waves the
player buys upgrades; the run ends on wave-10 victory or Castle-HP-zero defeat.

## Locked decisions (do not silently change)

1. **Shooting:** tap a point → arrow flies from the tower toward it → collision damage to the
   first monster hit (single-target, no pierce in MVP).
2. **Content:** 10 waves; monsters = Goblin Scout, Armored Brute, Bat Demon; Warborn Overlord
   boss at wave 10. Crystal Golem is deferred.
3. **Skills are post-MVP.** MVP ships only the 4 upgrades (Damage, Attack Speed, Crit, Castle HP).
   `SkillSystem` is a reserved stub with no behavior.
4. **Project setup:** this Cocos Creator 3.8.8 project already exists; develop gameplay in
   `assets/scripts/*.ts` and wire scenes in the editor. Do **not** hand-author `.scene`/`.meta`
   files — they are fragile when written outside the editor. Do **not** continue raw-JS
   gameplay development; the old WeChat airplane template (`game.js`, `game.json`,
   `project.config.json`, `js/player`, `js/npc`, `js/runtime`) is retired and must not be
   edited. WeChat DevTools opens only the Cocos **build output**, never this project root.

## Architecture rules

- Keep logic **modular**; never put all gameplay in one component.
- `GameConfig.ts` stores **all** game numbers. No magic numbers in gameplay code.
- `SaveService` handles all save/load. UI must not modify save data directly.
- `BattleManager` coordinates battle flow; `WaveManager` handles waves; `MonsterSpawner` spawns
  monsters; `UpgradeSystem` computes upgrades; `SkillSystem` is a reserved stub.
- UI communicates via `EventBus` (intents/state), never by reaching into core state.
- Follow the folder layout and event catalog in `ARCHITECTURE.md`.

## Save rules

- Business logic must **not** call `wx.setStorageSync` / `wx.getStorageSync` directly.
- Only `LocalSaveService` touches `wx.*Storage`. Everyone else uses the `ISaveService` interface.
- `CloudSaveService` is a reserved stub behind the same interface.
- `PlayerSaveData` includes a `version` field; provide a `migrate()` hook for schema changes.
- Coalesce writes (on wave end / on purchase), not on every gold tick.

## Performance rules

- Use `ObjectPool` for arrows, monsters, and damage-number labels. No `instantiate`/`destroy`
  in the per-frame battle path.
- Reuse damage-number nodes via the pool.
- Avoid heavy effects in MVP; keep WeChat mini-game performance in mind.
- Avoid creating many nodes during battle.

## Coding conventions

- TypeScript strict; explicit types on public methods and `@property` fields.
- One responsibility per file; keep files small and focused.
- Each component documents its required `@property` references at the top of the file.
- Config-driven sprite references so placeholder → final art needs no logic change.
- Prefer pure, Cocos-free logic in `progression/`, `economy/`, and `save/` for testability.

## Copyright rule

Do **not** copy names, assets, UI, monsters, sound effects, icons, or branding from *Defender II*
or any existing game. Only the general side-scrolling archer-defense idea is shared. All current
names are original placeholders and may be renamed.

## MVP scope

**In:** basic battle, tap-to-shoot, monsters moving right→left, castle HP, game over, 10-wave
system, 4-upgrade system, local save, simple HUD, pause.

**Out (do not build before MVP is playable):** active skills, Crystal Golem, payments, ads,
online accounts, complex equipment, multiplayer, advanced ranking, cloud save.



##  CodeGraph (Required)

This repository uses CodeGraph.

Before performing code analysis, debugging, refactoring, or feature implementation:

- Use CodeGraph MCP tools as the primary navigation mechanism.
- Use CodeGraph to locate symbols, references, callers, callees, dependencies, and impact scope.
- Use CodeGraph to understand architecture before reading files.
- Determine affected code paths before making changes.

Do NOT start with:

- grep
- ripgrep
- find
- global text search
- reading large portions of the repository

Read source files only after the relevant locations have been identified through CodeGraph.

If CodeGraph is not initialized:

```bash
codegraph init -i
```

Preferred workflow:

1. Analyze repository structure with CodeGraph.
2. Locate relevant symbols and references.
3. Trace dependencies and call chains.
4. Determine impact scope.
5. Read only necessary files.
6. Implement changes.
7. Verify changes.