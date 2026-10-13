#!/usr/bin/env python3
"""Render gyral-cem demo clips (GIF + MP4) from real captured command output.

Frames are rendered with PIL at 1280x720@10fps; GIFs are downscaled to 960x540
and MP4s are encoded with imageio-ffmpeg (H.264). Every command shown is
executed for real in the repo root and its actual output is rendered.
Regenerate with (from a checkout with `dist/` built):

    uv venv .venv && uv pip install pillow imageio-ffmpeg
    .venv/bin/python docs/demo/render.py
"""

from __future__ import annotations

import subprocess
import sys
import textwrap
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow is required: uv pip install pillow")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def capture(command: str) -> list[str]:
    """Runs a demo command in the repo root and returns its combined output lines."""
    proc = subprocess.run(command, shell=True, cwd=ROOT, capture_output=True, text=True)
    combined = (proc.stdout + proc.stderr).strip("\n")
    return combined.splitlines() if combined else []

WIDTH, HEIGHT = 1280, 720
FPS = 10
HEADER_H = 52
FONT_SIZE = 21
LINE_H = 30
PAD_X = 28
BG = (13, 17, 23)
HEADER_BG = (22, 27, 34)
TITLE_FG = (125, 133, 144)
PROMPT_FG = (126, 231, 135)
CMD_FG = (230, 237, 243)
OUT_FG = (185, 195, 207)
GREEN = (126, 231, 135)
YELLOW = (210, 153, 34)

def find_font(style: str) -> str:
    candidates = [
        f"/nix/store/v3n8r3sy38l5f1sj76azj1n4n0ndd6a7-dejavu-fonts-2.37/share/fonts/truetype/DejaVuSansMono{style}.ttf",
        f"/usr/share/fonts/truetype/dejavu/DejaVuSansMono{style}.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    matched = subprocess.run(
        ["fc-match", f"DejaVu Sans Mono{':style=Bold' if style else ''}", "--format=%{file}"],
        capture_output=True, text=True,
    )
    if matched.returncode == 0 and Path(matched.stdout.strip()).exists():
        return matched.stdout.strip()
    raise SystemExit("DejaVu Sans Mono not found")


FONT = ImageFont.truetype(find_font(""), FONT_SIZE)
FONT_BOLD = ImageFont.truetype(find_font("-Bold"), FONT_SIZE)

CHAR_W = int(FONT.getbbox("M")[2])
MAX_COLS = (WIDTH - PAD_X * 2) // CHAR_W
VISIBLE_LINES = (HEIGHT - HEADER_H - 32) // LINE_H


def output_color(line: str) -> tuple[int, int, int]:
    stripped = line.strip()
    if stripped.startswith("warning"):
        return YELLOW
    if "valid Custom Elements Manifest" in line or stripped.startswith("Analyzed"):
        return GREEN
    if "passed" in line and "failed" not in line:
        return GREEN
    return OUT_FG


def wrap_line(line: str) -> list[str]:
    if len(line) <= MAX_COLS:
        return [line]
    return textwrap.wrap(line, width=MAX_COLS, break_long_words=True, break_on_hyphens=False)


class Screen:
    """Accumulated terminal lines; renders the visible window."""

    def __init__(self, title: str) -> None:
        self.title = title
        self.lines: list[tuple[str, tuple[int, int, int], bool]] = []  # text, color, is_prompt

    def add_prompt(self, command: str) -> None:
        self.lines.append((command, CMD_FG, True))

    def update_prompt(self, command: str) -> None:
        text, color, is_prompt = self.lines[-1]
        assert is_prompt
        self.lines[-1] = (command, color, True)

    def add_output(self, text: str) -> None:
        for chunk in wrap_line(text):
            self.lines.append((chunk, output_color(text), False))

    def render(self, cursor: bool) -> Image.Image:
        img = Image.new("RGB", (WIDTH, HEIGHT), BG)
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 0, WIDTH, HEADER_H], fill=HEADER_BG)
        for i, color in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
            x = 24 + i * 28
            draw.ellipse([x, 18, x + 16, 34], fill=color)
        title = f"gyral-cem — {self.title}"
        bbox = draw.textbbox((0, 0), title, font=FONT)
        draw.text(((WIDTH - (bbox[2] - bbox[0])) / 2, 14), title, font=FONT, fill=TITLE_FG)
        visible = self.lines[-VISIBLE_LINES:]
        y = HEADER_H + 16
        for text, color, is_prompt in visible:
            x = PAD_X
            if is_prompt:
                draw.text((x, y), "$ ", font=FONT_BOLD, fill=PROMPT_FG)
                x += int(FONT_BOLD.getbbox("$ ")[2])
            for chunk in wrap_line(text) if is_prompt else [text]:
                draw.text((x, y), chunk, font=FONT, fill=color)
                y += LINE_H
                x = PAD_X
        if cursor and visible:
            last, _, is_prompt = visible[-1]
            prompt_w = int(FONT_BOLD.getbbox("$ ")[2]) if is_prompt else 0
            chunks = wrap_line(last) if is_prompt else [last]
            cx = PAD_X + prompt_w + len(chunks[-1]) * CHAR_W + 2
            cy = y - LINE_H + 4
            draw.rectangle([cx, cy, cx + 12, cy + 22], fill=CMD_FG)
        return img


def build_clip(title: str, steps: list[tuple[str, list[str]]]) -> list[Image.Image]:
    """steps: (command, captured output lines). Returns frames."""
    screen = Screen(title)
    frames: list[Image.Image] = []
    for _ in range(5):
        frames.append(screen.render(cursor=True))
    for command, output in steps:
        screen.add_prompt("")
        for i in range(0, len(command) + 1, 4):
            screen.update_prompt(command[:i])
            frames.append(screen.render(cursor=True))
        screen.update_prompt(command)
        frames.extend([screen.render(cursor=True)] * 3)
        for i in range(0, len(output), 3):
            for line in output[i : i + 3]:
                screen.add_output(line)
            frames.append(screen.render(cursor=False))
        frames.extend([screen.render(cursor=False)] * 12)
        screen.add_output("")
    for i in range(15):
        frames.append(screen.render(cursor=(i // 5) % 2 == 0))
    return frames


def write_mp4(frames: list[Image.Image], path: Path) -> None:
    import imageio_ffmpeg

    exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        exe, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22",
        "-movflags", "+faststart", str(path),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    assert proc.stdin is not None
    for frame in frames:
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg encoding failed")


def write_gif(frames: list[Image.Image], path: Path) -> None:
    small = [f.resize((960, 540), Image.LANCZOS) for f in frames]
    small[0].save(
        path, save_all=True, append_images=small[1:],
        duration=int(1000 / FPS), loop=0, optimize=True,
    )


CLIPS: dict[str, tuple[str, list[str]]] = {
    "01-analyze": ("analyze & validate", [
        "node dist/cli.js analyze examples --out /tmp/demo/cem.json --typingsDir /tmp/demo/typings",
        "ls /tmp/demo/typings",
        "node dist/cli.js validate /tmp/demo/cem.json",
    ]),
    "02-typings": ("generated typings, proven by typecheck", [
        "sed -n '1,22p' /tmp/demo/typings/react.d.ts",
        'npx vitest run test/typecheck.test.ts 2>&1 | grep -E "Test Files|Tests "',
    ]),
    "03-formats": ("machine formats & editor data", [
        "node dist/cli.js analyze examples --check --format json 2>/dev/null | head -14",
        "node dist/cli.js --version",
        "head -20 /tmp/demo/typings/html-custom-data.json",
    ]),
}


def main() -> None:
    HERE.mkdir(parents=True, exist_ok=True)
    for name, (title, commands) in CLIPS.items():
        print(f"capturing {name}...", flush=True)
        steps = [(command, capture(command)) for command in commands]
        print(f"rendering {name}...", flush=True)
        frames = build_clip(title, steps)
        write_gif(frames, HERE / f"{name}.gif")
        print(f"  {len(frames)} frames gif done", flush=True)
        write_mp4(frames, HERE / f"{name}.mp4")
        print("  mp4 done", flush=True)


if __name__ == "__main__":
    main()
