/**
 * ArcherController.ts
 * ----------------------------------------------------------------------------
 * The hero on the tower. Owns the fire cooldown and turns a tapped point into a
 * launched arrow pulled from the ArrowPool. Plain class (no Cocos node) so the
 * cooldown gating is testable; it depends only on the pool and a stats getter.
 *
 * Cooldown gating: taps during cooldown are ignored (no queued arrows), matching
 * DESIGN §3. Damage and cooldown come live from the upgrade-derived PlayerStats,
 * so buying upgrades changes behavior with no code change here. All hard limits
 * (min cooldown, arrow speed/lifetime) come from GameConfig.
 * ----------------------------------------------------------------------------
 */

import { Vec3 } from 'cc';
import { ArrowPool } from '../projectile/ArrowPool';
import type { Arrow } from '../projectile/Arrow';
import { GameConfig } from '../core/GameConfig';

/** The slice of PlayerStats the archer consumes. */
export interface ArcherStats {
  readonly damage: number;
  readonly fireCooldown: number;
}

export class ArcherController {
  private cooldownRemaining = 0;
  private readonly muzzle = new Vec3();

  /**
   * @param arrowPool source of recycled arrows.
   * @param getStats  live upgrade-derived stats (damage + fire cooldown).
   * @param muzzleX,muzzleY launch origin in the battle layer's local space.
   */
  constructor(
    private readonly arrowPool: ArrowPool,
    private readonly getStats: () => ArcherStats,
    muzzleX: number,
    muzzleY: number,
  ) {
    this.muzzle.set(muzzleX, muzzleY, 0);
  }

  /** Tick down the fire cooldown. */
  tick(dt: number): void {
    if (this.cooldownRemaining > 0) this.cooldownRemaining -= dt;
  }

  /** True if a shot would fire right now. */
  get ready(): boolean {
    return this.cooldownRemaining <= 0;
  }

  /**
   * Fire toward `target` if off cooldown. Returns the launched Arrow, or null if
   * the tap was within the cooldown window (ignored, no queueing).
   */
  tryFire(target: Vec3): Arrow | null {
    if (this.cooldownRemaining > 0) return null;

    const stats = this.getStats();
    const arrow = this.arrowPool.get();
    arrow.launch(this.muzzle, target, stats.damage);

    this.cooldownRemaining = Math.max(GameConfig.player.minFireCooldown, stats.fireCooldown);
    return arrow;
  }
}
