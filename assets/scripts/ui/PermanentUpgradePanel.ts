/**
 * PermanentUpgradePanel.ts
 * ----------------------------------------------------------------------------
 * The MAIN-MENU permanent-upgrade overlay (distinct from the in-battle
 * `UpgradePanel`, which is kept for the between-level flow). A code-built panel,
 * pure PRESENTER: it renders the rows/gold it is handed and reports the "upgrade
 * this" intent back via `onUpgrade`. It computes NO game numbers — costs and
 * effect strings are produced by the caller from UpgradeSystem/GameConfig.
 *
 * Each row shows: name, current level, current effect, next-level effect, cost,
 * and an Upgrade button (greyed when unaffordable or capped). After a tap it
 * shows a short toast ("升级成功" / "金币不足" / "已达上限") and re-reads state.
 *
 * Usage: MainMenuManager creates a centered child node, adds this component, and
 * calls `show({ ... })`. Required scene refs: none (built in `show()`).
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

/** Result of an upgrade attempt, used to pick the toast message. */
export type UpgradeResult = 'ok' | 'poor' | 'maxed';

/** Live state of one upgrade row (re-read on every refresh). */
export interface PermUpgradeRowData {
  id: UpgradeId;
  name: string;
  level: number;
  currentEffect: string;   // e.g. "25" / "360ms/次" / "10%" / "1200"
  nextEffect: string;      // next-level effect, or "已达上限" when capped
  cost: number | null;     // next-level cost, or null when capped
  affordable: boolean;
  maxed: boolean;
}

/** Everything the panel reads/reports. All state lives in MainMenuManager. */
export interface PermanentUpgradePanelData {
  /** Current gold balance (read live so it tracks purchases). */
  getGold: () => number;
  /** Current state of all upgrade rows (read live). */
  getRows: () => PermUpgradeRowData[];
  /** Intent: upgrade this stat. Returns the outcome so the panel can toast. */
  onUpgrade: (id: UpgradeId) => UpgradeResult;
  /** Intent: close the panel (caller destroys the node). */
  onClose: () => void;
}

/** Per-row view handles kept so refresh() can update them in place. */
interface RowView {
  title: Label;    // "箭矢伤害  Lv.3"
  effect: Label;   // "当前：25   下一级：30"
  cost: Label;     // "消耗：246 金币" / "已达上限"
  buttonBg: Graphics;
  buttonLabel: Label;
  enabled: boolean;
}

const CARD_W = 760;
const CARD_H = 600;
const ROW_W = 700;
const ROW_H = 92;

@ccclass('PermanentUpgradePanel')
export class PermanentUpgradePanel extends Component {
  private data: PermanentUpgradePanelData | null = null;
  private goldLabel: Label | null = null;
  private toastLabel: Label | null = null;
  private readonly rows = new Map<UpgradeId, RowView>();

  /** Build and display the panel for `data`. Call once. */
  show(data: PermanentUpgradePanelData): void {
    this.data = data;

    // Full-screen dim that also swallows taps from reaching the menu beneath.
    this.node.addComponent(UITransform).setContentSize(HALF_W * 2, HALF_H * 2);
    this.node.addComponent(BlockInputEvents);
    const dim = this.node.addComponent(Graphics);
    dim.fillColor = new Color(0, 0, 0, 190);
    dim.rect(-HALF_W, -HALF_H, HALF_W * 2, HALF_H * 2);
    dim.fill();

    // Central card.
    const card = this.addGraphics('Card');
    card.fillColor = new Color(28, 34, 22, 248);
    card.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 18);
    card.fill();
    card.lineWidth = 4;
    card.strokeColor = new Color(120, 150, 90, 255);
    card.stroke();

    // Header: title + gold + close button.
    this.addLabel('永久升级', 0, CARD_H / 2 - 48, 40, new Color(255, 210, 63, 255), CARD_W);
    this.goldLabel = this.addLabel('金币: 0', -CARD_W / 2 + 160, CARD_H / 2 - 100, 28, new Color(255, 210, 63, 255), 320);
    this.buildCloseButton(CARD_W / 2 - 60, CARD_H / 2 - 48, 72, 56);

    // Upgrade rows (top -> bottom).
    const rowData = data.getRows();
    const firstY = CARD_H / 2 - 175;
    rowData.forEach((r, i) => this.buildRow(r, firstY - i * (ROW_H + 12)));

    // Toast line near the bottom (above the close hint).
    this.toastLabel = this.addLabel('', 0, -CARD_H / 2 + 40, 26, new Color(245, 245, 245, 255), CARD_W);

    this.refresh();
  }

  /** Re-read gold + every row's state and repaint (after an upgrade attempt). */
  refresh(): void {
    if (!this.data) return;
    if (this.goldLabel) this.goldLabel.string = `金币: ${this.data.getGold()}`;

    for (const r of this.data.getRows()) {
      const view = this.rows.get(r.id);
      if (!view) continue;
      view.title.string = `${r.name}   Lv.${r.level}`;
      view.effect.string = r.maxed
        ? `当前：${r.currentEffect}`
        : `当前：${r.currentEffect}    下一级：${r.nextEffect}`;
      view.cost.string = r.maxed ? '已达上限' : `消耗：${r.cost} 金币`;
      view.buttonLabel.string = r.maxed ? '已满' : '升级';
      const enabled = !r.maxed && r.affordable;
      view.enabled = enabled;
      this.paintButton(view.buttonBg, enabled);
    }
  }

  // --- internals ------------------------------------------------------------

  private buildRow(r: PermUpgradeRowData, y: number): void {
    const plate = this.addGraphics(`row-${r.id}`);
    plate.fillColor = new Color(40, 50, 32, 255);
    plate.roundRect(-ROW_W / 2, y - ROW_H / 2, ROW_W, ROW_H, 10);
    plate.fill();

    // Left column: name + level (top) and effect line (below).
    const title = this.addLabel(`${r.name}   Lv.${r.level}`, -ROW_W / 2 + 30, y + 18, 28, new Color(235, 235, 235, 255), 380, true);
    const effect = this.addLabel('', -ROW_W / 2 + 30, y - 20, 22, new Color(180, 210, 150, 255), 460, true);

    // Cost line (right of center).
    const cost = this.addLabel('', ROW_W / 2 - 320, y, 24, new Color(255, 210, 63, 255), 220, true);

    // Upgrade button (far right).
    const { bg, label } = this.buildUpgradeButton(r.id, ROW_W / 2 - 90, y, 150, ROW_H - 28);

    this.rows.set(r.id, { title, effect, cost, buttonBg: bg, buttonLabel: label, enabled: false });
  }

  private buildUpgradeButton(id: UpgradeId, x: number, y: number, w: number, h: number): { bg: Graphics; label: Label } {
    const node = new Node(`upgrade-${id}`);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    this.node.addChild(node);
    node.setPosition(x, y, 0);

    const bg = node.addComponent(Graphics);
    this.paintButton(bg, false);

    const labelNode = new Node('label');
    labelNode.layer = Layers.Enum.UI_2D;
    labelNode.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
    const label = labelNode.addComponent(Label);
    label.string = '升级';
    label.fontSize = 28;
    label.lineHeight = 32;
    label.color = new Color(245, 245, 245, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    node.addChild(labelNode);

    node.on(Node.EventType.TOUCH_END, () => this.handleUpgrade(id), this);
    return { bg, label };
  }

  private handleUpgrade(id: UpgradeId): void {
    if (!this.data) return;
    const view = this.rows.get(id);
    // Even on a disabled button, give feedback about WHY it's disabled.
    const result = view && view.enabled ? this.data.onUpgrade(id) : this.disabledReason(id);
    this.showToast(result);
    this.refresh();
  }

  /** Why a greyed button can't be used right now (for the toast). */
  private disabledReason(id: UpgradeId): UpgradeResult {
    const row = this.data?.getRows().find((r) => r.id === id);
    return row?.maxed ? 'maxed' : 'poor';
  }

  private showToast(result: UpgradeResult): void {
    if (!this.toastLabel) return;
    const map: Record<UpgradeResult, { text: string; col: Color }> = {
      ok: { text: '升级成功', col: new Color(150, 220, 120, 255) },
      poor: { text: '金币不足', col: new Color(230, 120, 100, 255) },
      maxed: { text: '已达上限', col: new Color(220, 200, 150, 255) },
    };
    const { text, col } = map[result];
    this.toastLabel.string = text;
    this.toastLabel.color = col;
    // Clear after a moment (cancel any pending clear first).
    this.unschedule(this.clearToast);
    this.scheduleOnce(this.clearToast, 1.5);
  }

  private clearToast = (): void => {
    if (this.toastLabel) this.toastLabel.string = '';
  };

  private buildCloseButton(x: number, y: number, w: number, h: number): void {
    const node = new Node('CloseButton');
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    this.node.addChild(node);
    node.setPosition(x, y, 0);

    const g = node.addComponent(Graphics);
    g.fillColor = new Color(90, 60, 58, 255);
    g.roundRect(-w / 2, -h / 2, w, h, 10);
    g.fill();
    g.lineWidth = 2;
    g.strokeColor = new Color(180, 120, 110, 255);
    g.stroke();

    const labelNode = new Node('label');
    labelNode.layer = Layers.Enum.UI_2D;
    labelNode.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
    const label = labelNode.addComponent(Label);
    label.string = '✕';
    label.fontSize = 32;
    label.lineHeight = 36;
    label.color = new Color(245, 245, 245, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    node.addChild(labelNode);

    node.on(Node.EventType.TOUCH_END, this.handleClose, this);
  }

  private handleClose(): void {
    const cb = this.data?.onClose;
    this.data = null; // guard against double taps
    if (cb) cb();
  }

  /** Paint an upgrade button enabled (green) or disabled (grey). */
  private paintButton(g: Graphics, enabled: boolean): void {
    const w = 150;
    const h = ROW_H - 28;
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

  private addLabel(
    text: string, x: number, y: number, size: number, col: Color, width: number,
    left = false,
  ): Label {
    const node = new Node('label');
    node.layer = Layers.Enum.UI_2D;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(width, size * 1.4);
    ut.setAnchorPoint(left ? 0 : 0.5, 0.5);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size * 1.2;
    label.color = col;
    label.horizontalAlign = left ? Label.HorizontalAlign.LEFT : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    this.node.addChild(node);
    node.setPosition(x, y, 0);
    return label;
  }
}
