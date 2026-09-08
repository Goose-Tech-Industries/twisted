import os, math, random
from PIL import Image, ImageDraw

def ensure_dirs():
    dirs = [
        "twisted/te_phoenix/priv/static/tilesets",
        "twisted/te_phoenix/priv/static/sprites",
        "twisted/te_phoenix/priv/static/backdrops",
        "twisted/player/static/tilesets",
        "twisted/player/static/sprites",
        "twisted/player/static/backdrops"
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)

def generate_tileset():
    img = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    tile_size = 32

    def cell_rect(col, row):
        return col * tile_size, row * tile_size, (col + 1) * tile_size, (row + 1) * tile_size

    # --- Tile 0 (0,0): Ruined Citadel Stone Floor ---
    x0, y0, x1, y1 = cell_rect(0, 0)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(42, 45, 52))
    for i in range(16):
        rx = x0 + (i * 7) % 30 + 1
        ry = y0 + (i * 11) % 30 + 1
        draw.point((rx, ry), fill=(58, 62, 72))
    # Stone joints
    draw.line([x0, y0 + 16, x1 - 1, y0 + 16], fill=(28, 30, 36))
    draw.line([x0 + 16, y0, x0 + 16, y0 + 16], fill=(28, 30, 36))
    draw.line([x0 + 8, y0 + 16, x0 + 8, y1 - 1], fill=(28, 30, 36))
    draw.line([x0 + 24, y0 + 16, x0 + 24, y1 - 1], fill=(28, 30, 36))

    # --- Tile 1 (1,0): Gothic Basalt Brick Wall ---
    x0, y0, x1, y1 = cell_rect(1, 0)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(24, 26, 32)) # Dark basalt base
    brick_h = 7
    for r in range(4):
        by = y0 + r * (brick_h + 1)
        offset = 8 if (r % 2 == 1) else 0
        for bx in range(x0 - 16 + offset, x1, 16):
            bw = 15
            bx0 = max(x0, bx)
            bx1 = min(x1 - 1, bx + bw)
            if bx1 > bx0:
                # Brick face
                draw.rectangle([bx0, by, bx1, by + brick_h - 1], fill=(48, 54, 66))
                # Top highlight
                draw.line([bx0, by, bx1, by], fill=(70, 78, 94))
                # Bottom & right shadow
                draw.line([bx0, by + brick_h - 1, bx1, by + brick_h - 1], fill=(16, 18, 22))
                draw.line([bx1, by, bx1, by + brick_h - 1], fill=(16, 18, 22))

    # --- Tile 2 (2,0): Wall Top / Parapet Coping ---
    x0, y0, x1, y1 = cell_rect(2, 0)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(36, 40, 50))
    # Coping stone slabs
    draw.rectangle([x0 + 2, y0 + 2, x1 - 3, y1 - 3], fill=(55, 62, 75))
    draw.line([x0 + 2, y0 + 2, x1 - 3, y0 + 2], fill=(85, 95, 115))
    draw.line([x0 + 2, y0 + 2, x0 + 2, y1 - 3], fill=(85, 95, 115))
    draw.line([x0 + 2, y1 - 3, x1 - 3, y1 - 3], fill=(20, 22, 28))
    draw.line([x1 - 3, y0 + 2, x1 - 3, y1 - 3], fill=(20, 22, 28))

    # --- Tile 3 (3,0): Dark Cathedral Pool ---
    x0, y0, x1, y1 = cell_rect(3, 0)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(12, 35, 48))
    draw.ellipse([x0 + 4, y0 + 8, x0 + 20, y0 + 16], outline=(24, 70, 96), width=1)
    draw.ellipse([x0 + 14, y0 + 18, x0 + 28, y0 + 26], outline=(36, 100, 130), width=1)

    # --- Tile 4 (4,0): Charred Timber Beams ---
    x0, y0, x1, y1 = cell_rect(4, 0)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(25, 20, 18))
    for p in range(4):
        py = y0 + p * 8
        draw.rectangle([x0, py, x1-1, py + 6], fill=(50, 36, 28))
        draw.line([x0, py, x1-1, py], fill=(72, 52, 40))
        draw.line([x0, py + 6, x1-1, py + 6], fill=(15, 12, 10))
        # Charred wood cracks
        draw.line([x0 + 8 + p * 3, py + 1, x0 + 14 + p * 3, py + 5], fill=(12, 10, 8))

    # --- Tile 5 (5,0): Ashveil Gothic Cobblestone with glowing embers! ---
    x0, y0, x1, y1 = cell_rect(5, 0)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(22, 24, 28)) # Dark mortar
    stones = [
        (1, 1, 9, 8), (12, 1, 10, 7), (24, 1, 7, 8),
        (1, 11, 12, 9), (15, 10, 16, 10),
        (1, 22, 10, 9), (13, 22, 9, 8), (24, 22, 7, 9)
    ]
    for (sx, sy, sw, sh) in stones:
        draw.rectangle([x0 + sx, y0 + sy, x0 + sx + sw - 1, y0 + sy + sh - 1], fill=(52, 56, 64))
        draw.line([x0 + sx, y0 + sy, x0 + sx + sw - 1, y0 + sy], fill=(74, 80, 92))
        draw.line([x0 + sx, y0 + sy, x0 + sx, y0 + sy + sh - 1], fill=(74, 80, 92))
        draw.line([x0 + sx, y0 + sy + sh - 1, x0 + sx + sw - 1, y0 + sy + sh - 1], fill=(18, 20, 24))
        draw.line([x0 + sx + sw - 1, y0 + sy, x0 + sx + sw - 1, y0 + sy + sh - 1], fill=(18, 20, 24))
    # Glowing orange embers in crevices
    draw.point((x0 + 11, y0 + 10), fill=(255, 120, 0))
    draw.point((x0 + 14, y0 + 21), fill=(255, 160, 20))
    draw.point((x0 + 23, y0 + 10), fill=(255, 80, 0))

    # --- Tile 6 (6,0): Crumbling Basalt Wall ---
    x0, y0, x1, y1 = cell_rect(6, 0)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(20, 22, 26))
    draw.polygon([(x0+2, y0+4), (x0+28, y0+2), (x0+22, y0+28), (x0+4, y0+24)], fill=(44, 48, 58))
    draw.polygon([(x0+4, y0+6), (x0+18, y0+12), (x0+8, y0+22)], fill=(62, 68, 80))
    draw.line([x0+12, y0+8, x0+20, y0+24], fill=(15, 16, 20))

    # --- Tile 7 (7,0): Molten Embers / Lava Fissure ---
    x0, y0, x1, y1 = cell_rect(7, 0)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(200, 60, 0))
    draw.rectangle([x0+4, y0+10, x1-5, y0+14], fill=(255, 200, 40))
    draw.rectangle([x0+12, y0+6, x0+18, y1-6], fill=(255, 240, 100))
    # Basalt crust
    draw.rectangle([x0+2, y0+2, x0+10, y0+7], fill=(40, 20, 15))
    draw.rectangle([x0+18, y0+18, x1-3, y1-3], fill=(40, 20, 15))

    # --- Tile 8 (0,1): Volcanic Ash Pathway ---
    x0, y0, x1, y1 = cell_rect(0, 1)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(68, 64, 62))
    for i in range(24):
        rx = x0 + (i * 13) % 30 + 1
        ry = y0 + (i * 19) % 30 + 1
        c = 55 if i % 2 == 0 else 85
        draw.point((rx, ry), fill=(c, c - 4, c - 6))

    # --- Tile 9 (1,1): Ancient Runic Stone Slab ---
    x0, y0, x1, y1 = cell_rect(1, 1)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(35, 38, 46))
    draw.rectangle([x0+2, y0+2, x1-3, y1-3], fill=(48, 52, 62))
    # Glowing rune marks
    draw.line([x0+16, y0+6, x0+16, y1-8], fill=(255, 140, 20), width=1)
    draw.line([x0+10, y0+12, x0+22, y0+12], fill=(255, 140, 20), width=1)
    draw.line([x0+12, y0+20, x0+20, y0+20], fill=(255, 140, 20), width=1)

    # --- Tile 10 (2,1): Iron Grating / Drain ---
    x0, y0, x1, y1 = cell_rect(2, 1)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(10, 12, 16)) # Void
    for gx in range(x0+4, x1-4, 5):
        draw.line([gx, y0+2, gx, y1-3], fill=(90, 95, 105), width=2)
    for gy in range(y0+4, y1-4, 5):
        draw.line([x0+2, gy, x1-3, gy], fill=(70, 75, 85), width=1)

    # --- Tile 11 (3,1): Broken Pillar Base ---
    x0, y0, x1, y1 = cell_rect(3, 1)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(40, 42, 48))
    draw.ellipse([x0+4, y0+4, x1-5, y1-5], fill=(65, 70, 82), outline=(95, 102, 118), width=2)
    draw.ellipse([x0+8, y0+8, x1-9, y1-9], fill=(50, 54, 64))

    # --- Tile 12 (4,1): Smoldering Cinders Floor ---
    x0, y0, x1, y1 = cell_rect(4, 1)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(32, 28, 26))
    for i in range(18):
        rx = x0 + (i * 17) % 30 + 1
        ry = y0 + (i * 23) % 30 + 1
        draw.rectangle([rx, ry, rx+1, ry+1], fill=(255, 100 + (i * 8) % 150, 0))

    # --- Tile 13 (5,1): Deep Volcanic Ash Layer ---
    x0, y0, x1, y1 = cell_rect(5, 1)
    draw.rectangle([x0, y0, x1-1, y1-1], fill=(52, 50, 48))
    for i in range(30):
        rx = x0 + (i * 11) % 30 + 1
        ry = y0 + (i * 7) % 30 + 1
        draw.point((rx, ry), fill=(70, 68, 65))

    img.save("twisted/te_phoenix/priv/static/tilesets/ashveil_tiles.png")
    img.save("twisted/player/static/tilesets/ashveil_tiles.png")
    print("Generated ashveil_tiles.png successfully!")

def generate_animated_braziers():
    # 4 animation frames of flickering fire on an iron brazier stand (32x48)
    for frame in range(4):
        img = Image.new("RGBA", (32, 48), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Iron tripod brazier stand
        draw.rectangle([8, 36, 23, 40], fill=(50, 52, 58)) # Bowl
        draw.line([10, 40, 6, 47], fill=(30, 32, 36), width=2) # Left leg
        draw.line([21, 40, 25, 47], fill=(30, 32, 36), width=2) # Right leg
        draw.line([16, 40, 16, 47], fill=(40, 42, 46), width=2) # Center leg

        # Glowing charcoal bed in bowl
        draw.rectangle([9, 35, 22, 37], fill=(200, 60, 0))

        # Dynamic flickering flames based on frame
        f_shift = math.sin(frame * math.pi / 2.0) * 2.0
        f_height = 14 + int(math.cos(frame * math.pi) * 3)

        # Outer flame (deep red-orange)
        draw.polygon([
            (9, 35),
            (16 + int(f_shift), 35 - f_height),
            (22, 35)
        ], fill=(255, 69, 0, 220))

        # Mid flame (bright orange)
        draw.polygon([
            (11, 35),
            (16 + int(f_shift * 0.7), 35 - f_height + 4),
            (20, 35)
        ], fill=(255, 140, 0, 240))

        # Inner flame core (yellow-white hot)
        draw.polygon([
            (13, 35),
            (16, 35 - f_height + 8),
            (18, 35)
        ], fill=(255, 230, 80, 255))

        # Flying spark
        spark_y = 35 - f_height - (frame * 3) % 8
        draw.point((16 + int(f_shift * 1.5), spark_y), fill=(255, 200, 50))

        path_phx = f"twisted/te_phoenix/priv/static/sprites/brazier_fire_{frame}.png"
        path_ply = f"twisted/player/static/sprites/brazier_fire_{frame}.png"
        img.save(path_phx)
        img.save(path_ply)

    print("Generated 4 brazier fire animation frames successfully!")

def generate_props():
    # 1. Gothic Basalt Pillar (32x64 tall prop)
    pillar = Image.new("RGBA", (32, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(pillar)
    # Capital
    d.rectangle([4, 4, 27, 10], fill=(70, 76, 90))
    d.rectangle([2, 10, 29, 14], fill=(55, 60, 72))
    # Shaft with fluted vertical highlights
    d.rectangle([6, 14, 25, 52], fill=(42, 46, 56))
    for fx in [8, 12, 16, 20, 23]:
        d.line([fx, 14, fx, 52], fill=(62, 68, 80), width=1)
    # Base
    d.rectangle([2, 52, 29, 58], fill=(55, 60, 72))
    d.rectangle([0, 58, 31, 63], fill=(36, 40, 48))
    pillar.save("twisted/te_phoenix/priv/static/sprites/gothic_pillar.png")
    pillar.save("twisted/player/static/sprites/gothic_pillar.png")

    # 2. Citadel Rubble (32x32)
    rubble = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rubble)
    rd.polygon([(4, 28), (14, 14), (24, 28)], fill=(50, 55, 65))
    rd.polygon([(12, 28), (20, 18), (28, 28)], fill=(60, 66, 78))
    rd.line([8, 26, 26, 22], fill=(40, 28, 20), width=3) # Charred wood beam
    rd.point((15, 23), fill=(255, 120, 0)) # Ember
    rubble.save("twisted/te_phoenix/priv/static/sprites/citadel_rubble.png")
    rubble.save("twisted/player/static/sprites/citadel_rubble.png")

    print("Generated gothic pillar and citadel rubble props successfully!")

def generate_backdrop():
    # 960x960 Continuous Citadel Chamber Artwork
    bg = Image.new("RGB", (960, 960), (16, 18, 24))
    d = ImageDraw.Draw(bg)

    # Ambient gothic chambers
    for cy in range(0, 960, 32):
        for cx in range(0, 960, 32):
            noise = (math.sin(cx * 0.05) * math.cos(cy * 0.05)) * 12
            base_col = int(32 + noise)
            d.rectangle([cx, cy, cx+31, cy+31], fill=(base_col, base_col + 2, base_col + 6))
            d.rectangle([cx, cy, cx+31, cy+31], outline=(20, 22, 28), width=1)

    # Glowing orange ambient pools for the 5 braziers
    brazier_locs = [(240, 240), (720, 240), (480, 480), (240, 720), (720, 720)]
    for (bx, by) in brazier_locs:
        for r in range(120, 0, -5):
            alpha = int((1.0 - r / 120.0) * 80)
            d.ellipse([bx - r, by - r, bx + r, by + r], fill=(alpha + 30, int(alpha * 0.5) + 15, 10))

    bg.save("twisted/te_phoenix/priv/static/backdrops/ashveil_citadel_bg.png")
    bg.save("twisted/player/static/backdrops/ashveil_citadel_bg.png")
    print("Generated ashveil_citadel_bg.png backdrop successfully!")

ensure_dirs()
generate_tileset()
generate_animated_braziers()
generate_props()
generate_backdrop()
