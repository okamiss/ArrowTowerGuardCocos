/**
 * ArrowPool.ts
 * ----------------------------------------------------------------------------
 * Arrow-specific wrapper around the generic ObjectPool. Owns the arrow node
 * factory (a Sprite rendering art/tower/arrow) and parents every arrow under the
 * supplied ArrowLayer node.
 *
 * The SpriteFrame is preloaded by BattleManager and injected here, so the pool
 * can build ready-to-render arrows synchronously (during prewarm) with no
 * Graphics placeholder.
 * ----------------------------------------------------------------------------
 */

import { Node, UITransform, Sprite, SpriteFrame, Layers } from 'cc';
import { ObjectPool } from '../core/ObjectPool';
import { Arrow } from './Arrow';
import { GameConfig } from '../core/GameConfig';

export class ArrowPool {
  private readonly pool: ObjectPool<Arrow>;

  constructor(
    private readonly parent: Node,
    private readonly frame: SpriteFrame | null,
    prewarm = GameConfig.pool.arrowPrewarm,
  ) {
    this.pool = new ObjectPool<Arrow>(
      () => this.createArrow(),
      (arrow) => arrow.deactivate(),
      prewarm,
    );
  }

  /** Pull an arrow ready to be launch()'d. */
  get(): Arrow {
    return this.pool.get();
  }

  /** Return an arrow to the pool (resets + deactivates it). */
  put(arrow: Arrow): void {
    this.pool.put(arrow);
  }

  /** Build a fresh arrow node + component (inactive by default). */
  private createArrow(): Arrow {
    const node = new Node('arrow');
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(GameConfig.arrow.spriteWidth, GameConfig.arrow.spriteHeight);

    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.spriteFrame = this.frame; // art points right at angle 0; node.angle aims it

    node.active = false;
    this.parent.addChild(node);
    return node.addComponent(Arrow);
  }
}
