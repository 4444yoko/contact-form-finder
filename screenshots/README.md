# Screenshots

Chrome Web Store 掲載用スクリーンショットの作業ディレクトリ。

## ディレクトリ構成

```
screenshots/
├── raw/             ← 撮影した画像をここに置く（PNG / JPG / JPEG）
├── final/           ← format_screenshots.py が整形したものを出力
├── captions.json    ← ファイル名 → キャプションの対応
└── README.md        ← このファイル
```

## 使い方

1. Chrome 拡張機能を撮影し、画像を `screenshots/raw/` に保存
   - ファイル名は `captions.json` のキーと一致させる
   - 例: `01-popup-find.png`、`02-popup-autofill.png` ...
2. プロジェクトルートで:
   ```bash
   pip install -r requirements.txt
   python format_screenshots.py
   ```
3. `screenshots/final/` に 1280×800 の整形済み画像が出力される
4. これを Chrome ウェブストアの登録画面でアップロード
