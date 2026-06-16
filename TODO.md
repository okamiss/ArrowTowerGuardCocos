# TODO — ArrowTowerGuard MVP

> Implementation plan, phased so the game becomes **playable as early as possible**, then
> deepens. Each phase ends in something runnable. Check items off as you go.
> See `ARCHITECTURE.md` for module details and `DESIGN.md` for numbers.

## Runtime decision (updated 2026-06-16)

**This `ArrowTowerGuardCocos` Cocos Creator 3.8.8 project is the single source of truth.**
The work has moved out of the old raw WeChat mini-game template into this standalone Cocos
project.
- Develop gameplay only in `assets/scripts/*.ts` (Cocos). Do NOT resume raw-JS development.
- The old WeChat airplane template (`game.js`, `game.json`, `project.config.json`,
  `js/player`, `js/npc`, `js/runtime`) is retired — **do not edit** those files.
- Run/develop in Cocos Creator. Use WeChat DevTools only to open the Cocos **build output**
  (`Project → Build → WeChat Mini Game`); never open this project root in DevTools, and never
  edit generated build output by hand.
- `assets/scripts/core/GameScene.ts` is a minimal programmatic first screen (HUD gold,
  debug +gold, buy-damage, tower/enemy placeholders) wired to Wallet/SaveService/UpgradeSystem.
  Attach it to a Canvas node and press Play.

## Phase 0 — Project bootstrap
- [x] Cocos Creator 3.8.8 project created (this `ArrowTowerGuardCocos` folder).
- [ ] Set Canvas to 1280×720, Fit Width + Fit Height; build to WeChat with `landscape` orientation.
- [ ] Configure TypeScript + ESLint for Cocos; confirm an empty scene runs in editor preview.
- [ ] Create the `assets/scripts/` folder structure from `ARCHITECTURE.md`.

## Phase 1 — Config & core infra
- [ ] `config/GameConfig.ts` — all numbers from `DESIGN.md` (player, monsters, waves, upgrades).
- [ ] `core/EventBus.ts` + `core/GameEvents.ts` — typed pub/sub + event keys/payloads.
- [ ] `core/ObjectPool.ts` — generic pool with `get()` / `put()` and a `reset()` contract.
- [ ] `core/GameRoot.ts` — bootstrap skeleton with `@property` node refs (documented at top).

## Phase 2 — Core combat loop (first playable)
- [ ] `battle/entities/Castle.ts` — max/current HP, `takeDamage`, emits `GameOver`.
- [ ] `battle/entities/Tower.ts` — tap handler, fire cooldown, launches arrows from pool.
- [ ] `battle/entities/Arrow.ts` — move toward point, lifetime, recycle.
- [ ] `battle/entities/Monster.ts` — move left, attack castle on contact, recycle.
- [ ] `battle/combat/CollisionSystem.ts` — arrow↔monster distance hit test.
- [ ] `battle/combat/DamageSystem.ts` — crit roll, apply damage, spawn floating numbers.
- [ ] `ui/DamageNumber.ts` — pooled floating label.
- [ ] Placeholder prefabs: `Arrow`, `Monster`, `DamageNumber`; wire pools in editor.
- [ ] **Milestone:** tap to shoot, hit a manually-spawned monster, see damage, kill it.

## Phase 3 — Waves & spawning
- [ ] `battle/WaveManager.ts` — wave definitions, current wave, alive count, `WaveCleared`.
- [ ] `battle/MonsterSpawner.ts` — spawn per wave config from the pool, ground/air lanes.
- [ ] `battle/BattleManager.ts` — run lifecycle, wave→upgrade→next-wave flow, win/lose.
- [ ] **Milestone:** play through waves 1→10 (or lose), boss appears at wave 10.

## Phase 4 — Economy & upgrades
- [ ] `economy/Wallet.ts` — gold balance, add/spend, emits `GoldChanged`.
- [ ] `progression/PlayerStats.ts` — derived stats from upgrade levels.
- [ ] `progression/UpgradeSystem.ts` — cost curve, buy, apply to `PlayerStats`.
- [ ] `progression/SkillSystem.ts` — reserved stub (interface only, no behavior).
- [ ] **Milestone:** kills give gold; between-wave purchases visibly change combat.

## Phase 5 — Save
- [x] `save/PlayerSaveData.ts` — model + version + defaults + `migrate()` hook.
- [x] `save/SaveService.ts` — `ISaveService` interface + abstract base (async).
- [x] `save/LocalSaveService.ts` — wx storage wrapper (ONLY file calling `wx.*Storage`).
- [x] `save/CloudSaveService.ts` — stub behind the same interface.
- [x] `save/SaveVersionManager.ts` + `save/SaveServiceFactory.ts` (config-driven local/cloud).
- [x] Wire load on start (GameManager.boot), coalesced saves at save points
      (wave end / purchase / victory / defeat / pause / app-hide / manual).
- [x] `economy/Wallet.ts` — pure gold balance (get/set/add/spend/canAfford), emits GoldChanged.
- [x] Wallet wired into GameManager: seeded from profile on load, mirrored to
      profile in memory, persisted only at save points. `GameManager.debugAddGold()`
      for manual restart verification.
- [x] Save + Wallet validation incl. end-to-end gold-persists-across-restart:
      `tests/saveLayer.check.ts` (run `npx -y tsx tests/saveLayer.check.ts`).
- [ ] **Milestone:** gold + upgrade levels + highest wave survive an app restart.
      (gold path proven via Wallet + debugAddGold; upgrade levels persist once
      UpgradePanel ↔ UpgradeSystem is wired — next step.)

## Phase 6 — UI / HUD
- [ ] `ui/HUD.ts` — gold, `WAVE x/10` bar, Castle HP bar, pause button.
- [ ] `ui/UpgradePanel.ts` — 4 upgrade rows (icon, name, level, cost, buy) + Next Wave button.
- [ ] `ui/GameOverPanel.ts` — victory/defeat summary + restart.
- [ ] Disabled-placeholder skill slots + `x1` speed button (visual only).
- [ ] Pause / resume wired through `EventBus`.
- [ ] **Milestone:** full end-to-end loop matches the design-image layout (placeholder art).

## Phase 7 — Polish & verify
- [ ] Playtest balance pass against `DESIGN.md`; tune `GameConfig.ts`.
- [ ] Verify no GC churn / frame drops with a full wave on screen (pools working).
- [ ] Confirm all MVP success criteria in `PRD.md §10`.
- [ ] (Optional) Unit tests for `UpgradeSystem`, `DamageSystem`, `Wallet`, `SaveService`.

## Backlog (post-MVP — do not start before MVP is playable)
- [ ] Active skills (Multishot, Ice Spike, Fireball, Lightning, Healing, Coin Boost).
- [ ] Crystal Golem monster.
- [ ] Real art + animations (hero idle/aim/fire, monsters, castle, parallax background).
- [ ] Audio (`AudioService` + SFX/music).
- [ ] Cloud save via `CloudSaveService`.
- [ ] Game-speed toggle (`x1` / `x2`).
- [ ] Ads / IAP / ranking (only if the game proves out).
