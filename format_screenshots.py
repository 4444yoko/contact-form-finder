"""
format_screenshots.py
Chrome ウェブストア掲載用スクリーンショット整形スクリプト

入力: screenshots/raw/ 内の画像（PNG/JPG/JPEG、任意のサイズ）
出力: screenshots/final/ に 1280×800px の整形済み画像（PNG）

各画像に以下を適用:
- 1280×800 のキャンバスに、アスペクト比を保ったまま中央配置
- 余白は #f3f4f6（薄いグレー）
- 上部30%（=240px）の領域に日本語キャプション（28pxボールド、#1a1a1a）
- キャプションは screenshots/captions.json で指定（ファイル名（拡張子なし）→ キャプション）

使い方:
  pip install -r requirements.txt
  python format_screenshots.py
"""

import json
import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Pillow がインストールされていません。以下を実行してください:")
    print("    pip install -r requirements.txt")
    sys.exit(1)


# ===== 設定 =====
CANVAS_SIZE = (1280, 800)              # ストア推奨サイズ
BG_COLOR = (243, 244, 246)             # #f3f4f6
CAPTION_AREA_HEIGHT = 240              # 上部30%
CAPTION_COLOR = (26, 26, 26)           # #1a1a1a
CAPTION_FONT_SIZE = 28
LINE_HEIGHT_RATIO = 1.4
PADDING = 40                           # 画像と外枠の余白

ROOT = Path(__file__).parent
RAW_DIR = ROOT / "screenshots" / "raw"
FINAL_DIR = ROOT / "screenshots" / "final"
CAPTIONS_FILE = ROOT / "screenshots" / "captions.json"

# 日本語フォント候補（OSごと、見つかった最初のものを使う）
JP_FONT_CANDIDATES = [
    # Windows
    "C:/Windows/Fonts/YuGothB.ttc",     # 游ゴシック Bold
    "C:/Windows/Fonts/meiryob.ttc",     # メイリオ Bold
    "C:/Windows/Fonts/msgothic.ttc",    # MS ゴシック
    # macOS
    "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/Library/Fonts/Osaka.ttf",
    # Linux
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


# ===== ヘルパー =====
def load_font(size: int):
    """利用可能な日本語ボールドフォントを読み込む"""
    for path in JP_FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    print("[警告] 日本語ボールドフォントが見つかりませんでした。デフォルトフォントで代替します。")
    print("       JP_FONT_CANDIDATES に環境のフォントパスを追加してください。")
    return ImageFont.load_default()


def load_captions() -> dict:
    """captions.json を読み込む（無ければ空辞書）"""
    if not CAPTIONS_FILE.exists():
        return {}
    try:
        with open(CAPTIONS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[警告] captions.json の読み込みエラー: {e}")
        return {}


def fit_image(img: Image.Image, max_w: int, max_h: int) -> Image.Image:
    """アスペクト比を保ちつつ max_w × max_h に収まるよう縮小"""
    w, h = img.size
    if w <= 0 or h <= 0:
        return img
    ratio = min(max_w / w, max_h / h, 1.0)  # 拡大はしない
    new_w = max(1, int(w * ratio))
    new_h = max(1, int(h * ratio))
    return img.resize((new_w, new_h), Image.LANCZOS)


def wrap_caption_text(text: str, font, max_width: int, draw: ImageDraw.ImageDraw) -> list:
    """日本語向けに1文字ずつ計測して改行を入れる（手動 \n 改行も尊重）"""
    if not text:
        return []
    lines = []
    for paragraph in text.split("\n"):
        current = ""
        for ch in paragraph:
            test = current + ch
            bbox = draw.textbbox((0, 0), test, font=font)
            w = bbox[2] - bbox[0]
            if w <= max_width or not current:
                current = test
            else:
                lines.append(current)
                current = ch
        if current:
            lines.append(current)
    return lines


def render_caption(canvas: Image.Image, draw: ImageDraw.ImageDraw, text: str, font) -> None:
    """上部 CAPTION_AREA_HEIGHT 内に中央寄せで描画"""
    if not text:
        return
    max_caption_width = CANVAS_SIZE[0] - 2 * PADDING
    lines = wrap_caption_text(text, font, max_caption_width, draw)
    if not lines:
        return

    # 行の高さは「あ」の高さを基準にして line-height 1.4
    sample_bbox = draw.textbbox((0, 0), "あ", font=font)
    line_h = int((sample_bbox[3] - sample_bbox[1]) * LINE_HEIGHT_RATIO)
    total_h = line_h * len(lines)
    y_start = (CAPTION_AREA_HEIGHT - total_h) // 2

    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font)
        line_w = bbox[2] - bbox[0]
        x = (CANVAS_SIZE[0] - line_w) // 2
        y = y_start + i * line_h
        draw.text((x, y), line, font=font, fill=CAPTION_COLOR)


def process_image(src_path: Path, dst_path: Path, caption: str, font) -> None:
    img = Image.open(src_path).convert("RGB")

    # 画像エリアのサイズ（下部70% - PADDING）
    image_area_w = CANVAS_SIZE[0] - 2 * PADDING
    image_area_h = CANVAS_SIZE[1] - CAPTION_AREA_HEIGHT - PADDING
    img_fitted = fit_image(img, image_area_w, image_area_h)

    # キャンバス
    canvas = Image.new("RGB", CANVAS_SIZE, BG_COLOR)
    draw = ImageDraw.Draw(canvas)

    # キャプション（上部）
    render_caption(canvas, draw, caption, font)

    # 画像（下部、中央寄せ）
    img_x = (CANVAS_SIZE[0] - img_fitted.width) // 2
    img_y = CAPTION_AREA_HEIGHT + (image_area_h - img_fitted.height) // 2
    canvas.paste(img_fitted, (img_x, img_y))

    canvas.save(dst_path, "PNG", optimize=True)


# ===== エントリポイント =====
def main():
    if not RAW_DIR.exists():
        print(f"[エラー] {RAW_DIR} が存在しません。")
        print("        screenshots/raw/ フォルダを作成し、撮影した画像を置いてから再実行してください。")
        sys.exit(1)

    FINAL_DIR.mkdir(parents=True, exist_ok=True)

    captions = load_captions()
    font = load_font(CAPTION_FONT_SIZE)

    images = sorted(
        list(RAW_DIR.glob("*.png"))
        + list(RAW_DIR.glob("*.jpg"))
        + list(RAW_DIR.glob("*.jpeg"))
    )

    if not images:
        print(f"[情報] 画像が見つかりません: {RAW_DIR}")
        return

    print(f"--- {len(images)} 件の画像を整形します ---")
    success = 0
    for src in images:
        key = src.stem
        caption = captions.get(key, "")
        dst = FINAL_DIR / f"{src.stem}.png"
        try:
            process_image(src, dst, caption, font)
            cap_display = f'"{caption}"' if caption else "(キャプションなし)"
            print(f"  OK   {src.name} -> {dst.name}  caption={cap_display}")
            success += 1
        except Exception as e:
            print(f"  FAIL {src.name}: {e}")

    print(f"--- 完了: {success}/{len(images)} 件 ---")
    print(f"出力先: {FINAL_DIR}")


if __name__ == "__main__":
    main()
