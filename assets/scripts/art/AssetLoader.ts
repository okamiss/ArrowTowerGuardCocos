/**
 * AssetLoader.ts
 * ----------------------------------------------------------------------------
 * The ONE place that turns an AssetConfig entry into an on-screen image.
 *
 * Strategy (keeps the existing Graphics placeholder as the fallback):
 *   1. Callers build a node that already carries its Graphics-color placeholder
 *      (the current look — see GameSceneController.addRect).
 *   2. They hand that node to `applyTo(node, asset)`.
 *   3. We asynchronously try to load a real SpriteFrame from `resources`. If it
 *      exists, we drop the Graphics placeholder and add a Sprite that renders at
 *      the node's existing size/position — so layout is unchanged. If it does
 *      NOT exist, the Graphics placeholder simply stays.
 *
 * Result: the game runs with ZERO art today; dropping a correctly-named PNG into
 * assets/resources/art/... makes it appear with no gameplay-code changes.
 *
 * Misses are cached, so the many enemies that share one missing path don't each
 * trigger a failed load.
 * ----------------------------------------------------------------------------
 */

import { resources, SpriteFrame, Sprite, Graphics, Node, UITransform } from 'cc';
import type { SpriteAsset } from './AssetConfig';

class AssetLoaderClass {
  /** path -> SpriteFrame (loaded) | null (confirmed missing). */
  private readonly cache = new Map<string, SpriteFrame | null>();

  /**
   * Try to upgrade a placeholder node to real art. Safe to call on any node that
   * has (or doesn't have) a Graphics placeholder; if no PNG is found it is a
   * no-op and the placeholder remains.
   */
  applyTo(node: Node, asset: SpriteAsset): void {
    void this.loadFrame(asset).then((frame) => {
      if (!frame || !node || !node.isValid) return;

      // Hide the Graphics placeholder. We do NOT add a Sprite to this same node:
      // a node must not carry two UIRenderer components (Graphics + Sprite), or
      // the Sprite renders black. Instead we render the real art on a dedicated
      // child sized to the placeholder, so layout is unchanged.
      const g = node.getComponent(Graphics);
      if (g) {
        g.enabled = false;
        g.destroy();
      }

      const ut = node.getComponent(UITransform);
      const w = ut ? ut.width : frame.rect.width;
      const h = ut ? ut.height : frame.rect.height;

      const art = new Node('art');
      art.layer = node.layer;
      art.addComponent(UITransform).setContentSize(w, h);
      const sprite = art.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.type = Sprite.Type.SIMPLE;
      sprite.spriteFrame = frame;

      node.addChild(art);
      art.setPosition(0, 0, 0);
      art.setSiblingIndex(0); // keep art behind existing children (e.g. button label)
    });
  }

  /** Load (and cache) the SpriteFrame for an asset, or null if absent. */
  private loadFrame(asset: SpriteAsset): Promise<SpriteFrame | null> {
    const cached = this.cache.get(asset.path);
    if (cached !== undefined) return Promise.resolve(cached);

    // A PNG imported as a sprite-frame exposes its SpriteFrame at
    // `<path>/spriteFrame`; fall back to the bare path for other importers.
    const candidates = [`${asset.path}/spriteFrame`, asset.path];
    return this.tryLoad(candidates, 0).then((frame) => {
      this.cache.set(asset.path, frame);
      return frame;
    });
  }

  private tryLoad(paths: ReadonlyArray<string>, i: number): Promise<SpriteFrame | null> {
    if (i >= paths.length) return Promise.resolve(null);
    return new Promise((resolve) => {
      resources.load(paths[i], SpriteFrame, (err, frame) => {
        if (!err && frame) resolve(frame);
        else this.tryLoad(paths, i + 1).then(resolve);
      });
    });
  }
}

/** Shared singleton — stateless aside from its load cache. */
export const AssetLoader = new AssetLoaderClass();
