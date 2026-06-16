# ARCHITECTURE — ArrowTowerGuard

> How the code is organized and how data flows. See `PRD.md` for scope, `DESIGN.md` for numbers.

## 1. Principles

- **Modular.** No god-component. Each module has one clear responsibility, a small public
  surface, and explicit dependencies.
- **Numbers in one place.** Every tunable value lives in `GameConfig.ts`. Gameplay code reads
  config; it never hard-codes numbers.
- **Save behind a service.** Only `LocalSaveService` may call `wx.*Storage`. All other code
  goes through the `SaveService` interface.
- **Decouple UI from logic.** UI reads state and emits *intents* via `EventBus`; it never
  mutates save data or core state directly.
- **Pool hot objects.** Arrows, monsters, and damage-number labels are recycled through
  `ObjectPool` — never `instantiate`/`destroy` per shot or per kill.

## 2. Folder layout (`assets/scripts/`)

```
config/
  GameConfig.ts          // ALL numbers: stats, waves, costs, speeds, colors
core/
  GameManager.ts         // top-level coordinator; owns GameState; drives high-level flow
  GameState.ts           // GameState enum + legal transition table (pure)
  EventBus.ts            // typed pub/sub (incl. GameEvent enum + payload map)
  ObjectPool.ts          // generic recycling pool<T>
config/
  GameConfig.ts          // ALL numbers: player, monsters, waves, upgrades, layout, colors
save/
  SaveService.ts         // ISaveService interface + static SaveService façade
  LocalSaveService.ts    // wx.get/setStorageSync — ONLY file touching wx storage
  CloudSaveService.ts    // stub implementing ISaveService (wx.cloud.callFunction, reserved)
  SaveVersionManager.ts  // stepwise migration of old saves to the current version
  PlayerSaveData.ts      // data model + version + createDefaultSaveData()
battle/
  BattleManager.ts       // battle flow: start, run waves, win/lose; owns the systems below
  WaveManager.ts         // wave table, current wave, alive count, "cleared" signal (pure)
  MonsterSpawner.ts      // pulls monsters from pool, places them per wave config (pure)
  DamageSystem.ts        // crit roll + damage application + floating numbers
player/
  ArcherController.ts    // hero: tap input, fire cooldown, launches arrows
  UpgradeSystem.ts       // upgrade levels, cost curve, derived PlayerStats (pure)
monster/
  Monster.ts             // enemy instance: move, takeDamage, die (component)
  MonsterConfig.ts       // monster type shapes + typed accessors over GameConfig
projectile/
  Arrow.ts               // flies toward target point, carries damage payload (component)
  ArrowPool.ts           // arrow-specific wrapper around ObjectPool
ui/
  BattleUI.ts            // HUD: gold, wave bar, castle HP bar, pause button
  UpgradePanel.ts        // between-wave upgrade rows (level, cost, buy) + next wave
  PausePanel.ts          // pause overlay: resume / restart
```

> Reserved / later: `Castle` + `CollisionSystem` (currently folded into BattleManager's
> plan), `SkillSystem` (post-MVP stub), a `Wallet`/economy module, `GameOverPanel`, and a
> `DamageNumber` view. Add them as their phase arrives.

## 3. Ownership & lifecycle

`GameManager` (attached to one node in the scene) owns top-level state and wires everything:

```
GameManager  (owns GameState; boot -> battle -> upgrade -> ... -> win/lose)
 ├─ SaveService  (LocalSaveService)      → loads PlayerSaveData on start
 ├─ UpgradeSystem (reads/writes levels in PlayerSaveData; derives PlayerStats)
 ├─ BattleManager
 │    ├─ WaveManager
 │    ├─ MonsterSpawner   (uses monster ObjectPool)
 │    ├─ ArcherController (uses ArrowPool)
 │    └─ DamageSystem     (uses damage-number ObjectPool)
 └─ UI: BattleUI, UpgradePanel, PausePanel
```

Dependencies point downward (UI/managers depend on services, never the reverse).
Cross-cutting notifications go through `EventBus`, not direct references.

## 4. Core data flow

```
tap(point)
  → Tower.fire(point)               // respects min fire-cooldown from PlayerStats
      → ArrowPool.get() → Arrow.launch(from, point, damage)
Arrow.update()
  → moves toward point
  → CollisionSystem.check(arrow, monsters)
      → on hit: DamageSystem.apply(arrow.damage, monster)
          → crit roll → monster.takeDamage()
          → DamageNumberPool.get() → show value
          → if monster.dead:
              → Wallet.add(monster.goldReward)   → SaveService (debounced)
              → EventBus.emit(MonsterKilled)
              → MonsterPool.put(monster)
          → ArrowPool.put(arrow)
Monster.update()
  → moves left; on reaching castle: Castle.takeDamage(monster.attack); MonsterPool.put(monster)
Castle.takeDamage()
  → if hp <= 0: EventBus.emit(GameOver, {result:'lose'})

WaveManager
  → tracks alive monsters; when 0 and spawn queue empty: EventBus.emit(WaveCleared)
BattleManager
  → on WaveCleared: if lastWave → emit(GameOver,{result:'win'}); else show UpgradePanel
  → on UpgradePanel.next → WaveManager.startNextWave()
```

## 5. EventBus catalog (`core/GameEvents.ts`)

| Event | Payload | Emitted by | Consumed by |
|-------|---------|-----------|-------------|
| `GoldChanged` | `{ gold }` | Wallet | HUD |
| `MonsterKilled` | `{ type, gold }` | DamageSystem | WaveManager, HUD |
| `CastleHpChanged` | `{ hp, maxHp }` | Castle | HUD |
| `WaveStarted` | `{ index, total }` | WaveManager | HUD |
| `WaveCleared` | `{ index }` | WaveManager | BattleManager |
| `UpgradePurchased` | `{ key, level }` | UpgradeSystem | HUD, UpgradePanel |
| `GameOver` | `{ result: 'win' \| 'lose' }` | Castle / BattleManager | GameOverPanel, BattleManager |
| `GamePaused` / `GameResumed` | `{}` | HUD | GameRoot |

(Keys are constants; payloads are typed. Add new events here, not as loose strings.)

## 6. Save layer

```ts
interface ISaveService {
  load(): PlayerSaveData;
  save(data: PlayerSaveData): void;
  // async variants reserved for CloudSaveService
}

interface PlayerSaveData {
  version: number;                 // bump + migrate on schema change
  gold: number;
  upgradeLevels: {
    damage: number; attackSpeed: number; crit: number; castleHp: number;
  };
  highestWave: number;
  settings: { sound: boolean };
}
```

- `LocalSaveService` is the **only** code that calls `wx.setStorageSync` / `wx.getStorageSync`.
- `CloudSaveService` implements the same interface and is registered later; gameplay code is
  unaffected by the swap.
- `PlayerSaveData.version` + a `migrate(old): PlayerSaveData` hook protect old saves.
- Writes are **debounced/coalesced** (e.g. on wave end and on purchase), not on every gold tick.

## 7. Object pools

| Pool | Object | Reset on recycle |
|------|--------|------------------|
| ArrowPool | Arrow node | velocity, position, active flag |
| MonsterPool | Monster node (by type or generic) | hp, position, type sprite, flags |
| DamageNumberPool | label node | text, alpha, position |

`ObjectPool<T>` exposes `get()` and `put(node)`; objects implement a `reset()` contract so
recycling never leaks stale state. No `instantiate`/`destroy` in the per-frame battle path.

## 8. Scene / node tree (built by you in the editor)

```
Canvas (1280x720, fit)
 ├─ Background        (placeholder color/sprite)
 ├─ Battlefield
 │    ├─ Castle       (left)         + Tower (hero) child
 │    ├─ MonsterLayer (pool parent)
 │    ├─ ArrowLayer   (pool parent)
 │    └─ FxLayer      (damage numbers pool parent)
 ├─ HUD               (gold, WaveBar, CastleHpBar, PauseBtn)
 ├─ UpgradePanel      (hidden by default)
 ├─ GameOverPanel     (hidden by default)
 └─ GameRoot          (empty node holding the GameRoot.ts bootstrap component)
```

### Editor-wiring guide (because we generate scripts, not `.scene` files)

1. Open this Cocos Creator 3.8.8 project; set Canvas to 1280×720, Fit Width + Fit Height.
2. Build the node tree above (empty nodes + placeholder `Sprite`/`Label` components).
3. Drop `GameRoot.ts` on the `GameRoot` node. Expose the layer nodes (MonsterLayer, ArrowLayer,
   FxLayer), Castle, Tower, HUD widgets, and panels as `@property(Node)` fields, and drag the
   matching scene nodes onto them in the Inspector.
4. Create three placeholder **prefabs** — `Arrow`, `Monster`, `DamageNumber` — each a simple
   sprite/label with its component attached; assign them to the corresponding pool `@property`
   on `GameRoot` (or the manager that owns the pool).
5. Press Play. `GameRoot.start()` loads the save, builds the managers, and runs the first wave.

Each script will document its required `@property` references at the top of the file.

## 9. Testability

Logic modules (`UpgradeSystem`, `DamageSystem`, `WaveManager`, `Wallet`, `PlayerStats`,
`SaveService` round-trip) are kept free of Cocos node dependencies where practical, so their
math/state can be unit-tested in plain TypeScript. View/entity classes stay thin. MVP priority
is "playable first," but the seams for tests are designed in from the start.
