/**
 * MainMenuManager.ts
 * ----------------------------------------------------------------------------
 * The MAIN MENU controller (entry point of MainScene). Parallels
 * GameSceneController: attach it to ONE node centered under the 1280x720 Canvas
 * and press Play. It builds a code-driven skeleton UI (title + three buttons),
 * decides whether "Continue" is available by reading the save, and routes the
 * player into the battle scene. No combat / wave / spawning logic lives here —
 * that all stays in BattleManager and friends, reached only by switching scenes.
 *
 * Navigation:
 *   - Start Game  -> reset the run to level 1, persist, load the battle scene.
 *                    (Permanent gold/upgrades are kept; only currentLevel resets.)
 *   - Continue    -> load the battle scene as-is; BattleManager resumes at the
 *                    saved `currentLevel`. Disabled (greyed) when there is no
 *                    progress to resume.
 *   - Settings    -> pop a minimal SettingsPanel overlay with a Back button.
 *
 * Save access goes through SaveService only (never wx storage / localStorage
 * directly), exactly like BattleManager. Resume granularity is per-LEVEL
 * (currentLevel) because that is what the save persists — waves within a level
 * are transient and intentionally not stored (see WavePlan in GameConfig).
 *
 * Required scene refs: none (the node tree is built in code).
 * ----------------------------------------------------------------------------
 */

import {
  _decorator, Component, Node, UITransform, Graphics, Label, Color, Layers,
  director, view,
} from 'cc';
import { GameConfig } from '../core/GameConfig';
import type { UpgradeId } from '../core/GameConfig';
import { SaveServiceFactory } from '../save/SaveServiceFactory';
import type { SaveService } from '../save/SaveService';
import type { PlayerSaveData } from '../save/PlayerSaveData';
import { UpgradeSystem } from '../upgrades/UpgradeSystem';
import { SettingsPanel } from '../ui/SettingsPanel';
import { PermanentUpgradePanel } from '../ui/PermanentUpgradePanel';
import type { PermUpgradeRowData, UpgradeResult } from '../ui/PermanentUpgradePanel';

const { ccclass } = _decorator;

const HALF_W = GameConfig.layout.designWidth / 2;
const HALF_H = GameConfig.layout.designHeight / 2;

/** A simple code-built button: its node plus a re-tintable background. */
interface MenuButton {
  node: Node;
  bg: Graphics;
  label: Label;
  width: number;
  height: number;
}

@ccclass('MainMenuManager')
export class MainMenuManager extends Component {
  private save!: SaveService;
  private profile: PlayerSaveData | null = null;

  /** Continue is gated on having progress to resume; off until the save loads. */
  private canContinue = false;
  private continueButton: MenuButton | null = null;
  private hintLabel: Label | null = null;
  private settingsNode: Node | null = null;
  private upgradeNode: Node | null = null;
  /** Built from the loaded profile when the upgrade panel opens. */
  private upgradeSystem: UpgradeSystem | null = null;
  private navigating = false; // guard against double-taps during scene load

  /** Upgrade rows are shown in this order, top -> bottom. */
  private readonly upgradeOrder: UpgradeId[] = ['damage', 'attackSpeed', 'crit', 'castleHp'];

  protected async start(): Promise<void> {
    // Center this node under the Canvas so our center-origin layout lines up.
    const size = view.getVisibleSize();
    const ut = this.getComponent(UITransform) ?? this.addComponent(UITransform);
    ut.setContentSize(size.width, size.height);
    ut.setAnchorPoint(0.5, 0.5);

    this.buildMenu();

    // Load the save to decide whether "Continue" is offered. The button starts
    // disabled and is enabled only if there is real progress to resume.
    this.save = SaveServiceFactory.create();
    try {
      this.profile = await this.save.load();
      this.canContinue = this.hasProgress(this.profile);
    } catch (err) {
      console.error('[MainMenuManager] save load failed; Continue disabled', err);
      this.canContinue = false;
    }
    this.refreshContinueState();
  }

  // No onDestroy listener cleanup is needed: each button registers its TOUCH_END
  // handler on its OWN node, and Cocos removes a node's listeners when it (and
  // hence this component) is destroyed during the scene switch.

  /** A save is worth resuming once the player has cleared level 1 or beyond. */
  private hasProgress(data: PlayerSaveData): boolean {
    return data.highestLevel > 0 || data.currentLevel > 1;
  }

  // --- UI construction ------------------------------------------------------

  private buildMenu(): void {
    this.addTitle('守城弓箭传说', 0, 245);

    const btnW = 360;
    const btnH = 72;
    const step = btnH + 22;
    const y0 = 120; // first (top) button

    const start = this.makeButton('开始游戏', 0, y0, btnW, btnH, this.onStartTapped);
    this.tint(start, new Color(74, 110, 58, 255), new Color(150, 200, 110, 255)); // green = primary

    this.continueButton = this.makeButton('继续游戏', 0, y0 - step, btnW, btnH, this.onContinueTapped);
    this.makeButton('升级', 0, y0 - 2 * step, btnW, btnH, this.onUpgradeTapped);
    this.makeButton('设置', 0, y0 - 3 * step, btnW, btnH, this.onSettingsTapped);

    // "No save" hint sits to the right of the Continue button; shown when disabled.
    this.hintLabel = this.addLabel('', btnW / 2 + 90, y0 - step, 22, new Color(200, 160, 90, 255));
  }

  /** Build a rounded-rect button with a centered label and a TOUCH_END handler. */
  private makeButton(
    text: string, x: number, y: number, w: number, h: number,
    handler: () => void,
  ): MenuButton {
    const node = new Node(`${text}Button`);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    this.node.addChild(node);
    node.setPosition(x, y, 0);

    const bg = node.addComponent(Graphics);

    const labelNode = new Node('label');
    labelNode.layer = Layers.Enum.UI_2D;
    labelNode.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = 32;
    label.lineHeight = 38;
    label.color = new Color(245, 245, 245, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    node.addChild(labelNode);

    const btn: MenuButton = { node, bg, label, width: w, height: h };
    this.tint(btn, new Color(74, 90, 58, 255), new Color(150, 180, 110, 255));
    node.on(Node.EventType.TOUCH_END, handler, this);
    return btn;
  }

  /** Repaint a button's rounded-rect background with the given fill/stroke. */
  private tint(btn: MenuButton, fill: Color, stroke: Color): void {
    const { bg, width: w, height: h } = btn;
    bg.clear();
    bg.fillColor = fill;
    bg.roundRect(-w / 2, -h / 2, w, h, 12);
    bg.fill();
    bg.lineWidth = 3;
    bg.strokeColor = stroke;
    bg.stroke();
  }

  /** Reflect `canContinue` on the Continue button (enabled vs greyed) + hint. */
  private refreshContinueState(): void {
    const btn = this.continueButton;
    if (!btn) return;
    if (this.canContinue) {
      this.tint(btn, new Color(74, 90, 58, 255), new Color(150, 180, 110, 255));
      btn.label.color = new Color(245, 245, 245, 255);
      if (this.hintLabel) this.hintLabel.string = '';
    } else {
      this.tint(btn, new Color(60, 64, 56, 255), new Color(100, 104, 96, 255));
      btn.label.color = new Color(140, 140, 140, 255);
      if (this.hintLabel) this.hintLabel.string = '暂无存档';
    }
  }

  // --- button handlers ------------------------------------------------------

  /** Start a fresh run from level 1 (keeps permanent gold/upgrades), then battle. */
  private onStartTapped(): void {
    if (this.navigating) return;
    this.navigating = true;
    void this.resetRunThenBattle();
  }

  private async resetRunThenBattle(): Promise<void> {
    try {
      // Reload to avoid clobbering anything written since start(), then reset
      // only the run pointer. Gold/upgrades/stats are intentionally preserved.
      const data = this.profile ?? (await this.save.load());
      data.currentLevel = 1;
      await this.save.save(data);
    } catch (err) {
      console.error('[MainMenuManager] failed to reset run; starting anyway', err);
    }
    director.loadScene(GameConfig.scenes.battle);
  }

  /** Resume the saved level. No-op while disabled (no progress to resume). */
  private onContinueTapped(): void {
    if (this.navigating || !this.canContinue) return;
    this.navigating = true;
    // BattleManager loads the save itself and resumes at currentLevel — we only
    // need to switch scenes (no save write required here).
    director.loadScene(GameConfig.scenes.battle);
  }

  /** Pop the minimal settings overlay; Back destroys it and re-enables the menu. */
  private onSettingsTapped(): void {
    if (this.navigating || this.settingsNode) return;
    const node = new Node('SettingsPanel');
    node.layer = Layers.Enum.UI_2D;
    this.node.addChild(node);
    this.settingsNode = node;
    const panel = node.addComponent(SettingsPanel);
    panel.show({ onClose: () => this.closeSettings() });
  }

  private closeSettings(): void {
    this.settingsNode?.destroy();
    this.settingsNode = null;
  }

  // --- permanent upgrades ---------------------------------------------------

  /** Open the permanent-upgrade overlay (spends gold on persistent stats). */
  private onUpgradeTapped(): void {
    if (this.navigating || this.upgradeNode || !this.profile) return;
    // The system reads/writes levels + gold on the live profile; we persist
    // through SaveService after each successful upgrade.
    this.upgradeSystem = new UpgradeSystem(this.profile);

    const node = new Node('PermanentUpgradePanel');
    node.layer = Layers.Enum.UI_2D;
    this.node.addChild(node);
    this.upgradeNode = node;
    const panel = node.addComponent(PermanentUpgradePanel);
    panel.show({
      getGold: () => this.profile?.gold ?? 0,
      getRows: () => this.buildUpgradeRows(),
      onUpgrade: (id) => this.applyUpgrade(id),
      onClose: () => this.closeUpgradePanel(),
    });
  }

  /** Snapshot all four upgrade rows for the panel (display strings only). */
  private buildUpgradeRows(): PermUpgradeRowData[] {
    const sys = this.upgradeSystem;
    if (!sys) return [];
    return this.upgradeOrder.map((id) => {
      const level = sys.getLevel(id);
      const maxed = sys.isMaxed(id);
      return {
        id,
        name: GameConfig.upgrades[id].name,
        level,
        currentEffect: this.formatEffect(id, level),
        nextEffect: maxed ? '已达上限' : this.formatEffect(id, level + 1),
        cost: sys.getNextCost(id),
        affordable: sys.canUpgrade(id),
        maxed,
      };
    });
  }

  /**
   * Format one upgrade's effect at a given level for display. All NUMBERS come
   * from UpgradeSystem — this only turns them into strings (units/percent/ms).
   */
  private formatEffect(id: UpgradeId, level: number): string {
    const sys = this.upgradeSystem!;
    switch (id) {
      case 'damage':
        return `${sys.getDamageBonus(level)}`;
      case 'attackSpeed':
        return `${sys.getAttackIntervalMs(level)}ms/次`;
      case 'crit':
        return `${Math.round(sys.getCritRate(level) * 100)}%`;
      case 'castleHp':
        return `${sys.getCastleMaxHp(level)}`;
    }
  }

  /** Try to buy one level; persist on success. Returns the result for the toast. */
  private applyUpgrade(id: UpgradeId): UpgradeResult {
    const sys = this.upgradeSystem;
    if (!sys || !this.profile) return 'poor';
    if (sys.isMaxed(id)) return 'maxed';
    if (!sys.upgrade(id)) return 'poor'; // not enough gold
    void this.save.save(this.profile).catch((err) =>
      console.error('[MainMenuManager] failed to persist upgrade', err),
    );
    return 'ok';
  }

  private closeUpgradePanel(): void {
    this.upgradeNode?.destroy();
    this.upgradeNode = null;
    this.upgradeSystem = null;
  }

  // --- label helpers --------------------------------------------------------

  private addTitle(text: string, x: number, y: number): void {
    this.addLabel(text, x, y, 64, new Color(255, 210, 63, 255));
    this.addLabel('Castle Defense Archer', x, y - 58, 24, new Color(200, 200, 200, 255));
  }

  private addLabel(text: string, x: number, y: number, size: number, col: Color): Label {
    const node = new Node('label');
    node.layer = Layers.Enum.UI_2D;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(900, size * 1.4);
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
