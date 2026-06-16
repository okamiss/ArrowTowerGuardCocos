/**
 * AssetConfig.ts
 * ----------------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for every art-asset path. Gameplay code must NEVER
 * hard-code an image path — it imports a SpriteAsset from here instead.
 *
 * This module has NO Cocos ('cc') dependency on purpose (like GameConfig), so it
 * stays trivially testable and importable anywhere.
 *
 * `path` is relative to the Cocos `resources` root (assets/resources/) and has
 * NO file extension. A PNG dropped at:
 *     assets/resources/art/tower/castle.png
 * is referenced as path `art/tower/castle` and loaded by AssetLoader via
 * `resources.load('art/tower/castle/spriteFrame', SpriteFrame)`.
 *
 * `fallbackColor` is the placeholder tint shown until a real SpriteFrame exists.
 * Colors are NOT defined here — they are referenced from GameConfig.colors /
 * GameConfig.monsters so there is one source of truth for tints.
 * ----------------------------------------------------------------------------
 */

import { GameConfig } from '../core/GameConfig';
import type { MonsterId } from '../core/GameConfig';

export interface SpriteAsset {
  /** Path under assets/resources/ (no extension), e.g. 'art/tower/castle'. */
  readonly path: string;
  /** Placeholder fill color (hex) used until a real SpriteFrame is present. */
  readonly fallbackColor: string;
  /** Placeholder alpha 0-255 (default 255). */
  readonly alpha?: number;
}

const C = GameConfig.colors;
const M = GameConfig.monsters;

export const AssetConfig = {
  background: {
    field:  { path: 'art/background/field',  fallbackColor: C.background },
    ground: { path: 'art/background/ground', fallbackColor: C.ground },
  },
  tower: {
    castle: { path: 'art/tower/castle', fallbackColor: C.castle },
    tower:  { path: 'art/tower/tower',  fallbackColor: C.tower },
    archer: { path: 'art/tower/archer', fallbackColor: C.hero },
    arrow:  { path: 'art/tower/arrow',  fallbackColor: C.arrow },
  },
  enemy: {
    goblin:   { path: 'art/enemy/goblin',   fallbackColor: M.goblin.color },
    bat:      { path: 'art/enemy/bat',      fallbackColor: M.bat.color },
    brute:    { path: 'art/enemy/brute',    fallbackColor: M.brute.color },
    overlord: { path: 'art/enemy/overlord', fallbackColor: M.overlord.color },
  },
  ui: {
    // Back-compat: existing code references `ui.button`. The bare `art/ui/button`
    // PNG no longer exists, so this now points at the normal-state button art.
    // Prefer `buttonNormal` / `buttonPressed` in new code.
    button:        { path: 'art/ui/button_normal',  fallbackColor: C.button },
    buttonNormal:  { path: 'art/ui/button_normal',  fallbackColor: C.button },
    buttonPressed: { path: 'art/ui/button_pressed',  fallbackColor: C.button },
    iconCoin:      { path: 'art/ui/icon_coin',       fallbackColor: C.damageCrit },
    spawnZone:     { path: 'art/ui/spawn_zone',      fallbackColor: C.spawnZone, alpha: 46 },
  },
  effects: {
    hit: { path: 'art/effects/hit', fallbackColor: C.damageCrit },
  },
} as const;

/** Resolve the SpriteAsset for a monster by id (keeps callers off the map). */
export function enemyAsset(id: MonsterId): SpriteAsset {
  return AssetConfig.enemy[id];
}

// ----- Key types (derived from AssetConfig; stay in sync automatically) -----

/** Top-level asset groups: 'background' | 'tower' | 'enemy' | 'ui' | 'effects'. */
export type AssetGroup = keyof typeof AssetConfig;

/** Asset ids within each group. */
export type BackgroundAssetId = keyof typeof AssetConfig.background;
export type TowerAssetId = keyof typeof AssetConfig.tower;
export type EnemyAssetId = keyof typeof AssetConfig.enemy;
export type UiAssetId = keyof typeof AssetConfig.ui;
export type EffectAssetId = keyof typeof AssetConfig.effects;
