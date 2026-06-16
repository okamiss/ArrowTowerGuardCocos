/**
 * Arrow.ts
 * ----------------------------------------------------------------------------
 * A single projectile. Flies in a straight line from the tower muzzle toward
 * the tapped point, carrying a damage payload. Pure entity: it moves itself and
 * knows when its life is spent — it does NOT know about monsters or collision.
 * The conductor (BattleManager) drives `step()`, checks hits, and recycles it.
 *
 * Lifecycle: created by ArrowPool (factory), reused via launch()/deactivate().
 * Never instantiate/destroy per shot — always go through ArrowPool.
 *
 * Required scene refs: none. The node is built programmatically by ArrowPool
 * (UITransform + Graphics placeholder); this component is added to it.
 * ----------------------------------------------------------------------------
 */

import { _decorator, Component, Vec3 } from 'cc';
import { GameConfig } from '../core/GameConfig';

const { ccclass } = _decorator;

// Scratch vector reused across launches to avoid per-shot allocation.
const _dir = new Vec3();

@ccclass('Arrow')
export class Arrow extends Component {
  private readonly velocity = new Vec3();
  private life = 0;
  private _damage = 0;
  private _active = false;

  /** Damage this arrow delivers on its single hit. */
  get damage(): number {
    return this._damage;
  }

  /** True while in flight (not yet recycled). */
  get isActive(): boolean {
    return this._active;
  }

  /** Current tip position (world == local under the flat UI battle layer). */
  get position(): Readonly<Vec3> {
    return this.node.position;
  }

  /**
   * Launch from `from` straight toward `target`, continuing past it. Numbers
   * default to GameConfig.arrow; damage is supplied by the archer's stats.
   */
  launch(
    from: Vec3,
    target: Vec3,
    damage: number,
    speed = GameConfig.arrow.speed,
    lifetime = GameConfig.arrow.lifetime,
  ): void {
    Vec3.subtract(_dir, target, from);
    _dir.z = 0;
    if (_dir.lengthSqr() < 1e-6) {
      _dir.set(1, 0, 0); // degenerate tap on the muzzle: fire right
    }
    _dir.normalize();
    Vec3.multiplyScalar(this.velocity, _dir, speed);

    this._damage = damage;
    this.life = lifetime;
    this._active = true;

    this.node.setPosition(from.x, from.y, 0);
    this.node.angle = Math.atan2(_dir.y, _dir.x) * 180 / Math.PI; // face travel dir
    this.node.active = true;
  }

  /**
   * Advance one frame. Returns true while still flying, false once its lifetime
   * is spent (BattleManager then recycles it). Off-screen culling is handled by
   * the conductor, which knows the screen bounds.
   */
  step(dt: number): boolean {
    if (!this._active) return false;
    this.life -= dt;
    if (this.life <= 0) return false;
    const p = this.node.position;
    this.node.setPosition(p.x + this.velocity.x * dt, p.y + this.velocity.y * dt, 0);
    return true;
  }

  /** Reset to an idle pooled state (called by ArrowPool on recycle). */
  deactivate(): void {
    this._active = false;
    this._damage = 0;
    this.life = 0;
    this.velocity.set(0, 0, 0);
    this.node.active = false;
  }
}
