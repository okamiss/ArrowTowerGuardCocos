/**
 * MonsterSpawner.ts
 * ----------------------------------------------------------------------------
 * Pulls monsters from an ObjectPool and places them at the right-edge spawn
 * point on a timer. Owns the monster pool so the battle never instantiates /
 * destroys enemies per kill (see performance rules).
 *
 * It is a thin, plan-driven pump. BattleManager calls `spawnWave(wave)` each
 * time a wave becomes due; the spawner turns that wave into a per-monster spawn
 * TASK and emits one monster per `spawnInterval`. Several tasks can run at once
 * (waves are time-scheduled and overlap), so the spawner advances all active
 * tasks every frame and drops each one when its monsters are exhausted.
 *
 * It does NOT decide when a wave/level is cleared, does NOT count alive monsters,
 * does NOT save, and owns NO UI — those are LevelManager / BattleManager.
 * ----------------------------------------------------------------------------
 */

import { Node, UITransform, Sprite, SpriteFrame, Layers } from 'cc';
import { ObjectPool } from '../core/ObjectPool';
import { Monster } from '../monster/Monster';
import { GameConfig } from '../core/GameConfig';
import type { MonsterId, WavePlan } from '../core/GameConfig';

/** One queued spawn carrying its level-scaled stats. */
interface SpawnTicket {
  readonly id: MonsterId;
  readonly hp: number;
  readonly gold: number;
  readonly castleDamage: number;
  readonly speed: number;
}

/** An in-flight wave: a queue of monsters drained on its own cadence. */
interface SpawnTask {
  readonly queue: SpawnTicket[];
  cursor: number;
  timer: number;
  readonly interval: number;
}

/** Resolves the preloaded SpriteFrame for a monster type. */
export type MonsterFrameProvider = (id: MonsterId) => SpriteFrame | null;

export class MonsterSpawner {
  private readonly pool: ObjectPool<Monster>;

  // Active spawn tasks (one per live wave). Multiple may run concurrently.
  private readonly tasks: SpawnTask[] = [];

  // Design-space (bottom-left origin) -> center-origin offsets.
  private static readonly HALF_W = GameConfig.layout.designWidth / 2;
  private static readonly HALF_H = GameConfig.layout.designHeight / 2;

  constructor(
    private readonly parent: Node,
    private readonly frameFor: MonsterFrameProvider,
    prewarm = GameConfig.pool.monsterPrewarm,
  ) {
    this.pool = new ObjectPool<Monster>(
      () => this.createMonster(),
      (monster) => monster.deactivate(),
      prewarm,
    );
  }

  /** Queue a newly-triggered wave as a concurrent spawn task. */
  spawnWave(wave: WavePlan): void {
    const queue = MonsterSpawner.flatten(wave);
    if (queue.length === 0) return;
    this.tasks.push({ queue, cursor: 0, timer: 0, interval: wave.spawnInterval });
  }

  /**
   * Advance every active spawn task. Each emits one monster per its interval
   * (catching up if `dt` covers several) and is dropped once exhausted. Spawned
   * monsters are handed to `onSpawn` (BattleManager tracks them + counts).
   */
  update(dt: number, onSpawn: (monster: Monster) => void): void {
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const task = this.tasks[i];
      task.timer -= dt;
      while (task.timer <= 0 && task.cursor < task.queue.length) {
        onSpawn(this.spawnOne(task.queue[task.cursor++]));
        task.timer += task.interval;
      }
      if (task.cursor >= task.queue.length) {
        // Swap-remove the finished task.
        this.tasks[i] = this.tasks[this.tasks.length - 1];
        this.tasks.pop();
      }
    }
  }

  /** True while any wave still has monsters left to spawn. */
  get hasPendingSpawns(): boolean {
    return this.tasks.length > 0;
  }

  /** Halt all spawning immediately (e.g. on level complete / defeat). */
  stop(): void {
    this.tasks.length = 0;
  }

  /** Recycle a dead / castle-reaching monster back into the pool. */
  recycle(monster: Monster): void {
    this.pool.put(monster);
  }

  private spawnOne(ticket: SpawnTicket): Monster {
    const cfg = GameConfig.monsters[ticket.id];
    const laneY = cfg.lane === 'air' ? GameConfig.layout.airY : GameConfig.layout.groundY;
    const x = GameConfig.layout.spawnX - MonsterSpawner.HALF_W;
    const y = laneY - MonsterSpawner.HALF_H;

    const monster = this.pool.get();
    monster.spawn(cfg, x, y, this.frameFor(ticket.id), {
      hp: ticket.hp,
      gold: ticket.gold,
      castleDamage: ticket.castleDamage,
      speed: ticket.speed,
    });
    return monster;
  }

  /** Flatten a wave into one spawn ticket per individual monster. */
  private static flatten(wave: WavePlan): SpawnTicket[] {
    const q: SpawnTicket[] = [];
    for (const spawn of wave.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        q.push({
          id: spawn.id,
          hp: spawn.hp,
          gold: spawn.gold,
          castleDamage: spawn.castleDamage,
          speed: spawn.speed,
        });
      }
    }
    return q;
  }

  /** Build a fresh monster node + component (Sprite frame set on spawn). */
  private createMonster(): Monster {
    const node = new Node('monster');
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform);
    node.addComponent(Sprite);
    node.active = false;
    this.parent.addChild(node);
    return node.addComponent(Monster);
  }
}
