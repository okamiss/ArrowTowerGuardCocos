/**
 * SaveService.ts
 * ----------------------------------------------------------------------------
 * The save ABSTRACTION. Gameplay code depends only on this contract / base
 * class — never on a concrete backend, and never on wx storage directly.
 *
 *   - LocalSaveService  : default backend (wx storage).
 *   - CloudSaveService  : reserved backend (wx.cloud.callFunction), stubbed.
 *
 * Obtain an instance through `SaveServiceFactory` so backends can be swapped
 * (local <-> cloud) without touching call sites. All I/O methods are async
 * (Promise-based) precisely so the local backend can later be replaced by a
 * cloud one with no signature changes.
 * ----------------------------------------------------------------------------
 */

import type { PlayerSaveData } from './PlayerSaveData';
import { createDefaultSaveData, touchSaveData } from './PlayerSaveData';

/** Contract every storage backend implements. */
export interface ISaveService {
  /** Load the profile, creating a default save if none exists. */
  load(): Promise<PlayerSaveData>;
  /** Persist the profile (refreshes `updatedAt`). */
  save(data: PlayerSaveData): Promise<void>;
  /** Remove all saved data (debug / reset to a fresh profile). */
  clear(): Promise<void>;
  /** Build a fresh default profile (pure; no I/O). */
  createDefaultSave(): PlayerSaveData;
}

/**
 * Base class with the behavior shared by every backend. Subclasses implement
 * the three async I/O methods; `createDefaultSave` and `touch` are provided.
 */
export abstract class SaveService implements ISaveService {
  abstract load(): Promise<PlayerSaveData>;
  abstract save(data: PlayerSaveData): Promise<void>;
  abstract clear(): Promise<void>;

  /** A brand-new profile. Shared by all backends. */
  createDefaultSave(): PlayerSaveData {
    return createDefaultSaveData();
  }

  /** Refresh `updatedAt`; subclasses call this inside save(). */
  protected touch(data: PlayerSaveData): PlayerSaveData {
    return touchSaveData(data);
  }
}
