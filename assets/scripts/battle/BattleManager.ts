/**
 * BattleManager.ts
 * ----------------------------------------------------------------------------
 * The battle CONDUCTOR. It wires the systems and runs the per-frame loop, but
 * holds no gameplay rules of its own: archer cooldown lives in ArcherController,
 * movement in Arrow/Monster, crit/gold in DamageSystem, spawning in
 * MonsterSpawner, persistence behind SaveService. BattleManager only:
 *   - boots the save/economy/upgrade systems and builds the battlefield nodes,
 *   - routes taps to the archer,
 *   - steps spawner + entities each frame, runs the arrow/monster hit test,
 *   - recycles spent arrows/dead monsters to their pools,
 *   - coalesces gold writes to storage (never per tick).
 *
 * All on-screen art is a real Sprite loaded from assets/resources/art/** (no
 * Graphics placeholders); the frames are preloaded before the battle starts.
 *
 * Editor wiring: this project builds nodes in code (no .scene authoring), so
 * just attach this component to ONE node centered under the 1280x720 Canvas
 * (same pattern as GameSceneController) and press Play. No @property refs needed.
 * ----------------------------------------------------------------------------
 */

import {
  _decorator, Component, Node, UITransform, Sprite, SpriteFrame, Layers, Color, Vec3, Label,
  input, Input, EventTouch, EventMouse, director,
} from 'cc';
import { GameConfig, TOTAL_WAVES } from '../core/GameConfig';
import type { MonsterId } from '../core/GameConfig';
import { eventBus, GameEvent } from '../core/EventBus';
import { Wallet } from '../economy/Wallet';
import { UpgradeSystem } from '../upgrades/UpgradeSystem';
import type { PlayerStats } from '../upgrades/UpgradeSystem';
import { SaveServiceFactory } from '../save/SaveServiceFactory';
import type { SaveService } from '../save/SaveService';
import type { PlayerSaveData } from '../save/PlayerSaveData';
import { AssetConfig, enemyAsset } from '../art/AssetConfig';
import type { SpriteAsset } from '../art/AssetConfig';
import { AssetLoader } from '../art/AssetLoader';
import { hexToColor } from '../art/colorUtil';
import { ArrowPool } from '../projectile/ArrowPool';
import type { Arrow } from '../projectile/Arrow';
import { MonsterSpawner } from './MonsterSpawner';
import { Monster, MonsterStep } from '../monster/Monster';
import { DamageSystem } from './DamageSystem';
import { Castle } from './Castle';
import { ArcherController } from '../player/ArcherController';
import { ResultPanel } from '../ui/ResultPanel';

const { ccclass } = _decorator;

const HALF_W = GameConfig.layout.designWidth / 2;
const HALF_H = GameConfig.layout.designHeight / 2;

// Scratch vector for touch -> local-point conversion (avoid per-tap alloc).
const _tap = new Vec3();

@ccclass('BattleManager')
export class BattleManager extends Component {
  // --- pure-logic systems ---
  private save!: SaveService;
  private profile!: PlayerSaveData;
  private wallet!: Wallet;
  private upgrades!: UpgradeSystem;
  private stats!: PlayerStats;

  // --- battle systems ---
  private arrowPool!: ArrowPool;
  private spawner!: MonsterSpawner;
  private damageSystem!: DamageSystem;
  private castle!: Castle;
  private archer!: ArcherController;

  // --- art ---
  private readonly frames = new Map<string, SpriteFrame | null>();
  private ui!: UITransform; // this.node's transform; tap conversion uses it

  // --- active entities (the per-frame battle path) ---
  private readonly arrows: Arrow[] = [];
  private readonly monsters: Monster[] = [];

  // --- save coalescing ---
  private saveDirty = false;
  private saveTimer = 0;

  private booted = false;
  private over = false; // latched on defeat: stops spawning, movement, and firing
  private goldLabel: Label | null = null;
  private castleHpLabel: Label | null = null;

  // Per-run tallies shown on the result screen (reset every battle).
  private runKills = 0;
  private runGoldEarned = 0;

  // Hold-to-fire: while `firing`, update() launches arrows toward `aimTarget`
  // (gated by the archer's cooldown). `aimTarget` follows the pointer.
  private firing = false;
  private readonly aimTarget = new Vec3();

  // Cull / castle lines in local (center-origin) space.
  private readonly cullRight = HALF_W + GameConfig.arrow.cullMargin;
  private readonly cullLeft = -HALF_W - GameConfig.arrow.cullMargin;
  private readonly cullTop = HALF_H + GameConfig.arrow.cullMargin;
  private readonly cullBottom = -HALF_H - GameConfig.arrow.cullMargin;
  private readonly castleX = GameConfig.layout.castleHitX - HALF_W;

  protected async start(): Promise<void> {
    // This node must carry a centered UITransform so screen taps convert into the
    // same local space the entities are placed in (origin at screen center).
    this.ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    this.ui.setContentSize(GameConfig.layout.designWidth, GameConfig.layout.designHeight);
    this.ui.setAnchorPoint(0.5, 0.5);

    // --- bootstrap pure logic (mirrors GameSceneController) ---
    this.save = SaveServiceFactory.create();
    this.profile = await this.loadProfileSafely();
    this.upgrades = new UpgradeSystem(this.profile);
    this.stats = this.upgrades.computeStats();
    this.wallet = new Wallet();

    eventBus.on(GameEvent.GoldChanged, this.onGoldChanged, this);
    eventBus.on(GameEvent.MonsterKilled, this.onMonsterKilled, this);
    eventBus.on(GameEvent.CastleHpChanged, this.onCastleHpChanged, this);

    // --- preload real art, then build the scene ---
    await this.preloadArt();
    const { monsterLayer, arrowLayer } = this.buildField();
    this.buildHud();

    // --- battle systems ---
    this.arrowPool = new ArrowPool(arrowLayer, this.frameOf(AssetConfig.tower.arrow));
    this.spawner = new MonsterSpawner(monsterLayer, (id: MonsterId) => this.frameOf(enemyAsset(id)));
    this.damageSystem = new DamageSystem(this.wallet, () => this.stats.critChance);
    // Castle starts at full upgrade-driven HP; the constructor emits CastleHpChanged
    // which seeds the HUD bar built above.
    this.castle = new Castle(this.stats.castleMaxHp);
    this.archer = new ArcherController(
      this.arrowPool,
      () => ({ damage: this.stats.damage, fireCooldown: this.stats.fireCooldown }),
      GameConfig.layout.towerMuzzle.x - HALF_W,
      GameConfig.layout.towerMuzzle.y - HALF_H,
    );

    // Hold-to-fire. Touch covers mobile; mouse covers desktop/editor preview.
    // Press starts firing + sets aim; move updates aim; release stops.
    input.on(Input.EventType.TOUCH_START, this.onPointerDown, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onPointerMove, this);
    input.on(Input.EventType.TOUCH_END, this.onPointerUp, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onPointerUp, this);
    input.on(Input.EventType.MOUSE_DOWN, this.onPointerDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.onPointerMove, this);
    input.on(Input.EventType.MOUSE_UP, this.onPointerUp, this);

    // Seed gold from the save -> emits GoldChanged -> refreshes the HUD.
    this.wallet.setGold(this.profile.gold);
    this.booted = true;
  }

  protected onDestroy(): void {
    input.off(Input.EventType.TOUCH_START, this.onPointerDown, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onPointerMove, this);
    input.off(Input.EventType.TOUCH_END, this.onPointerUp, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onPointerUp, this);
    input.off(Input.EventType.MOUSE_DOWN, this.onPointerDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.onPointerMove, this);
    input.off(Input.EventType.MOUSE_UP, this.onPointerUp, this);
    eventBus.offTarget(this);
    if (this.saveDirty) this.flushSave('on-destroy');
  }

  protected update(dt: number): void {
    if (!this.booted || this.over) return; // defeat freezes spawning/movement/firing

    this.archer.tick(dt);
    if (this.firing) this.fireAtAim(); // continuous fire, gated by cooldown
    this.spawner.update(dt, (m) => this.monsters.push(m));
    this.stepMonsters(dt);
    this.stepArrowsAndCollide(dt);
    this.tickSave(dt);
  }

  // --- per-frame battle path ----------------------------------------------

  private stepMonsters(dt: number): void {
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      // A monster that reached the castle stops and bites on a timer. It keeps
      // living (and stays a valid arrow target) until killed, so it is NOT
      // recycled here — only its bite damages the castle.
      if (m.step(dt, this.castleX) === MonsterStep.AttackCastle) {
        const destroyed = this.castle.takeDamage(m.castleDamage);
        if (destroyed) {
          this.onDefeat();
          return; // stop stepping; the run is over this frame
        }
      }
    }
  }

  /**
   * Castle HP hit 0. Latch the over flag (freezes the next update), persist the
   * run's outcome (highest wave + lifetime totals), announce GameOver, and pop
   * the result summary.
   */
  private onDefeat(): void {
    if (this.over) return;
    this.over = true;
    this.firing = false;

    const wave = this.spawner.currentWave;
    this.profile.stats.totalGames += 1;
    if (wave > this.profile.highestWave) this.profile.highestWave = wave;
    this.profile.currentWave = wave;
    this.flushSave('defeat'); // immediate, not coalesced: the run just ended

    eventBus.emit(GameEvent.GameOver, { result: 'lose' });
    console.log(`[BattleManager] DEFEAT wave=${wave} kills=${this.runKills} gold=${this.runGoldEarned}`);

    this.showResultPanel(wave);
  }

  /** Build and display the (simple) end-of-run summary overlay. */
  private showResultPanel(wave: number): void {
    const node = new Node('ResultPanel');
    node.layer = Layers.Enum.UI_2D;
    this.node.addChild(node);
    const panel = node.addComponent(ResultPanel);
    panel.show({
      wave,
      kills: this.runKills,
      goldEarned: this.runGoldEarned,
      highestWave: this.profile.highestWave,
      onRestart: () => this.restart(),
    });
  }

  /** Reload the scene for a fresh run (re-runs GameSceneController -> BattleManager). */
  private restart(): void {
    const scene = director.getScene();
    if (scene) director.loadScene(scene.name);
  }

  private stepArrowsAndCollide(dt: number): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];

      // Move + lifetime; cull on expiry or off-screen.
      const alive = arrow.step(dt);
      const px = arrow.position.x;
      const py = arrow.position.y;
      if (!alive || px > this.cullRight || px < this.cullLeft || py > this.cullTop || py < this.cullBottom) {
        this.removeArrow(i);
        continue;
      }

      // First monster whose hitbox overlaps the arrow tip takes the hit.
      for (let j = this.monsters.length - 1; j >= 0; j--) {
        const m = this.monsters[j];
        const reach = m.radius + GameConfig.arrow.radius;
        const dx = px - m.positionX;
        const dy = py - m.positionY;
        if (dx * dx + dy * dy <= reach * reach) {
          const result = this.damageSystem.applyHit(m, arrow.damage);
          if (result.killed) this.removeMonster(j);
          this.removeArrow(i); // single-target, no pierce in MVP
          break;
        }
      }
    }
  }

  /** Swap-remove an arrow from the active list and recycle it. */
  private removeArrow(i: number): void {
    const arrow = this.arrows[i];
    const last = this.arrows.length - 1;
    this.arrows[i] = this.arrows[last];
    this.arrows.pop();
    this.arrowPool.put(arrow);
  }

  /** Swap-remove a monster from the active list and recycle it. */
  private removeMonster(i: number): void {
    const m = this.monsters[i];
    const last = this.monsters.length - 1;
    this.monsters[i] = this.monsters[last];
    this.monsters.pop();
    this.spawner.recycle(m);
  }

  // --- input ----------------------------------------------------------------

  /** Press: start firing and aim at the press point. */
  private onPointerDown(e: EventTouch | EventMouse): void {
    if (!this.booted || this.over) return;
    this.firing = true;
    this.updateAim(e);
  }

  /** Move: while held, retarget to follow the pointer. */
  private onPointerMove(e: EventTouch | EventMouse): void {
    if (!this.booted || !this.firing) return;
    this.updateAim(e);
  }

  /** Release / cancel: stop firing. */
  private onPointerUp(_e: EventTouch | EventMouse): void {
    this.firing = false;
  }

  /** Convert the pointer's screen location into the battle layer's local space. */
  private updateAim(e: EventTouch | EventMouse): void {
    const ui = e.getUILocation(); // UI/world space (design px, bottom-left origin)
    _tap.set(ui.x, ui.y, 0);
    this.ui.convertToNodeSpaceAR(_tap, this.aimTarget); // -> center-origin local space
  }

  /** One firing attempt per frame; the archer's cooldown sets the real rate. */
  private fireAtAim(): void {
    const arrow = this.archer.tryFire(this.aimTarget);
    if (!arrow) return; // on cooldown this frame
    this.arrows.push(arrow); // track it so update() steps + collides it
    console.log(
      `[BattleManager] fireArrow -> target(${this.aimTarget.x.toFixed(0)}, ${this.aimTarget.y.toFixed(0)}) ` +
        `dmg=${arrow.damage} activeArrows=${this.arrows.length} monsters=${this.monsters.length}`,
    );
  }

  // --- economy / persistence ------------------------------------------------

  private onGoldChanged(p: { gold: number }): void {
    this.profile.gold = p.gold; // mirror only; the flush happens on a timer
    if (this.goldLabel) this.goldLabel.string = `Gold: ${p.gold}`;
  }

  private onMonsterKilled(p: { id: MonsterId; gold: number }): void {
    this.runKills += 1;
    this.runGoldEarned += p.gold;
    this.profile.stats.totalKills += 1;
    this.profile.stats.totalGoldEarned += p.gold;
    this.saveDirty = true; // coalesced flush; never write per tick
    console.log(`[BattleManager] killMonster id=${p.id} +${p.gold} gold (total gold=${this.wallet.getGold()})`);
  }

  private onCastleHpChanged(p: { hp: number; maxHp: number }): void {
    if (this.castleHpLabel) this.castleHpLabel.string = `Castle: ${p.hp} / ${p.maxHp}`;
  }

  private tickSave(dt: number): void {
    if (!this.saveDirty) return;
    this.saveTimer += dt;
    if (this.saveTimer >= GameConfig.save.debounceSec) {
      this.flushSave('battle-gold');
    }
  }

  private flushSave(reason: string): void {
    this.saveDirty = false;
    this.saveTimer = 0;
    this.profile.gold = this.wallet.getGold();
    void this.save.save(this.profile).catch((err) => {
      console.error(`[BattleManager] save failed (${reason})`, err);
    });
  }

  private async loadProfileSafely(): Promise<PlayerSaveData> {
    try {
      return await this.save.load();
    } catch (err) {
      console.error('[BattleManager] load failed; using default profile', err);
      return this.save.createDefaultSave();
    }
  }

  // --- art ------------------------------------------------------------------

  /** Resolve every SpriteFrame the battle needs up front (one load per path). */
  private async preloadArt(): Promise<void> {
    const list: SpriteAsset[] = [
      AssetConfig.background.field,
      AssetConfig.background.ground,
      AssetConfig.tower.castle,
      AssetConfig.tower.archer,
      AssetConfig.tower.arrow,
      AssetConfig.enemy.goblin,
      AssetConfig.enemy.bat,
      AssetConfig.enemy.brute,
      AssetConfig.enemy.overlord,
    ];
    await Promise.all(
      list.map(async (a) => {
        this.frames.set(a.path, await AssetLoader.loadSpriteFrame(a));
      }),
    );
  }

  private frameOf(asset: SpriteAsset): SpriteFrame | null {
    return this.frames.get(asset.path) ?? null;
  }

  // --- scene construction ---------------------------------------------------

  /** Build background, ground, castle/archer art, and the pool layers. */
  private buildField(): { monsterLayer: Node; arrowLayer: Node } {
    this.addSprite(AssetConfig.background.field, 0, 0, HALF_W * 2, HALF_H * 2);

    const groundY = GameConfig.layout.groundY - HALF_H;
    this.addSprite(AssetConfig.background.ground, 0, (-HALF_H + groundY) / 2, HALF_W * 2, groundY + HALF_H);

    // Castle + archer (left), positioned from layout config.
    const castleX = GameConfig.layout.castleHitX - HALF_W;
    this.addSprite(AssetConfig.tower.castle, castleX - 20, groundY + 90, 120, 180);
    this.addSprite(
      AssetConfig.tower.archer,
      GameConfig.layout.towerMuzzle.x - HALF_W,
      GameConfig.layout.towerMuzzle.y - HALF_H,
      56, 56,
    );

    // Pool parents (kept above the field art).
    const monsterLayer = this.addLayer('MonsterLayer');
    const arrowLayer = this.addLayer('ArrowLayer');
    return { monsterLayer, arrowLayer };
  }

  private buildHud(): void {
    this.goldLabel = this.addLabel('Gold: 0', -HALF_W + 20, HALF_H - 30, 26, hexToColor(GameConfig.colors.damageCrit));
    this.castleHpLabel = this.addLabel('Castle: -- / --', -HALF_W + 20, HALF_H - 64, 24, new Color(120, 220, 120));
    this.addLabel(`WAVE 1 / ${TOTAL_WAVES}`, -HALF_W + 20, HALF_H - 96, 20, new Color(230, 230, 230));
    this.addLabel('Tap the field to fire', -HALF_W + 20, HALF_H - 126, 18, new Color(200, 200, 200));
  }

  private addLayer(name: string): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform);
    this.node.addChild(node);
    return node;
  }

  /** Add a Sprite node for `asset`. Skips silently if the PNG is absent. */
  private addSprite(asset: SpriteAsset, x: number, y: number, w: number, h: number): Node | null {
    const frame = this.frameOf(asset);
    if (!frame) return null;
    const node = new Node('art');
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.spriteFrame = frame;
    this.node.addChild(node);
    node.setPosition(x, y, 0);
    return node;
  }

  private addLabel(text: string, x: number, y: number, size: number, col: Color): Label {
    const node = new Node('label');
    node.layer = Layers.Enum.UI_2D;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(400, size * 1.4);
    ut.setAnchorPoint(0, 0.5);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size * 1.2;
    label.color = col;
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.node.addChild(node);
    node.setPosition(x, y, 0);
    return label;
  }
}
