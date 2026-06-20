"""Extract transparent guide-note artwork from a supplied teaching poster.

Usage:
    python scripts/extract_guide_note_visuals.py path/to/poster.png

The script removes only border-connected near-white pixels, preserving enclosed
white fills such as the clouds and seagull. Long, isolated staff-line fragments
are removed from the resulting crops.
"""

from collections import deque
from pathlib import Path
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter


OUTPUT_DIR = Path("src/assets/guide-note-visuals")

# Coordinates are measured against the supplied 1276 x 1536 source poster.
CROPS = {
    "cloud-left": (105, 140, 425, 350),
    "cloud-right": (635, 185, 875, 350),
    "seagull-c5": (675, 470, 885, 640),
    "guitarist-boat-g4": (295, 575, 515, 850),
    "fish-f4": (710, 975, 895, 1125),
    "seaweed-c3": (300, 1110, 480, 1265),
    "treasure-chest-c2": (585, 1270, 820, 1510),
}

COLORED_SUBJECT_FILTERS = {
    "guitarist-boat-g4": 21,
    "fish-f4": 11,
    "seaweed-c3": 11,
    "treasure-chest-c2": 13,
}

STAFF_LINE_BANDS = (
    range(461, 466), range(536, 541), range(614, 619), range(694, 698), range(772, 777),
    range(975, 980), range(1055, 1059), range(1137, 1142), range(1220, 1225), range(1301, 1306),
)


def erase_staff_line_fragments(source):
    """Erase long dark runs on known staff rows before extracting artwork."""
    cleaned = source.copy()
    pixels = cleaned.load()
    for band in STAFF_LINE_BANDS:
        for y in band:
            x = 40
            while x < 930:
                red, green, blue = pixels[x, y]
                if max(red, green, blue) >= 120:
                    x += 1
                    continue
                start = x
                while x < 930 and max(pixels[x, y]) < 120:
                    x += 1
                if x - start >= 18:
                    for run_x in range(start, x):
                        pixels[run_x, y] = (255, 255, 255)
    return cleaned


def is_background_candidate(pixel):
    red, green, blue = pixel[:3]
    return min(red, green, blue) >= 235 and max(red, green, blue) - min(red, green, blue) <= 32


def remove_border_background(image, trim=True):
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    queue = deque()
    visited = set()

    for x in range(width):
        queue.extend(((x, 0), (x, height - 1)))
    for y in range(height):
        queue.extend(((0, y), (width - 1, y)))

    while queue:
        x, y = queue.popleft()
        if not (0 <= x < width and 0 <= y < height):
            continue
        if (x, y) in visited or not is_background_candidate(pixels[x, y]):
            continue
        visited.add((x, y))
        queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))

    for x, y in visited:
        red, green, blue, _ = pixels[x, y]
        # A soft alpha ramp retains antialiased cartoon edges without a white box.
        alpha = max(0, min(255, (248 - min(red, green, blue)) * 20))
        if alpha == 0:
            pixels[x, y] = (255, 255, 255, 0)
        else:
            pixels[x, y] = (red, green, blue, alpha)

    remove_isolated_staff_lines(rgba)
    return trim_transparency(rgba) if trim else rgba


def remove_isolated_staff_lines(image):
    """Remove standalone, very wide horizontal components left by staff lines."""
    alpha = image.getchannel("A")
    width, height = image.size
    seen = set()
    for y in range(height):
        for x in range(width):
            if (x, y) in seen or alpha.getpixel((x, y)) <= 35:
                continue
            queue = deque([(x, y)])
            component = []
            seen.add((x, y))
            while queue:
                point = queue.popleft()
                component.append(point)
                px, py = point
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in seen and alpha.getpixel((nx, ny)) > 35:
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            xs = [point[0] for point in component]
            ys = [point[1] for point in component]
            component_width = max(xs) - min(xs) + 1
            component_height = max(ys) - min(ys) + 1
            if component_width > width * 0.55 and component_height <= 12:
                for px, py in component:
                    red, green, blue, _ = image.getpixel((px, py))
                    image.putpixel((px, py), (red, green, blue, 0))


def trim_transparency(image, padding=5):
    bounds = image.getchannel("A").getbbox()
    if not bounds:
        return image
    left, top, right, bottom = bounds
    return image.crop((
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    ))


def keep_colored_subject(image, source_crop, dilation):
    """Keep color-led cartoon artwork while dropping neutral staff fragments."""
    seed = Image.new("L", source_crop.size, 0)
    seed_pixels = seed.load()
    source_pixels = source_crop.load()
    for y in range(source_crop.height):
        for x in range(source_crop.width):
            red, green, blue = source_pixels[x, y]
            chroma = max(red, green, blue) - min(red, green, blue)
            if chroma >= 18 and min(red, green, blue) < 245:
                seed_pixels[x, y] = 255
    subject_mask = seed.filter(ImageFilter.MaxFilter(dilation))
    image.putalpha(ImageChops.multiply(image.getchannel("A"), subject_mask))
    return trim_transparency(image)


def clear_region(image, condition):
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            if condition(x, y):
                red, green, blue, _ = pixels[x, y]
                pixels[x, y] = (red, green, blue, 0)


def keep_seagull_silhouette(image):
    """Use a loose multi-part silhouette to exclude surrounding staff lines."""
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon([(0, 104), (22, 91), (39, 106), (25, 131), (0, 130)], fill=255)  # beak
    draw.polygon([(12, 38), (45, 27), (80, 40), (101, 91), (64, 89), (30, 69)], fill=255)  # left wing
    draw.polygon([(69, 52), (98, 18), (174, 8), (202, 22), (180, 67), (136, 105), (93, 100)], fill=255)  # right wing
    draw.polygon([(19, 92), (50, 70), (92, 86), (127, 104), (190, 112), (181, 143), (128, 147), (91, 157), (43, 142)], fill=255)  # body/tail
    draw.polygon([(119, 138), (173, 139), (181, 169), (125, 169)], fill=255)  # feet
    mask = mask.filter(ImageFilter.MaxFilter(7))
    image.putalpha(ImageChops.multiply(image.getchannel("A"), mask))
    return trim_transparency(image)


def make_cloud_group(left, right):
    gap = 58
    height = max(left.height, right.height)
    result = Image.new("RGBA", (left.width + gap + right.width, height), (0, 0, 0, 0))
    result.alpha_composite(left, (0, (height - left.height) // 2))
    result.alpha_composite(right, (left.width + gap, (height - right.height) // 2))
    return result


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Provide the path to the source poster PNG.")
    source_path = Path(sys.argv[1])
    source = Image.open(source_path).convert("RGB")
    if source.size != (1276, 1536):
        raise SystemExit(f"Expected a 1276x1536 poster, found {source.size}.")

    source = erase_staff_line_fragments(source)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    extracted = {}
    for name, box in CROPS.items():
        source_crop = source.crop(box)
        image = remove_border_background(source_crop, trim=False)
        if name in COLORED_SUBJECT_FILTERS:
            # Remove neighboring poster landmarks before the color-led mask expands.
            if name == "fish-f4":
                clear_region(image, lambda x, _y: x < 11)
            elif name == "guitarist-boat-g4":
                clear_region(image, lambda x, y: x > 197 and (y < 180 or y > 235))
            image = keep_colored_subject(image, source_crop, COLORED_SUBJECT_FILTERS[name])
        elif name == "seagull-c5":
            image = keep_seagull_silhouette(image)
        else:
            image = trim_transparency(image)
        extracted[name] = image
    clouds = make_cloud_group(extracted.pop("cloud-left"), extracted.pop("cloud-right"))
    clouds.save(OUTPUT_DIR / "clouds-c6.png", optimize=True)
    for name, image in extracted.items():
        image.save(OUTPUT_DIR / f"{name}.png", optimize=True)

    for path in sorted(OUTPUT_DIR.glob("*.png")):
        with Image.open(path) as image:
            print(f"{path.as_posix()}  {image.width}x{image.height}  {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
