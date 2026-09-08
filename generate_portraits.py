import os, math
from PIL import Image, ImageDraw, ImageFilter

def ensure_dirs():
    os.makedirs("twisted/te_phoenix/priv/static/portraits", exist_ok=True)
    os.makedirs("twisted/player/static/portraits", exist_ok=True)

def create_gothic_frame(img):
    # Draw ornate metallic gothic border around the portrait
    w, h = img.size
    draw = ImageDraw.Draw(img)
    # 2px dark outer border
    draw.rectangle([0, 0, w-1, h-1], outline=(20, 20, 24), width=3)
    # Gold filigree inner border
    draw.rectangle([3, 3, w-4, h-4], outline=(179, 139, 58), width=2)
    # Corner brackets
    corner_size = 12
    for (cx, cy) in [(3, 3), (w-4, 3), (3, h-4), (w-4, h-4)]:
        draw.rectangle([cx-2, cy-2, cx+2, cy+2], fill=(218, 175, 80))
    return img

def generate_mage_portrait():
    size = 256
    img = Image.new("RGB", (size, size), (15, 12, 24))
    d = ImageDraw.Draw(img)

    # Dark atmospheric background with arcane aura
    for r in range(120, 0, -4):
        alpha = int((1.0 - r / 120.0) * 110)
        d.ellipse([128 - r, 120 - r, 128 + r, 120 + r], fill=(30 + int(alpha*0.8), 15 + int(alpha*0.3), 50 + alpha))

    # Shoulders / Robe
    d.polygon([(40, 256), (90, 160), (166, 160), (216, 256)], fill=(32, 24, 48))
    d.polygon([(70, 256), (110, 175), (146, 175), (186, 256)], fill=(48, 36, 72))

    # Hood Cowl
    d.polygon([(75, 180), (128, 45), (181, 180)], fill=(24, 18, 36))
    d.polygon([(85, 175), (128, 60), (171, 175)], fill=(12, 8, 18))

    # Shaded Face under cowl
    d.ellipse([100, 95, 156, 165], fill=(45, 38, 48))
    # Glowing violet/cyan eyes
    d.ellipse([110, 122, 118, 127], fill=(160, 80, 255))
    d.ellipse([112, 123, 116, 126], fill=(220, 180, 255))
    d.ellipse([138, 122, 146, 127], fill=(160, 80, 255))
    d.ellipse([140, 123, 144, 126], fill=(220, 180, 255))

    # Arcane Rune on collar
    d.line([128, 175, 128, 195], fill=(180, 130, 255), width=2)
    d.line([120, 185, 136, 185], fill=(180, 130, 255), width=2)

    img = create_gothic_frame(img)
    img.save("twisted/te_phoenix/priv/static/portraits/portrait_mage.png")
    img.save("twisted/player/static/portraits/portrait_mage.png")

def generate_rogue_portrait():
    size = 256
    img = Image.new("RGB", (size, size), (12, 14, 18))
    d = ImageDraw.Draw(img)

    # Moonlight shadow backdrop
    for r in range(120, 0, -5):
        alpha = int((1.0 - r / 120.0) * 80)
        d.ellipse([128 - r, 120 - r, 128 + r, 120 + r], fill=(20 + int(alpha*0.4), 25 + int(alpha*0.5), 35 + alpha))

    # Leather armor mantle with strap
    d.polygon([(35, 256), (85, 155), (171, 155), (221, 256)], fill=(28, 30, 36))
    d.line([50, 256, 150, 155], fill=(70, 50, 35), width=8) # Leather weapon strap
    d.rectangle([115, 185, 130, 200], fill=(180, 150, 80)) # Brass buckle

    # Dagger pommel on shoulder
    d.rectangle([55, 160, 65, 190], fill=(90, 95, 105))
    d.ellipse([52, 150, 68, 162], fill=(200, 170, 70))

    # Shadow cowl & face
    d.polygon([(78, 175), (128, 48), (178, 175)], fill=(20, 22, 26))
    d.ellipse([102, 98, 154, 162], fill=(170, 145, 130)) # Face
    # Mask covering lower face
    d.polygon([(100, 135), (128, 165), (156, 135)], fill=(32, 35, 42))

    # Piercing amber-green eyes
    d.ellipse([112, 118, 120, 124], fill=(80, 200, 120))
    d.ellipse([114, 119, 118, 123], fill=(180, 255, 180))
    d.ellipse([136, 118, 144, 124], fill=(80, 200, 120))
    d.ellipse([138, 119, 142, 123], fill=(180, 255, 180))

    img = create_gothic_frame(img)
    img.save("twisted/te_phoenix/priv/static/portraits/portrait_rogue.png")
    img.save("twisted/player/static/portraits/portrait_rogue.png")

def generate_warrior_portrait():
    size = 256
    img = Image.new("RGB", (size, size), (22, 16, 14))
    d = ImageDraw.Draw(img)

    # Warm forge glow backdrop
    for r in range(120, 0, -5):
        alpha = int((1.0 - r / 120.0) * 90)
        d.ellipse([128 - r, 120 - r, 128 + r, 120 + r], fill=(45 + alpha, 22 + int(alpha*0.4), 15))

    # Heavy plate steel gorget & wolf fur pauldron
    d.polygon([(30, 256), (80, 150), (176, 150), (226, 256)], fill=(65, 70, 80))
    d.ellipse([30, 150, 95, 215], fill=(55, 50, 48)) # Wolf fur left shoulder
    d.polygon([(85, 185), (128, 220), (171, 185)], fill=(95, 102, 118)) # Steel chestplate bevel

    # Strong jawline face with battle scar
    d.polygon([(95, 90), (161, 90), (150, 185), (106, 185)], fill=(185, 145, 125))
    # Dark spiky hair
    d.polygon([(90, 95), (128, 42), (166, 95)], fill=(35, 30, 28))

    # Intense steely eyes
    d.ellipse([110, 116, 119, 122], fill=(70, 110, 150))
    d.ellipse([137, 116, 146, 122], fill=(70, 110, 150))
    # Red battle scar over right eye
    d.line([142, 106, 140, 134], fill=(160, 45, 45), width=2)

    img = create_gothic_frame(img)
    img.save("twisted/te_phoenix/priv/static/portraits/portrait_warrior.png")
    img.save("twisted/player/static/portraits/portrait_warrior.png")

def generate_companion_portrait():
    size = 256
    img = Image.new("RGB", (size, size), (16, 20, 22))
    d = ImageDraw.Draw(img)

    # Moonlit forest glow
    for r in range(120, 0, -5):
        alpha = int((1.0 - r / 120.0) * 80)
        d.ellipse([128 - r, 120 - r, 128 + r, 120 + r], fill=(15, 35 + int(alpha*0.6), 40 + alpha))

    # Shadow Wolf head silhouette
    # Ears
    d.polygon([(85, 120), (70, 50), (105, 85)], fill=(45, 48, 54))
    d.polygon([(171, 120), (186, 50), (151, 85)], fill=(45, 48, 54))
    # Head & muzzle
    d.polygon([(90, 95), (166, 95), (146, 185), (128, 205), (110, 185)], fill=(60, 65, 75))
    d.polygon([(115, 160), (141, 160), (128, 195)], fill=(30, 32, 38)) # Muzzle
    d.ellipse([122, 185, 134, 195], fill=(15, 16, 20)) # Nose

    # Glowing predatory amber eyes
    d.polygon([(102, 120), (118, 125), (108, 128)], fill=(255, 180, 20))
    d.polygon([(154, 120), (138, 125), (148, 128)], fill=(255, 180, 20))

    img = create_gothic_frame(img)
    img.save("twisted/te_phoenix/priv/static/portraits/portrait_companion_wolf.png")
    img.save("twisted/player/static/portraits/portrait_companion_wolf.png")

ensure_dirs()
generate_mage_portrait()
generate_rogue_portrait()
generate_warrior_portrait()
generate_companion_portrait()
print("All portraits successfully generated!")
