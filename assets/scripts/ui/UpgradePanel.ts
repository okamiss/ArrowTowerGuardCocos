/**
 * UpgradePanel.ts
 * ----------------------------------------------------------------------------
 * The between-level overlay shown after a level is cleared. A code-built panel
 * (no .scene authoring), matching how BattleManager / ResultPanel build the rest
 * of the UI. It is a pure PRESENTER:
 *   - shows the cleared level + current gold,
 *   - shows the 4 MVP upgrades (name, level, next cost) each with a Buy button,
 *   - shows a "Continue" button to advance to the next level.
 *
 * It owns NO game state: it reads everything through the callbacks in
 * UpgradePanelData and reports intents back (onBuy / onContinue). It never
 * touches the save, the wallet, or the EventBus directly — BattleManager wires
 * those. After a buy, BattleManager applies it and the panel re-reads state via
 * refresh().
 *
 * Usage: BattleManager creates a centered child node, adds this component, and
 * calls show({ ... }); when the player taps Continue it calls onContinue.
 *
 * Required scene refs: none (the node tree is built in `show()`).
 * ----------------------------------------------------------------------------
 */

import {
  _decorator, Component, Node, UITransform, Graphics, Label, Color, Layers,
  BlockInputEvents,
} from 'cc';
import { GameConfig } from '../core/GameConfig';
import type { UpgradeId } from '../core/GameConfig';

const { ccclass } = _decorator;

const HALF_W = GameConfig.layout.designWidth / 2;
const HALF_H = GameConfig.layout.designHeight / 2;

/** Live state of one upgrade row (re-read on every refresh). */
export interface UpgradeRowData {
  id: UpgradeId;
  name: string;
  level: number;
  maxed: boolean;
  cost: number | null;   // next-level cost, or null if maxed
  affordable: boolean;
}

/** Everything the panel reads/reports. All state lives in BattleManager. */
export interface UpgradePanelData {
  /** The level the player just cleared. */
  level: number;
  /** Current gold balance (read live so it tracks purchases). */
  getGold: () => number;
  /** Current state of all upgrade rows (read live). */
  getRows: () => UpgradeRowData[];
  /** Intent: buy this upgrade. BattleManager validates + applies, then the panel refreshes. */
  onBuy: (id: UpgradeId) => void;
  /** Intent: advance to the next level. */
  onContinue: () => void;
}

/** Internal handles kept per row so refresh() can update them in place. */
interface RowView {
  info: Label;     // "Damage  Lv.3"
  cost: Label;     // "120 g" / "MAX"
  buttonBg: Graphics;
  enabled: boolean;
}

const CARD_W = 660;
const CARD_H = 500;
const ROW_W = 600;
const ROW_H = 60;

@ccclass('UpgradePanel')
export class UpgradePanel extends Component {
  private data: UpgradePanelData | null = null;
  private goldLabel: Label | null = null;
  private readonly rows = new Map<UpgradeId, RowView>();

  /** Build and display the panel for `data`. Call once. */
  show(data: UpgradePanelData): void {
    this.data = data;

    // Full-screen dim that also swallows taps from reaching the battlefield.
    this.node.addComponent(UITransform).setContentSize(HALF_W * 2, HALF_H * 2);
    this.node.addComponent(BlockInputEvents);
    const dim = this.node.addComponent(Graphics);
    dim.fillColor = new Color(0, 0, 0, 180);
    dim.rect(-HALF_W, -HALF_H, HALF_W * 2, HALF_H * 2);
    dim.fill();

    // Central card.
    const card = this.addGraphics('Card');
    card.fillColor = new Color(28, 34, 22, 245);
    card.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 16);
    card.fill();
    card.lineWidth = 4;
    card.strokeColor = new Color(120, 150, 90, 255);
    card.stroke();

    // Header.
    this.addLabel(`LEVEL ${data.level} CLEARED`, 0, CARD_H / 2 - 50, 40, new Color(180, 220, 140, 255));
    this.goldLabel = this.addLabel('Gold: 0', 0, CARD_H / 2 - 100, 28, new Color(255, 210, 63, 255));

    // Upgrade rows (top -> bottom).
    const rowData = data.getRows();
    const firstY = CARD_H / 2 - 160;
    rowData.forEach((r, i) => this.buildRow(r, 0, firstY - i * (ROW_H + 14)));

    // Continue.
    this.buildContinueButton(0, -CARD_H / 2 + 50, 260, 64);

    this.refresh();
  }

  /** Re-read gold + every row's state and repaint (after a buy). */
  refresh(): void {
    if (!this.data) return;
    if (this.goldLabel) this.goldLabel.string = `Gold: ${this.data.getGold()}`;

    for (const r of this.data.getRows()) {
      const view = this.rows.get(r.id);
      if (!view) continue;
      view.info.string = `${r.name}   Lv.${r.level}`;
      view.cost.string = r.maxed ? 'MAX' : `${r.cost} g`;
      const enabled = !r.maxed && r.affordable;
      view.enabled = enabled;
      this.paintButton(view.buttonBg, enabled);
    }
  }

  // --- internals ------------------------------------------------------------

  private buildRow(r: UpgradeRowData, x: number, y: number): void {
    // Row background plate.
    const plate = this.addGraphics(`row-${r.id}`);
    plate.fillColor = new Color(40, 50, 32, 255);
    plate.roundRect(-ROW_W / 2, y - ROW_H / 2, ROW_W, ROW_H, 8);
    plate.fill();

    // Left: name + level. Right of center: cost. Far right: Buy button.
    const info = this.addLabel(`${r.name}   Lv.${r.level}`, -ROW_W / 2 + 150, y, 26, new Color(235, 235, 235, 255));
    const cost = this.addLabel('—', ROW_W / 2 - 230, y, 26, new Color(255, 210, 63, 255));

    const buttonBg = this.buildBuyButton(r.id, ROW_W / 2 - 90, y, 150, ROW_H - 14);

    this.rows.set(r.id, { info, cost, buttonBg, enabled: false });
  }

  private buildBuyButton(id: UpgradeId, x: number, y: number, w: number, h: number): Graphics {
    const node = new Node(`buy-${id}`);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    this.node.addChild(node);
    node.setPosition(x, y, 0);

    const g = node.addComponent(Graphics);
    this.paintButton(g, false);

    const labelNode = new Node('label');
    labelNode.layer = Layers.Enum.UI_2D;
    labelNode.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
    const label = labelNode.addComponent(Label);
    label.string = 'Buy';
    label.fontSize = 26;
    label.lineHeight = 30;
    label.color = new Color(245, 245, 245, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    node.addChild(labelNode);

    node.on(Node.EventType.TOUCH_END, () => this.handleBuy(id), this);
    return g;
  }

  private handleBuy(id: UpgradeId): void {
    const view = this.rows.get(id);
    if (!view || !view.enabled || !this.data) return; // ignore taps on disabled rows
    this.data.onBuy(id);
    this.refresh();
  }

  private buildContinueButton(x: number, y: number, w: number, h: number): void {
    const node = new Node('ContinueButton');
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
    label.string = 'Next Level';
    label.fontSize = 30;
    label.lineHeight = 36;
    label.color = new Color(245, 245, 245, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    node.addChild(labelNode);

    node.on(Node.EventType.TOUCH_END, this.handleContinue, this);
  }

  private handleContinue(): void {
    const cb = this.data?.onContinue;
    this.data = null; // guard against double taps while the next level loads
    if (cb) cb();
  }

  /** Paint a buy button enabled (green) or disabled (grey). */
  private paintButton(g: Graphics, enabled: boolean): void {
    const w = 150;
    const h = ROW_H - 14;
    g.clear();
    g.fillColor = enabled ? new Color(74, 110, 58, 255) : new Color(70, 70, 70, 255);
    g.roundRect(-w / 2, -h / 2, w, h, 8);
    g.fill();
    g.lineWidth = 2;
    g.strokeColor = enabled ? new Color(150, 200, 110, 255) : new Color(100, 100, 100, 255);
    g.stroke();
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
    ut.setContentSize(CARD_W, size * 1.4);
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
