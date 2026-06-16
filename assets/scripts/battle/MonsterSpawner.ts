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
  readonly isBoss: boolean;
}

/**
 * An in-flight spawn group: the monsters of ONE `ResolvedSpawn` drained on that
 * group's own cadence. A wave may produce several tasks (one per monster type),
 * each with its own `interval` and an initial `timer` countdown (= startDelay)
 * before its first spawn. Tasks run concurrently and are dropped when drained.
 */
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

  // Active spawn tasks (one per monster GROUP of a live wave). Multiple run
  // concurrently (overlapping waves + per-group start delays).
  private readonly tasks: SpawnTask[] = [];

  // Boss-once guard: latched the moment a boss is actually emitted, reset only by
  // stop() (called on level start/restart, level complete, and defeat). Prevents
  // a duplicate boss from any source — a re-triggered wave, a re-queued group, or
  // a startDelay timer firing twice.
  private bossSpawnedThisLevel = false;

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

  /**
   * Queue a newly-triggered wave. Each `ResolvedSpawn` group becomes its OWN
   * concurrent task with that group's cadence (`spawnInterval`) and an initial
   * `startDelay` countdown before its first spawn. A boss group is skipped here
   * if one was already spawned this level (belt-and-suspenders with the drain-
   * time guard in `update`).
   */
  spawnWave(wave: WavePlan): void {
    for (const spawn of wave.spawns) {
      if (spawn.isBoss && this.bossSpawnedThisLevel) continue; // never queue a 2nd boss
      const count = spawn.isBoss ? 1 : spawn.count;           // bosses are always exactly one
      const queue: SpawnTicket[] = [];
      for (let i = 0; i < count; i++) {
        queue.push({
          id: spawn.id,
          hp: spawn.hp,
          gold: spawn.gold,
          castleDamage: spawn.castleDamage,
          speed: spawn.speed,
          isBoss: spawn.isBoss,
        });
      }
      if (queue.length === 0) continue;
      // timer starts at startDelay (counts down before the first spawn), then
      // the group spawns one per `spawnInterval`.
      this.tasks.push({ queue, cursor: 0, timer: spawn.startDelay, interval: spawn.spawnInterval });
    }
  }

  /**
   * Advance every active spawn task. Each emits one monster per its interval
   * (catching up if `dt` covers several) and is dropped once exhausted. Spawned
   * monsters are handed to `onSpawn` (BattleManager tracks them + counts).
   *
   * Boss tickets are gated by `bossSpawnedThisLevel`: the FIRST boss latches the
   * guard; any further boss ticket is dropped (consumed without spawning), so a
   * boss can never appear twice within a level regardless of how it was queued.
   */
  update(dt: number, onSpawn: (monster: Monster) => void): void {
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const task = this.tasks[i];
      task.timer -= dt;
      while (task.timer <= 0 && task.cursor < task.queue.length) {
        const ticket = task.queue[task.cursor++];
        task.timer += task.interval;
        if (ticket.isBoss) {
          if (this.bossSpawnedThisLevel) continue; // duplicate boss: drop it
          this.bossSpawnedThisLevel = true;
        }
        onSpawn(this.spawnOne(ticket));
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

  /**
   * Halt all spawning immediately and reset per-level state (e.g. on level
   * start/restart, level complete, or defeat). Clearing the boss guard here is
   * what lets the NEXT level spawn its own boss.
   */
  stop(): void {
    this.tasks.length = 0;
    this.bossSpawnedThisLevel = false;
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
