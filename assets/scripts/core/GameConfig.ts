/**
 * GameConfig.ts
 * ----------------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for every tunable number in the game.
 * Mirrors DESIGN.md — keep the two in sync. No gameplay code may hard-code
 * numbers; read them from here instead.
 *
 * This module has NO Cocos ('cc') dependency on purpose, so it can be imported
 * anywhere (including plain unit tests).
 * ----------------------------------------------------------------------------
 */

// ----- Types ---------------------------------------------------------------

export type MonsterId = 'goblin' | 'bat' | 'brute' | 'overlord';
export type UpgradeId = 'damage' | 'attackSpeed' | 'crit' | 'castleHp';
export type Lane = 'ground' | 'air';

export interface MonsterConfig {
  readonly id: MonsterId;
  readonly name: string;
  readonly hp: number;
  readonly speed: number;          // px/s, moving left
  readonly castleDamage: number;   // damage dealt to the castle on contact
  readonly gold: number;           // gold dropped on death
  readonly lane: Lane;
  readonly color: string;          // placeholder-art fill color (hex)
  readonly radius: number;         // hitbox radius (px) for collision tests
  readonly isBoss?: boolean;
}

export interface WaveSpawn {
  readonly monster: MonsterId;
  readonly count: number;
}

export interface WaveConfig {
  readonly index: number;          // 1-based wave number
  readonly spawns: ReadonlyArray<WaveSpawn>;
  readonly spawnInterval: number;  // seconds between individual spawns
}

export interface UpgradeConfig {
  readonly id: UpgradeId;
  readonly name: string;
  readonly baseCost: number;
  readonly growth: number;         // cost(level) = ceil(baseCost * growth^level)
  readonly maxLevel: number;
  readonly perLevel: number;       // meaning is upgrade-specific (see DESIGN.md)
}

// ----- Config --------------------------------------------------------------

export const GameConfig = {
  /** Design-time canvas / world layout (px). */
  layout: {
    designWidth: 1280,
    designHeight: 720,
    spawnX: 1340,        // monsters appear just off the right edge
    castleHitX: 200,     // x where a monster "reaches" the castle
    groundY: 160,        // ground-lane Y
    airY: 320,           // air-lane Y (flyers)
    towerMuzzle: { x: 180, y: 260 }, // where arrows launch from
  },

  /** Base player/tower stats (before upgrades). */
  player: {
    baseDamage: 10,
    baseFireCooldown: 0.40,   // seconds between shots at level 0
    minFireCooldown: 0.10,    // hard floor regardless of upgrades
    cooldownFactor: 0.96,     // fireCooldown *= cooldownFactor ^ attackSpeedLevel
    baseCritChance: 0.05,
    critChanceCap: 0.60,
    critMultiplier: 2.0,
    baseCastleHp: 200,
  },

  /** Projectile behavior. */
  arrow: {
    speed: 900,      // px/s, straight line toward the tapped point
    lifetime: 2.0,   // seconds before an un-hit arrow is recycled
    pierce: false,   // MVP: single-target
    radius: 8,       // collision radius (px) of the arrow tip vs monster center
    cullMargin: 60,  // px beyond the screen edge before an un-hit arrow is recycled
    spriteWidth: 44, // on-screen arrow sprite size (px); art points right at angle 0
    spriteHeight: 16,
  },

  /** Melee combat once a monster reaches the castle. */
  combat: {
    /** Seconds between successive hits from a monster stopped at the castle.
     *  The per-hit damage is each monster's `castleDamage` (see `monsters`). */
    castleAttackInterval: 1.0,
  },

  /** Object-pool prewarm sizes (perf infra, not balance). */
  pool: {
    arrowPrewarm: 16,
    monsterPrewarm: 12,
  },

  /** Monster definitions, keyed by id. */
  monsters: {
    goblin: {
      id: 'goblin', name: 'Goblin Scout',
      hp: 30, speed: 70, castleDamage: 8, gold: 5,
      lane: 'ground', color: '#6fae54', radius: 26,
    },
    bat: {
      id: 'bat', name: 'Bat Demon',
      hp: 45, speed: 95, castleDamage: 12, gold: 8,
      lane: 'air', color: '#7a4fb0', radius: 24,
    },
    brute: {
      id: 'brute', name: 'Armored Brute',
      hp: 140, speed: 35, castleDamage: 25, gold: 18,
      lane: 'ground', color: '#8a5a2b', radius: 40,
    },
    overlord: {
      id: 'overlord', name: 'Warborn Overlord',
      hp: 1800, speed: 25, castleDamage: 60, gold: 250,
      lane: 'ground', color: '#b03030', radius: 60, isBoss: true,
    },
  } as Record<MonsterId, MonsterConfig>,

  /** 10-wave progression (see DESIGN.md §5). */
  waves: [
    { index: 1,  spawnInterval: 1.20, spawns: [{ monster: 'goblin', count: 5 }] },
    { index: 2,  spawnInterval: 1.10, spawns: [{ monster: 'goblin', count: 7 }] },
    { index: 3,  spawnInterval: 1.00, spawns: [{ monster: 'goblin', count: 6 }, { monster: 'bat', count: 2 }] },
    { index: 4,  spawnInterval: 0.95, spawns: [{ monster: 'goblin', count: 6 }, { monster: 'bat', count: 4 }] },
    { index: 5,  spawnInterval: 1.10, spawns: [{ monster: 'goblin', count: 4 }, { monster: 'brute', count: 3 }] },
    { index: 6,  spawnInterval: 0.90, spawns: [{ monster: 'goblin', count: 6 }, { monster: 'bat', count: 4 }, { monster: 'brute', count: 1 }] },
    { index: 7,  spawnInterval: 0.85, spawns: [{ monster: 'goblin', count: 8 }, { monster: 'bat', count: 5 }] },
    { index: 8,  spawnInterval: 0.90, spawns: [{ monster: 'brute', count: 4 }, { monster: 'bat', count: 5 }] },
    { index: 9,  spawnInterval: 0.80, spawns: [{ monster: 'goblin', count: 10 }, { monster: 'bat', count: 6 }, { monster: 'brute', count: 3 }] },
    { index: 10, spawnInterval: 1.50, spawns: [{ monster: 'overlord', count: 1 }, { monster: 'brute', count: 4 }] },
  ] as ReadonlyArray<WaveConfig>,

  /** Permanent upgrades (see DESIGN.md §6). `perLevel` meaning:
   *   damage      -> +flat damage per level
   *   attackSpeed -> unused (cooldown uses player.cooldownFactor); kept for UI display
   *   crit        -> +crit chance (fraction) per level
   *   castleHp    -> +max HP per level
   */
  upgrades: {
    damage:      { id: 'damage',      name: 'Damage',       baseCost: 50, growth: 1.18, maxLevel: 50, perLevel: 5 },
    attackSpeed: { id: 'attackSpeed', name: 'Attack Speed', baseCost: 60, growth: 1.20, maxLevel: 50, perLevel: 0.04 },
    crit:        { id: 'crit',        name: 'Crit Chance',  baseCost: 75, growth: 1.22, maxLevel: 50, perLevel: 0.015 },
    castleHp:    { id: 'castleHp',    name: 'Castle HP',    baseCost: 80, growth: 1.16, maxLevel: 50, perLevel: 40 },
  } as Record<UpgradeId, UpgradeConfig>,

  /** Save layer. */
  save: {
    storageKey: 'arrowtowerguard.save',
    version: 1,
    /** Default persistence backend; SaveServiceFactory reads this. */
    backend: 'local' as 'local' | 'cloud',
    /** Coalesce window (s): gold-earning kills are flushed to storage at most
     *  this often, never on every per-frame tick. */
    debounceSec: 1.0,
  },

  /** Misc placeholder-art colors. SINGLE SOURCE OF TRUTH for fallback tints —
   *  AssetConfig.ts references these; do not hard-code colors elsewhere. */
  colors: {
    background: '#3a4a2e',
    ground: '#2c3a22',
    castle: '#7d7d85',
    tower: '#9a9aa2',
    hero: '#d8c45a',
    arrow: '#e8e0c0',
    spawnZone: '#b03030',
    button: '#4a5a3a',
    damageNormal: '#ffffff',
    damageCrit: '#ffd23f',
  },
} as const;

// ----- Derived helpers (pure) ----------------------------------------------

/** Cost to buy the NEXT level (i.e. to go from `level` -> `level+1`). */
export function upgradeCost(id: UpgradeId, level: number): number {
  const c = GameConfig.upgrades[id];
  return Math.ceil(c.baseCost * Math.pow(c.growth, level));
}

/** Total number of waves in the MVP run. */
export const TOTAL_WAVES = GameConfig.waves.length;
