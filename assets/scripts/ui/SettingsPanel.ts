/**
 * SettingsPanel.ts
 * ----------------------------------------------------------------------------
 * A deliberately MINIMAL settings overlay for the main menu. Pure presenter —
 * code-built (no .scene authoring), matching ResultPanel / UpgradePanel. It owns
 * no game state and touches neither the save nor the EventBus; its only job is to
 * render a card with a title and a "Back" button, and to invoke `onClose` when
 * Back is tapped (the caller decides what closing means — typically destroying
 * this node).
 *
 * Real settings (sound, vibration, language, reset save, ...) get added here
 * later; for the MVP skeleton this is just the navigational shell.
 *
 * Usage: MainMenuManager creates a child node centered under the Canvas, adds
 * this component, and calls `show({ onClose })`.
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

/** Inputs for the settings overlay. */
export interface SettingsData {
  /** Invoked when the player taps "Back". The caller closes/destroys the panel. */
  onClose: () => void;
}

@ccclass('SettingsPanel')
export class SettingsPanel extends Component {
  private onClose: (() => void) | null = null;

  /** Build and display the overlay. Call once. */
  show(data: SettingsData): void {
    this.onClose = data.onClose;

    // Full-screen dim that also swallows taps from reaching the menu beneath.
    this.node.addComponent(UITransform).setContentSize(HALF_W * 2, HALF_H * 2);
    this.node.addComponent(BlockInputEvents);
    const dim = this.node.addComponent(Graphics);
    dim.fillColor = new Color(0, 0, 0, 180);
    dim.rect(-HALF_W, -HALF_H, HALF_W * 2, HALF_H * 2);
    dim.fill();

    // Central card.
    const cardW = 520;
    const cardH = 360;
    const card = this.addGraphics('Card');
    card.fillColor = new Color(28, 34, 22, 245);
    card.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    card.fill();
    card.lineWidth = 4;
    card.strokeColor = new Color(120, 150, 90, 255);
    card.stroke();

    this.addLabel('SETTINGS', 0, 110, 44, new Color(235, 235, 235, 255));
    this.addLabel('(coming soon)', 0, 40, 24, new Color(180, 180, 180, 255));

    this.buildBackButton(0, -110, 220, 64);
  }

  // --- internals ------------------------------------------------------------

  private buildBackButton(x: number, y: number, w: number, h: number): void {
    const node = new Node('BackButton');
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
    label.string = 'Back';
    label.fontSize = 30;
    label.lineHeight = 36;
    label.color = new Color(245, 245, 245, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    node.addChild(labelNode);

    node.on(Node.EventType.TOUCH_END, this.handleClose, this);
  }

  private handleClose(): void {
    const cb = this.onClose;
    this.onClose = null; // guard against double taps
    if (cb) cb();
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
    ut.setContentSize(480, size * 1.4);
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
