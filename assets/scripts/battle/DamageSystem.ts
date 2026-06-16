/**
 * DamageSystem.ts
 * ----------------------------------------------------------------------------
 * Resolves a single arrow->monster hit: rolls a crit, applies damage, and on a
 * kill awards gold (via Wallet) and announces it on the EventBus. Pure logic —
 * NO Cocos node dependency — so the crit/damage math is unit-testable and the
 * RNG can be injected.
 *
 * It does NOT detect collisions (the conductor does the distance test) and does
 * NOT recycle nodes (the conductor owns the pools). It only answers: "given this
 * hit, how much was dealt, was it a crit, and did the target die?"
 *
 * Floating damage numbers are a separate FX concern (DamageNumber pool) and are
 * deferred for this minimal demo per the task scope.
 * ----------------------------------------------------------------------------
 */

import { GameConfig } from '../core/GameConfig';
import type { MonsterId } from '../core/GameConfig';
import { Wallet } from '../economy/Wallet';
import { eventBus as sharedBus, EventBus, GameEvent } from '../core/EventBus';

/** The minimal surface DamageSystem needs from whatever it damages. */
export interface DamageTarget {
  readonly id: MonsterId;
  readonly gold: number;
  /** Apply damage; return true if this hit was lethal. */
  takeDamage(amount: number): boolean;
}

export interface HitResult {
  readonly dealt: number;
  readonly crit: boolean;
  readonly killed: boolean;
}

export class DamageSystem {
  /**
   * @param wallet         credited with the kill reward.
   * @param getCritChance  current crit chance (0..1), read live so upgrades apply.
   * @param rng            0..1 source, injectable for deterministic tests.
   * @param bus            EventBus to announce MonsterKilled on.
   */
  constructor(
    private readonly wallet: Wallet,
    private readonly getCritChance: () => number,
    private readonly rng: () => number = Math.random,
    private readonly bus: EventBus = sharedBus,
  ) {}

  /** Apply `baseDamage` to `target`, handling crit, gold, and the kill event. */
  applyHit(target: DamageTarget, baseDamage: number): HitResult {
    const crit = this.rng() < this.getCritChance();
    const dealt = crit ? Math.round(baseDamage * GameConfig.player.critMultiplier) : baseDamage;
    const killed = target.takeDamage(dealt);

    if (killed) {
      this.wallet.addGold(target.gold);
      this.bus.emit(GameEvent.MonsterKilled, { id: target.id, gold: target.gold });
    }
    return { dealt, crit, killed };
  }
}
