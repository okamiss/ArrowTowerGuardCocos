/**
 * LocalSaveService.ts
 * ----------------------------------------------------------------------------
 * Default save backend for the Cocos runtime. The ONLY file that touches device
 * storage. Uses Cocos `sys.localStorage`, which is cross-platform:
 *   - browser Preview -> window.localStorage (persists across reloads)
 *   - native build     -> a local file
 *   - WeChat build     -> wx storage
 * So gold/upgrades persist everywhere, including the editor Preview.
 *
 * Methods are Promise-based so this can be swapped for CloudSaveService (async)
 * with no call-site changes. Falls back to an in-memory store if storage throws.
 * ----------------------------------------------------------------------------
 */

import { sys } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { SaveService } from './SaveService';
import { SaveVersionManager } from './SaveVersionManager';
import type { PlayerSaveData } from './PlayerSaveData';

export class LocalSaveService extends SaveService {
  private readonly key = GameConfig.save.storageKey;
  /** Used only when storage is unavailable/throws. */
  private memoryFallback: PlayerSaveData | null = null;

  private get hasStorage(): boolean {
    return typeof sys !== 'undefined' && !!sys.localStorage;
  }

  async load(): Promise<PlayerSaveData> {
    const raw = this.readRaw();
    if (raw == null) {
      const fresh = this.createDefaultSave();
      await this.save(fresh);
      return fresh;
    }
    return SaveVersionManager.migrate(raw);
  }

  async save(data: PlayerSaveData): Promise<void> {
    this.touch(data); // refresh updatedAt on every save
    const json = JSON.stringify(data);
    try {
      if (this.hasStorage) {
        sys.localStorage.setItem(this.key, json);
        return;
      }
    } catch (err) {
      console.error('[LocalSaveService] write failed; keeping in memory', err);
    }
    this.memoryFallback = JSON.parse(json);
  }

  async clear(): Promise<void> {
    try {
      if (this.hasStorage) sys.localStorage.removeItem(this.key);
    } catch (err) {
      console.warn('[LocalSaveService] clear failed', err);
    }
    this.memoryFallback = null;
  }

  /** Read + parse the raw blob; returns null on empty/corrupt data. */
  private readRaw(): any | null {
    try {
      if (this.hasStorage) {
        const value = sys.localStorage.getItem(this.key);
        if (!value) return null;
        return JSON.parse(value);
      }
      return this.memoryFallback;
    } catch (err) {
      console.warn('[LocalSaveService] read failed; treating as empty', err);
      return null;
    }
  }
}
