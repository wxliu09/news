#!/usr/bin/env python3
"""每日情報儀表板 — 執行前置檢查與時間參數計算。

用法：
  python3 preflight.py            正式執行
  python3 preflight.py --test     測試執行：略過時間門檻與重複檢查，輸出到 news_test/
  python3 preflight.py --now "2026-10-28 08:10"   以指定時間（UTC+8）模擬，供除錯用

輸出一行 JSON：
  status = "skip" → 依 message 回覆後停止
  status = "ok"   → 其餘欄位供主 Agent 直接採用（所有時間皆為 UTC+8）

蒐集範圍：前一天 00:00 到現在。
中間有漏跑時（例如用量不足沒跑），下一次執行仍只產出一份日報，
資料範圍改從上次產出那天的 00:00 起算，最多涵蓋 MAX_DAYS 天。
"""
import argparse
import json
import re
import sys
from datetime import datetime, time, timedelta, timezone
from pathlib import Path

TZ = timezone(timedelta(hours=8))   # 台灣無夏令時間，固定 +8，不依賴系統時區設定
EARLIEST_RUN = (6, 0)               # 美股收盤為台灣時間 04:00（夏令）／05:00（冬令），06:00 前不執行
TW_CLOSE = (13, 30)                 # 台股收盤
US_CLOSE_HOUR = 5                   # 美股收盤（取冬令較晚者）
MAX_DAYS = 4                        # 漏跑時單次最多回推 4 天
SITE_URL = "https://wxliu09.github.io/news/"   # GitHub Pages 網址
WEEKDAY = "一二三四五六日"
MONTH_EN = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"]
FNAME_RE = re.compile(r"^daily_news_(\d{4}-\d{2}-\d{2})_(\d{6})\.html$")


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(0)


def last_weekday(d):
    """週末往回推到週五（不含國定假日，由 Subagent 再確認）。"""
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def fmt(dt):
    return dt.strftime("%Y-%m-%d %H:%M")


def md(dt):
    return f"{dt.month}/{dt.day}（{WEEKDAY[dt.weekday()]}）"


def en(d):
    """搜尋用英文日期，例如 October 27, 2026"""
    return f"{MONTH_EN[d.month - 1]} {d.day}, {d.year}"


def zh(d):
    """搜尋用中文日期，例如 10月27日"""
    return f"{d.month}月{d.day}日"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--now", help="模擬目前時間，格式 YYYY-MM-DD HH:MM（UTC+8）")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent
    news = root / "news"
    out_dir = root / ("news_test" if args.test else "news")

    if args.now:
        now = datetime.strptime(args.now, "%Y-%m-%d %H:%M").replace(tzinfo=TZ)
    else:
        now = datetime.now(TZ).replace(microsecond=0)
    today = now.date()

    # 正式執行才做的兩項檢查
    if not args.test:
        if (now.hour, now.minute) < EARLIEST_RUN:
            emit({"status": "skip",
                  "message": f"⏰ 尚未到 {EARLIEST_RUN[0]:02d}:{EARLIEST_RUN[1]:02d}（美股收盤資料齊全的時間），本次略過。"})
        done = sorted(news.glob(f"daily_news_{today:%Y-%m-%d}_*.html"))
        if done:
            m = FNAME_RE.match(done[-1].name)
            at = f"{m.group(2)[:2]}:{m.group(2)[2:4]}" if m else "稍早"
            emit({"status": "skip",
                  "message": f"📋 今日儀表板已於 {at} 產生過，無需重複執行。",
                  "existing_url": f"{SITE_URL}news/{done[-1].name}"})

    # 上一次正式產出時間：只看 news/ 的檔名，且必須早於現在
    last_run = None
    for f in news.glob("daily_news_*.html"):
        m = FNAME_RE.match(f.name)
        if not m:
            continue
        t = datetime.strptime(m.group(1) + m.group(2), "%Y-%m-%d%H%M%S").replace(tzinfo=TZ)
        if t < now and (last_run is None or t > last_run):
            last_run = t

    # 蒐集起點（某天 00:00）
    yesterday = today - timedelta(days=1)
    floor_day = today - timedelta(days=MAX_DAYS)
    if last_run is None:
        start_day, basis = yesterday, "找不到上次產出，取前一天 00:00 起"
    elif last_run.date() >= yesterday:
        start_day, basis = yesterday, f"上次產出 {fmt(last_run)}，取前一天 00:00 起"
    elif last_run.date() >= floor_day:
        start_day, basis = last_run.date(), f"上次產出 {fmt(last_run)}，中間有漏跑，本份從該日 00:00 起涵蓋"
    else:
        start_day, basis = floor_day, f"上次產出 {fmt(last_run)} 已超過 {MAX_DAYS} 天，本份最多涵蓋 {MAX_DAYS} 天"
    cutoff = datetime.combine(start_day, time(0), TZ)
    days_covered = (today - start_day).days
    range_text = f"{md(cutoff)}00:00 – {md(now)}{now:%H:%M}"

    # 預期資料日：依執行時間判斷該市場最近一個「已收盤」的交易日（不含國定假日）
    tw_session = last_weekday(today if (now.hour, now.minute) >= TW_CLOSE else today - timedelta(days=1))
    us_session = last_weekday(today - timedelta(days=1 if now.hour >= US_CLOSE_HOUR else 2))

    # 搜尋用的自然日期寫法（實測 ISO 格式與 "today" 會搜到大量舊聞與垃圾站）
    span = [start_day + timedelta(days=i) for i in range(days_covered + 1)]

    out_dir.mkdir(parents=True, exist_ok=True)
    output_file = out_dir / f"daily_news_{now:%Y-%m-%d_%H%M%S}.html"

    emit({
        "status": "ok",
        "mode": "測試" if args.test else "正式",
        "now": fmt(now),
        "today": f"{today:%Y-%m-%d}",
        "weekday": WEEKDAY[today.weekday()],
        "cutoff": fmt(cutoff),
        "cutoff_basis": basis,
        "days_covered": days_covered,
        "range_text": range_text,
        "dates_en": " / ".join(en(d) for d in span),
        "dates_zh": " / ".join(zh(d) for d in span),
        "tw_expected_session": f"{tw_session:%Y-%m-%d}",
        "us_expected_session": f"{us_session:%Y-%m-%d}",
        "tw_session_zh": zh(tw_session),
        "tw_session_en": en(tw_session),
        "us_session_en": en(us_session),
        "title_date": f"{today:%Y/%m/%d}",
        "date_zh": f"{today.year}年{today.month:02d}月{today.day:02d}日",
        "output_file": str(output_file),
        "page_url": None if args.test else f"{SITE_URL}news/{output_file.name}",
    })


if __name__ == "__main__":
    main()
