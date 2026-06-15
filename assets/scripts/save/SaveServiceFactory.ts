/**
 * SaveServiceFactory.ts
 * ----------------------------------------------------------------------------
 * Builds the active save backend. Call this once at boot and hand the returned
 * SaveService to whoever needs persistence — the rest of the game stays unaware
 * of which backend is in use.
 *
 * Backend selection is config-driven (GameConfig.save.backend) and defaults to
 * 'local'. Switching to cloud later is a one-line config change.
 *
 * Lives in its own file so SaveService.ts (the base class) never imports the
 * concrete backends, keeping the module dependency graph acyclic.
 * ----------------------------------------------------------------------------
 */

import { GameConfig } from '../core/GameConfig';
import { SaveService } from './SaveService';
import { LocalSaveService } from './LocalSaveService';
import { CloudSaveService } from './CloudSaveService';

export type SaveBackend = 'local' | 'cloud';

export class SaveServiceFactory {
  /**
   * Create a save service for the given backend. Defaults to the backend in
   * GameConfig.save.backend (currently 'local').
   */
  static create(backend: SaveBackend = GameConfig.save.backend): SaveService {
    switch (backend) {
      case 'cloud':
        return new CloudSaveService();
      case 'local':
      default:
        return new LocalSaveService();
    }
  }
}
