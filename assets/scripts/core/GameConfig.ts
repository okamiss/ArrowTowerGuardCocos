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

/** A combo of monster types unlocked once the player reaches `unlockLevel`. */
export interface MonsterGroup {
  readonly unlockLevel: number;            // 1-based level this combo becomes active
  readonly monsters: ReadonlyArray<MonsterId>;
}

/**
 * One resolved spawn entry: a monster type, how many to spawn, and the
 * level-scaled stats each instance should carry. `buildLevelPlan()` produces
 * these so the spawner stays a dumb pump (no difficulty math in MonsterSpawner).
 */
export interface ResolvedSpawn {
  readonly id: MonsterId;
  readonly count: number;
  readonly hp: number;             // per-instance HP after level scaling
  readonly gold: number;           // per-instance gold after level scaling
  readonly castleDamage: number;   // per-instance castle damage
  readonly speed: number;          // px/s
  readonly isBoss: boolean;
}

/**
 * One wave INSIDE a level. A level is divided into several waves that start on a
 * TIME schedule (`startTime`, seconds after the level began) — a wave does NOT
 * wait for the previous wave to be cleared, so multiple waves coexist on the
 * field. This is the unit MonsterSpawner consumes (spawns + cadence). Waves are
 * transient — they are never persisted (only the level is).
 */
export interface WavePlan {
  readonly wave: number;                         // 1-based wave within the level
  readonly startTime: number;                    // seconds after level start when this wave begins
  readonly spawns: ReadonlyArray<ResolvedSpawn>; // normal monsters first, boss last
  readonly spawnInterval: number;                // seconds between individual spawns
  readonly count: number;                        // monsters this wave will spawn
  readonly isEliteWave: boolean;                 // tougher final wave of every level
  readonly hasBoss: boolean;                     // boss appears in this wave
}

/** The fully-resolved plan for a single level: an ordered list of waves. */
export interface LevelPlan {
  readonly level: number;                  // 1-based level number
  readonly waves: ReadonlyArray<WavePlan>; // played in order; clear all to finish the level
  readonly totalWaves: number;
  readonly hasBoss: boolean;               // true if a boss appears (in the final wave)
  readonly totalCount: number;             // monsters across all waves (diagnostics)
}

export interface UpgradeConfig {
  readonly id: UpgradeId;
  readonly name: string;
  readonly baseCost: number;
  readonly growth: number;         // cost(level) = floor(baseCost * growth^level)
  /**
   * Effect magnitude per level — UNITS DIFFER per upgrade (see UpgradeSystem):
   *   damage      -> +flat arrow damage per level
   *   attackSpeed -> -ms shaved off the attack interval per level
   *   crit        -> +crit rate (fraction 0..1) per level
   *   castleHp    -> +max castle HP per level
   */
  readonly perLevel: number;
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

  /**
   * Base player/tower stats (before upgrades). The permanent-upgrade system
   * (UpgradeSystem) derives the live battle attributes from these + the upgrade
   * levels; nothing else hard-codes these numbers.
   *
   * Attack speed is modeled as an attack INTERVAL in milliseconds (designer-
   * friendly), reduced linearly per attackSpeed level down to a hard floor.
   * `*FireCooldown` are the SECONDS mirrors the runtime archer consumes
   * (interval_ms / 1000); keep them in sync with the *AttackIntervalMs values.
   */
  player: {
    baseDamage: 10,                // arrow damage at level 0
    baseAttackIntervalMs: 500,     // ms between shots at level 0
    minAttackIntervalMs: 180,      // fastest allowed interval (attack-speed cap)
    baseFireCooldown: 0.50,        // seconds mirror of baseAttackIntervalMs
    minFireCooldown: 0.18,         // seconds mirror of minAttackIntervalMs (ArcherController floor)
    baseCritRate: 0,               // crit chance (0..1) at level 0
    critChanceCap: 0.50,           // max crit chance (crit cap)
    critMultiplier: 2.0,           // crit damage multiplier (DamageSystem)
    baseCastleHp: 1000,            // castle max HP at level 0
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

  /**
   * Level system (replaces the old fixed 10-wave table). Levels are generated
   * procedurally from these knobs by `buildLevelPlan(level)`:
   *   - which monster combo is active (monsterGroups, by unlockLevel),
   *   - how many monsters / how fast they spawn (base + difficultyGrowth),
   *   - whether a boss appears (every `bossInterval` levels).
   * The run is endless; there is no victory cap.
   */
  levelConfigs: {
    wavesPerLevel: 10,             // every level has exactly 10 waves
    waveInterval: 8,               // seconds between successive wave START times
    levelCompleteDelay: 0.5,       // grace period after the field empties before completing
    baseMonstersPerWave: 3,        // normal monsters per wave on level 1, wave 1
    baseSpawnInterval: 1.10,       // seconds between individual spawns on level 1
    minSpawnInterval: 0.55,        // floor as levels speed up
    spawnIntervalDecayPerLevel: 0.015,
    eliteHpMultiplier: 1.5,        // HP bump for the elite final wave (non-boss levels)
    bossInterval: 10,              // a boss appears on every Nth level (in its final wave)
    /**
     * Monster combos by unlock level (the highest unlockLevel ≤ the current
     * level wins). Drives "1-4 base only / 5 new combo / 15 stronger combo".
     */
    monsterGroups: [
      { unlockLevel: 1,  monsters: ['goblin'] },
      { unlockLevel: 5,  monsters: ['goblin', 'bat'] },
      { unlockLevel: 15, monsters: ['goblin', 'bat', 'brute'] },
    ] as ReadonlyArray<MonsterGroup>,
  },

  /** Boss tuning. A boss (the `overlord` monster) appears every bossInterval
   *  levels; these base stats are scaled by level in `buildLevelPlan`. */
  bossConfigs: {
    id: 'overlord' as MonsterId,
    baseHp: 1800,
    baseGold: 250,
    baseCastleDamage: 60,
    baseSpeed: 25,
  },

  /** Difficulty growth (linear fractions of the base values). Per-level scales
   *  across levels; per-wave scales across the 10 waves within a level so later
   *  waves pile on more pressure. */
  difficultyGrowth: {
    hpGrowthPerLevel: 0.12,        // +12% monster HP per level past level 1
    hpGrowthPerWave: 0.04,         // +4% monster HP per wave within a level
    countGrowthPerLevel: 0.4,      // +0.4 monsters/wave per level (rounded)
    countGrowthPerWave: 0.25,      // +0.25 monsters per wave within a level (rounded)
    goldGrowthPerLevel: 0.08,      // +8% gold reward per level past level 1
    bossHpGrowthPerLevel: 0.25,    // +25% boss HP per boss tier (per 10 levels)
  },

  /**
   * Permanent (out-of-battle) upgrades, bought on the main menu and applied at
   * battle start. `cost(level) = floor(baseCost * growth^level)`; the effect is
   * `perLevel` (units per UpgradeConfig). Caps are derived, not stored here:
   * attackSpeed is capped by `player.minAttackIntervalMs`, crit by
   * `player.critChanceCap`; damage and castleHp are uncapped. Names are the
   * display strings shown by both upgrade panels.
   */
  upgrades: {
    damage:      { id: 'damage',      name: '箭矢伤害', baseCost: 100, growth: 1.35, perLevel: 5 },
    attackSpeed: { id: 'attackSpeed', name: '攻击速度', baseCost: 120, growth: 1.35, perLevel: 35 },
    crit:        { id: 'crit',        name: '暴击率',   baseCost: 150, growth: 1.35, perLevel: 0.01 },
    castleHp:    { id: 'castleHp',    name: '城墙血量', baseCost: 100, growth: 1.35, perLevel: 100 },
  } as Record<UpgradeId, UpgradeConfig>,

  /** Scene names as authored in the Cocos editor. SINGLE SOURCE OF TRUTH for
   *  director.loadScene targets — never hard-code scene name strings elsewhere.
   *  `battle` is the existing scene asset (assets/scene.scene, _name "scene");
   *  `main` is the new MainScene the editor must contain (see README/manual
   *  setup). Keep these in sync with the actual .scene asset names. */
  scenes: {
    main: 'MainScene',
    battle: 'scene',
  },

  /** Save layer. */
  save: {
    storageKey: 'arrowtowerguard.save',
    version: 3,
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

/** Cost to buy the NEXT level (i.e. to go from `level` -> `level+1`).
 *  `floor(baseCost * growth^level)` — e.g. damage L0->L1 = 100, castleHp L2->L3
 *  = floor(100 * 1.35^2) = 182. */
export function upgradeCost(id: UpgradeId, level: number): number {
  const c = GameConfig.upgrades[id];
  return Math.floor(c.baseCost * Math.pow(c.growth, level));
}

/** The monster combo active at `level` (highest unlockLevel ≤ level). */
function activeMonsterGroup(level: number): ReadonlyArray<MonsterId> {
  const groups = GameConfig.levelConfigs.monsterGroups;
  let active = groups[0].monsters;
  for (const g of groups) {
    if (level >= g.unlockLevel) active = g.monsters;
  }
  return active;
}

/** Distribute `total` monsters across `group`, weaker types first; level-scaled. */
function distributeWave(
  group: ReadonlyArray<MonsterId>,
  total: number,
  hpMul: number,
  goldMul: number,
): ResolvedSpawn[] {
  const per = Math.floor(total / group.length);
  let remainder = total - per * group.length;

  const out: ResolvedSpawn[] = [];
  for (const id of group) {
    const count = per + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    if (count <= 0) continue;
    const base = GameConfig.monsters[id];
    out.push({
      id,
      count,
      hp: Math.max(1, Math.round(base.hp * hpMul)),
      gold: Math.max(1, Math.round(base.gold * goldMul)),
      castleDamage: base.castleDamage,
      speed: base.speed,
      isBoss: false,
    });
  }
  return out;
}

/** The boss spawn for level `L`, scaled by the level HP curve and the boss tier. */
function makeBossSpawn(L: number, hpMul: number, goldMul: number): ResolvedSpawn {
  const bc = GameConfig.bossConfigs;
  const dg = GameConfig.difficultyGrowth;
  const bossTier = Math.floor(L / GameConfig.levelConfigs.bossInterval); // 1 at L=10, 2 at L=20
  const bossHp = Math.round(bc.baseHp * hpMul * (1 + dg.bossHpGrowthPerLevel * (bossTier - 1)));
  return {
    id: bc.id,
    count: 1,
    hp: Math.max(1, bossHp),
    gold: Math.round(bc.baseGold * goldMul),
    castleDamage: bc.baseCastleDamage,
    speed: bc.baseSpeed,
    isBoss: true,
  };
}

/**
 * Build the fully-resolved plan for `level` (1-based). Pure & Cocos-free, so it
 * is unit-testable and the spawner needs no difficulty math.
 *
 * Structure: a level has `wavesPerLevel` waves that start on a TIME schedule —
 * wave `w` begins at `(w-1) * waveInterval` seconds after the level starts,
 * regardless of whether earlier waves are cleared. The level finishes only once
 * every wave has been spawned AND the field is empty (BattleManager enforces).
 *
 * Difficulty rules:
 *   - monster HP / count grow both per level and per wave (later waves harder),
 *   - levels 1-4 spawn only the base combo; level 5 unlocks a new combo;
 *     level 15 unlocks a stronger combo,
 *   - the final wave of every level is an "elite" wave (tougher); on every
 *     `bossInterval`-th level (10, 20, ...) the final wave is a BOSS wave.
 */
export function buildLevelPlan(level: number): LevelPlan {
  const L = Math.max(1, Math.floor(level));
  const lc = GameConfig.levelConfigs;
  const dg = GameConfig.difficultyGrowth;

  const goldMul = 1 + (L - 1) * dg.goldGrowthPerLevel;
  const spawnInterval = Math.max(lc.minSpawnInterval, lc.baseSpawnInterval - (L - 1) * lc.spawnIntervalDecayPerLevel);
  const group = activeMonsterGroup(L);
  const totalWaves = lc.wavesPerLevel;
  const levelHasBoss = L % lc.bossInterval === 0;

  const waves: WavePlan[] = [];
  for (let w = 1; w <= totalWaves; w++) {
    const isEliteWave = w === totalWaves;
    const isBossWave = isEliteWave && levelHasBoss;

    // HP / count scale with both the level and the wave (later waves pile on).
    const waveHpMul = 1 + (L - 1) * dg.hpGrowthPerLevel + (w - 1) * dg.hpGrowthPerWave;
    const hpMul = isEliteWave && !isBossWave ? waveHpMul * lc.eliteHpMultiplier : waveHpMul;
    const perWave = Math.max(
      1,
      Math.round(lc.baseMonstersPerWave + (L - 1) * dg.countGrowthPerLevel + (w - 1) * dg.countGrowthPerWave),
    );

    const spawns = distributeWave(group, perWave, hpMul, goldMul);
    if (isBossWave) spawns.push(makeBossSpawn(L, waveHpMul, goldMul));

    const count = spawns.reduce((sum, s) => sum + s.count, 0);
    waves.push({
      wave: w,
      startTime: (w - 1) * lc.waveInterval,
      spawns,
      spawnInterval,
      count,
      isEliteWave,
      hasBoss: isBossWave,
    });
  }

  const totalCount = waves.reduce((sum, wv) => sum + wv.count, 0);
  return { level: L, waves, totalWaves, hasBoss: levelHasBoss, totalCount };
}
