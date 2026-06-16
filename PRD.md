# PRD — ArrowTowerGuard (Working Title)

> Horizontal 2D archer-defense WeChat mini-game. Single-player MVP.
> This document defines **what** we are building. For **how**, see `ARCHITECTURE.md`; for **numbers**, see `DESIGN.md`.

## 1. Vision

A bite-sized, session-friendly defense game: the player guards a castle on the left
edge of the screen and taps to fire arrows at monsters advancing from the right.
Between waves the player spends earned gold on permanent upgrades. The fantasy is
"a lone archer holding the wall" — quick to understand, satisfying to improve.

## 2. Platform & constraints

| Item | Decision |
|------|----------|
| Engine | Cocos Creator 3.8.8 |
| Language | TypeScript |
| Target | WeChat mini-game |
| Orientation | **Landscape** |
| Design resolution | 1280 × 720 (Canvas fit-width/height) |
| Network | None for MVP — local save only; cloud reserved |
| Art | Placeholder shapes/sprites first; final art swapped later without code change |

## 3. Copyright rule (hard requirement)

Do **not** copy the name, art, UI, sound, monster designs, or branding of *Defender II*
or any existing game. Only the generic genre idea (side-scrolling archer defense) is
shared. All names used here ("Forest Archer", "Skyward Keep", "Warborn Overlord", etc.)
are original placeholders and may be renamed freely.

## 4. Core gameplay loop

1. A wave of monsters spawns from the right and walks/flies left toward the castle.
2. The player **taps a point** on screen; an arrow launches from the tower toward that
   point and damages the first monster it collides with.
3. Killed monsters drop **gold**. Monsters that reach the castle deal damage to **Castle HP**.
4. When all monsters in a wave are cleared, an **Upgrade panel** appears.
5. The player spends gold on upgrades, then starts the next wave.
6. The run ends in **victory** (wave 10 cleared) or **defeat** (Castle HP reaches 0).

## 5. Features — IN MVP

- Tap-to-shoot combat (arrow flies toward tapped point, collision damage).
- Three monster types: **Goblin Scout**, **Armored Brute**, **Bat Demon** (flying).
- Boss: **Warborn Overlord** at wave 10.
- **10-wave** progression with a `WAVE x / 10` indicator.
- Castle HP with on-screen HP bar; game-over on depletion.
- Gold economy (drops from kills).
- Four permanent upgrades between waves: **Damage, Attack Speed, Crit Chance, Castle HP**.
- Crit hits (chance + multiplier) with floating damage numbers.
- **Local save** (gold, upgrade levels, highest wave, settings) via `SaveService`.
- Simple HUD: gold, wave bar, castle HP, pause.
- Pause / resume.

## 6. Features — OUT of MVP (reserved, do not build yet)

- Active **skills** (Multishot, Ice Spike, Fireball, Lightning, Healing, Coin Boost) —
  `SkillSystem` exists only as a reserved interface/stub.
- Crystal Golem monster.
- Cloud save / accounts (`CloudSaveService` is a stub behind the same interface).
- Payments / IAP, ads, ranking/leaderboards, equipment, multiplayer.
- Game-speed toggle (the `x1` button in the mockup) — visual only or deferred.

## 7. Monster summary (details/numbers in `DESIGN.md`)

| Monster | Role | Notes |
|---------|------|-------|
| Goblin Scout | Fast, weak fodder | Ground lane |
| Armored Brute | Slow, high HP, hits hard | Ground lane |
| Bat Demon | Fast flyer | Upper lane (different Y), evades ground-aimed shots |
| Warborn Overlord | Wave-10 boss | High HP, large gold reward |

## 8. Upgrade summary (curves in `DESIGN.md`)

| Upgrade | Effect |
|---------|--------|
| Damage | Increases damage per arrow |
| Attack Speed | Reduces minimum time between shots |
| Crit Chance | Increases chance of a critical (× multiplier) hit |
| Castle HP | Increases max Castle HP (and refills on purchase) |

## 9. Win / lose

- **Win:** all 10 waves cleared. Show victory summary; record `highestWave = 10`.
- **Lose:** Castle HP reaches 0. Show game-over summary; offer restart.
- Gold and upgrade levels persist across runs (single endless meta-progression for MVP).

## 10. Success criteria (MVP "done")

1. The game launches in the WeChat devtools simulator in landscape and is playable end-to-end.
2. A player can clear (or lose) all 10 waves without crashes or soft-locks.
3. Upgrades visibly change combat (more damage, faster fire, more crits, tougher castle).
4. Gold and upgrade levels survive an app restart (local save round-trips).
5. No frame-rate collapse with a full wave on screen (object pools prevent GC churn).
6. All tunable numbers live in `GameConfig.ts`; no magic numbers in gameplay code.
