/**
 * WaveManager.ts
 * ----------------------------------------------------------------------------
 * Schedules the waves of ONE level by TIME. Pure logic — NO Cocos node
 * dependency and NO storage — so it is unit-testable.
 *
 * It does not spawn monsters, decide level completion, advance the level, or
 * touch any UI. Its only job: track elapsed time and report which waves have
 * become "due" (their `startTime` has passed) so the caller can spawn them. A
 * wave is triggered purely on its schedule — it does NOT wait for the previous
 * wave to be cleared, so several waves can be live at once.
 *
 * Owned and driven by LevelManager; BattleManager spawns the waves it returns.
 * ----------------------------------------------------------------------------
 */

import type { LevelPlan, WavePlan } from '../core/GameConfig';

export class WaveManager {
  private elapsed = 0;
  private triggered = 0; // number of waves whose startTime has elapsed
  private waves: ReadonlyArray<WavePlan> = [];

  /** Begin scheduling the waves of `plan` from t = 0. */
  start(plan: LevelPlan): void {
    this.waves = plan.waves;
    this.elapsed = 0;
    this.triggered = 0;
  }

  /**
   * Advance the clock by `dt` and return any waves whose `startTime` has now
   * elapsed (usually 0 or 1 per tick). Waves are returned in order, each exactly
   * once. The caller hands them to the MonsterSpawner.
   */
  update(dt: number): WavePlan[] {
    this.elapsed += dt;
    const due: WavePlan[] = [];
    while (this.triggered < this.waves.length && this.waves[this.triggered].startTime <= this.elapsed) {
      due.push(this.waves[this.triggered]);
      this.triggered += 1;
    }
    return due;
  }

  /** Seconds since the level started. */
  get elapsedTime(): number {
    return this.elapsed;
  }

  /** 1-based index of the most recently triggered wave (1 before any trigger). */
  get currentWave(): number {
    return Math.max(1, this.triggered);
  }

  /** Number of waves triggered so far. */
  get triggeredCount(): number {
    return this.triggered;
  }

  get totalWaves(): number {
    return this.waves.length;
  }

  /** True once every wave of the level has been triggered (spawning may still run). */
  get allTriggered(): boolean {
    return this.waves.length > 0 && this.triggered >= this.waves.length;
  }
}
