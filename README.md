# 每日情報儀表板

每天早上 08:10（台北時間）由 Claude 雲端排程自動蒐集國際、台灣、AI、股市、天氣、遊戲、動漫等 7 類資訊，產出一份 HTML 日報，發布在 GitHub Pages：

**https://wxliu09.github.io/news/**

## 運作方式

每次排程執行都會重新 clone 這個 repo，依 `cowork_news_instructions.md` 的規則：

1. `preflight.py` 計算時間參數：蒐集範圍是前一天 00:00 到執行當下；中間有漏跑時，下一次仍只產出一份日報，範圍從上次產出那天的 00:00 起，最多涵蓋 4 天。
2. 7 個 Subagent 平行蒐集，主 Agent 驗證後依 `_template_minimal.html` 組成日報，存到 `news/`。
3. `build_index.py` 依 `news/` 的檔案重建 `index.html` 的日期清單。
4. commit 並 push 到 `main`，GitHub Pages 自動更新。

## 檔案結構

```
├── index.html                  ← 目錄首頁（日期下拉選單；清單由 build_index.py 產生）
├── news/                       ← 每日日報 daily_news_YYYY-MM-DD_HHMMSS.html
├── assets/
│   ├── dashboard.css           ← 所有日報共用樣式
│   └── dashboard.js            ← 所有日報共用互動（含「🏠 返回目錄」按鈕）
├── _template_minimal.html      ← 日報 HTML 骨架
├── cowork_news_instructions.md ← 排程執行規則
├── preflight.py                ← 執行前檢查與時間參數
└── build_index.py              ← 更新目錄清單
```

## 本機預覽與測試

- 直接用瀏覽器開 `index.html` 即可瀏覽。
- `python3 preflight.py --test` 模擬一次執行（輸出到 `news_test/`，不會被 commit）。
- `python3 preflight.py --now "2026-10-28 08:10"` 以指定時間檢查時間參數。
