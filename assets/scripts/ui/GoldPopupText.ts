/**
 * GoldPopupText.ts
 * ----------------------------------------------------------------------------
 * The floating "+12 金币" shown at a monster's death position. A pure presenter
 * (extends FloatingText): it ONLY displays the amount it is handed and drifts it
 * upward — it never changes the player's balance. The real gold award is done by
 * DamageSystem/Wallet on the kill; this is cosmetic feedback only.
 *
 * `GoldPopupTextPool` is the only thing battle code touches: call `show(x, y,
 * gold)` at the kill site and the pooled label recycles itself when it fades.
 * Nodes are reused via ObjectPool — no instantiate/destroy in the battle path.
 * ----------------------------------------------------------------------------
 */

import { _decorator, Node, Layers, Color } from 'cc';
import { FloatingText } from './FloatingText';
import { ObjectPool } from '../core/ObjectPool';

const { ccclass } = _decorator;

const GOLD_COLOR = new Color(255, 210, 63, 255);
const FONT_SIZE = 26;
const RISE = 72;        // px drifted upward over the label's life
const DURATION = 0.9;   // seconds (within the 0.6–1.0s spec window)

@ccclass('GoldPopupText')
export class GoldPopupText extends FloatingText {
  /** Show "+`gold` 金币" rising from (x, y). */
  spawn(x: number, y: number, gold: number, release: (self: FloatingText) => void): void {
    this.node.setPosition(x, y, 0);
    this.play({
      text: `+${gold} 金币`,
      color: GOLD_COLOR,
      fontSize: FONT_SIZE,
      rise: RISE,
      duration: DURATION,
      release,
    });
  }
}

/** Owns the recycled GoldPopupText nodes; the only surface battle code uses. */
export class GoldPopupTextPool {
  private readonly pool: ObjectPool<GoldPopupText>;

  constructor(private readonly parent: Node, prewarm = 6) {
    this.pool = new ObjectPool<GoldPopupText>(() => this.create(), () => {}, prewarm);
  }

  /** Pop a label, show the gold reward, auto-recycled on fade. */
  show(x: number, y: number, gold: number): void {
    const text = this.pool.get();
    text.spawn(x, y, gold, (self) => this.pool.put(self as GoldPopupText));
  }

  private create(): GoldPopupText {
    const node = new Node('goldPopup');
    node.layer = Layers.Enum.UI_2D;
    node.active = false;
    this.parent.addChild(node);
    return node.addComponent(GoldPopupText);
  }
}
