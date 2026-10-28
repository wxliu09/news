#!/usr/bin/env python3
"""依 news/ 內的日報檔案，更新 index.html 的日期清單。

用法：python3 build_index.py
每次正式產出日報後執行。只掃描 news/（不含 news_test/），所以沒有產出的日子不會出現在清單；
漏跑這一步也沒關係，下次執行會依 news/ 的實際檔案重建，自動補上。
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

FNAME_RE = re.compile(r"^daily_news_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})\.html$")
BEGIN = "<!-- NEWS_DATA:BEGIN"
END = "<!-- NEWS_DATA:END -->"
WEEKDAY = "一二三四五六日"


def main():
    root = Path(__file__).resolve().parent
    index = root / "index.html"

    entries = []
    for f in (root / "news").glob("daily_news_*.html"):
        m = FNAME_RE.match(f.name)
        if not m:
            continue
        y, mo, d, hh, mm, _ = m.groups()
        try:
            wd = WEEKDAY[date(int(y), int(mo), int(d)).weekday()]
        except ValueError:
            continue
        entries.append({"file": f"news/{f.name}", "date": f"{y}-{mo}-{d}",
                        "time": f"{hh}:{mm}", "weekday": wd})
    entries.sort(key=lambda e: e["file"], reverse=True)   # 新到舊

    html = index.read_text(encoding="utf-8")
    start, end = html.find(BEGIN), html.find(END)
    if start < 0 or end < start:
        sys.exit("index.html 找不到 NEWS_DATA 標記，未更新")
    keep_until = html.index("\n", start) + 1               # 保留 BEGIN 標記那一行
    rows = ",\n".join(json.dumps(e, ensure_ascii=False) for e in entries)
    data = ("[\n" + rows + "\n]" if rows else "[]").replace("</", "<\\/")
    block = f'<script id="news-data" type="application/json">\n{data}\n</script>\n'
    new_html = html[:keep_until] + block + html[end:]
    if new_html != html:
        index.write_text(new_html, encoding="utf-8", newline="\n")

    print(json.dumps({"entries": len(entries),
                      "latest": entries[0]["date"] if entries else None},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
