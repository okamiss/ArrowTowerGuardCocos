/**
 * DamageText.ts
 * ----------------------------------------------------------------------------
 * The floating damage number shown above a monster when an arrow lands. A pure
 * presenter (extends FloatingText): it ONLY renders the number it is handed and
 * drifts it upward — it never computes damage or rolls crits (DamageSystem does
 * that; BattleManager passes the resolved value + crit flag in).
 *
 *   - normal hit : white "-15"
 *   - crit hit   : larger orange-red "暴击 -30"
 *
 * `DamageTextPool` is the only thing battle code touches: call `show(x, y, dealt,
 * crit)` at the hit point and the pooled label recycles itself when it fades.
 * Nodes are reused via ObjectPool — no instantiate/destroy in the battle path.
 * ----------------------------------------------------------------------------
 */

import { _decorator, Node, Layers, Color } from 'cc';
import { FloatingText } from './FloatingText';
import { ObjectPool } from '../core/ObjectPool';

const { ccclass } = _decorator;

const NORMAL_COLOR = new Color(245, 245, 245, 255);
const CRIT_COLOR = new Color(255, 120, 70, 255);
const NORMAL_SIZE = 28;
const CRIT_SIZE = 40;
const RISE = 64;        // px drifted upward over the label's life
const DURATION = 0.7;   // seconds (within the 0.5–0.8s spec window)

@ccclass('DamageText')
export class DamageText extends FloatingText {
  /** Show `dealt` damage at (x, y); `crit` selects the louder style. */
  spawn(x: number, y: number, dealt: number, crit: boolean, release: (self: FloatingText) => void): void {
    this.node.setPosition(x, y, 0);
    this.play({
      text: crit ? `暴击 -${dealt}` : `-${dealt}`,
      color: crit ? CRIT_COLOR : NORMAL_COLOR,
      fontSize: crit ? CRIT_SIZE : NORMAL_SIZE,
      rise: RISE,
      duration: DURATION,
      release,
    });
  }
}

/** Owns the recycled DamageText nodes; the only surface battle code uses. */
export class DamageTextPool {
  private readonly pool: ObjectPool<DamageText>;

  constructor(private readonly parent: Node, prewarm = 8) {
    this.pool = new ObjectPool<DamageText>(() => this.create(), () => {}, prewarm);
  }

  /** Pop a label, show `dealt` (crit-styled when `crit`), auto-recycled on fade. */
  show(x: number, y: number, dealt: number, crit: boolean): void {
    const text = this.pool.get();
    text.spawn(x, y, dealt, crit, (self) => this.pool.put(self as DamageText));
  }

  private create(): DamageText {
    const node = new Node('damageText');
    node.layer = Layers.Enum.UI_2D;
    node.active = false;
    this.parent.addChild(node);
    return node.addComponent(DamageText);
  }
}
