/**
 * SaveVersionManager.ts
 * ----------------------------------------------------------------------------
 * Upgrades old PlayerSaveData blobs to the current schema version. Keeps a
 * registry of stepwise migrations (v1 -> v2 -> v3 ...) applied in order.
 *
 * When you bump GameConfig.save.version, add a migration step here so existing
 * players keep their progress.
 * ----------------------------------------------------------------------------
 */

import { GameConfig } from '../core/GameConfig';
import { createDefaultSaveData } from './PlayerSaveData';
import type { PlayerSaveData } from './PlayerSaveData';

/** A single forward migration step: transforms one version into the next. */
type MigrationStep = (data: any) => any;

export class SaveVersionManager {
  /**
   * migrations[n] turns a v(n) blob into a v(n+1) blob. Add an entry whenever
   * GameConfig.save.version is bumped, e.g.:
   *
   *   1: (data) => ({ ...data, version: 2, prestigeLevel: 0 }),
   */
  private static readonly migrations: Record<number, MigrationStep> = {
    // v1 -> v2: the fixed wave system became the endless level system.
    // Carry the old wave progress forward as level progress, then drop the
    // legacy fields.
    1: (data: any) => {
      const { currentWave, highestWave, ...rest } = data;
      return {
        ...rest,
        version: 2,
        currentLevel: data.currentLevel ?? currentWave ?? 1,
        highestLevel: data.highestLevel ?? highestWave ?? 0,
      };
    },
    // v2 -> v3: schema-compatible bump. (A short-lived persisted `currentWave`
    // was dropped — only LEVEL progress is saved; the within-level wave is
    // runtime-only and always restarts at 1. Legacy `currentWave` is ignored.)
    2: (data: any) => ({
      ...data,
      version: 3,
    }),
  };

  static get currentVersion(): number {
    return GameConfig.save.version;
  }

  /**
   * Bring a raw, possibly-old save up to the current version.
   * Falls back to a fresh default profile if the blob is unusable.
   */
  static migrate(raw: any): PlayerSaveData {
    // Reject anything that isn't a versioned object.
    if (!raw || typeof raw !== 'object' || typeof raw.version !== 'number') {
      console.warn('[SaveVersionManager] invalid save blob; using defaults');
      return createDefaultSaveData();
    }

    let data: any = raw;

    // Apply migrations stepwise until we reach the current version.
    while (data.version < SaveVersionManager.currentVersion) {
      const step = SaveVersionManager.migrations[data.version];
      if (!step) {
        // Missing migration path — safest is to reset rather than run on a
        // half-known shape.
        console.warn(
          `[SaveVersionManager] no migration from v${data.version}; using defaults`,
        );
        return createDefaultSaveData();
      }
      data = step(data);
    }

    // A save newer than this client (e.g. downgraded build) is not understood.
    if (data.version > SaveVersionManager.currentVersion) {
      console.warn(
        `[SaveVersionManager] save v${data.version} is newer than client ` +
          `v${SaveVersionManager.currentVersion}; using defaults`,
      );
      return createDefaultSaveData();
    }

    // Defensively backfill any fields a malformed save might be missing so
    // callers always get a fully-shaped object.
    return SaveVersionManager.withDefaults(data);
  }

  /** Merge `data` over a fresh default so every field is guaranteed present. */
  private static withDefaults(data: any): PlayerSaveData {
    const d = createDefaultSaveData();
    // Strip deprecated fields so they are never re-persisted: this version saves
    // only LEVEL progress, never the within-level wave (currentWave/bestWave).
    const { currentWave, bestWave, highestWave, ...rest } = data;
    return {
      ...d,
      ...rest,
      upgrades: { ...d.upgrades, ...(rest.upgrades ?? {}) },
      skills: { ...d.skills, ...(rest.skills ?? {}) },
      stats: { ...d.stats, ...(rest.stats ?? {}) },
      version: SaveVersionManager.currentVersion,
    };
  }
}
