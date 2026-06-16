/**
 * LevelManager.ts
 * ----------------------------------------------------------------------------
 * Owns the LEVEL FLOW. Pure logic — NO Cocos node dependency and NO storage I/O
 * — so the progression is unit-testable and platform-independent.
 *
 * Responsibilities:
 *   - track the current level + its state (Idle / Fighting / Completed),
 *   - resolve the current level's plan (GameConfig.buildLevelPlan),
 *   - drive the per-level wave SCHEDULE via its WaveManager (waves start on a
 *     time schedule, not on clearing the previous wave),
 *   - expose level-completion latching and advance to the next level,
 *   - keep currentLevel / highestLevel in sync on the in-memory profile.
 *
 * It does NOT spawn monsters, count alive monsters, decide *when* the field is
 * empty, or touch any UI. BattleManager owns the alive-monster bookkeeping and
 * calls `complete()` once it has verified "all waves triggered + all spawning
 * finished + no monsters left"; BattleManager also persists the profile through
 * SaveService at the level boundary.
 * ----------------------------------------------------------------------------
 */

import { buildLevelPlan } from '../core/GameConfig';
import type { LevelPlan, WavePlan } from '../core/GameConfig';
import type { PlayerSaveData } from '../save/PlayerSaveData';
import { eventBus as sharedBus, EventBus, GameEvent } from '../core/EventBus';
import { WaveManager } from './WaveManager';

/** Lifecycle of the level currently loaded into the manager. */
export enum LevelState {
  /** Not started yet (boot, or between levels before startLevel()). */
  Idle,
  /** Waves are being scheduled / fought. */
  Fighting,
  /** All waves spawned and the field cleared. */
  Completed,
}

export class LevelManager {
  private state = LevelState.Idle;
  private plan: LevelPlan;

  /**
   * @param profile in-memory save; currentLevel / highestLevel are read & updated here.
   * @param waves   per-level wave scheduler (time-based); owned & driven here.
   * @param bus     EventBus for LevelStarted / LevelCleared; inject in tests.
   */
  constructor(
    private readonly profile: PlayerSaveData,
    private readonly waves: WaveManager,
    private readonly bus: EventBus = sharedBus,
  ) {
    this.plan = buildLevelPlan(this.profile.currentLevel);
  }

  /** The level currently being played (1-based, persisted on the profile). */
  get currentLevel(): number {
    return this.profile.currentLevel;
  }

  /** Best level ever reached (persisted on the profile). */
  get highestLevel(): number {
    return this.profile.highestLevel;
  }

  get currentState(): LevelState {
    return this.state;
  }

  /** The resolved plan for the current level. */
  get currentPlan(): LevelPlan {
    return this.plan;
  }

  get wavesPerLevel(): number {
    return this.plan.totalWaves;
  }

  /** 1-based index of the wave most recently started this level (for the HUD). */
  get currentWaveInLevel(): number {
    return this.waves.currentWave;
  }

  /** Seconds since this level started. */
  get levelElapsedTime(): number {
    return this.waves.elapsedTime;
  }

  /** True once every wave of the level has been triggered (spawning may continue). */
  get allWavesTriggered(): boolean {
    return this.waves.allTriggered;
  }

  get isCompleted(): boolean {
    return this.state === LevelState.Completed;
  }

  /**
   * Begin (or restart) the current level at wave 1. Rebuilds the plan, starts
   * the wave schedule from t=0, keeps highestLevel in sync, announces
   * LevelStarted, and returns the plan (diagnostics).
   */
  startLevel(): LevelPlan {
    this.plan = buildLevelPlan(this.profile.currentLevel);
    this.state = LevelState.Fighting;
    this.bumpHighest();
    this.waves.start(this.plan);
    this.bus.emit(GameEvent.LevelStarted, { level: this.plan.level, totalWaves: this.plan.totalWaves });
    return this.plan;
  }

  /**
   * Advance the wave schedule by `dt` and return any waves that just became due
   * (BattleManager hands these to the MonsterSpawner). No-op unless Fighting.
   */
  update(dt: number): WavePlan[] {
    if (this.state !== LevelState.Fighting) return [];
    return this.waves.update(dt);
  }

  /**
   * Latch the level as complete. The caller (BattleManager) must have verified
   * that all waves were triggered, all spawning finished, and no monsters remain.
   * Emits LevelCleared exactly once.
   */
  complete(): void {
    if (this.state !== LevelState.Fighting) return;
    this.state = LevelState.Completed;
    this.bus.emit(GameEvent.LevelCleared, { level: this.plan.level });
  }

  /**
   * Advance to the next level after the player taps "continue". Bumps
   * currentLevel + highestLevel and returns to Idle (call startLevel() to begin
   * the new level). The caller persists the profile afterward.
   */
  nextLevel(): number {
    this.profile.currentLevel += 1;
    this.state = LevelState.Idle;
    this.bumpHighest();
    return this.profile.currentLevel;
  }

  private bumpHighest(): void {
    if (this.profile.currentLevel > this.profile.highestLevel) {
      this.profile.highestLevel = this.profile.currentLevel;
    }
  }
}
