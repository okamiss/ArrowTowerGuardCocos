/**
 * MonsterSpawner.ts
 * ----------------------------------------------------------------------------
 * Pulls monsters from an ObjectPool and places them at the right-edge spawn
 * point on a timer. Owns the monster pool so MVP demos never instantiate/destroy
 * enemies per kill (see performance rules).
 *
 * For this minimal demo it spawns an ENDLESS stream: the GameConfig wave table
 * is flattened into a spawn queue (each entry carries its wave's spawnInterval),
 * and the cursor loops back to the start when the queue is exhausted so the
 * battlefield keeps producing targets. WaveManager (separate concern) will later
 * own real wave start/clear logic; the spawner stays a thin, config-driven pump.
 *
 * No flow/economy logic here: it only spawns and recycles monster nodes.
 * ----------------------------------------------------------------------------
 */

import { Node, UITransform, Sprite, SpriteFrame, Layers } from 'cc';
import { ObjectPool } from '../core/ObjectPool';
import { Monster } from '../monster/Monster';
import { GameConfig } from '../core/GameConfig';
import type { MonsterId } from '../core/GameConfig';

interface SpawnTicket {
  readonly id: MonsterId;
  readonly interval: number; // seconds to wait before the NEXT spawn
  readonly wave: number;     // 1-based wave this monster belongs to
}

/** Resolves the preloaded SpriteFrame for a monster type. */
export type MonsterFrameProvider = (id: MonsterId) => SpriteFrame | null;

export class MonsterSpawner {
  private readonly pool: ObjectPool<Monster>;
  private readonly queue: SpawnTicket[];
  private cursor = 0;
  private timer = 0;
  private _currentWave = GameConfig.waves.length > 0 ? GameConfig.waves[0].index : 1;

  /** 1-based index of the wave the most recently spawned monster belongs to. */
  get currentWave(): number {
    return this._currentWave;
  }

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
    this.queue = MonsterSpawner.buildQueue();
  }

  /**
   * Advance the spawn clock. When the interval elapses, spawn the next queued
   * monster and hand it to `onSpawn` (the conductor tracks it as active).
   */
  update(dt: number, onSpawn: (monster: Monster) => void): void {
    if (this.queue.length === 0) return;
    this.timer -= dt;
    if (this.timer > 0) return;

    const ticket = this.queue[this.cursor];
    this.timer = ticket.interval;
    this._currentWave = ticket.wave;
    this.cursor = (this.cursor + 1) % this.queue.length; // endless loop
    onSpawn(this.spawnOne(ticket.id));
  }

  /** Recycle a dead / castle-reaching monster back into the pool. */
  recycle(monster: Monster): void {
    this.pool.put(monster);
  }

  private spawnOne(id: MonsterId): Monster {
    const cfg = GameConfig.monsters[id];
    const laneY = cfg.lane === 'air' ? GameConfig.layout.airY : GameConfig.layout.groundY;
    const x = GameConfig.layout.spawnX - MonsterSpawner.HALF_W;
    const y = laneY - MonsterSpawner.HALF_H;

    const monster = this.pool.get();
    monster.spawn(cfg, x, y, this.frameFor(id));
    return monster;
  }

  /** Flatten the wave table into one spawn ticket per individual monster. */
  private static buildQueue(): SpawnTicket[] {
    const q: SpawnTicket[] = [];
    for (const wave of GameConfig.waves) {
      for (const spawn of wave.spawns) {
        for (let i = 0; i < spawn.count; i++) {
          q.push({ id: spawn.monster, interval: wave.spawnInterval, wave: wave.index });
        }
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
