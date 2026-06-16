/**
 * FloatingText.ts
 * ----------------------------------------------------------------------------
 * Shared base for the short-lived floating labels that rise off the battlefield
 * (damage numbers, gold pop-ups). A pure PRESENTER: it shows a string, drifts it
 * upward, fades it out, and — once its lifetime ends — deactivates itself and
 * calls back into its owning pool so the node is reused (no per-kill
 * instantiate/destroy, see the performance rules in CLAUDE.md).
 *
 * It owns NO game state and computes NO gameplay numbers: the text + style are
 * handed to it by `play()`; the caller (BattleManager, via DamageText /
 * GoldPopupText pools) decides what to show and where.
 *
 * Subclasses (DamageText, GoldPopupText) only pick the string + colour + size.
 *
 * Required scene refs: none (built programmatically by the pools).
 * ----------------------------------------------------------------------------
 */

import { Component, UITransform, Label, Color } from 'cc';

/** Style + lifetime for one floating label. */
export interface FloatingTextOptions {
  text: string;
  color: Color;
  fontSize: number;
  /** Total upward drift over the label's life (px). */
  rise: number;
  /** Seconds before the label fades out and recycles. */
  duration: number;
  /** Returns the label to its pool when the animation finishes. */
  release: (self: FloatingText) => void;
}

export abstract class FloatingText extends Component {
  private label: Label | null = null;
  private riseSpeed = 0;       // px/s, derived from rise / duration
  private elapsed = 0;
  private duration = 0;
  private readonly baseColor = new Color(255, 255, 255, 255);
  private release: ((self: FloatingText) => void) | null = null;

  /** Start the rise+fade for the given style. The node is positioned by the caller. */
  protected play(opts: FloatingTextOptions): void {
    this.ensureLabel();
    const label = this.label!;
    label.string = opts.text;
    label.fontSize = opts.fontSize;
    label.lineHeight = Math.round(opts.fontSize * 1.1);

    this.baseColor.set(opts.color);
    label.color = this.baseColor.clone();

    this.duration = Math.max(0.01, opts.duration);
    this.riseSpeed = opts.rise / this.duration;
    this.elapsed = 0;
    this.release = opts.release;
    this.node.active = true;
  }

  protected update(dt: number): void {
    if (!this.node.active || this.release === null) return;

    this.elapsed += dt;
    const p = this.node.position;
    this.node.setPosition(p.x, p.y + this.riseSpeed * dt, p.z);

    const remaining = 1 - this.elapsed / this.duration;
    if (remaining <= 0) {
      this.node.active = false;
      const done = this.release;
      this.release = null;
      done(this); // back to the pool
      return;
    }

    if (this.label) {
      this.label.color = new Color(
        this.baseColor.r, this.baseColor.g, this.baseColor.b,
        Math.round(255 * remaining),
      );
    }
  }

  /** Lazily attach the Label (and its required UITransform) on first use. */
  private ensureLabel(): void {
    const ut = this.getComponent(UITransform) ?? this.addComponent(UITransform);
    ut.setAnchorPoint(0.5, 0.5);
    if (!this.label) {
      const label = this.getComponent(Label) ?? this.addComponent(Label);
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.enableOutline = true;
      label.outlineColor = new Color(0, 0, 0, 200);
      label.outlineWidth = 2;
      this.label = label;
    }
  }
}
