# Character Sprite Assets

Drop PNG files (transparent background) into the matching folder.

## Folder Structure
```
characters/
  bodies/      body_human_m.png, body_human_f.png, body_elf_m.png, body_orc_m.png ...
  heads/       head_human_m_01.png, head_human_m_02.png, head_elf_f_01.png ...
  hair/        hair_short_01.png, hair_long_01.png, hair_mohawk_01.png ...
  armor/       armor_leather_m.png, armor_plate_m.png, armor_robe_f.png ...
  weapon/      weapon_sword_01.png, weapon_staff_01.png, weapon_bow_01.png ...
  acc/         acc_cloak_01.png, acc_cape_01.png ...
```

## Recommended Sizes
- 64×64px or 32×64px for humanoid characters (top-down)
- PNG with alpha transparency
- Match your existing tileset pixel density (16px or 32px tile size)

## Free Asset Sources (CC0 / CC-BY)
- **LPC (Liberated Pixel Cup)** — massive library of compatible character parts
  https://opengameart.org/content/liberated-pixel-cup-characters
- **Universal LPC Spritesheet Character Generator**
  https://sanderfrenken.github.io/Universal-LPC-Spritesheet-Character-Generator/
- **OpenGameArt.org** — search "top-down character" filtered to CC0

## Naming Convention
Use `type_race_gender_variant` — e.g. `head_human_m_01`
The Character Creator uses this as the filename (without .png).
