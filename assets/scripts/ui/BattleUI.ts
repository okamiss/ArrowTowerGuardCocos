/**
 * BattleUI.ts
 * ----------------------------------------------------------------------------
 * The in-battle HUD. A pure PRESENTER, built in code (no .scene authoring) to
 * match the rest of the UI. It shows the live battle state and exposes the pause
 * button — nothing more. It NEVER mutates gold, waves, HP, kills, or the save:
 * every number is read through the `BattleUiData` getters (owned by
 * BattleManager) and the panel only repaints when BattleManager calls one of the
 * `refresh*` methods (so it does not poll state every frame).
 *
 * Layout (landscape, generous safe margins so nothing crowds the screen edge or
 * the central battlefield):
 *   top-left    : current wave + remaining monsters
 *   top-center  : castle HP text + bar
 *   top-right   : gold + pause button
 *   bottom-left : kills
 *
 * Usage: BattleManager creates a centered child node, adds this component, and
 * calls `build({ ... })`; thereafter it calls refreshGold/refreshWave/etc. at the
 * matching events (gold change, wave change, castle hit, kill, spawn).
 *
 * Required scene refs: none (the node tree is built in `build()`).
 * ----------------------------------------------------------------------------
 */

import {
  _decorator, Component, Node, UITransform, Graphics, Label, Color, Layers,
} from 'cc';
import { GameConfig } from '../core/GameConfig';

const { ccclass } = _decorator;

const HALF_W = GameConfig.layout.designWidth / 2;
const HALF_H = GameConfig.layout.designHeight / 2;

/** Safe top/side inset so HUD text never hugs the screen edge. */
const MARGIN = 36;

/** Castle HP bar dimensions (top-center). */
const BAR_W = 300;
const BAR_H = 20;

/** Everything the HUD reads, plus the pause intent. All state lives in BattleManager. */
export interface BattleUiData {
  /** Current LEVEL (关) — shown as "关卡：第 N 关". */
  getLevel: () => number;
  /** Current WAVE (波) within the level, 1..wavesPerLevel — shown as "波次：第 W / N 波". */
  getWave: () => number;
  /** Waves per level (default 10). */
  getWavesPerLevel: () => number;
  getGold: () => number;
  getCastleHp: () => number;
  getCastleMaxHp: () => number;
  getKills: () => number;
  /** Monsters currently alive on the field. */
  getAliveMonsters: () => number;
  /** Intent: player tapped pause. BattleManager freezes the battle + pops the menu. */
  onPause: () => void;
}

@ccclass('BattleUI')
export class BattleUI extends Component {
  private data: BattleUiData | null = null;

  private levelLabel: Label | null = null;
  private waveLabel: Label | null = null;
  private monsterLabel: Label | null = null;
  private goldLabel: Label | null = null;
  private killLabel: Label | null = null;
  private castleLabel: Label | null = null;
  private castleBar: Graphics | null = null;

  // Pause-button rect in this.node-local space, for fire-suppression hit-tests.
  private pauseRect: { cx: number; cy: number; w: number; h: number } | null = null;

  /** Build the HUD node tree and paint the initial state. Call once. */
  build(data: BattleUiData): void {
    this.data = data;
    this.node.addComponent(UITransform).setContentSize(HALF_W * 2, HALF_H * 2);

    const light = new Color(235, 235, 235, 255);
    const gold = new Color(255, 210, 63, 255);

    // top-left: level, wave, remaining monsters (three stacked lines)
    this.levelLabel = this.addLabel('关卡：第 - 关', -HALF_W + MARGIN, HALF_H - MARGIN - 4, 30, gold, 0);
    this.waveLabel = this.addLabel('波次：第 - / - 波', -HALF_W + MARGIN, HALF_H - MARGIN - 42, 26, light, 0);
    this.monsterLabel = this.addLabel('剩余怪物：-', -HALF_W + MARGIN, HALF_H - MARGIN - 76, 22, light, 0);

    // top-center: castle HP text + bar
    this.castleLabel = this.addLabel('城墙 -- / --', 0, HALF_H - MARGIN - 4, 24, new Color(180, 220, 140, 255), 0.5);
    this.castleBar = this.addGraphics('castleBar', 0, HALF_H - MARGIN - 34);

    // top-right: pause button + gold (gold sits to the left of the button)
    const pauseW = 110;
    const pauseH = 52;
    const pauseCx = HALF_W - MARGIN - pauseW / 2;
    const pauseCy = HALF_H - MARGIN - pauseH / 2;
    this.buildPauseButton(pauseCx, pauseCy, pauseW, pauseH);
    this.pauseRect = { cx: pauseCx, cy: pauseCy, w: pauseW, h: pauseH };
    this.goldLabel = this.addLabel('金币：0', pauseCx - pauseW / 2 - 24, pauseCy, 28, gold, 1);

    // bottom-left: kills
    this.killLabel = this.addLabel('击杀：0', -HALF_W + MARGIN, -HALF_H + MARGIN + 6, 26, light, 0);

    this.refreshAll();
  }

  // --- refresh API (called by BattleManager at the matching events) ---------

  refreshAll(): void {
    this.refreshWave();
    this.refreshGold();
    this.refreshCastleHp();
    this.refreshKillCount();
    this.refreshMonsterCount();
  }

  /** Repaint both the level (关) and wave (波) lines. */
  refreshWave(): void {
    if (!this.data) return;
    if (this.levelLabel) this.levelLabel.string = `关卡：第 ${this.data.getLevel()} 关`;
    if (this.waveLabel) {
      this.waveLabel.string = `波次：第 ${this.data.getWave()} / ${this.data.getWavesPerLevel()} 波`;
    }
  }

  refreshGold(): void {
    if (this.goldLabel && this.data) this.goldLabel.string = `金币：${this.data.getGold()}`;
  }

  refreshKillCount(): void {
    if (this.killLabel && this.data) this.killLabel.string = `击杀：${this.data.getKills()}`;
  }

  refreshMonsterCount(): void {
    if (this.monsterLabel && this.data) this.monsterLabel.string = `剩余怪物：${this.data.getAliveMonsters()}`;
  }

  /**
   * Repaint the castle HP line + bar. Values may be passed explicitly (the
   * CastleHpChanged event carries them, and on construction `this.castle` is not
   * yet assigned in BattleManager); otherwise they are read from the getters.
   */
  refreshCastleHp(hp?: number, maxHp?: number): void {
    if (!this.data) return;
    const cur = hp ?? this.data.getCastleHp();
    const max = maxHp ?? this.data.getCastleMaxHp();
    if (this.castleLabel) this.castleLabel.string = `城墙 ${cur} / ${max}`;
    this.paintCastleBar(cur, max);
  }

  /** True if the battle-local point (this.node space) lands on the pause button.
   *  BattleManager uses this to stop a tap on pause from also firing an arrow. */
  hitTestLocal(x: number, y: number): boolean {
    const r = this.pauseRect;
    return !!r && Math.abs(x - r.cx) <= r.w / 2 && Math.abs(y - r.cy) <= r.h / 2;
  }

  // --- internals ------------------------------------------------------------

  private paintCastleBar(hp: number, max: number): void {
    const g = this.castleBar;
    if (!g) return;
    const ratio = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
    g.clear();

    // track
    g.fillColor = new Color(30, 34, 26, 220);
    g.roundRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, 6);
    g.fill();

    // fill (green healthy, red when low)
    if (ratio > 0) {
      g.fillColor = ratio > 0.3 ? new Color(110, 200, 110, 255) : new Color(210, 90, 80, 255);
      g.roundRect(-BAR_W / 2, -BAR_H / 2, BAR_W * ratio, BAR_H, 6);
      g.fill();
    }

    // border
    g.lineWidth = 2;
    g.strokeColor = new Color(150, 170, 120, 255);
    g.roundRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, 6);
    g.stroke();
  }

  private buildPauseButton(x: number, y: number, w: number, h: number): void {
    const node = new Node('PauseButton');
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    this.node.addChild(node);
    node.setPosition(x, y, 0);

    const g = node.addComponent(Graphics);
    g.fillColor = new Color(60, 70, 50, 235);
    g.roundRect(-w / 2, -h / 2, w, h, 10);
    g.fill();
    g.lineWidth = 3;
    g.strokeColor = new Color(150, 180, 110, 255);
    g.stroke();

    const labelNode = new Node('label');
    labelNode.layer = Layers.Enum.UI_2D;
    labelNode.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
    const label = labelNode.addComponent(Label);
    label.string = '暂停';
    label.fontSize = 28;
    label.lineHeight = 34;
    label.color = new Color(245, 245, 245, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    node.addChild(labelNode);

    node.on(Node.EventType.TOUCH_END, () => this.data?.onPause(), this);
  }

  private addGraphics(name: string, x: number, y: number): Graphics {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform);
    this.node.addChild(node);
    node.setPosition(x, y, 0);
    return node.addComponent(Graphics);
  }

  /** anchorX: 0 = left-aligned, 0.5 = centered, 1 = right-aligned. */
  private addLabel(text: string, x: number, y: number, size: number, col: Color, anchorX: number): Label {
    const node = new Node('label');
    node.layer = Layers.Enum.UI_2D;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(420, size * 1.4);
    ut.setAnchorPoint(anchorX, 0.5);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size * 1.2;
    label.color = col;
    label.horizontalAlign =
      anchorX === 1 ? Label.HorizontalAlign.RIGHT
        : anchorX === 0.5 ? Label.HorizontalAlign.CENTER
          : Label.HorizontalAlign.LEFT;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.enableOutline = true;
    label.outlineColor = new Color(0, 0, 0, 170);
    label.outlineWidth = 2;
    this.node.addChild(node);
    node.setPosition(x, y, 0);
    return label;
  }
}
