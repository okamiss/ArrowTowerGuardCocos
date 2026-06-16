/**
 * PlayerSaveData.ts
 * ----------------------------------------------------------------------------
 * The persisted player profile. `version` enables forward migration via
 * SaveVersionManager. Keep this a plain serializable shape (no class methods,
 * no Cocos types) so it round-trips cleanly through JSON / wx storage.
 * ----------------------------------------------------------------------------
 */

import { GameConfig } from '../core/GameConfig';
import type { UpgradeId } from '../core/GameConfig';

/** Permanent upgrade levels (the 4 MVP upgrades). */
export interface UpgradeSaveData {
  damageLevel: number;
  attackSpeedLevel: number;
  critLevel: number;
  castleHpLevel: number;
}

/** Skill levels. Skills are post-MVP; these are reserved and default to 0. */
export interface SkillSaveData {
  multishotLevel: number;
  iceSpikeLevel: number;
  fireballLevel: number;
  lightningLevel: number;
  healingLevel: number;
  coinBoostLevel: number;
}

/** Lifetime aggregate counters (for stats screens / achievements later). */
export interface StatsSaveData {
  totalKills: number;
  totalGames: number;
  totalGoldEarned: number;
}

/** The full persisted player profile. */
export interface PlayerSaveData {
  /** Schema version; bump when the shape changes and add a migration step. */
  version: number;
  /** Optional owner id; set by CloudSaveService once accounts exist. */
  userId?: string;

  gold: number;
  diamond: number;

  /** Best level ever reached. */
  highestLevel: number;
  /** Level the player is currently on / will resume at. */
  currentLevel: number;

  upgrades: UpgradeSaveData;
  skills: SkillSaveData;
  stats: StatsSaveData;

  /** Epoch ms when the profile was first created. */
  createdAt: number;
  /** Epoch ms of the last successful save (refreshed on every save()). */
  updatedAt: number;
}

/**
 * Maps the gameplay-facing UpgradeId (used by GameConfig / UpgradeSystem) to
 * its level field on the save's `upgrades` block. Keeps callers id-driven while
 * the stored shape uses explicit `*Level` fields.
 */
export const UPGRADE_LEVEL_KEY: Record<UpgradeId, keyof UpgradeSaveData> = {
  damage: 'damageLevel',
  attackSpeed: 'attackSpeedLevel',
  crit: 'critLevel',
  castleHp: 'castleHpLevel',
};

/** A brand-new profile. */
export function createDefaultSaveData(): PlayerSaveData {
  const now = Date.now();
  return {
    version: GameConfig.save.version,

    gold: 0,
    diamond: 0,

    highestLevel: 0,
    currentLevel: 1, // levels are 1-based (see GameConfig.levelConfigs)

    upgrades: {
      damageLevel: 0,
      attackSpeedLevel: 0,
      critLevel: 0,
      castleHpLevel: 0,
    },
    skills: {
      multishotLevel: 0,
      iceSpikeLevel: 0,
      fireballLevel: 0,
      lightningLevel: 0,
      healingLevel: 0,
      coinBoostLevel: 0,
    },
    stats: {
      totalKills: 0,
      totalGames: 0,
      totalGoldEarned: 0,
    },

    createdAt: now,
    updatedAt: now,
  };
}

/** Stamp `updatedAt` to now and return the same object (mutates in place). */
export function touchSaveData(data: PlayerSaveData): PlayerSaveData {
  data.updatedAt = Date.now();
  return data;
}
