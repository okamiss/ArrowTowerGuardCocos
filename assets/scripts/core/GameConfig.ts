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

/**
 * Monster identifier. This is a closed union for typo-safety (the spawn loop
 * never hard-codes ids — it reads them from `waveMonsterRules`). To add a NEW
 * monster you extend in exactly three places, all in this file:
 *   1) add its id to this union,
 *   2) add its base stats to `GameConfig.monsters`,
 *   3) reference it from `GameConfig.levelConfigs.waveMonsterRules`.
 * No gameplay/spawning code needs to change.
 */
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

/**
 * One AUTHORED spawn entry inside a wave rule (designer-facing). Counts and
 * cadence are the *base* values; per-level growth is applied later by
 * `buildWaveSpawns()`. `spawnInterval` / `startDelay` are optional — they fall
 * back to `levelConfigs.defaultSpawnInterval` / `0`.
 */
export interface WaveMonsterSpawn {
  readonly type: MonsterId;          // which monster (must exist in GameConfig.monsters)
  readonly count: number;            // base instances of this monster in the wave
  readonly isBoss?: boolean;         // true => spawns exactly once, never count-scaled
  readonly spawnInterval?: number;   // seconds between this group's individual spawns
  readonly startDelay?: number;      // seconds after the wave begins before this group starts
}

/**
 * A rule covering a BAND of waves (`waveFrom`..`waveTo`, inclusive, 1-based
 * within a level). Every wave in the band spawns the listed monsters. This is
 * what replaces the old unlock-by-level `monsterGroups`: spawning is now driven
 * by the wave number, not the level number.
 */
export interface WaveMonsterRule {
  readonly waveFrom: number;
  readonly waveTo: number;
  readonly monsters: ReadonlyArray<WaveMonsterSpawn>;
}

/** The wave-driven spawn config for a level: how many waves + the band rules. */
export interface LevelWaveConfig {
  readonly wavesPerLevel: number;
  readonly waveMonsterRules: ReadonlyArray<WaveMonsterRule>;
}

/**
 * One RESOLVED spawn group: a monster type, how many to spawn, the level-scaled
 * stats each instance carries, and this group's own cadence. `buildWaveSpawns()`
 * produces these so the spawner stays a dumb pump (no difficulty math in
 * MonsterSpawner).
 */
export interface ResolvedSpawn {
  readonly id: MonsterId;
  readonly count: number;
  readonly hp: number;             // per-instance HP after level scaling
  readonly gold: number;           // per-instance gold after level scaling
  readonly castleDamage: number;   // per-instance castle damage after level scaling
  readonly speed: number;          // px/s
  readonly isBoss: boolean;
  readonly spawnInterval: number;  // seconds between this group's individual spawns
  readonly startDelay: number;     // seconds after the wave begins before this group starts
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
    towerMuzzle: { x: 150, y: 470 }, // archer atop the wall; where arrows launch from
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
   * Level system. The number of waves per level GROWS with the level (see
   * `getWavesPerLevel`): 5 waves early, ramping to a 10-wave cap. What spawns in
   * each NORMAL wave is driven by `waveMonsterRules` (BY WAVE NUMBER, not by
   * level). A BOSS appears only on boss levels (`isBossLevel`, every
   * `bossLevelInterval` levels) and only on that level's FINAL wave
   * (`isBossWave`) — the boss is injected by `buildWaveSpawns`, never authored
   * into `waveMonsterRules`.
   *
   * `buildLevelPlan(level)` walks waves 1..getWavesPerLevel(level) and, for each,
   * calls `buildWaveSpawns(level, wave)` which:
   *   - on a boss wave: spawns ONLY the boss (count 1), unless `bossWaveKeepsMinions`,
   *   - otherwise: looks up the wave-band rule and applies per-LEVEL growth
   *     (difficultyGrowth) to count / hp / gold / castle damage.
   *
   * To retune the wave RAMP, edit `baseWavesPerLevel` / `wavesStepLevels` /
   * `maxWavesPerLevel`. To change boss cadence, edit `bossLevelInterval`. To
   * change which monsters appear when, edit `waveMonsterRules`. The spawn loop
   * itself contains no balance numbers.
   */
  levelConfigs: {
    // --- wave-count ramp: getWavesPerLevel(L) = min(base + floor((L-1)/step), max) ---
    baseWavesPerLevel: 5,          // waves on levels 1..wavesStepLevels
    wavesStepLevels: 5,            // +1 wave every this many levels
    maxWavesPerLevel: 10,          // hard cap on waves per level

    waveInterval: 8,               // seconds between successive wave START times (time pressure)
    levelCompleteDelay: 0.5,       // grace period after the field empties before completing
    defaultSpawnInterval: 0.9,     // fallback cadence when a rule omits `spawnInterval`

    // --- boss cadence & definition ---
    bossLevelInterval: 5,          // a boss level occurs every Nth level (5, 10, 15, ...)
    bossWaveKeepsMinions: false,   // true => a boss wave ALSO spawns its normal-band monsters
    boss: {
      type: 'overlord' as MonsterId, // which monster is the boss (must exist in `monsters`)
      spawnInterval: 1.0,          // unused for a single boss, kept for symmetry
      startDelay: 2,               // seconds after the boss wave begins before the boss enters
    },

    /**
     * Per-wave spawn rules for NORMAL (non-boss) waves. A wave's monsters are
     * chosen by matching its number against `waveFrom`..`waveTo`. Bands cover
     * waves 1..maxWavesPerLevel so any reachable wave resolves:
     *   waves 1-3  -> base only,
     *   waves 4-6  -> base + mid,
     *   waves 7-10 -> base + mid + high.
     * Counts/cadence are BASE values; per-level growth is layered on at runtime.
     * Do NOT put bosses here — bosses are injected on boss waves automatically.
     */
    waveMonsterRules: [
      {
        waveFrom: 1, waveTo: 3,
        monsters: [
          { type: 'goblin', count: 5, spawnInterval: 0.8 },
        ],
      },
      {
        waveFrom: 4, waveTo: 6,
        monsters: [
          { type: 'goblin', count: 5, spawnInterval: 0.7 },
          { type: 'bat',    count: 3, spawnInterval: 1.2, startDelay: 2 },
        ],
      },
      {
        waveFrom: 7, waveTo: 10,
        monsters: [
          { type: 'goblin', count: 5, spawnInterval: 0.6 },
          { type: 'bat',    count: 3, spawnInterval: 1.0, startDelay: 1 },
          { type: 'brute',  count: 2, spawnInterval: 2.0, startDelay: 3 },
        ],
      },
    ] as ReadonlyArray<WaveMonsterRule>,
  },

  /** Difficulty growth — per-LEVEL fractions of the base values (waves within a
   *  level differ by their RULE, not by procedural per-wave scaling). Applied by
   *  `levelGrowth()`; nothing else hard-codes these curves. */
  difficultyGrowth: {
    hpGrowthPerLevel: 0.12,           // +12% normal-monster HP per level past 1
    goldGrowthPerLevel: 0.08,         // +8%  gold reward per level past 1
    countGrowthPerLevel: 0.10,        // +10% monster COUNT per level past 1 (boss excluded)
    castleDamageGrowthPerLevel: 0.05, // +5%  monster castle damage per level past 1
    bossHpGrowthPerLevel: 0.20,       // +20% boss HP per level past 1
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

/** Per-LEVEL difficulty multipliers, resolved once per level. ENCAPSULATES all
 *  growth math so `buildWaveSpawns()` stays a flat resolve loop with no inline
 *  balance numbers. Tune the curves in `GameConfig.difficultyGrowth`. */
interface LevelGrowth {
  readonly hpMul: number;          // normal-monster HP scale
  readonly goldMul: number;        // gold-reward scale
  readonly countMul: number;       // normal-monster count scale (boss excluded)
  readonly castleDamageMul: number;// monster castle-damage scale
  readonly bossHpMul: number;      // boss HP scale (separate curve)
}

function levelGrowth(level: number): LevelGrowth {
  const dg = GameConfig.difficultyGrowth;
  const past = Math.max(0, Math.floor(level) - 1); // levels grown past level 1
  return {
    hpMul: 1 + past * dg.hpGrowthPerLevel,
    goldMul: 1 + past * dg.goldGrowthPerLevel,
    countMul: 1 + past * dg.countGrowthPerLevel,
    castleDamageMul: 1 + past * dg.castleDamageGrowthPerLevel,
    bossHpMul: 1 + past * dg.bossHpGrowthPerLevel,
  };
}

/**
 * How many waves level `L` (1-based) has. Waves RAMP with the level:
 *   getWavesPerLevel(L) = min(base + floor((L-1)/step), max)
 * With the default config (base 5, step 5, max 10):
 *   levels 1-5 -> 5, 6-10 -> 6, 11-15 -> 7, 16-20 -> 8, 21-25 -> 9, 26+ -> 10.
 * This is the SINGLE source of the per-level wave count — never hard-code 10.
 */
export function getWavesPerLevel(level: number): number {
  const lc = GameConfig.levelConfigs;
  const L = Math.max(1, Math.floor(level));
  return Math.min(lc.baseWavesPerLevel + Math.floor((L - 1) / lc.wavesStepLevels), lc.maxWavesPerLevel);
}

/** True if `level` is a boss level (every `bossLevelInterval`-th: 5, 10, 15, ...). */
export function isBossLevel(level: number): boolean {
  return Math.floor(level) % GameConfig.levelConfigs.bossLevelInterval === 0;
}

/** True if (level, wave) is THE boss wave: a boss level's FINAL wave. The boss
 *  never appears anywhere else, and a non-boss level has no boss wave at all. */
export function isBossWave(level: number, wave: number): boolean {
  return isBossLevel(level) && Math.floor(wave) === getWavesPerLevel(level);
}

/**
 * The spawn rule covering NORMAL wave `wave` (1-based), or `null` if no band
 * matches. Lookup is BY WAVE NUMBER only (independent of level) — this is the
 * single place the wave -> normal-monsters mapping is resolved. Bosses are NOT
 * in these rules (see `makeBossSpawn`).
 */
export function getWaveMonsterRule(wave: number): WaveMonsterRule | null {
  const w = Math.floor(wave);
  for (const rule of GameConfig.levelConfigs.waveMonsterRules) {
    if (w >= rule.waveFrom && w <= rule.waveTo) return rule;
  }
  return null;
}

/** The level-scaled boss spawn (count forced to 1, scaled on the boss HP curve). */
function makeBossSpawn(level: number): ResolvedSpawn {
  const bc = GameConfig.levelConfigs.boss;
  const base = GameConfig.monsters[bc.type];
  const g = levelGrowth(level);
  return {
    id: bc.type,
    count: 1, // bosses are always exactly one
    hp: Math.max(1, Math.round(base.hp * g.bossHpMul)),
    gold: Math.max(1, Math.round(base.gold * g.goldMul)),
    castleDamage: Math.max(1, Math.round(base.castleDamage * g.castleDamageMul)),
    speed: base.speed,
    isBoss: true,
    spawnInterval: bc.spawnInterval,
    startDelay: Math.max(0, bc.startDelay),
  };
}

/**
 * Resolve the FINAL list of monster groups to spawn for (level, wave). This is
 * the single seam where boss logic + level scaling live — the spawner and
 * `buildLevelPlan` never do balance math.
 *
 * Boss waves take PRIORITY: on a boss wave only the boss spawns (count 1),
 * unless `bossWaveKeepsMinions` is set — then the normal band spawns too.
 * Normal waves resolve their wave-band rule and apply per-LEVEL growth
 * (count / hp / gold / castle damage). Output is ordered normal-first, boss-last.
 */
export function buildWaveSpawns(level: number, wave: number): ResolvedSpawn[] {
  const L = Math.max(1, Math.floor(level));
  const w = Math.floor(wave);
  const lc = GameConfig.levelConfigs;
  const bossWave = isBossWave(L, w);

  const out: ResolvedSpawn[] = [];

  // Normal monsters: present on every normal wave, and on a boss wave only if
  // minions are explicitly allowed.
  if (!bossWave || lc.bossWaveKeepsMinions) {
    const rule = getWaveMonsterRule(w);
    if (rule) {
      const g = levelGrowth(L);
      const def = lc.defaultSpawnInterval;
      for (const m of rule.monsters) {
        if (m.isBoss) continue; // bosses are injected below, never from rules
        const base = GameConfig.monsters[m.type];
        if (!base) continue; // unknown id (mis-typed rule): skip defensively, never crash
        out.push({
          id: m.type,
          count: Math.max(1, Math.round(m.count * g.countMul)),
          hp: Math.max(1, Math.round(base.hp * g.hpMul)),
          gold: Math.max(1, Math.round(base.gold * g.goldMul)),
          castleDamage: Math.max(1, Math.round(base.castleDamage * g.castleDamageMul)),
          speed: base.speed,
          isBoss: false,
          spawnInterval: m.spawnInterval ?? def,
          startDelay: Math.max(0, m.startDelay ?? 0),
        });
      }
    }
  }

  if (bossWave) out.push(makeBossSpawn(L)); // boss always last

  return out;
}

/**
 * Build the fully-resolved plan for `level` (1-based). Pure & Cocos-free, so it
 * is unit-testable and the spawner needs no difficulty math.
 *
 * Structure: the level has `getWavesPerLevel(level)` waves that start on a TIME
 * schedule — wave `w` begins at `(w-1) * waveInterval` seconds after the level
 * starts, regardless of whether earlier waves are cleared (the time-pressure
 * model). The level finishes only once every wave has been spawned AND the field
 * is empty (BattleManager enforces).
 *
 * WHAT spawns per wave comes entirely from `buildWaveSpawns(level, w)` — i.e.
 * normal-band rules + per-level growth, plus the boss on the boss wave. Nothing
 * here hard-codes monster types, counts, or the wave count.
 */
export function buildLevelPlan(level: number): LevelPlan {
  const L = Math.max(1, Math.floor(level));
  const lc = GameConfig.levelConfigs;
  const totalWaves = getWavesPerLevel(L);

  const waves: WavePlan[] = [];
  for (let w = 1; w <= totalWaves; w++) {
    const spawns = buildWaveSpawns(L, w);
    const count = spawns.reduce((sum, s) => sum + s.count, 0);
    const hasBoss = spawns.some((s) => s.isBoss);
    waves.push({
      wave: w,
      startTime: (w - 1) * lc.waveInterval,
      spawns,
      spawnInterval: lc.defaultSpawnInterval, // default cadence; groups carry their own
      count,
      isEliteWave: w === totalWaves,
      hasBoss,
    });
  }

  const totalCount = waves.reduce((sum, wv) => sum + wv.count, 0);
  const hasBoss = waves.some((wv) => wv.hasBoss);
  return { level: L, waves, totalWaves, hasBoss, totalCount };
}
