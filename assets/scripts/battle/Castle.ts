/**
 * Castle.ts
 * ----------------------------------------------------------------------------
 * Runtime source of truth for the player's castle HP during a battle. Pure
 * logic — NO Cocos node dependency and NO storage dependency — so the HP/defeat
 * math is unit-testable and works identically on any platform.
 *
 * Mirrors the Wallet pattern: it holds a single number, mutates it through a
 * narrow API, and announces every change on the EventBus. It does NOT decide
 * what happens on defeat (that flow lives in BattleManager); it only reports
 * "this hit landed, here is the new HP, and whether the castle is now down".
 *
 * Max HP is upgrade-driven: BattleManager seeds it from
 * `UpgradeSystem.computeStats().castleMaxHp`, which already folds in the
 * `castleHp` upgrade level.
 * ----------------------------------------------------------------------------
 */

import { eventBus as sharedBus, EventBus, GameEvent } from '../core/EventBus';

export class Castle {
  private readonly maxHp: number;
  private hp: number;

  /**
   * @param maxHp starting and ceiling HP (already includes the castleHp upgrade).
   * @param bus   EventBus to emit CastleHpChanged on; inject a private bus in tests.
   */
  constructor(maxHp: number, private readonly bus: EventBus = sharedBus) {
    this.maxHp = Castle.sanitize(maxHp);
    this.hp = this.maxHp;
    this.emit(); // sync HUD to the full bar on boot
  }

  get currentHp(): number {
    return this.hp;
  }

  get maxHpValue(): number {
    return this.maxHp;
  }

  /** True once HP has reached 0 (defeat condition). */
  get isDestroyed(): boolean {
    return this.hp <= 0;
  }

  /**
   * Apply `amount` damage. Returns true if this hit dropped HP to 0 (or it was
   * already 0). Emits CastleHpChanged only when the value actually moves.
   */
  takeDamage(amount: number): boolean {
    if (this.hp <= 0) return true; // already destroyed; ignore further hits
    const dmg = Castle.sanitize(amount);
    if (dmg === 0) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.emit();
    return this.hp <= 0;
  }

  private emit(): void {
    this.bus.emit(GameEvent.CastleHpChanged, { hp: this.hp, maxHp: this.maxHp });
  }

  /** Clamp to a non-negative integer; treat NaN/garbage as 0. */
  private static sanitize(amount: number): number {
    if (!Number.isFinite(amount)) return 0;
    return Math.max(0, Math.floor(amount));
  }
}
