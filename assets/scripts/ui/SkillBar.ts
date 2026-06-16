/**
 * SkillBar.ts
 * ----------------------------------------------------------------------------
 * The in-battle SKILL buttons. A pure PRESENTER built in code (no .scene
 * authoring), matching BattleUI. It shows the three active-skill buttons along
 * the bottom and reports taps — it holds NO skill logic (no damage, cooldown, or
 * targeting lives here). Every number is read through the `SkillBarData` getters
 * (owned by BattleManager / SkillSystem) and the press/drag/release gesture is
 * forwarded raw (onAimStart/onAimMove/onAimEnd) for drag-to-aim targeting.
 *
 * Each button shows the skill name plus a status line that the component polls
 * every frame:
 *   - ready    : "就绪"  (button bright / tappable)
 *   - cooling  : "5.2s"  (button dimmed / tap ignored)
 *   - locked   : "未解锁" (level 0; button dimmed)
 *
 * Required scene refs: none (the node tree is built in `build()`).
 * ----------------------------------------------------------------------------
 */

import {
  _decorator, Component, Node, UITransform, Graphics, Label, Color, Layers, EventTouch,
} from 'cc';
import { GameConfig } from '../core/GameConfig';
import type { SkillId } from '../core/GameConfig';

const { ccclass } = _decorator;

const HALF_H = GameConfig.layout.designHeight / 2;

// Button geometry + layout (bottom-center row).
const BTN_W = 132;
const BTN_H = 70;
const GAP = 18;
const ROW_Y = -HALF_H + 58;

const READY_FILL = new Color(58, 96, 52, 240);
const READY_STROKE = new Color(150, 200, 110, 255);
const DIM_FILL = new Color(48, 52, 44, 230);
const DIM_STROKE = new Color(110, 120, 100, 255);
const NAME_READY = new Color(245, 245, 235, 255);
const NAME_DIM = new Color(165, 170, 160, 255);
const STATUS_READY = new Color(180, 220, 140, 255);
const STATUS_COOL = new Color(225, 200, 120, 255);

/** One row item: the skill id + its display name (from GameConfig.skills). */
export interface SkillBarItem {
  readonly id: SkillId;
  readonly name: string;
}

/**
 * Everything the skill bar reads, plus the drag-to-aim intents. All skill LOGIC
 * (cooldowns, targeting, casting, the aim preview) lives in BattleManager /
 * SkillSystem; the bar only reports the raw button gesture:
 *   press   -> onAimStart  (arm + show preview at the auto-target)
 *   drag    -> onAimMove    (move the impact point with the finger)
 *   release -> onAimEnd     (cast at the chosen point; fires for both TOUCH_END
 *                            inside the button and TOUCH_CANCEL out in the field)
 * A plain press+release with no drag casts at the auto-target (lead cluster).
 */
export interface SkillBarData {
  readonly items: ReadonlyArray<SkillBarItem>;
  getLevel: (id: SkillId) => number;
  getCooldownRemaining: (id: SkillId) => number;
  canCast: (id: SkillId) => boolean;
  onAimStart: (id: SkillId, e: EventTouch) => void;
  onAimMove: (id: SkillId, e: EventTouch) => void;
  onAimEnd: (id: SkillId, e: EventTouch) => void;
}

/** Internal per-button bundle so update() can repaint cheaply. */
interface SkillButton {
  readonly id: SkillId;
  readonly cx: number; // center x in this.node-local space (for hit-testing)
  readonly bg: Graphics;
  readonly nameLabel: Label;
  readonly statusLabel: Label;
  enabled: boolean; // last painted enabled state (avoids redrawing the bg every frame)
}

@ccclass('SkillBar')
export class SkillBar extends Component {
  private data: SkillBarData | null = null;
  private readonly buttons: SkillButton[] = [];

  /** Build the button row and paint the initial state. Call once. */
  build(data: SkillBarData): void {
    this.data = data;
    this.node.addComponent(UITransform).setContentSize(GameConfig.layout.designWidth, GameConfig.layout.designHeight);

    const items = data.items;
    const total = items.length;
    const span = total * BTN_W + (total - 1) * GAP;
    const startX = -span / 2 + BTN_W / 2;

    items.forEach((item, i) => {
      const cx = startX + i * (BTN_W + GAP);
      this.buttons.push(this.buildButton(item, cx, ROW_Y));
    });

    this.refresh();
  }

  /** Poll cooldown/lock state each frame and repaint (text always, bg on change). */
  protected update(_dt: number): void {
    this.refresh();
  }

  private refresh(): void {
    if (!this.data) return;
    for (const btn of this.buttons) {
      const level = this.data.getLevel(btn.id);
      const ready = this.data.canCast(btn.id);

      if (level <= 0) {
        btn.statusLabel.string = '未解锁';
        btn.statusLabel.color = NAME_DIM;
      } else if (ready) {
        btn.statusLabel.string = '就绪';
        btn.statusLabel.color = STATUS_READY;
      } else {
        const remaining = this.data.getCooldownRemaining(btn.id);
        btn.statusLabel.string = `${remaining.toFixed(1)}s`;
        btn.statusLabel.color = STATUS_COOL;
      }

      // Only repaint the (costly) Graphics background when the enabled state flips.
      if (btn.enabled !== ready) {
        btn.enabled = ready;
        btn.nameLabel.color = ready ? NAME_READY : NAME_DIM;
        this.paintButton(btn.bg, ready);
      }
    }
  }

  // --- node construction -----------------------------------------------------

  private buildButton(item: SkillBarItem, x: number, y: number): SkillButton {
    const node = new Node(`Skill_${item.id}`);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
    this.node.addChild(node);
    node.setPosition(x, y, 0);

    const bg = node.addComponent(Graphics);
    this.paintButton(bg, false);

    const nameLabel = this.addLabel(node, item.name, 0, 14, 26, NAME_DIM);
    const statusLabel = this.addLabel(node, '', 0, -16, 22, STATUS_COOL);

    // Drag-to-aim: the touch that starts on this button is captured for the whole
    // gesture (move + release fire here even once the finger leaves the button), so
    // BattleManager can follow the drag across the battlefield and cast on release.
    //
    // NOTE: Cocos only sends TOUCH_END when the finger lifts *inside* the button's
    // bounds; releasing out in the battlefield (the normal case here) sends
    // TOUCH_CANCEL instead. Both mean "release -> cast", so they share onAimEnd.
    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      if (this.data?.canCast(item.id)) this.data.onAimStart(item.id, e);
    }, this);
    node.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => this.data?.onAimMove(item.id, e), this);
    node.on(Node.EventType.TOUCH_END, (e: EventTouch) => this.data?.onAimEnd(item.id, e), this);
    node.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => this.data?.onAimEnd(item.id, e), this);

    return { id: item.id, cx: x, bg, nameLabel, statusLabel, enabled: false };
  }

  /** True if the battle-local point (this.node space) lands on any skill button.
   *  BattleManager uses this to stop a tap on the bar from also firing an arrow. */
  hitTestLocal(x: number, y: number): boolean {
    for (const btn of this.buttons) {
      if (Math.abs(x - btn.cx) <= BTN_W / 2 && Math.abs(y - ROW_Y) <= BTN_H / 2) return true;
    }
    return false;
  }

  private paintButton(g: Graphics, enabled: boolean): void {
    g.clear();
    g.fillColor = enabled ? READY_FILL : DIM_FILL;
    g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 12);
    g.fill();
    g.lineWidth = 3;
    g.strokeColor = enabled ? READY_STROKE : DIM_STROKE;
    g.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 12);
    g.stroke();
  }

  private addLabel(parent: Node, text: string, x: number, y: number, size: number, col: Color): Label {
    const node = new Node('label');
    node.layer = Layers.Enum.UI_2D;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(BTN_W, size * 1.4);
    ut.setAnchorPoint(0.5, 0.5);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size * 1.2;
    label.color = col;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.enableOutline = true;
    label.outlineColor = new Color(0, 0, 0, 170);
    label.outlineWidth = 2;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    return label;
  }
}
