/**
 * GameSceneController.ts
 * ----------------------------------------------------------------------------
 * Minimal first screen for Arrow Tower Guard, built PROGRAMMATICALLY so no
 * fragile .scene authoring is needed. Attach this component to a node under the
 * Canvas and press Play — it builds the HUD/buttons/placeholders and wires the
 * migrated pure-logic systems.
 *
 * Shows: HUD gold text + wave text, a "+100 Gold" debug button, a "Buy Damage"
 * upgrade button, and placeholder left tower + right enemy-spawn boxes.
 * NO combat yet.
 *
 * Wiring (all pure logic migrated from the WeChat project):
 *   SaveServiceFactory -> backend (local; cloud later)
 *   SaveService        -> load/save the profile (persist only at save points)
 *   Wallet             -> runtime gold, emits GoldChanged via EventBus
 *   UpgradeSystem      -> cost curve + level increment on purchase
 *
 * Layout adapts to the Canvas design resolution via view.getVisibleSize(), so
 * it looks correct whether the project is 1280x720 or otherwise.
 * ----------------------------------------------------------------------------
 */

import { _decorator, Component, Node, Label, UITransform, Graphics, Color, Layers, view } from 'cc';
import { eventBus, GameEvent } from '../core/EventBus';
import { SaveServiceFactory } from '../save/SaveServiceFactory';
import type { SaveService } from '../save/SaveService';
import type { PlayerSaveData } from '../save/PlayerSaveData';
import { Wallet } from '../economy/Wallet';
import { UpgradeSystem } from '../upgrades/UpgradeSystem';
import { TOTAL_WAVES } from '../core/GameConfig';
import { AssetConfig } from '../art/AssetConfig';
import type { SpriteAsset } from '../art/AssetConfig';
import { AssetLoader } from '../art/AssetLoader';

const { ccclass } = _decorator;

@ccclass('GameSceneController')
export class GameSceneController extends Component {
  private save!: SaveService;
  private profile!: PlayerSaveData;
  private wallet!: Wallet;
  private upgradeSystem!: UpgradeSystem;

  // Half-extents of the visible area (center-origin coordinates).
  private hw = 640;
  private hh = 360;

  private goldLabel: Label | null = null;
  private damageLabel: Label | null = null;

  protected async start(): Promise<void> {
    const size = view.getVisibleSize();
    this.hw = size.width / 2;
    this.hh = size.height / 2;

    // --- bootstrap pure logic ---
    this.save = SaveServiceFactory.create();
    this.profile = await this.loadProfileSafely();
    this.upgradeSystem = new UpgradeSystem(this.profile);
    this.wallet = new Wallet(); // emits on the shared eventBus

    eventBus.on(GameEvent.GoldChanged, this.onGoldChanged, this);

    // --- build the screen ---
    this.buildField();
    this.buildHud();
    this.buildButtons();

    // Seed gold from the save; emits GoldChanged -> refreshes the HUD label.
    this.wallet.setGold(this.profile.gold);
  }

  protected onDestroy(): void {
    eventBus.offTarget(this);
  }

  private async loadProfileSafely(): Promise<PlayerSaveData> {
    try {
      return await this.save.load();
    } catch (err) {
      console.error('[GameSceneController] load failed; using default profile', err);
      return this.save.createDefaultSave();
    }
  }

  // --- UI construction -----------------------------------------------------

  private buildField(): void {
    const { hw, hh } = this;
    const groundTopY = -hh + 200; // ground band is 200px tall at the bottom

    this.addArt(AssetConfig.background.field, 0, 0, hw * 2, hh * 2); // background
    this.addArt(AssetConfig.background.ground, 0, (-hh + groundTopY) / 2, hw * 2, groundTopY - -hh); // ground

    // Enemy spawn zone (right) + placeholder monster.
    const zoneW = Math.min(180, hw * 0.28);
    this.addArt(AssetConfig.ui.spawnZone, hw - zoneW / 2, (groundTopY + hh) / 2, zoneW, hh - groundTopY);
    this.addArt(AssetConfig.enemy.goblin, hw - zoneW / 2, groundTopY + 25, 32, 50);
    this.addLabel('ENEMY SPAWN', hw - zoneW / 2, hh - 30, 16, color(255, 255, 255), Label.HorizontalAlign.CENTER);

    // Castle + tower + archer (left).
    this.addArt(AssetConfig.tower.castle, -hw + 85, groundTopY + 75, 90, 150);
    this.addArt(AssetConfig.tower.tower, -hw + 145, groundTopY + 110, 46, 200);
    this.addArt(AssetConfig.tower.archer, -hw + 168, groundTopY + 215, 30, 30);
  }

  private buildHud(): void {
    const { hw, hh } = this;
    this.goldLabel = this.addLabel('Gold: 0', -hw + 20, hh - 30, 26, color(255, 210, 63), Label.HorizontalAlign.LEFT);
    this.addLabel(`WAVE ${this.profile.currentWave} / ${TOTAL_WAVES}`, 0, hh - 30, 24, color(255, 255, 255), Label.HorizontalAlign.CENTER);
    const dmgLv = this.upgradeSystem.getLevel('damage');
    this.damageLabel = this.addLabel(`Damage Lv.${dmgLv}`, -hw + 20, hh - 70, 20, color(230, 230, 230), Label.HorizontalAlign.LEFT);
  }

  private buildButtons(): void {
    const { hw, hh } = this;
    this.addButton('+100 Gold (debug)', hw - 130, hh - 40, 220, 56, () => this.onDebugAddGold());
    this.addButton('Buy Damage', hw - 130, hh - 110, 220, 56, () => this.onBuyDamage());
  }

  // --- actions (save points) -----------------------------------------------

  private onGoldChanged(p: { gold: number }): void {
    this.profile.gold = p.gold; // mirror only; NOT a save
    if (this.goldLabel) this.goldLabel.string = `Gold: ${p.gold}`;
  }

  /** TEMPORARY debug: add gold and persist so it survives a restart. */
  private onDebugAddGold(): void {
    this.wallet.addGold(100);
    this.persist('debug-add-gold');
  }

  private onBuyDamage(): void {
    const cost = this.upgradeSystem.getNextCost('damage');
    if (cost === null || !this.wallet.canAfford(cost)) return;
    this.wallet.spendGold(cost);
    const newLevel = this.profile.upgrades.damageLevel + 1;
    this.upgradeSystem.purchase('damage');
    eventBus.emit(GameEvent.UpgradePurchased, { id: 'damage', level: newLevel });
    if (this.damageLabel) this.damageLabel.string = `Damage Lv.${this.upgradeSystem.getLevel('damage')}`;
    this.persist('upgrade-purchased');
  }

  private persist(reason: string): void {
    this.profile.gold = this.wallet.getGold(); // ensure mirrored before write
    void this.save.save(this.profile).catch((err) => {
      console.error(`[GameSceneController] save failed (${reason})`, err);
    });
  }

  // --- tiny UI helpers -----------------------------------------------------

  /**
   * Place a piece of art. Draws the Graphics-color placeholder immediately
   * (current look), then asks AssetLoader to swap in a real SpriteFrame if a PNG
   * exists for this asset. The fill color comes from AssetConfig -> GameConfig,
   * so no colors are hard-coded here.
   */
  private addArt(asset: SpriteAsset, x: number, y: number, w: number, h: number): Node {
    const fill = hexToColor(asset.fallbackColor, asset.alpha ?? 255);
    const node = this.addRect(x, y, w, h, fill);
    AssetLoader.applyTo(node, asset);
    return node;
  }

  /** A solid-color rectangle node (its own Graphics, single color). */
  private addRect(x: number, y: number, w: number, h: number, fill: Color): Node {
    const node = new Node('rect');
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = fill;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
    this.node.addChild(node);
    node.setPosition(x, y, 0);
    return node;
  }

  private addLabel(text: string, x: number, y: number, size: number, col: Color, align: number): Label {
    const node = new Node('label');
    node.layer = Layers.Enum.UI_2D;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(400, size * 1.4);
    ut.setAnchorPoint(align === Label.HorizontalAlign.LEFT ? 0 : 0.5, 0.5);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size * 1.2;
    label.color = col;
    label.horizontalAlign = align;
    this.node.addChild(node);
    node.setPosition(x, y, 0);
    return label;
  }

  private addButton(text: string, x: number, y: number, w: number, h: number, onClick: () => void): Node {
    const node = new Node('button');
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = hexToColor(AssetConfig.ui.button.fallbackColor);
    g.roundRect(-w / 2, -h / 2, w, h, 8);
    g.fill();
    // Swap in real button art if a PNG exists; otherwise the rounded placeholder stays.
    AssetLoader.applyTo(node, AssetConfig.ui.button);

    const labelNode = new Node('label');
    labelNode.layer = Layers.Enum.UI_2D;
    labelNode.addComponent(UITransform).setContentSize(w, h);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = 20;
    label.lineHeight = 24;
    label.color = color(255, 255, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    node.addChild(labelNode);

    node.on(Node.EventType.TOUCH_END, onClick, this);
    this.node.addChild(node);
    node.setPosition(x, y, 0);
    return node;
  }
}

/** Color helper (0-255 channels). */
function color(r: number, g: number, b: number, a = 255): Color {
  return new Color(r, g, b, a);
}

/** Parse a `#rrggbb` hex string (from AssetConfig/GameConfig) into a Color. */
function hexToColor(hex: string, a = 255): Color {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return new Color(r, g, b, a);
}
