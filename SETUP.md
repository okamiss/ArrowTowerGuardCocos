# Arrow Tower Guard — Cocos Setup

Migrated from the old WeChat mini-game project. **Cocos Creator 3.8.8 is the source of truth.**
Only reusable pure logic was migrated — no airplane demo code, no `game.js`/`game.json`/
`project.config.json`, no `js/player|npc|runtime`.

## What was migrated (`assets/scripts/`)

| Folder | Files |
|--------|-------|
| `core/` | `GameConfig.ts` (configs + economy/cost formulas), `EventBus.ts` (GameEvents: `GameEvent` enum + typed payloads) |
| `save/` | `PlayerSaveData.ts`, `SaveService.ts`, `SaveServiceFactory.ts`, `LocalSaveService.ts`, `CloudSaveService.ts`, `SaveVersionManager.ts` (persistence logic) |
| `economy/` | `Wallet.ts` |
| `upgrades/` | `UpgradeSystem.ts` |
| `cocos/` | `GameSceneController.ts` (the only Cocos-coupled file: builds the first screen) |
| `battle/` | (empty — reserved for battle logic) |

`LocalSaveService` now uses Cocos `sys.localStorage`, so gold/upgrades persist in **browser
Preview, native, and WeChat builds** alike. All save methods are `Promise`-based for a future
cloud swap.

## Create the scene (≈1 minute in the editor)

> The `.scene` file is **not** hand-authored on purpose: Cocos scene files contain editor-managed
> internals (Camera, `SceneGlobals`, compressed script UUIDs) that are fragile to write by hand and
> can't be verified outside the editor. The editor generates a correct one in seconds:

1. Open the project in **Cocos Creator 3.8.8** (it compiles the scripts; check the Console for errors).
2. **Project → Project Settings → Layout** (Design Resolution): set **1280 × 720**, Fit Width + Fit Height.
3. In **Assets**, right-click `assets/scenes` → **Create → Scene**, name it **`GameScene`**.
   (This creates a valid scene with a `Canvas` + `Camera`.)
4. Double-click `GameScene` to open it. In **Hierarchy**, right-click `Canvas` → **Create → Empty Node**, name it **`GameRoot`**.
5. Select `GameRoot` → **Inspector → Add Component → Custom Script → `GameSceneController`**.
6. **Ctrl+S**. (Optional) set `GameScene` as the start scene in Project Settings.
7. Press **Preview** (▶). You should see: HUD `Gold:` + `WAVE 1 / 10`, a `+100 Gold (debug)` button,
   a `Buy Damage` button, and the left tower / right enemy-spawn placeholders. **No airplanes.**

## Verify Wallet persistence

1. Click **+100 Gold (debug)** a few times → `Gold:` rises (and it saves).
2. Stop and Preview again → gold is still there (loaded from `sys.localStorage`).
3. Click **Buy Damage** → spends 50 gold, `Damage Lv.` increments, persists.

## Build for WeChat (later)

- **Project → Build → WeChat Mini Game**. Open the **build output** folder in WeChat DevTools.
- Do **not** edit generated build output by hand. Keep developing here in Cocos.
