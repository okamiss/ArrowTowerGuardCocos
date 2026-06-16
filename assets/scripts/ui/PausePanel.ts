/**
 * PausePanel.ts
 * ----------------------------------------------------------------------------
 * The modal overlay shown when the player taps Pause. A code-built panel (no
 * .scene authoring) matching the other UI. Pure presenter: it shows three
 * buttons and fires the matching intent — it owns no game state and never
 * touches the save, the battle, or the EventBus directly. BattleManager wires
 * the callbacks and decides what each one does:
 *   - 继续游戏   -> onResume       (unfreeze the battle, close this panel)
 *   - 重新开始   -> onRestart      (reload the battle scene)
 *   - 返回主界面 -> onReturnToMain (switch to MainScene)
 *
 * Its full-screen dim + BlockInputEvents swallow taps, so the battlefield and
 * the HUD pause button underneath cannot be triggered while it is up.
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

/** The three pause intents. All behavior lives in BattleManager. */
export interface PausePanelData {
  onResume: () => void;
  onRestart: () => void;
  onReturnToMain: () => void;
}

@ccclass('PausePanel')
export class PausePanel extends Component {
  private data: PausePanelData | null = null;

  /** Build and display the panel for `data`. Call once. */
  show(data: PausePanelData): void {
    this.data = data;

    // Full-screen dim that also swallows taps from reaching the battlefield/HUD.
    this.node.addComponent(UITransform).setContentSize(HALF_W * 2, HALF_H * 2);
    this.node.addComponent(BlockInputEvents);
    const dim = this.node.addComponent(Graphics);
    dim.fillColor = new Color(0, 0, 0, 190);
    dim.rect(-HALF_W, -HALF_H, HALF_W * 2, HALF_H * 2);
    dim.fill();

    // Central card.
    const cardW = 460;
    const cardH = 420;
    const card = this.addGraphics('Card');
    card.fillColor = new Color(28, 34, 22, 245);
    card.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    card.fill();
    card.lineWidth = 4;
    card.strokeColor = new Color(120, 150, 90, 255);
    card.stroke();

    this.addLabel('已暂停', 0, cardH / 2 - 64, 44, new Color(255, 210, 63, 255));

    const btnW = 320;
    const btnH = 70;
    const step = btnH + 22;
    const y0 = 70;
    this.buildButton('继续游戏', 0, y0, btnW, btnH, () => this.fire(this.data?.onResume), true);
    this.buildButton('重新开始', 0, y0 - step, btnW, btnH, () => this.fire(this.data?.onRestart), false);
    this.buildButton('返回主界面', 0, y0 - 2 * step, btnW, btnH, () => this.fire(this.data?.onReturnToMain), false);
  }

  // --- internals ------------------------------------------------------------

  /** Run an intent once, guarding against double taps during transitions. */
  private fire(cb: (() => void) | undefined): void {
    const data = this.data;
    this.data = null;
    if (data && cb) cb();
  }

  private buildButton(
    text: string, x: number, y: number, w: number, h: number,
    handler: () => void, primary: boolean,
  ): void {
    const node = new Node(`${text}Button`);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    this.node.addChild(node);
    node.setPosition(x, y, 0);

    const g = node.addComponent(Graphics);
    g.fillColor = primary ? new Color(74, 110, 58, 255) : new Color(74, 90, 58, 255);
    g.roundRect(-w / 2, -h / 2, w, h, 12);
    g.fill();
    g.lineWidth = 3;
    g.strokeColor = primary ? new Color(150, 200, 110, 255) : new Color(150, 180, 110, 255);
    g.stroke();

    const labelNode = new Node('label');
    labelNode.layer = Layers.Enum.UI_2D;
    labelNode.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = 30;
    label.lineHeight = 36;
    label.color = new Color(245, 245, 245, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    node.addChild(labelNode);

    node.on(Node.EventType.TOUCH_END, handler, this);
  }

  private addGraphics(name: string): Graphics {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform);
    this.node.addChild(node);
    return node.addComponent(Graphics);
  }

  private addLabel(text: string, x: number, y: number, size: number, col: Color): Label {
    const node = new Node('label');
    node.layer = Layers.Enum.UI_2D;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(440, size * 1.4);
    ut.setAnchorPoint(0.5, 0.5);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size * 1.2;
    label.color = col;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    this.node.addChild(node);
    node.setPosition(x, y, 0);
    return label;
  }
}
