/**
 * Monster.ts
 * ----------------------------------------------------------------------------
 * A single enemy instance. Spawns off the right edge, walks left, takes damage,
 * and dies. Pure entity: it moves itself and reports whether it reached the
 * castle line — it does NOT roll crits, award gold, or recycle itself. The
 * conductor (BattleManager) drives `step()` and the DamageSystem applies hits.
 *
 * All numbers (hp, speed, gold, radius) come from its MonsterConfig in
 * GameConfig; nothing is hard-coded here. A pooled node is reused across monster
 * types, so spawn() swaps in the current type's SpriteFrame each time.
 *
 * Required scene refs: none. The node is built programmatically by
 * MonsterSpawner (UITransform + Sprite); this component is added to it.
 * ----------------------------------------------------------------------------
 */

import { _decorator, Component, Sprite, SpriteFrame, UITransform } from 'cc';
import { GameConfig } from '../core/GameConfig';
import type { MonsterConfig, MonsterId } from '../core/GameConfig';

const { ccclass } = _decorator;

/** Result of advancing a monster one frame. */
export enum MonsterStep {
  /** Still walking, or stopped at the castle but not biting this frame. */
  Alive,
  /** Reached the castle and landed a hit this frame (apply `castleDamage`). */
  AttackCastle,
}

/**
 * Per-spawn stat overrides. The level system scales a monster's HP/gold/etc by
 * the current level (see GameConfig.buildLevelPlan), so spawn() takes the
 * resolved numbers instead of always using the static MonsterConfig defaults.
 */
export interface MonsterStats {
  readonly hp: number;
  readonly gold: number;
  readonly castleDamage: number;
  readonly speed: number;
}

@ccclass('Monster')
export class Monster extends Component {
  private cfg!: MonsterConfig;
  private hp = 0;
  private _active = false;

  // Level-scaled stats for THIS spawn (fall back to cfg defaults if omitted).
  private _gold = 0;
  private _castleDamage = 0;
  private _speed = 0;

  // Castle siege: once the monster reaches the castle line it stops moving and
  // bites on a fixed interval. `attacking` latches on arrival; `attackTimer`
  // counts down to the next hit.
  private attacking = false;
  private attackTimer = 0;

  // Skill-applied slow (IceSpike). `slowFactor` scales the walk speed (1 = full
  // speed, <1 = slowed); `slowTimer` counts down, restoring full speed at 0.
  // The base `_speed` is never mutated, so the original speed always returns.
  private slowFactor = 1;
  private slowTimer = 0;

  get id(): MonsterId {
    return this.cfg.id;
  }

  /** Gold awarded to the player on death (level-scaled). */
  get gold(): number {
    return this._gold;
  }

  /** Damage this monster deals to the castle per hit (level-scaled). */
  get castleDamage(): number {
    return this._castleDamage;
  }

  /** True if this spawn is a boss (drives any boss-specific presentation). */
  get isBoss(): boolean {
    return this.cfg.isBoss === true;
  }

  /** Hitbox radius (px) for the arrow distance test. */
  get radius(): number {
    return this.cfg.radius;
  }

  /** True while spawned and still above 0 HP. */
  get isAlive(): boolean {
    return this._active && this.hp > 0;
  }

  /** Current center position (world == local under the flat UI battle layer). */
  get positionX(): number {
    return this.node.position.x;
  }

  get positionY(): number {
    return this.node.position.y;
  }

  /**
   * Configure for a (re)spawn of `cfg` at the given position with its art.
   * `stats` carries the level-scaled numbers; when omitted the static
   * MonsterConfig defaults are used (e.g. in tests / direct spawns).
   */
  spawn(cfg: MonsterConfig, x: number, y: number, frame: SpriteFrame | null, stats?: MonsterStats): void {
    this.cfg = cfg;
    this.hp = stats?.hp ?? cfg.hp;
    this._gold = stats?.gold ?? cfg.gold;
    this._castleDamage = stats?.castleDamage ?? cfg.castleDamage;
    this._speed = stats?.speed ?? cfg.speed;
    this._active = true;
    this.attacking = false;
    this.attackTimer = 0;
    this.slowFactor = 1;
    this.slowTimer = 0;
    this.applyArt(frame);
    this.node.setPosition(x, y, 0);
    this.node.active = true;
  }

  /**
   * Advance one frame. While walking it moves left; once it crosses the castle
   * line it stops there and begins biting. Returns AttackCastle on the frames a
   * bite lands (BattleManager then subtracts `castleDamage` from the castle);
   * otherwise Alive. The monster keeps living (and stays a valid arrow target)
   * until killed — it is never recycled just for reaching the castle.
   */
  step(dt: number, castleX: number): MonsterStep {
    if (!this._active) return MonsterStep.Alive;

    // Tick any active slow; restore full speed once it expires.
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.slowTimer = 0;
        this.slowFactor = 1;
      }
    }

    if (this.attacking) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer += GameConfig.combat.castleAttackInterval;
        return MonsterStep.AttackCastle;
      }
      return MonsterStep.Alive;
    }

    const p = this.node.position;
    const nx = p.x - this._speed * this.slowFactor * dt;
    if (nx <= castleX) {
      // Snap to the castle line, latch into the attacking state, and let the
      // first bite land on the very next step (attackTimer starts at 0).
      this.node.setPosition(castleX, p.y, 0);
      this.attacking = true;
      this.attackTimer = 0;
      return MonsterStep.Alive;
    }
    this.node.setPosition(nx, p.y, 0);
    return MonsterStep.Alive;
  }

  /** Apply damage. Returns true if this hit killed the monster. */
  takeDamage(amount: number): boolean {
    if (!this._active) return false;
    this.hp -= amount;
    return this.hp <= 0;
  }

  /**
   * Apply (or refresh) a temporary slow. `rate` is the fraction of speed removed
   * (0..1, e.g. 0.5 => 50% slower); `duration` is how long it lasts in seconds.
   * First-pass behavior: a fresh slow REPLACES the current one and refreshes the
   * timer (no stacking). The base speed is never mutated, so it always recovers.
   */
  applySlow(rate: number, duration: number): void {
    if (!this._active) return;
    this.slowFactor = Math.max(0, 1 - rate);
    this.slowTimer = duration;
  }

  /** Reset to an idle pooled state (called by MonsterSpawner on recycle). */
  deactivate(): void {
    this._active = false;
    this.hp = 0;
    this._gold = 0;
    this._castleDamage = 0;
    this._speed = 0;
    this.attacking = false;
    this.attackTimer = 0;
    this.slowFactor = 1;
    this.slowTimer = 0;
    this.node.active = false;
  }

  /** Show the current monster type's sprite, sized from its hitbox radius. */
  private applyArt(frame: SpriteFrame | null): void {
    const d = this.cfg.radius * 2;
    (this.getComponent(UITransform) ?? this.addComponent(UITransform)).setContentSize(d, d);
    const sprite = this.getComponent(Sprite) ?? this.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.spriteFrame = frame;
  }
}
