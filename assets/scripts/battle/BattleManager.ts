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
  _decorator, Component, Node, UITransform, Sprite, SpriteFrame, Layers, Vec3,
  input, Input, EventTouch, EventMouse, director,
} from 'cc';
import { GameConfig, getWavesPerLevel } from '../core/GameConfig';
import type { MonsterId, UpgradeId } from '../core/GameConfig';
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
import { ArrowPool } from '../projectile/ArrowPool';
import type { Arrow } from '../projectile/Arrow';
import { MonsterSpawner } from './MonsterSpawner';
import { Monster, MonsterStep } from '../monster/Monster';
import { DamageSystem } from './DamageSystem';
import { Castle } from './Castle';
import { ArcherController } from '../player/ArcherController';
import { ResultPanel } from '../ui/ResultPanel';
import { UpgradePanel } from '../ui/UpgradePanel';
import type { UpgradeRowData } from '../ui/UpgradePanel';
import { BattleUI } from '../ui/BattleUI';
import { PausePanel } from '../ui/PausePanel';
import { DamageTextPool } from '../ui/DamageText';
import { GoldPopupTextPool } from '../ui/GoldPopupText';
import { LevelManager, LevelState } from '../level/LevelManager';
import { WaveManager } from '../level/WaveManager';

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
  private levelManager!: LevelManager;

  // --- art ---
  private readonly frames = new Map<string, SpriteFrame | null>();
  private ui!: UITransform; // this.node's transform; tap conversion uses it

  // --- floating combat FX (pooled; built over the battlefield) ---
  private damageTexts!: DamageTextPool;
  private goldPopups!: GoldPopupTextPool;

  // --- active entities (the per-frame battle path) ---
  private readonly arrows: Arrow[] = [];
  private readonly monsters: Monster[] = [];

  // --- level / monster bookkeeping (drives level-complete detection) ---
  private aliveMonsterCount = 0;
  private totalSpawnedMonsterCount = 0;
  private totalKilledMonsterCount = 0;
  private levelCompleteTimer = 0; // grace countdown once the field empties

  // --- save coalescing ---
  private saveDirty = false;
  private saveTimer = 0;

  private booted = false;
  private over = false;   // latched on defeat: stops spawning, movement, and firing
  private paused = false; // true while a modal overlay (UpgradePanel or PausePanel) is up
  private battleUI: BattleUI | null = null;
  private upgradePanel: UpgradePanel | null = null;
  private upgradePanelNode: Node | null = null;
  private pauseMenuNode: Node | null = null;

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
    eventBus.on(GameEvent.LevelStarted, this.onLevelStarted, this);

    // --- preload real art, then build the scene ---
    await this.preloadArt();
    const { monsterLayer, arrowLayer, fxLayer } = this.buildField();
    this.damageTexts = new DamageTextPool(fxLayer);
    this.goldPopups = new GoldPopupTextPool(fxLayer);
    this.buildBattleUi();

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

    // Level flow: resume at the saved currentLevel and start its time-scheduled waves.
    this.levelManager = new LevelManager(this.profile, new WaveManager());
    this.startCurrentLevel();

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
    // defeat freezes everything; the between-level panel pauses the battle.
    if (!this.booted || this.over || this.paused) return;

    this.archer.tick(dt);
    if (this.firing) this.fireAtAim(); // continuous fire, gated by cooldown

    // Time-scheduled waves: any wave whose startTime elapsed this tick begins
    // spawning now — it does NOT wait for earlier waves to be cleared.
    const due = this.levelManager.update(dt);
    if (due.length > 0) {
      for (const wave of due) this.spawner.spawnWave(wave);
      this.updateWaveHud(); // runtime-only wave display; never persisted
    }
    this.spawner.update(dt, this.onMonsterSpawned);

    this.stepMonsters(dt);
    this.stepArrowsAndCollide(dt);
    this.checkLevelCompletion(dt);
    this.tickSave(dt);
  }

  /** Track a freshly spawned monster (called by the spawner). */
  private readonly onMonsterSpawned = (m: Monster): void => {
    this.monsters.push(m);
    this.aliveMonsterCount += 1;
    this.totalSpawnedMonsterCount += 1;
    this.battleUI?.refreshMonsterCount();
  };

  /**
   * The level finishes only when ALL three hold: every wave has been triggered,
   * the spawner has no monsters left to emit, and the field is empty — then a
   * short grace delay. Triggering wave 10 or finishing its spawn is NOT enough.
   */
  private checkLevelCompletion(dt: number): void {
    if (this.levelManager.currentState !== LevelState.Fighting) return;

    const ready =
      this.levelManager.allWavesTriggered &&
      !this.spawner.hasPendingSpawns &&
      this.aliveMonsterCount <= 0;
    if (!ready) {
      this.levelCompleteTimer = 0;
      return;
    }

    this.levelCompleteTimer += dt;
    if (this.levelCompleteTimer >= GameConfig.levelConfigs.levelCompleteDelay) {
      this.levelManager.complete(); // emits LevelCleared
      this.onLevelComplete();
    }
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
   * run's outcome (highest level + lifetime totals), announce GameOver, and pop
   * the result summary. currentLevel is left as-is so the player retries the
   * level they fell on (it only advances on a clear).
   */
  private onDefeat(): void {
    if (this.over) return;
    this.over = true;
    this.paused = false;
    this.firing = false;
    this.spawner.stop();

    const level = this.levelManager.currentLevel;
    this.profile.stats.totalGames += 1;
    if (level > this.profile.highestLevel) this.profile.highestLevel = level;
    this.profile.currentLevel = level;
    this.flushSave('defeat'); // immediate, not coalesced: the run just ended

    eventBus.emit(GameEvent.GameOver, { result: 'lose' });
    console.log(`[BattleManager] DEFEAT level=${level} kills=${this.runKills} gold=${this.runGoldEarned}`);

    this.showResultPanel();
  }

  /** Build and display the end-of-run summary overlay (reads its numbers live). */
  showResultPanel(): void {
    const node = new Node('ResultPanel');
    node.layer = Layers.Enum.UI_2D;
    this.node.addChild(node);
    const panel = node.addComponent(ResultPanel);
    panel.show({
      level: this.getCurrentLevel(),
      kills: this.runKills,
      goldEarned: this.runGoldEarned,
      highestLevel: this.getBestLevel(),
      onRestart: () => this.restartBattle(),
      onReturnToMain: () => this.returnToMainMenu(),
    });
  }

  // --- level flow -----------------------------------------------------------

  /** Start (or restart) the current level: reset counters and begin its schedule. */
  private startCurrentLevel(): void {
    this.clearActiveEntities();      // defensive: no leftovers from a prior level
    this.aliveMonsterCount = 0;
    this.totalSpawnedMonsterCount = 0;
    this.totalKilledMonsterCount = 0;
    this.levelCompleteTimer = 0;

    const plan = this.levelManager.startLevel(); // starts the wave schedule (waves spawn over time)
    this.spawner.stop();             // drop any leftover spawn tasks
    this.paused = false;
    // A level always (re)starts at wave 1 (WaveManager resets its counter). This
    // within-level wave is runtime-only and is never written to the save.
    this.battleUI?.refreshAll();
    console.log(`[BattleManager] startLevel ${plan.level} waves=${plan.totalWaves} monsters=${plan.totalCount} boss=${plan.hasBoss}`);
  }

  /**
   * Every monster for the current level is dead. Stop spawning, pause the battle,
   * and BANK the clear immediately: advance currentLevel (+ highestLevel) and
   * persist NOW — not on "continue" — so a player who quits on the upgrade panel
   * resumes at the NEXT level and never replays the cleared one. The upgrade
   * overlay still shows the level that was just cleared.
   */
  private onLevelComplete(): void {
    if (this.over || this.paused) return;
    this.paused = true;
    this.firing = false;
    this.spawner.stop();

    const clearedLevel = this.levelManager.currentLevel;
    this.levelManager.nextLevel();        // currentLevel += 1, highestLevel = max(...)
    this.profile.gold = this.wallet.getGold();
    this.flushSave('level-clear');        // persist currentLevel / highestLevel / gold now

    this.showUpgradePanel(clearedLevel);
    console.log(`[BattleManager] level ${clearedLevel} CLEARED -> resume at ${this.levelManager.currentLevel}`);
  }

  /** Build and display the between-level upgrade + continue overlay.
   *  @param clearedLevel the level the player just finished (for the title). */
  showUpgradePanel(clearedLevel: number): void {
    const node = new Node('UpgradePanel');
    node.layer = Layers.Enum.UI_2D;
    this.node.addChild(node);
    this.upgradePanelNode = node;
    this.upgradePanel = node.addComponent(UpgradePanel);
    this.upgradePanel.show({
      level: clearedLevel,
      getGold: () => this.wallet.getGold(),
      getRows: () => this.buildUpgradeRows(),
      onBuy: (id) => this.buyUpgrade(id),
      onContinue: () => this.continueNextWave(),
    });
  }

  /** Snapshot the 4 MVP upgrades for the panel. */
  private buildUpgradeRows(): UpgradeRowData[] {
    const ids: UpgradeId[] = ['damage', 'attackSpeed', 'crit', 'castleHp'];
    const gold = this.wallet.getGold();
    return ids.map((id) => ({
      id,
      name: GameConfig.upgrades[id].name,
      level: this.upgrades.getLevel(id),
      maxed: this.upgrades.isMaxed(id),
      cost: this.upgrades.getNextCost(id),
      affordable: this.upgrades.canAfford(id, gold),
    }));
  }

  /** Apply a purchase: deduct gold, recompute stats, mark the save dirty. */
  private buyUpgrade(id: UpgradeId): void {
    if (!this.upgrades.canAfford(id, this.wallet.getGold())) return;
    const cost = this.upgrades.purchase(id);
    if (cost === null) return;
    this.wallet.spendGold(cost);                 // emits GoldChanged -> HUD + profile mirror
    this.stats = this.upgrades.computeStats();   // archer reads stats live via closure
    eventBus.emit(GameEvent.UpgradePurchased, { id, level: this.upgrades.getLevel(id) });
    this.saveDirty = true;                       // coalesced; the level-clear flush also covers it
  }

  /**
   * Player tapped "continue". currentLevel was ALREADY advanced + persisted in
   * onLevelComplete (banking-on-clear), so here we only refill the castle for the
   * upgraded stats and begin the already-current level.
   */
  private continueToNextLevel(): void {
    // Refill the castle to its (possibly upgraded) max HP for the new level.
    this.stats = this.upgrades.computeStats();
    this.castle = new Castle(this.stats.castleMaxHp); // emits CastleHpChanged -> HUD

    this.destroyUpgradePanel();
    this.startCurrentLevel();
  }

  /** Recycle every active arrow/monster back to its pool (between levels). */
  private clearActiveEntities(): void {
    for (const m of this.monsters) this.spawner.recycle(m);
    this.monsters.length = 0;
    for (const a of this.arrows) this.arrowPool.put(a);
    this.arrows.length = 0;
  }

  private destroyUpgradePanel(): void {
    this.upgradePanelNode?.destroy();
    this.upgradePanelNode = null;
    this.upgradePanel = null;
  }

  // --- public API (read by the UI; the UI never mutates core state) ---------

  /** Current LEVEL (关) the player is on. */
  getCurrentLevel(): number {
    return this.levelManager?.currentLevel ?? this.profile.currentLevel;
  }

  /**
   * Current WAVE (波) within the level, 1..getWavesPerLevel(level).
   *
   * Save policy: only LEVEL progress is persisted, never the within-level wave.
   * On re-entry the battle restarts the saved level at wave 1. This value is
   * runtime-only state owned by WaveManager (via LevelManager.currentWaveInLevel)
   * — it is read here for display, never loaded from / written to the save.
   */
  getCurrentWave(): number {
    return this.levelManager?.currentWaveInLevel ?? 1;
  }

  /** Total waves of the current level (RAMPS with the level; never a fixed 10). */
  getWavesPerLevel(): number {
    return this.levelManager?.wavesPerLevel ?? getWavesPerLevel(this.getCurrentLevel());
  }

  getCurrentGold(): number {
    return this.wallet.getGold();
  }

  getCastleHp(): number {
    return this.castle?.currentHp ?? 0;
  }

  getCastleMaxHp(): number {
    return this.castle?.maxHpValue ?? 0;
  }

  getKillCount(): number {
    return this.runKills;
  }

  getAliveMonsterCount(): number {
    return this.aliveMonsterCount;
  }

  /** Gold earned this run (shown on the result screen). */
  getBattleEarnedGold(): number {
    return this.runGoldEarned;
  }

  /** Best LEVEL (关) ever reached (persisted). */
  getBestLevel(): number {
    return this.profile.highestLevel;
  }

  /** Freeze the battle and pop the pause menu (no-op if over / already paused). */
  pauseGame(): void {
    if (!this.booted || this.over || this.paused) return;
    this.paused = true;
    this.firing = false;
    eventBus.emit(GameEvent.GamePaused, {});

    const node = new Node('PausePanel');
    node.layer = Layers.Enum.UI_2D;
    this.node.addChild(node);
    this.pauseMenuNode = node;
    node.addComponent(PausePanel).show({
      onResume: () => this.resumeGame(),
      onRestart: () => this.restartBattle(),
      onReturnToMain: () => this.returnToMainMenu(),
    });
  }

  /** Close the pause menu and resume the battle. */
  resumeGame(): void {
    if (this.over) return;
    this.destroyPauseMenu();
    this.paused = false;
    eventBus.emit(GameEvent.GameResumed, {});
  }

  /** Reload the battle scene for a fresh run. */
  restartBattle(): void {
    const scene = director.getScene();
    if (scene) director.loadScene(scene.name);
  }

  /** Advance to the next wave/level (closes the upgrade panel). */
  continueNextWave(): void {
    this.continueToNextLevel();
  }

  /** Persist progress and return to the main menu. */
  returnToMainMenu(): void {
    this.flushSave('return-main');
    director.loadScene(GameConfig.scenes.main);
  }

  private destroyPauseMenu(): void {
    this.pauseMenuNode?.destroy();
    this.pauseMenuNode = null;
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
          // Capture position + reward before the hit may recycle the monster.
          const hitX = m.positionX;
          const hitY = m.positionY + m.radius;
          const reward = m.gold;
          const result = this.damageSystem.applyHit(m, arrow.damage);
          this.damageTexts.show(hitX, hitY, result.dealt, result.crit);
          if (result.killed) {
            this.goldPopups.show(hitX, hitY + 24, reward);
            this.removeMonster(j);
          }
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
    if (!this.booted || this.over || this.paused) return;
    this.firing = true;
    this.updateAim(e);
  }

  /** Move: while held, retarget to follow the pointer. */
  private onPointerMove(e: EventTouch | EventMouse): void {
    if (!this.booted || this.paused || !this.firing) return;
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
    this.battleUI?.refreshGold();
  }

  private onMonsterKilled(p: { id: MonsterId; gold: number }): void {
    this.runKills += 1;
    this.runGoldEarned += p.gold;
    this.profile.stats.totalKills += 1;
    this.profile.stats.totalGoldEarned += p.gold;
    this.saveDirty = true; // coalesced flush; never write per tick

    // Field bookkeeping: a kill removes one live monster. Level completion is
    // decided by checkLevelCompletion() once the field is empty.
    this.totalKilledMonsterCount += 1;
    this.aliveMonsterCount = Math.max(0, this.aliveMonsterCount - 1);

    this.battleUI?.refreshKillCount();
    this.battleUI?.refreshMonsterCount();
  }

  private onLevelStarted(_p: { level: number; totalWaves: number }): void {
    this.battleUI?.refreshWave();
    this.battleUI?.refreshMonsterCount();
  }

  /** Refresh the wave line on the HUD (driven by the level manager). */
  private updateWaveHud(): void {
    this.battleUI?.refreshWave();
  }

  private onCastleHpChanged(p: { hp: number; maxHp: number }): void {
    // Pass the payload explicitly: during the Castle ctor `this.castle` is not
    // yet assigned, so the HP getters would read stale/zero values here.
    this.battleUI?.refreshCastleHp(p.hp, p.maxHp);
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
  private buildField(): { monsterLayer: Node; arrowLayer: Node; fxLayer: Node } {
    this.addSprite(AssetConfig.background.field, 0, 0, HALF_W * 2, HALF_H * 2);

    const groundY = GameConfig.layout.groundY - HALF_H;
    this.addSprite(AssetConfig.background.ground, 0, (-HALF_H + groundY) / 2, HALF_W * 2, groundY + HALF_H);

    // Castle + archer (left), positioned from layout config.
    // The wall is flush against the screen's left edge; its right face lands on
    // the collision line (castleHitX) so the visual and the hit test agree.
    const castleRightX = GameConfig.layout.castleHitX - HALF_W; // centered X of the wall's right face
    const castleW = castleRightX - -HALF_W;                     // span: left edge -> hit line
    const castleH = 360;                                        // tall wall (rises from the ground)
    this.addSprite(
      AssetConfig.tower.castle,
      -HALF_W + castleW / 2, // center X => left edge flush with the screen
      groundY + castleH / 2, // bottom sits on the ground lane
      castleW, castleH,
    );
    this.addSprite(
      AssetConfig.tower.archer,
      GameConfig.layout.towerMuzzle.x - HALF_W,
      GameConfig.layout.towerMuzzle.y - HALF_H,
      56, 56,
    );

    // Pool parents (kept above the field art). FxLayer is last so damage / gold
    // numbers draw over the monsters and arrows.
    const monsterLayer = this.addLayer('MonsterLayer');
    const arrowLayer = this.addLayer('ArrowLayer');
    const fxLayer = this.addLayer('FxLayer');
    return { monsterLayer, arrowLayer, fxLayer };
  }

  /** Attach the in-battle HUD and wire it to read state via the public getters. */
  private buildBattleUi(): void {
    const node = new Node('BattleUI');
    node.layer = Layers.Enum.UI_2D;
    this.node.addChild(node);
    this.battleUI = node.addComponent(BattleUI);
    this.battleUI.build({
      getLevel: () => this.getCurrentLevel(),
      getWave: () => this.getCurrentWave(),
      getWavesPerLevel: () => this.getWavesPerLevel(),
      getGold: () => this.getCurrentGold(),
      getCastleHp: () => this.getCastleHp(),
      getCastleMaxHp: () => this.getCastleMaxHp(),
      getKills: () => this.getKillCount(),
      getAliveMonsters: () => this.getAliveMonsterCount(),
      onPause: () => this.pauseGame(),
    });
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
}
