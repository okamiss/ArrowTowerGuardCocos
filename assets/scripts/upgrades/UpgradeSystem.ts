/**
 * UpgradeSystem.ts
 * ----------------------------------------------------------------------------
 * Pure progression logic (no Cocos nodes). Holds upgrade levels, computes
 * costs from GameConfig, validates purchases against the wallet, and derives
 * the runtime combat stats the ArcherController/Castle consume.
 *
 * It reads/writes levels through the save profile (passed in) but never touches
 * storage directly.
 * ----------------------------------------------------------------------------
 */

import { GameConfig, upgradeCost } from '../core/GameConfig';
import type { UpgradeId } from '../core/GameConfig';
import type { PlayerSaveData } from '../save/PlayerSaveData';
import { UPGRADE_LEVEL_KEY } from '../save/PlayerSaveData';

/** Derived stats applied to gameplay. */
export interface PlayerStats {
  damage: number;
  fireCooldown: number;
  critChance: number;
  castleMaxHp: number;
}

export class UpgradeSystem {
  constructor(private readonly profile: PlayerSaveData) {}

  getLevel(id: UpgradeId): number {
    return this.profile.upgrades[UPGRADE_LEVEL_KEY[id]];
  }

  isMaxed(id: UpgradeId): boolean {
    return this.getLevel(id) >= GameConfig.upgrades[id].maxLevel;
  }

  /** Cost of the next level, or null if maxed. */
  getNextCost(id: UpgradeId): number | null {
    if (this.isMaxed(id)) return null;
    return upgradeCost(id, this.getLevel(id));
  }

  canAfford(id: UpgradeId, gold: number): boolean {
    const cost = this.getNextCost(id);
    return cost !== null && gold >= cost;
  }

  /**
   * Increment the level if allowed. Returns the spent cost, or null if the
   * purchase was rejected (maxed). Caller deducts gold from the wallet.
   */
  purchase(id: UpgradeId): number | null {
    const cost = this.getNextCost(id);
    if (cost === null) return null;
    this.profile.upgrades[UPGRADE_LEVEL_KEY[id]] += 1;
    return cost;
  }

  /** Compute derived combat stats from current levels. */
  computeStats(): PlayerStats {
    const p = GameConfig.player;
    const lv = this.profile.upgrades;
    return {
      damage: p.baseDamage + GameConfig.upgrades.damage.perLevel * lv.damageLevel,
      fireCooldown: Math.max(p.minFireCooldown, p.baseFireCooldown * Math.pow(p.cooldownFactor, lv.attackSpeedLevel)),
      critChance: Math.min(p.critChanceCap, p.baseCritChance + GameConfig.upgrades.crit.perLevel * lv.critLevel),
      castleMaxHp: p.baseCastleHp + GameConfig.upgrades.castleHp.perLevel * lv.castleHpLevel,
    };
  }
}
