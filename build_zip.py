"""
build_zip.py
Chrome ウェブストア提出用 ZIP を生成する。

manifest.json をルートに配置し、拡張機能の動作に必要なファイルのみを含める。
（README、スクリーンショット、開発ツール等は除外）

実行:
  python build_zip.py
"""

import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).parent

# manifest.json から version を取得して ZIP 名を組み立てる
with open(ROOT / "manifest.json", "r", encoding="utf-8") as f:
    manifest = json.load(f)
ZIP_NAME = f"contact-finder-v{manifest['version']}.zip"

# ZIP に含めるファイル（manifest.json をルートに置く）
# .git / .gitignore / node_modules / .DS_Store / Thumbs.db / README.md /
# screenshots/ / docs/ / *.py / requirements.txt は含めない
INCLUDE_FILES = [
    "manifest.json",
    "LICENSE",
    # ポップアップ
    "popup.html",
    "popup.css",
    "popup.js",
    # オプション
    "options.html",
    "options.css",
    "options.js",
    # 履歴
    "history.html",
    "history.js",
    # アイコン
    "icons/icon16.png",
    "icons/icon48.png",
    "icons/icon128.png",
    # ライブラリ
    "lib/autofill.js",
    "lib/detector.js",
    "lib/finder.js",
    "lib/format.js",
    "lib/keywords.js",
    "lib/storage.js",
]


def main():
    out_path = ROOT / ZIP_NAME
    if out_path.exists():
        out_path.unlink()
        print(f"  removed existing: {ZIP_NAME}")

    missing = []
    total_size = 0
    print(f"--- Building {ZIP_NAME} ---")
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for rel in INCLUDE_FILES:
            src = ROOT / rel
            if not src.exists():
                missing.append(rel)
                print(f"  MISSING: {rel}")
                continue
            zf.write(src, arcname=rel)
            size = src.stat().st_size
            total_size += size
            print(f"  added : {rel}  ({size:,} bytes)")

    if missing:
        print(f"\n[エラー] {len(missing)} 個のファイルが見つかりませんでした。ZIPを削除します。")
        out_path.unlink()
        sys.exit(1)

    final_size = out_path.stat().st_size
    print(f"\n--- 完了 ---")
    print(f"  output      : {out_path.name}")
    print(f"  files       : {len(INCLUDE_FILES)}")
    print(f"  uncompressed: {total_size:,} bytes")
    print(f"  compressed  : {final_size:,} bytes")


if __name__ == "__main__":
    main()
