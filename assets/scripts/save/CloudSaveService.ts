/**
 * CloudSaveService.ts
 * ----------------------------------------------------------------------------
 * RESERVED backend for future cloud persistence. Implements the same
 * SaveService contract so it can replace LocalSaveService without touching any
 * gameplay code.
 *
 * A real implementation will call wx.cloud.callFunction({ name, data }) against
 * cloud functions backed by a database, and probably keep LocalSaveService as a
 * synchronous on-device cache that syncs to the cloud in the background.
 *
 * For now every method is an intentional no-op / default — NO cloud function is
 * wired up yet. Keep it harmless so a misconfigured backend never crashes boot.
 * ----------------------------------------------------------------------------
 */

import { SaveService } from './SaveService';
import type { PlayerSaveData } from './PlayerSaveData';

// Provided by the WeChat mini-game runtime once cloud is initialized.
declare const wx: any;

export class CloudSaveService extends SaveService {
  async load(): Promise<PlayerSaveData> {
    // TODO: const res = await wx.cloud.callFunction({ name: 'loadProfile' });
    //       return SaveVersionManager.migrate(res.result);
    console.warn('[CloudSaveService] load() not implemented; returning a default save');
    return this.createDefaultSave();
  }

  async save(_data: PlayerSaveData): Promise<void> {
    // TODO: await wx.cloud.callFunction({ name: 'saveProfile', data: this.touch(_data) });
    console.warn('[CloudSaveService] save() not implemented; no-op');
  }

  async clear(): Promise<void> {
    // TODO: await wx.cloud.callFunction({ name: 'clearProfile' });
    console.warn('[CloudSaveService] clear() not implemented; no-op');
  }
}
