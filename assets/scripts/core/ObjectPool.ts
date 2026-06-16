/**
 * ObjectPool.ts
 * ----------------------------------------------------------------------------
 * Generic recycling pool<T>. Hot battle objects (arrows, monsters, damage
 * labels) are reused through this instead of `instantiate`/`destroy` per shot
 * or per kill — see the performance rules in CLAUDE.md / ARCHITECTURE.md §7.
 *
 * No Cocos ('cc') dependency: the pool only knows how to MAKE an item (factory)
 * and how to RESET it on recycle. That keeps it trivially unit-testable and
 * usable for both node-backed entities and plain objects.
 *
 * Contract:
 *   - get(): hand out a free item, creating one on demand if the pool is empty.
 *   - put(item): reset the item (clear stale state) and return it to the pool.
 * Callers must not keep using an item after put().
 * ----------------------------------------------------------------------------
 */

export class ObjectPool<T> {
  /** Items currently available for reuse. */
  private readonly free: T[] = [];
  /** Total items ever created by this pool (for diagnostics). */
  private created = 0;

  /**
   * @param factory   makes a brand-new item (called lazily and during prewarm).
   * @param resetItem clears an item's stale state on recycle (default: no-op).
   * @param prewarm   how many items to allocate up front.
   */
  constructor(
    private readonly factory: () => T,
    private readonly resetItem: (item: T) => void = () => {},
    prewarm = 0,
  ) {
    for (let i = 0; i < prewarm; i++) {
      this.free.push(this.make());
    }
  }

  /** Hand out a free item, allocating a new one only if the pool is empty. */
  get(): T {
    const item = this.free.pop();
    return item ?? this.make();
  }

  /** Reset and return an item to the pool for later reuse. */
  put(item: T): void {
    this.resetItem(item);
    this.free.push(item);
  }

  /** Number of items currently idle in the pool. */
  get freeCount(): number {
    return this.free.length;
  }

  /** Total items this pool has ever created (active + idle). */
  get createdCount(): number {
    return this.created;
  }

  private make(): T {
    this.created++;
    return this.factory();
  }
}
