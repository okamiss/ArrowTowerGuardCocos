/**
 * ResultPanel.ts
 * ----------------------------------------------------------------------------
 * The end-of-run summary overlay (defeat for the MVP). A deliberately SIMPLE,
 * code-built panel — no .scene authoring — matching how BattleManager builds the
 * rest of the battlefield. It is a pure presenter: it renders the numbers it is
 * handed and fires `onRestart` when the button is tapped. It owns no game state
 * and never touches the save or EventBus directly.
 *
 * Usage: BattleManager creates a child node centered under the Canvas, adds this
 * component, and calls `show({ ... })` once the castle falls.
 *
 * Required scene refs: none (the node tree is built in `show()`).
 * ----------------------------------------------------------------------------
 */

import {
  _decorator, Component, Node, UITransform, Graphics, Label, Color, Layers,
  BlockInputEvents,
} from 'cc';
import { GameConfig } from '../core/GameConfig';

const { ccclass } = _decorator;

const HALF_W = GameConfig.layout.designWidth / 2;
const HALF_H = GameConfig.layout.designHeight / 2;

/** Everything the panel displays, plus the restart hook. */
export interface ResultData {
  /** Level reached this run. */
  level: number;
  /** Monsters killed this run. */
  kills: number;
  /** Gold earned this run. */
  goldEarned: number;
  /** Best level ever reached (post-save). */
  highestLevel: number;
  /** Invoked when the player taps "Restart". */
  onRestart: () => void;
}

@ccclass('ResultPanel')
export class ResultPanel extends Component {
  private onRestart: (() => void) | null = null;

  /** Build and display the panel for `data`. Call once. */
  show(data: ResultData): void {
    this.onRestart = data.onRestart;

    // Full-screen dim that also swallows taps from reaching the battlefield.
    this.node.addComponent(UITransform).setContentSize(HALF_W * 2, HALF_H * 2);
    this.node.addComponent(BlockInputEvents);
    const dim = this.node.addComponent(Graphics);
    dim.fillColor = new Color(0, 0, 0, 180);
    dim.rect(-HALF_W, -HALF_H, HALF_W * 2, HALF_H * 2);
    dim.fill();

    // Central card.
    const cardW = 540;
    const cardH = 420;
    const card = this.addGraphics('Card');
    card.fillColor = new Color(28, 34, 22, 245);
    card.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    card.fill();
    card.lineWidth = 4;
    card.strokeColor = new Color(120, 150, 90, 255);
    card.stroke();

    // Title + stat rows (top -> bottom inside the card).
    this.addLabel('DEFEAT', 0, 150, 48, new Color(220, 90, 80, 255), true);
    this.addLabel(`Level Reached:  ${data.level}`, 0, 78, 30, new Color(235, 235, 235, 255), true);
    this.addLabel(`Kills:  ${data.kills}`, 0, 30, 30, new Color(235, 235, 235, 255), true);
    this.addLabel(`Gold Earned:  ${data.goldEarned}`, 0, -18, 30, new Color(255, 210, 63, 255), true);
    this.addLabel(`Best Level:  ${data.highestLevel}`, 0, -66, 30, new Color(180, 220, 140, 255), true);

    this.buildRestartButton(0, -150, 220, 64);
  }

  // --- internals ------------------------------------------------------------

  private buildRestartButton(x: number, y: number, w: number, h: number): void {
    const node = new Node('RestartButton');
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    this.node.addChild(node);
    node.setPosition(x, y, 0);

    const g = node.addComponent(Graphics);
    g.fillColor = new Color(74, 90, 58, 255);
    g.roundRect(-w / 2, -h / 2, w, h, 10);
    g.fill();
    g.lineWidth = 3;
    g.strokeColor = new Color(150, 180, 110, 255);
    g.stroke();

    const labelNode = new Node('label');
    labelNode.layer = Layers.Enum.UI_2D;
    labelNode.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
    const label = labelNode.addComponent(Label);
    label.string = 'Restart';
    label.fontSize = 30;
    label.lineHeight = 36;
    label.color = new Color(245, 245, 245, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    node.addChild(labelNode);

    node.on(Node.EventType.TOUCH_END, this.handleRestart, this);
  }

  private handleRestart(): void {
    const cb = this.onRestart;
    this.onRestart = null; // guard against double taps during reload
    if (cb) cb();
  }

  private addGraphics(name: string): Graphics {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform);
    this.node.addChild(node);
    return node.addComponent(Graphics);
  }

  private addLabel(text: string, x: number, y: number, size: number, col: Color, center: boolean): Label {
    const node = new Node('label');
    node.layer = Layers.Enum.UI_2D;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(520, size * 1.4);
    ut.setAnchorPoint(0.5, 0.5);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size * 1.2;
    label.color = col;
    label.horizontalAlign = center ? Label.HorizontalAlign.CENTER : Label.HorizontalAlign.LEFT;
    this.node.addChild(node);
    node.setPosition(x, y, 0);
    return label;
  }
}
