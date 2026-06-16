# DESIGN — ArrowTowerGuard

> Gameplay numbers, formulas, and UI. **All values here are the source of truth for
> `GameConfig.ts`.** When balance changes, change it here and in `GameConfig.ts` together.
> Numbers below are MVP starting points — tune freely; they are intentionally round.

## 1. Screen & layout

- Landscape, design resolution **1280 × 720**.
- **Castle/Tower** occupies the left ~15% of the screen; the hero (archer) sits atop it.
- Monsters spawn just off the **right** edge and move left.
- Two travel lanes:
  - **Ground lane** (lower Y, ~y=160): Goblin Scout, Armored Brute, Warborn Overlord.
  - **Air lane** (upper Y, ~y=320): Bat Demon.
- The castle's "hit line" is at x ≈ 200; a monster reaching it attacks, then is removed.

## 2. Player / Tower stats

| Stat | Base value | Source |
|------|-----------|--------|
| Arrow damage | 10 | `GameConfig.player.baseDamage` |
| Fire cooldown (min time between taps that fire) | 0.40 s | `baseFireCooldown` |
| Crit chance | 5 % | `baseCritChance` |
| Crit multiplier | 2.0× | `critMultiplier` (not upgraded in MVP) |
| Castle max HP | 200 | `baseCastleHp` |

## 3. Arrow mechanics

- On tap, an arrow launches from the tower muzzle toward the tapped point.
- **Speed:** 900 px/s, straight line (slight visual rotation to face direction).
- **Lifetime:** 2.0 s, then recycled if it hit nothing.
- **Collision:** first monster whose hitbox the arrow overlaps takes the hit; arrow is then
  recycled (single-target, no pierce in MVP).
- **Hitbox test:** distance check (arrow tip vs monster center radius) — cheap, pool-friendly.
- Fire cooldown gates spam: taps during cooldown are ignored (no queued arrows).

## 4. Monsters (MVP)

| Monster | HP | Speed (px/s) | Castle damage | Gold | Lane |
|---------|----|----|----|------|------|
| Goblin Scout | 30 | 70 | 8 | 5 | Ground |
| Bat Demon | 45 | 95 | 12 | 8 | Air |
| Armored Brute | 140 | 35 | 25 | 18 | Ground |
| **Warborn Overlord** (boss) | 1800 | 25 | 60 | 250 | Ground |

- Monsters deal `castle damage` once on reaching the hit line, then are removed (they do not
  linger and tick). Tune to a melee-tick model later if desired.
- HP bars over monsters are optional in MVP (floating damage numbers are required).

## 5. Wave table (10 waves)

Spawn interval shrinks slightly as waves rise (`spawnInterval` per wave, seconds between spawns).

| Wave | Composition | Spawn interval |
|------|-------------|----------------|
| 1 | 5 Goblin | 1.2 |
| 2 | 7 Goblin | 1.1 |
| 3 | 6 Goblin, 2 Bat | 1.0 |
| 4 | 6 Goblin, 4 Bat | 0.95 |
| 5 | 4 Goblin, 3 Brute | 1.1 |
| 6 | 6 Goblin, 4 Bat, 1 Brute | 0.9 |
| 7 | 8 Goblin, 5 Bat | 0.85 |
| 8 | 4 Brute, 5 Bat | 0.9 |
| 9 | 10 Goblin, 6 Bat, 3 Brute | 0.8 |
| 10 | 1 Warborn Overlord + 4 Brute escort | 1.5 |

A wave is **cleared** when its spawn queue is empty and zero monsters remain alive.

## 6. Economy & upgrades

Gold comes only from kills (sum of monster `gold`). Upgrades are permanent and persist.

**Cost curve:** `cost(level) = ceil(baseCost × growth^level)` (level starts at 0).

| Upgrade | Effect per level | Base cost | Growth | Cap |
|---------|------------------|-----------|--------|-----|
| Damage | +5 arrow damage | 50 | 1.18 | 50 |
| Attack Speed | −4 % fire cooldown (multiplicative) | 60 | 1.20 | 50 (min cooldown 0.10 s) |
| Crit Chance | +1.5 % crit chance | 75 | 1.22 | 50 (cap 60 %) |
| Castle HP | +40 max HP (and heal to full on buy) | 80 | 1.16 | 50 |

**Derived stats (`PlayerStats`):**
```
damage        = baseDamage + 5 * damageLevel
fireCooldown  = max(minCooldown, baseFireCooldown * 0.96 ^ attackSpeedLevel)
critChance    = min(0.60, baseCritChance + 0.015 * critLevel)
castleMaxHp   = baseCastleHp + 40 * castleHpLevel
```

**Damage formula:**
```
isCrit  = random() < critChance
dealt   = isCrit ? round(damage * critMultiplier) : damage
```
Floating number shows `dealt`; crits render larger / different color.

## 7. UI (mapped to design images)

**Battle HUD (img 1):**
- Top-left: gold counter (coin icon + amount).
- Top-center: `WAVE x / 10` with a small progress indicator.
- Top-right: pause button.
- Bottom-left: Castle HP bar with `current / max` text.
- Bottom-center: 3 skill slots — **rendered as disabled/placeholder in MVP** (skills are post-MVP).
- Bottom-right: `x1` speed toggle — **visual placeholder / deferred**.

**Upgrade panel (img 4):** four rows (Damage, Attack Speed, Crit Chance, Castle HP), each with
icon, name, `Lv n`, current cost, and a Buy button; gold balance shown at the bottom; a
"Next Wave" / start button. The "Skills" sub-panel from the mockup is **hidden/disabled in MVP**.

**Game-over panel:** result (Victory/Defeat), waves survived, gold earned, Restart button.

## 8. Art plan (placeholders first)

| Element | MVP placeholder | Later |
|---------|-----------------|-------|
| Tower/Castle | Gray rectangle + colored banner | "Skyward Keep" art (img 2) |
| Hero | Small colored capsule on the tower | "Forest Archer" idle/aim/fire frames |
| Goblin / Brute / Bat / Boss | Distinct colored shapes, sized per table | Monster art (img 3) |
| Arrow | Thin line/triangle sprite | Arrow art |
| Damage number | `Label` | Styled crit/normal labels |
| Background | Flat color or single image | Parallax forest/castle scene (img 1) |

Sprite references are config-driven so swapping placeholder → final art needs **no logic change**.

## 9. Audio (deferred)

No audio required for MVP "playable". Reserve hooks (a `Sound` enum + a thin `AudioService`)
but do not block the loop on assets. Keep the existing `audio/` folder out of the build until used.

## 10. Tuning notes

- If early waves feel too easy/slow, lower `baseFireCooldown` or raise Goblin speed.
- Boss HP (1800) assumes a player who upgraded damage to ~level 6–8 by wave 10; adjust after playtest.
- All of the above maps 1:1 to fields in `GameConfig.ts`; keep the two in sync.
