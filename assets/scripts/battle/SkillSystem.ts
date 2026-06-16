/**
 * SkillSystem.ts
 * ----------------------------------------------------------------------------
 * The active-skill brain (first pass). Owns skill LEVELS (read from the save),
 * per-skill COOLDOWNS, and the cast logic for the three MVP skills:
 *   - Multishot : fires a short burst of arrows at the lead monster,
 *   - IceSpike  : area damage + a temporary slow on the lead cluster,
 *   - Fireball  : area explosion damage on the lead cluster.
 *
 * Pure logic — NO Cocos ('cc') dependency — so cooldown gating and targeting are
 * unit-testable. Everything that touches nodes/pools (launching arrows, applying
 * area damage, spawning placeholder FX) is delegated to a `SkillContext` that
 * BattleManager implements. The UI never reaches in here; it only calls the
 * read-only query methods (canCast / getCooldownRemaining / ...) and asks
 * BattleManager to `castSkill`.
 *
 * All balance numbers (cooldown / damage / radius / slow / cadence) come from
 * GameConfig.skills — nothing is hard-coded here.
 * ----------------------------------------------------------------------------
 */

import { GameConfig } from '../core/GameConfig';
import type { SkillId } from '../core/GameConfig';
import type { PlayerSaveData } from '../save/PlayerSaveData';
import { SKILL_LEVEL_KEY } from '../save/PlayerSaveData';

const HALF_W = GameConfig.layout.designWidth / 2;
const HALF_H = GameConfig.layout.designHeight / 2;

/** The three active skills, in display order (drives the skill bar layout). */
export const SKILL_IDS: ReadonlyArray<SkillId> = ['multishot', 'iceSpike', 'fireball'];

/** Where to aim a skill when NO monster is on the field (local center-origin). */
const FALLBACK_AIM_X = HALF_W;                                    // forward, off the right edge
const MUZZLE_LOCAL_Y = GameConfig.layout.towerMuzzle.y - HALF_H;  // muzzle height
const FALLBACK_AREA_X = 0;                                        // mid-field
const FALLBACK_AREA_Y = GameConfig.layout.groundY - HALF_H;       // ground lane

/**
 * The minimal monster shape SkillSystem reads to pick a target. `Monster`
 * satisfies this structurally, so SkillSystem stays free of any 'cc' import.
 */
export interface SkillTarget {
  readonly positionX: number;
  readonly positionY: number;
  readonly isAlive: boolean;
}

/** A battle-local impact point chosen by the drag-to-aim gesture. */
export interface SkillPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The battle-side effects SkillSystem orchestrates. BattleManager implements
 * this (it owns the pools, monster list, DamageSystem, and FX layer); SkillSystem
 * only decides WHAT happens and WHERE, never HOW the nodes are managed.
 */
export interface SkillContext {
  /** Live list of monsters on the field (read-only; used only for targeting). */
  getMonsters(): ReadonlyArray<SkillTarget>;
  /** Current per-arrow player damage (multishot arrows use this). */
  getPlayerArrowDamage(): number;
  /** Launch one arrow from the tower toward (targetX, targetY) ignoring the archer cooldown. */
  fireArrowAt(targetX: number, targetY: number, damage: number): void;
  /** Apply one-shot area damage to every monster within `radius` of the center. */
  dealAreaDamage(centerX: number, centerY: number, radius: number, damage: number): void;
  /** Slow every monster within `radius` for `duration` seconds. */
  applyAreaSlow(centerX: number, centerY: number, radius: number, rate: number, duration: number): void;
  /** Spawn a simple placeholder FX circle (color hex) that lingers for `durationSec`. */
  spawnSkillEffect(centerX: number, centerY: number, radius: number, colorHex: string, durationSec: number): void;
}

/** Per-skill runtime state: unlocked level + remaining cooldown. */
interface SkillRuntime {
  level: number;
  remaining: number; // seconds of cooldown left (0 => ready)
}

/** One queued multishot arrow waiting out its rapid-fire delay. */
interface PendingShot {
  delay: number;
  targetX: number;
  targetY: number;
  damage: number;
}

export class SkillSystem {
  private readonly runtime = new Map<SkillId, SkillRuntime>();
  private readonly pendingShots: PendingShot[] = [];

  constructor(
    private readonly profile: PlayerSaveData,
    private readonly ctx: SkillContext,
  ) {
    for (const id of SKILL_IDS) {
      this.runtime.set(id, { level: this.readLevel(id), remaining: 0 });
    }
  }

  // --- per-frame -------------------------------------------------------------

  /** Tick cooldowns and drain the multishot burst queue. Call once per frame. */
  update(dt: number): void {
    for (const rt of this.runtime.values()) {
      if (rt.remaining > 0) rt.remaining = Math.max(0, rt.remaining - dt);
    }

    for (let i = this.pendingShots.length - 1; i >= 0; i--) {
      const shot = this.pendingShots[i];
      shot.delay -= dt;
      if (shot.delay <= 0) {
        this.ctx.fireArrowAt(shot.targetX, shot.targetY, shot.damage);
        this.pendingShots[i] = this.pendingShots[this.pendingShots.length - 1];
        this.pendingShots.pop();
      }
    }
  }

  // --- UI queries (read-only) ------------------------------------------------

  /** Unlocked level of `id` (0 = locked / un-castable). */
  getLevel(id: SkillId): number {
    return this.runtime.get(id)?.level ?? 0;
  }

  /** Full cooldown length (seconds) of `id`. */
  getCooldownTotal(id: SkillId): number {
    return GameConfig.skills[id].cooldown;
  }

  /** Seconds of cooldown still remaining for `id` (0 = ready). */
  getCooldownRemaining(id: SkillId): number {
    return this.runtime.get(id)?.remaining ?? 0;
  }

  /** True only if `id` is unlocked (level > 0) AND off cooldown. */
  canCast(id: SkillId): boolean {
    const rt = this.runtime.get(id);
    return !!rt && rt.level > 0 && rt.remaining <= 0;
  }

  /** Area-of-effect radius (px) of `id`, or 0 for a point/aim skill (multishot).
   *  Used by the UI to draw the drag-to-aim preview at the right size. */
  getAreaRadius(id: SkillId): number {
    return GameConfig.skills[id].radius ?? 0;
  }

  /** Placeholder tint of `id` (used for the aim preview + FX). */
  getColor(id: SkillId): string {
    return GameConfig.skills[id].color ?? '#ffffff';
  }

  /** Best auto-target point for `id` (lead cluster), for a no-drag quick cast. */
  getAutoTarget(id: SkillId): SkillPoint {
    return id === 'multishot' ? this.aimPoint() : this.areaCenter();
  }

  // --- casting ---------------------------------------------------------------

  /**
   * Cast `id` if it is unlocked and ready. On success runs the skill's effect and
   * starts its cooldown; returns whether the cast actually fired (UI can ignore
   * the result — the button is already gated by `canCast`).
   *
   * `target` is the player-chosen impact point (battle-local space) from the
   * drag-to-aim gesture. When omitted, the skill falls back to auto-targeting the
   * lead cluster (used by a plain tap / programmatic casts / tests).
   */
  castSkill(id: SkillId, target?: SkillPoint): boolean {
    if (!this.canCast(id)) return false;

    switch (id) {
      case 'multishot':
        this.castMultishot(target);
        break;
      case 'iceSpike':
        this.castIceSpike(target);
        break;
      case 'fireball':
        this.castFireball(target);
        break;
    }

    const rt = this.runtime.get(id);
    if (rt) rt.remaining = GameConfig.skills[id].cooldown;
    return true;
  }

  // --- individual skills -----------------------------------------------------

  /** Queue a rapid burst of arrows toward `target` (or the lead monster / ahead). */
  private castMultishot(target?: SkillPoint): void {
    const cfg = GameConfig.skills.multishot;
    const count = cfg.arrowCount ?? 3;
    const interval = cfg.interval ?? 0.12;
    const damage = this.ctx.getPlayerArrowDamage();
    const aim = target ?? this.aimPoint();
    for (let i = 0; i < count; i++) {
      this.pendingShots.push({ delay: i * interval, targetX: aim.x, targetY: aim.y, damage });
    }
  }

  /** Area damage + a temporary slow centered on `target` (or the lead cluster). */
  private castIceSpike(target?: SkillPoint): void {
    const cfg = GameConfig.skills.iceSpike;
    const radius = cfg.radius ?? 120;
    const center = target ?? this.areaCenter();
    this.ctx.spawnSkillEffect(center.x, center.y, radius, cfg.color ?? '#5ab0e8', cfg.effectDuration ?? 0.5);
    this.ctx.dealAreaDamage(center.x, center.y, radius, cfg.damage ?? 0);
    this.ctx.applyAreaSlow(center.x, center.y, radius, cfg.slowRate ?? 0.5, cfg.slowDuration ?? 2);
  }

  /** Explosion area damage centered on `target` (or the lead cluster). */
  private castFireball(target?: SkillPoint): void {
    const cfg = GameConfig.skills.fireball;
    const radius = cfg.radius ?? 140;
    const center = target ?? this.areaCenter();
    this.ctx.spawnSkillEffect(center.x, center.y, radius, cfg.color ?? '#ff8a3a', cfg.effectDuration ?? 0.4);
    this.ctx.dealAreaDamage(center.x, center.y, radius, cfg.damage ?? 0);
  }

  // --- targeting helpers -----------------------------------------------------

  /** The monster closest to the castle (smallest x), or null if the field is empty. */
  private frontmostMonster(): SkillTarget | null {
    let best: SkillTarget | null = null;
    for (const m of this.ctx.getMonsters()) {
      if (!m.isAlive) continue;
      if (best === null || m.positionX < best.positionX) best = m;
    }
    return best;
  }

  /** Where multishot arrows fly: the lead monster, else straight ahead. */
  private aimPoint(): { x: number; y: number } {
    const m = this.frontmostMonster();
    if (m) return { x: m.positionX, y: m.positionY };
    return { x: FALLBACK_AIM_X, y: MUZZLE_LOCAL_Y };
  }

  /** Where an area skill lands: on the lead monster, else a mid-field placeholder. */
  private areaCenter(): { x: number; y: number } {
    const m = this.frontmostMonster();
    if (m) return { x: m.positionX, y: m.positionY };
    return { x: FALLBACK_AREA_X, y: FALLBACK_AREA_Y };
  }

  // --- internals -------------------------------------------------------------

  private readLevel(id: SkillId): number {
    const lvl = this.profile.skills[SKILL_LEVEL_KEY[id]];
    return Number.isFinite(lvl) ? Math.max(0, Math.floor(lvl)) : 0;
  }
}
