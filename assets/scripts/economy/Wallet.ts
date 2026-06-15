/**
 * Wallet.ts
 * ----------------------------------------------------------------------------
 * Runtime source of truth for the player's gold during a session. Pure logic —
 * NO Cocos node dependency and NO storage dependency, so it is unit-testable
 * and works identically behind LocalSaveService or a future cloud backend.
 *
 * The Wallet does not load or save anything itself. It only:
 *   - holds the current gold balance, and
 *   - emits GameEvent.GoldChanged whenever the balance changes.
 *
 * GameManager bridges it to persistence: it seeds the Wallet from PlayerSaveData
 * on load, mirrors GoldChanged back into the profile in memory, and flushes to
 * storage only at discrete save points (never per gold tick).
 * ----------------------------------------------------------------------------
 */

import { eventBus as sharedBus, EventBus, GameEvent } from '../core/EventBus';

export class Wallet {
  private gold = 0;

  /**
   * @param bus EventBus to emit GoldChanged on. Defaults to the shared
   *            singleton; pass a private bus in tests for isolation.
   */
  constructor(private readonly bus: EventBus = sharedBus) {}

  getGold(): number {
    return this.gold;
  }

  /**
   * Authoritatively set the balance (used to seed from the save on load).
   * Always emits so listeners (HUD) sync to the loaded value.
   */
  setGold(amount: number): void {
    this.gold = Wallet.sanitize(amount);
    this.emit();
  }

  /** Add gold (e.g. monster kill reward). Emits only when the balance moves. */
  addGold(amount: number): void {
    const delta = Wallet.sanitize(amount);
    if (delta === 0) return;
    this.gold += delta;
    this.emit();
  }

  /** True if the player can afford `amount`. */
  canAfford(amount: number): boolean {
    return this.gold >= Wallet.sanitize(amount);
  }

  /**
   * Spend gold if affordable. Returns true on success (balance changed), false
   * if the player can't afford it (no change, no event).
   */
  spendGold(amount: number): boolean {
    const cost = Wallet.sanitize(amount);
    if (!this.canAfford(cost)) return false;
    if (cost === 0) return true; // affordable no-op; nothing changed
    this.gold -= cost;
    this.emit();
    return true;
  }

  private emit(): void {
    this.bus.emit(GameEvent.GoldChanged, { gold: this.gold });
  }

  /** Clamp to a non-negative integer; treat NaN/garbage as 0. */
  private static sanitize(amount: number): number {
    if (!Number.isFinite(amount)) return 0;
    return Math.max(0, Math.floor(amount));
  }
}
