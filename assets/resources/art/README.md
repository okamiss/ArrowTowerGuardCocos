# Art assets (Cocos `resources`)

Everything under `assets/resources/` is dynamically loadable at runtime via
`resources.load(path, SpriteFrame)`. The game loads art through
[`AssetConfig.ts`](../../scripts/art/AssetConfig.ts) +
[`AssetLoader.ts`](../../scripts/art/AssetLoader.ts) — **never hard-code paths in
gameplay code**.

## How it works today (zero PNGs required)

Each visual element first draws its **Graphics placeholder** (a solid-color box,
color taken from `GameConfig.ts`). The loader then tries to load a real
`SpriteFrame` from the matching folder below. If the PNG exists, the placeholder
is swapped for a Sprite; if not, the placeholder stays. The game runs fine with
this folder completely empty.

## Adding real art later

Drop a PNG into the correct sub-folder using the filename that matches the
`path` in `AssetConfig.ts`. Example: `AssetConfig.tower.castle.path` is
`art/tower/castle`, so the file goes to:

    assets/resources/art/tower/castle.png

After the Cocos editor imports it (it auto-generates the `.meta`), make sure the
image's **Type** is `sprite-frame` in the Inspector (the default for a plain
PNG). No code changes are needed — the loader picks it up on next run.

## Folders

| Folder        | Contents                                   |
|---------------|--------------------------------------------|
| `background/` | `field`, `ground`                          |
| `tower/`      | `castle`, `tower`, `archer`, `arrow`       |
| `enemy/`      | `goblin`, `bat`, `brute`, `overlord`       |
| `ui/`         | `button`, `spawn_zone`                      |
