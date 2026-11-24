#!/usr/bin/env python3
"""Generate legacy launcher PNGs from the brand mark without third-party deps."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "app" / "src" / "main" / "res"
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
SUPERSAMPLE = 3


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def night(x: float, y: float, size: int) -> tuple[int, int, int]:
    t = (x + y) / max(1, 2 * (size - 1))
    if t < 0.55:
        return lerp((10, 5, 20), (29, 15, 51), t / 0.55)
    return lerp((29, 15, 51), (43, 17, 71), (t - 0.55) / 0.45)


def gold(y: float, size: int) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, (y - 190 * size / 512) / (208 * size / 512)))
    if t < 0.55:
        return lerp((247, 231, 194), (233, 200, 139), t / 0.55)
    return lerp((233, 200, 139), (184, 145, 47), (t - 0.55) / 0.45)


def in_rounded(x: float, y: float, size: int, radius: int) -> bool:
    r = radius * size / 512
    dx = max(r - x, 0.0, x - (size - 1 - r))
    dy = max(r - y, 0.0, y - (size - 1 - r))
    return dx * dx + dy * dy <= r * r


def in_circle(x: float, y: float, cx: float, cy: float, r: float) -> bool:
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_polygon(x: float, y: float, points: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(points) - 1
    for i in range(len(points)):
        xi, yi = points[i]
        xj, yj = points[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def render(size: int) -> list[tuple[int, int, int, int]]:
    s = size * SUPERSAMPLE
    scale = s / 512
    crown = [
        (126, 372), (126, 232), (184, 276), (222, 190),
        (260, 276), (298, 232), (298, 372),
    ]
    pixels: list[tuple[int, int, int, int]] = []
    for y in range(s):
        for x in range(s):
            if not in_rounded(x, y, s, 112):
                pixels.append((0, 0, 0, 0))
                continue
            color = night(x, y, s)
            if in_circle(x, y, 368 * scale, 140 * scale, 58 * scale):
                color = (248, 236, 205)
            if in_circle(x, y, 392 * scale, 122 * scale, 52 * scale):
                color = night(x, y, s)
            scaled_crown = [(px * scale, py * scale) for px, py in crown]
            if in_polygon(x, y, scaled_crown):
                color = gold(y, s)
            if 126 * scale <= x <= 318 * scale and 372 * scale <= y <= 398 * scale:
                color = (233, 200, 139)
            for gx in (146, 184, 222, 260, 298):
                if in_circle(x, y, gx * scale, 352 * scale, 9 * scale):
                    color = (43, 17, 71)
            if in_circle(x, y, 222 * scale, 222 * scale, 11 * scale):
                color = (138, 62, 192)
            if in_circle(x, y, 222 * scale, 222 * scale, 4 * scale):
                color = (247, 231, 194)
            pixels.append((*color, 255))

    out: list[tuple[int, int, int, int]] = []
    for y in range(size):
        for x in range(size):
            block = [
                pixels[(y * SUPERSAMPLE + dy) * s + (x * SUPERSAMPLE + dx)]
                for dy in range(SUPERSAMPLE)
                for dx in range(SUPERSAMPLE)
            ]
            out.append(tuple(round(sum(p[i] for p in block) / len(block)) for i in range(4)))
    return out


def chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def write_png(path: Path, size: int, pixels: list[tuple[int, int, int, int]]) -> None:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(pixels[y * size + x])
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    for density, size in SIZES.items():
        target = RES / f"mipmap-{density}"
        target.mkdir(parents=True, exist_ok=True)
        write_png(target / "ic_launcher.png", size, render(size))
        write_png(target / "ic_launcher_round.png", size, render(size))


if __name__ == "__main__":
    main()
