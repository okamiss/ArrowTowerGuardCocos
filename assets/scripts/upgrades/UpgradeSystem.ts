/**
 * UpgradeSystem.ts
 * ----------------------------------------------------------------------------
 * Pure progression logic for the PERMANENT (out-of-battle) upgrades — no Cocos
 * nodes, no storage I/O. This is the SINGLE place that turns upgrade levels into
 * costs and into the live combat attributes; neither the UI nor the battle code
 * may re-derive these numbers (they read them from here / GameConfig).
 *
 * It reads/writes levels + gold on the save profile passed in, but never touches
 * storage directly — the caller (MainMenuManager / BattleManager) persists the
 * profile through SaveService after a successful `upgrade()`.
 *
 * Two purchase paths share this class:
 *   - `upgrade(type)`  : main-menu flow. Deducts gold from the profile balance.
 *   - `purchase(id)`   : in-battle flow. Only bumps the level; BattleManager
 *                        deducts gold from its live Wallet. (Kept for the
 *                        between-level UpgradePanel — do not remove.)
 *
 * Effect model (all numbers from GameConfig, never inline):
 *   arrowDamage      = baseDamage      + damageLevel      * damage.perLevel
 *   attackIntervalMs = max(minMs, baseMs - attackSpeedLevel * attackSpeed.perLevel)
 *   critRate         = min(cap, baseCritRate + critLevel  * crit.perLevel)
 *   castleMaxHp      = baseCastleHp    + castleHpLevel    * castleHp.perLevel
 *
 * Caps: attackSpeed by player.minAttackIntervalMs, crit by player.critChanceCap;
 * damage and castleHp are uncapped.
 * ----------------------------------------------------------------------------
 */

import { GameConfig, upgradeCost } from '../core/GameConfig';
import type { UpgradeId } from '../core/GameConfig';
import type { PlayerSaveData } from '../save/PlayerSaveData';
import { UPGRADE_LEVEL_KEY } from '../save/PlayerSaveData';

/**
 * Enum mirror of UpgradeId for callers that prefer named members. Its string
 * values are exactly the UpgradeId union, so the two are interchangeable.
 */
export enum UpgradeType {
  Damage = 'damage',
  AttackSpeed = 'attackSpeed',
  Crit = 'crit',
  CastleHp = 'castleHp',
}

/** The fully-resolved combat attributes BattleScene applies at start. */
export interface BattleAttributes {
  arrowDamage: number;
  attackIntervalMs: number;
  critRate: number;            // 0..1
  critDamageMultiplier: number;
  castleMaxHp: number;
}

/** Legacy derived-stats shape consumed by ArcherController / Castle / DamageSystem
 *  (fire cooldown in SECONDS). Kept so the battle wiring is unchanged. */
export interface PlayerStats {
  damage: number;
  fireCooldown: number;        // seconds (== attackIntervalMs / 1000)
  critChance: number;          // 0..1
  castleMaxHp: number;
}

export class UpgradeSystem {
  constructor(private readonly profile: PlayerSaveData) {}

  // --- levels ---------------------------------------------------------------

  getLevel(id: UpgradeId): number {
    return this.profile.upgrades[UPGRADE_LEVEL_KEY[id]];
  }

  /** True once an upgrade has hit its (derived) cap. Damage/castleHp never cap. */
  isMaxed(id: UpgradeId): boolean {
    const level = this.getLevel(id);
    switch (id) {
      case 'attackSpeed':
        return this.getAttackIntervalMs(level) <= GameConfig.player.minAttackIntervalMs;
      case 'crit':
        return this.getCritRate(level) >= GameConfig.player.critChanceCap;
      default:
        return false;
    }
  }

  // --- costs ----------------------------------------------------------------

  /** Cost to go from `level` to `level+1` for `type`. */
  getUpgradeCost(type: UpgradeId, level: number): number {
    return upgradeCost(type, level);
  }

  /** Cost of the NEXT level for the current state, or null if maxed. */
  getNextCost(id: UpgradeId): number | null {
    if (this.isMaxed(id)) return null;
    return upgradeCost(id, this.getLevel(id));
  }

  /** Can `gold` afford the next level of `id`? (false if maxed) */
  canAfford(id: UpgradeId, gold: number): boolean {
    const cost = this.getNextCost(id);
    return cost !== null && gold >= cost;
  }

  /** Main-menu check: not maxed AND the profile's gold covers the next level. */
  canUpgrade(type: UpgradeId): boolean {
    return this.canAfford(type, this.profile.gold);
  }

  // --- purchasing -----------------------------------------------------------

  /**
   * Main-menu purchase: deduct gold from the PROFILE balance and bump the level.
   * Returns true on success, false if maxed or unaffordable. Does NOT persist —
   * the caller saves the profile through SaveService.
   */
  upgrade(type: UpgradeId): boolean {
    const cost = this.getNextCost(type);
    if (cost === null || this.profile.gold < cost) return false;
    this.profile.gold -= cost;
    this.profile.upgrades[UPGRADE_LEVEL_KEY[type]] += 1;
    return true;
  }

  /**
   * In-battle purchase: increment the level only (the caller deducts gold from
   * its live Wallet). Returns the spent cost, or null if maxed.
   */
  purchase(id: UpgradeId): number | null {
    const cost = this.getNextCost(id);
    if (cost === null) return null;
    this.profile.upgrades[UPGRADE_LEVEL_KEY[id]] += 1;
    return cost;
  }

  // --- effect curves (pure; valid for any level, not just the current one) ---

  /** Total arrow damage at `level`. */
  getDamageBonus(level: number): number {
    return GameConfig.player.baseDamage + GameConfig.upgrades.damage.perLevel * level;
  }

  /** Attack interval (ms) at `level`, clamped to the floor. */
  getAttackIntervalMs(level: number): number {
    const ms = GameConfig.player.baseAttackIntervalMs - GameConfig.upgrades.attackSpeed.perLevel * level;
    return Math.max(GameConfig.player.minAttackIntervalMs, ms);
  }

  /** Crit rate (0..1) at `level`, clamped to the cap. */
  getCritRate(level: number): number {
    const r = GameConfig.player.baseCritRate + GameConfig.upgrades.crit.perLevel * level;
    return Math.min(GameConfig.player.critChanceCap, r);
  }

  /** Max castle HP at `level`. */
  getCastleMaxHp(level: number): number {
    return GameConfig.player.baseCastleHp + GameConfig.upgrades.castleHp.perLevel * level;
  }

  // --- resolved attributes --------------------------------------------------

  /** The combat attributes for the CURRENT levels (what BattleScene applies). */
  getBattleAttributes(): BattleAttributes {
    return {
      arrowDamage: this.getDamageBonus(this.getLevel('damage')),
      attackIntervalMs: this.getAttackIntervalMs(this.getLevel('attackSpeed')),
      critRate: this.getCritRate(this.getLevel('crit')),
      critDamageMultiplier: GameConfig.player.critMultiplier,
      castleMaxHp: this.getCastleMaxHp(this.getLevel('castleHp')),
    };
  }

  /** Same as getBattleAttributes, mapped to the seconds-based PlayerStats the
   *  existing ArcherController / Castle / DamageSystem already consume. */
  computeStats(): PlayerStats {
    const a = this.getBattleAttributes();
    return {
      damage: a.arrowDamage,
      fireCooldown: a.attackIntervalMs / 1000,
      critChance: a.critRate,
      castleMaxHp: a.castleMaxHp,
    };
  }
}
