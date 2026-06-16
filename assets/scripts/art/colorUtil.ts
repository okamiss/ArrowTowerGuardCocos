/**
 * colorUtil.ts
 * ----------------------------------------------------------------------------
 * Shared `#rrggbb` -> cc.Color parser. Placeholder fills come from
 * GameConfig.colors / monster.color (the single source of truth for tints), so
 * every node-builder needs to turn those hex strings into a cc.Color. This is
 * the one place that conversion lives.
 * ----------------------------------------------------------------------------
 */

import { Color } from 'cc';

/** Parse a `#rrggbb` hex string into a cc.Color (alpha 0-255, default opaque). */
export function hexToColor(hex: string, a = 255): Color {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return new Color(r, g, b, a);
}
