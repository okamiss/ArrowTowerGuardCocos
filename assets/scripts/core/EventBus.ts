/**
 * EventBus.ts
 * ----------------------------------------------------------------------------
 * Typed publish/subscribe channel. The ONLY way modules talk across boundaries
 * (UI never reaches into core state directly — it listens/emits here).
 *
 * No Cocos dependency, so it is unit-testable in plain TypeScript.
 * Import the shared singleton `eventBus`, or construct your own for tests.
 * ----------------------------------------------------------------------------
 */

import type { MonsterId, UpgradeId } from './GameConfig';

/** All cross-module events. Add new events here, never as loose strings. */
export enum GameEvent {
  GoldChanged = 'gold-changed',
  MonsterKilled = 'monster-killed',
  CastleHpChanged = 'castle-hp-changed',
  WaveStarted = 'wave-started',
  WaveCleared = 'wave-cleared',
  UpgradePurchased = 'upgrade-purchased',
  GameStateChanged = 'game-state-changed',
  GameOver = 'game-over',
  GamePaused = 'game-paused',
  GameResumed = 'game-resumed',
}

/** Strongly-typed payload for each event. */
export interface GameEventPayload {
  [GameEvent.GoldChanged]: { gold: number };
  [GameEvent.MonsterKilled]: { id: MonsterId; gold: number };
  [GameEvent.CastleHpChanged]: { hp: number; maxHp: number };
  [GameEvent.WaveStarted]: { index: number; total: number };
  [GameEvent.WaveCleared]: { index: number };
  [GameEvent.UpgradePurchased]: { id: UpgradeId; level: number };
  [GameEvent.GameStateChanged]: { from: string; to: string };
  [GameEvent.GameOver]: { result: 'win' | 'lose' };
  [GameEvent.GamePaused]: Record<string, never>;
  [GameEvent.GameResumed]: Record<string, never>;
}

type Handler<E extends GameEvent> = (payload: GameEventPayload[E]) => void;

interface Subscription {
  handler: Function;
  target?: object;
  once: boolean;
}

export class EventBus {
  private readonly subs = new Map<GameEvent, Subscription[]>();

  on<E extends GameEvent>(event: E, handler: Handler<E>, target?: object): void {
    this.add(event, handler, target, false);
  }

  once<E extends GameEvent>(event: E, handler: Handler<E>, target?: object): void {
    this.add(event, handler, target, true);
  }

  off<E extends GameEvent>(event: E, handler: Handler<E>, target?: object): void {
    const list = this.subs.get(event);
    if (!list) return;
    this.subs.set(
      event,
      list.filter((s) => !(s.handler === handler && s.target === target)),
    );
  }

  /** Remove every subscription belonging to `target` (call in onDestroy). */
  offTarget(target: object): void {
    for (const [event, list] of this.subs) {
      this.subs.set(event, list.filter((s) => s.target !== target));
    }
  }

  emit<E extends GameEvent>(event: E, payload: GameEventPayload[E]): void {
    const list = this.subs.get(event);
    if (!list || list.length === 0) return;
    // Iterate a copy so handlers may unsubscribe during dispatch.
    for (const sub of list.slice()) {
      sub.handler.call(sub.target, payload);
      if (sub.once) this.off(event, sub.handler as Handler<E>, sub.target);
    }
  }

  clear(): void {
    this.subs.clear();
  }

  private add(event: GameEvent, handler: Function, target: object | undefined, once: boolean): void {
    const list = this.subs.get(event) ?? [];
    list.push({ handler, target, once });
    this.subs.set(event, list);
  }
}

/** Shared application-wide bus. */
export const eventBus = new EventBus();
