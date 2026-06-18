# Object Sprite Assets

Place PNG files here. Each file is one object/prop sprite.
Transparent background (alpha channel) required.

## Folder Convention
```
objects/
  chest/      chest_closed.png, chest_open.png, chest_gold.png
  barrel/     barrel_wood.png, barrel_oil.png, barrel_fire.png
  crate/      crate_wood.png, crate_metal.png
  tree/       tree_oak.png, tree_pine.png, tree_dead.png
  statue/     statue_stone.png, statue_gold.png
  pillar/     pillar_stone.png, pillar_marble.png
  misc/       sign_wood.png, well.png, fountain.png, campfire.png ...
```

## Recommended Size
- 32×32px for 1-tile objects (barrel, crate, chest)
- 32×64px for tall objects (tree, pillar, statue) — they hang UP from their tile
- 64×64px for large props (fountain, altar)
- PNG with alpha transparency

## Free Asset Sources (CC0 / CC-BY)
- **Kenney.nl** — huge CC0 top-down pack with chests, barrels, crates, trees
  https://kenney.nl/assets/tiny-dungeon  
  https://kenney.nl/assets/roguelike-rpg-pack
- **OpenGameArt** — search "top-down RPG objects CC0"
  https://opengameart.org/content/2d-lost-garden-zelda-style-tiles
- **itch.io free assets** — many CC0 16px and 32px top-down packs
  https://itch.io/game-assets/free/tag-top-down

## Using Animated Objects (chest open/close)
In the Custom Sprite modal:
1. Set frame 0 path: chest/chest_closed.png
2. Set frame 1 path: chest/chest_open.png  
3. Check "Flag-driven" and give it a flag key like: chest_5_3
4. Add a SCRIPT event on the same tile with action SET_MAP_FLAG
   { key: "chest_5_3", value: true } to open it when player steps on it
