# ArrowTowerGuard (Cocos)

Horizontal 2D archer-defense game built with **Cocos Creator 3.8.8** (TypeScript), targeting
the **WeChat mini-game** platform. Landscape, design resolution 1280 × 720. Single-player MVP.

This folder (`ArrowTowerGuardCocos`) is a standalone Cocos Creator project and is now the
**single source of truth** for the game. Gameplay lives in `assets/scripts/`.

> Companion docs in this folder: `PRD.md` (what we build), `ARCHITECTURE.md` (how the code is
> organized), `DESIGN.md` (the numbers), `TODO.md` (the plan), `AGENTS.md` (rules for humans/agents).

## How to run

1. Open this folder (`ArrowTowerGuardCocos`) in **Cocos Creator 3.8.8**.
2. Open the main scene and press **Play** to run in the editor / browser preview.
3. To run on WeChat: **Project → Build → WeChat Mini Game**, then open the generated
   **build output** folder in WeChat DevTools — **not** this project root.

## Project layout

```
ArrowTowerGuardCocos/
├── assets/                 // ← source of truth (Cocos assets)
│   └── scripts/            // all gameplay TypeScript (see ARCHITECTURE.md)
├── settings/               // Cocos project settings
├── profiles/               // editor/build profiles
├── library/                // editor import cache (generated)
├── temp/                   // editor temp (generated)
├── .creator/               // editor metadata
├── package.json
└── tsconfig.json
```

`library/`, `temp/`, and `.creator/` are editor-generated and not authored by hand.

## Working rules (summary)

- Develop gameplay only in `assets/scripts/*.ts`. See `AGENTS.md` for the full ruleset.
- Do **not** continue raw-JS gameplay development; the old WeChat airplane template is retired.
- All tunable numbers live in `assets/scripts/config/GameConfig.ts` (kept in sync with `DESIGN.md`).
- WeChat DevTools opens only the Cocos **build output**, never this source project root.
