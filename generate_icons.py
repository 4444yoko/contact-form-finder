"""
アイコン生成スクリプト（開発時のみ使用）
青(#2563eb)の角丸背景に、白い封筒+虫眼鏡のシンボルを描画。
16/48/128の3サイズを icons/ 配下に書き出します。

使い方:
    python generate_icons.py
"""
from PIL import Image, ImageDraw
import os


BLUE = (37, 99, 235, 255)   # #2563eb
WHITE = (255, 255, 255, 255)


def make_icon(size: int, output_path: str) -> None:
    # 4倍解像度で描画してから縮小（アンチエイリアス効果）
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # --- 背景: 青の角丸正方形 ---
    radius = int(s * 0.20)
    draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=BLUE)

    # --- 線の太さ ---
    line_w = max(int(s * 0.045), 2)

    # --- 封筒の枠 ---
    env_w = int(s * 0.62)
    env_h = int(s * 0.42)
    env_x = int((s - env_w) / 2)
    env_y = int(s * 0.28)
    draw.rounded_rectangle(
        [env_x, env_y, env_x + env_w, env_y + env_h],
        radius=int(s * 0.025),
        outline=WHITE,
        width=line_w,
    )

    # --- 封筒のフタ（V字）---
    flap_top = env_y
    flap_bottom = env_y + int(env_h * 0.55)
    cx = env_x + env_w // 2
    draw.line([(env_x, flap_top), (cx, flap_bottom)], fill=WHITE, width=line_w)
    draw.line([(cx, flap_bottom), (env_x + env_w, flap_top)], fill=WHITE, width=line_w)

    # 16x16のときは虫眼鏡を省略してシンプルに（細部が潰れるため）
    if size >= 32:
        # --- 虫眼鏡（封筒の右下に重ねる） ---
        glass_r = int(s * 0.16)
        glass_cx = env_x + env_w - int(s * 0.04)
        glass_cy = env_y + env_h - int(s * 0.04)

        # 虫眼鏡の下を青で塗りつぶし、封筒の線を消す
        clear_pad = line_w + int(s * 0.01)
        draw.ellipse(
            [
                glass_cx - glass_r - clear_pad,
                glass_cy - glass_r - clear_pad,
                glass_cx + glass_r + clear_pad,
                glass_cy + glass_r + clear_pad,
            ],
            fill=BLUE,
        )

        # 虫眼鏡の輪
        draw.ellipse(
            [
                glass_cx - glass_r,
                glass_cy - glass_r,
                glass_cx + glass_r,
                glass_cy + glass_r,
            ],
            outline=WHITE,
            width=line_w,
        )

        # 取っ手
        h_start = (
            glass_cx + int(glass_r * 0.7),
            glass_cy + int(glass_r * 0.7),
        )
        h_end = (
            glass_cx + int(glass_r * 1.5),
            glass_cy + int(glass_r * 1.5),
        )
        draw.line([h_start, h_end], fill=WHITE, width=line_w + 2)

    # 縮小（高品質）
    img = img.resize((size, size), Image.LANCZOS)
    img.save(output_path, "PNG")
    print(f"  -> {output_path}  ({size}x{size})")


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    icons_dir = os.path.join(here, "icons")
    os.makedirs(icons_dir, exist_ok=True)

    print("Generating icons...")
    for sz in (16, 48, 128):
        make_icon(sz, os.path.join(icons_dir, f"icon{sz}.png"))
    print("Done.")


if __name__ == "__main__":
    main()
