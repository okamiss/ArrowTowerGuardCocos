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
import type { MonsterConfig, MonsterId } from '../core/GameConfig';

const { ccclass } = _decorator;

/** Result of advancing a monster one frame. */
export enum MonsterStep {
  Alive,
  ReachedCastle,
}

@ccclass('Monster')
export class Monster extends Component {
  private cfg!: MonsterConfig;
  private hp = 0;
  private _active = false;

  get id(): MonsterId {
    return this.cfg.id;
  }

  /** Gold awarded to the player on death. */
  get gold(): number {
    return this.cfg.gold;
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

  /** Configure for a (re)spawn of `cfg` at the given position with its art. */
  spawn(cfg: MonsterConfig, x: number, y: number, frame: SpriteFrame | null): void {
    this.cfg = cfg;
    this.hp = cfg.hp;
    this._active = true;
    this.applyArt(frame);
    this.node.setPosition(x, y, 0);
    this.node.active = true;
  }

  /**
   * Move left one frame. Returns ReachedCastle once the center crosses the
   * castle hit line (the conductor then recycles it).
   */
  step(dt: number, castleX: number): MonsterStep {
    if (!this._active) return MonsterStep.Alive;
    const p = this.node.position;
    const nx = p.x - this.cfg.speed * dt;
    this.node.setPosition(nx, p.y, 0);
    return nx <= castleX ? MonsterStep.ReachedCastle : MonsterStep.Alive;
  }

  /** Apply damage. Returns true if this hit killed the monster. */
  takeDamage(amount: number): boolean {
    if (!this._active) return false;
    this.hp -= amount;
    return this.hp <= 0;
  }

  /** Reset to an idle pooled state (called by MonsterSpawner on recycle). */
  deactivate(): void {
    this._active = false;
    this.hp = 0;
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
