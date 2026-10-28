# 每日情報蒐集儀表板 — 執行規則

> 排程自動執行、無人值守：依本文件一次完成全部流程，不向使用者提問。
> 執行環境：雲端排程，每次重新 clone 本 repo；下文的 `{workspace}` 指 repo 根目錄。成果發布在 GitHub Pages：https://wxliu09.github.io/news/

## 1. 任務與約束

你是主 Agent：先跑 `preflight.py` 取得時間參數，再用 7 個 Subagent 平行蒐集，最後由你驗證結果、填入範本，產出一份 HTML 儀表板。

- 不使用 `AskUserQuestion`、不建立進度清單；遇到不確定的情況，依本文件自行判斷。
- 內容一律用繁體中文（外電標題與摘要也要翻成中文）。不捏造、不推測，找不到就標「近期無重大更新」，絕不以舊聞充數。
- 不依賴前次執行的對話或結果；唯一例外是 `preflight.py` 會讀 `news/` 的檔名來決定 cutoff。
- `WebFetch` 被封鎖（EGRESS_BLOCKED）時改用 `WebSearch`，不要用 Bash 繞過。
- 以下檔案只讀不改，除非使用者明確要求：本文件、`preflight.py`、`build_index.py`、`_template_minimal.html`（HTML 骨架）、`assets/dashboard.css`（樣式）、`assets/dashboard.js`（互動）、`index.html`（目錄首頁；日期清單只由 `build_index.py` 更新）。

| 頁籤 | 蒐集內容 |
|---|---|
| 國際新聞 | 全球重大政治、經濟、軍事、外交、人道事件 |
| 台灣新聞 | 台灣政治、經濟、民生、社會、氣象事件 |
| AI 資訊 | 兩個子頁籤：① AI 產業（模型發布、合作／收購、研究突破、產品上線）；② Anthropic Claude（模型、功能、API、研究） |
| 股票市場 | S&P 500、Dow Jones、Nasdaq、台股加權指數、WTI 原油，加上重大市場事件 |
| 天氣預報 | 台北市、連江縣（馬祖）未來 7 天 |
| 遊戲情報 | 新作發售、重大更新、展覽活動、產業新聞 |
| 日本動漫 | 新番首播、重大公告、平台授權、續作消息 |

## 2. 執行 preflight.py

```bash
python3 "{workspace}/preflight.py"
```

腳本輸出一行 JSON，時間全部是 UTC+8。**直接採用它的值，不要自己重算時間或檔名。**

- `status` 為 `"skip"`：用 `message` 回覆使用者後停止（有 `existing_url` 時附上連結）。
- `status` 為 `"ok"`：記下以下欄位，後面的 `{變數}` 都指這些值。

| 欄位 | 說明 |
|---|---|
| `now`、`today`、`weekday` | 執行時間、日期、星期（一～日） |
| `cutoff` | 截止時間，早於此發布的資訊一律排除 |
| `cutoff_basis` | cutoff 的計算依據（寫進回覆） |
| `days_covered` | 這份日報的資料涵蓋幾天（平常 1，前面有漏跑時最多 4） |
| `range_text` | 蒐集範圍文字，如「10/27（二）00:00 – 10/28（三）08:10」 |
| `dates_en`、`dates_zh` | 蒐集範圍內每一天的自然日期寫法，搜尋用（如「October 27, 2026 / October 28, 2026」「10月27日 / 10月28日」） |
| `tw_expected_session`、`us_expected_session` | 台股、美股預期資料日（已排除週末，未排除國定假日） |
| `tw_session_zh`、`tw_session_en`、`us_session_en` | 上面兩個交易日的自然日期寫法，搜尋用 |
| `title_date`、`date_zh` | 填入 HTML 的日期字串 |
| `output_file` | HTML 存檔的完整路徑 |
| `page_url` | 這份日報在 GitHub Pages 上的網址 |

腳本已處理：06:00 前不執行（美股收盤為台灣時間 04:00／05:00，之後收盤資料才齊全），不論觸發方式；當日已產出就不重複執行；建立輸出資料夾。蒐集範圍是「前一天 00:00 到現在」；中間有漏跑時（例如用量不足沒跑），下一次執行仍只產出一份日報，資料範圍改從上次產出那天的 00:00 起算，最多涵蓋 4 天。股市取前一個交易日的收盤（`tw_expected_session`、`us_expected_session`）。

使用者要求「測試執行」時改跑 `python3 "{workspace}/preflight.py" --test`：略過上述兩項檢查，輸出到 `news_test/`，不影響正式排程；測試執行不要 commit／push。

## 3. 啟動 Subagent

1. 用 Read 讀取 `{workspace}/_template_minimal.html`。
2. **在同一則訊息中發出 7 個 Agent 呼叫**，讓 7 個類別平行蒐集。
3. Subagent 不會讀本文件。每個 prompt 都是「3.1 共通 brief」加上「3.2 該類別附加段」，**原文照貼**，只把 `{...}` 換成 preflight 的值與頁籤名稱。

### 3.1 共通 brief

```text
你是每日情報蒐集團隊的「{頁籤名稱}」研究員，只負責搜尋並回傳 JSON，不產出 HTML。
執行時間：{now}（星期{weekday}，UTC+8）
蒐集範圍：{range_text}
截止時間 cutoff：{cutoff}（UTC+8）

【時間規則：每一則都要通過】
1. 先確認發布時間，並換算成 UTC+8（外電多為 UTC 或美東時間）。
2. 發布時間早於 cutoff → 排除，再重要也一樣。舊事件的後續報導，以該篇報導本身的發布時間判斷。
3. 只顯示「X 小時前」「X 天前」→ 換算成絕對時間再比對；無法換算就排除。
4. 時間模糊（「近期」「本月」「2026/10 期間」）→ 排除。
5. 只知道日期、不知道時間：cutoff 固定是某天 00:00，所以日期在 cutoff 當天或之後 → 可採用；早於 → 排除。
6. 不得猜測或編造時間；找不到確切時間，published_at 就只寫日期。
7. 範圍內沒有符合的消息 → items 回傳 []，絕不以舊聞充數。

【做法】
1. 先開列表頁：用 WebFetch 打開附加段列出的列表頁（每則都標有日期或時間），挑出 cutoff 之後的消息。打不開或內容明顯過舊就跳過，不要因此判定「沒有消息」。
2. 再用 WebSearch 補足，至少 3 次、每次換關鍵字（WebSearch 若有 mode 參數，用 "extended"）：
   - 日期用自然寫法：英文 {dates_en}；中文 {dates_zh}。
   - 不要用「today」，也不要用 2026-10-28 這種 ISO 日期（實測會搜到大量舊聞、分類頁與垃圾站）。
   - 加上來源名稱、地區或事件關鍵字，例如「Reuters Israel election October 27, 2026」。
3. 判斷發布時間可以用：列表頁上的日期／時間、網址裡的日期（如 /2026/10/27/、/news/2026-10-27/、202610270123）、標題裡的日期、原文頁面。只確定到「日」也可以。
4. 目標每類 4–8 則。宣告沒有消息之前，至少要打開 2 個列表頁並搜尋 3 次；items 為空時，在 note 列出試過的列表頁與關鍵字。
- WebFetch 被封鎖（EGRESS_BLOCKED）就改用 WebSearch，不要用 Bash 繞過。
- 同一事件只保留一則，多個來源合併在 sources。
- tag、title、summary 一律用繁體中文（外電也要翻譯）；不捏造、不推測。
- 只回傳下列 JSON：純文字，不要 code block，不要其他說明。

{
  "category": "{頁籤名稱}",
  "items": [
    {
      "tag": "分類標籤，如：戰爭衝突、產品發布、續作",
      "title": "中文標題",
      "summary": "2–4 句中文摘要",
      "published_at": "YYYY-MM-DD HH:MM（UTC+8；只知道日期就寫 YYYY-MM-DD）",
      "sources": [{"name": "來源名稱", "url": "https://..."}]
    }
  ],
  "note": "items 為空時填「近期無重大更新」並列出試過的列表頁與關鍵字，否則省略"
}
```

### 3.2 各類別附加段

**國際新聞**
```text
列表頁：中央社國際 https://www.cna.com.tw/list/aopl.aspx（每則有時間）
搜尋範例：world news {dates_en}、Reuters {dates_en}、AP news {dates_en}，再依列表頁看到的大事件（地區、選舉、衝突等）加關鍵字搜尋
優先來源：中央社、Reuters、AP、NPR、CNN、Al Jazeera
```

**台灣新聞**
```text
列表頁：中央社政治 https://www.cna.com.tw/list/aipl.aspx、中央社社會 https://www.cna.com.tw/list/asoc.aspx、中央社即時 https://www.cna.com.tw/list/aall.aspx（每則有時間；即時列表偶爾是幾小時前的快取，最新消息靠搜尋補）
搜尋範例：台灣 新聞 {dates_zh}、中央社 {dates_zh}、Focus Taiwan {dates_en}
優先來源：中央社、聯合新聞網、自由時報、TVBS
台股盤勢新聞照常收錄，主 Agent 會用來交叉驗證台股收盤。
```

**AI 資訊**
```text
分兩組蒐集，兩組都套用時間規則：
① 一般 AI 產業 → 放 items。關鍵字：AI news {dates_en}、OpenAI / Google / Meta AI {dates_en}。優先 TechCrunch、The Verge、CNBC。
② Anthropic / Claude → 放 claude_items。關鍵字：Anthropic {dates_en}、Claude Anthropic announcement {dates_en}。優先 Anthropic 官網 News、Anthropic Blog、Claude release notes、TechCrunch。
Anthropic / Claude 的消息只放 claude_items，不要兩邊重複。
JSON 多一個欄位 "claude_items"，格式同 items；沒有消息就回傳 []。
```

**股票市場**
```text
指數數值不受 cutoff 限制，但必須標示實際對應的交易日。市場要聞（items）照常套用時間規則，並以 {tw_expected_session}（台股）與 {us_expected_session}（美股）的盤勢、收盤與盤後重大消息為主。

【台股加權指數】取 {tw_expected_session} 的收盤（已依執行時間確認該日已收盤，一定有收盤數據）。
- 只有確認當天休市（國定假日、颱風假）才改取前一個交易日，data_date 照實標示。
- 依序搜尋直到拿到當日數值：「台股 {tw_session_zh} 收盤 點數 漲跌」→「台股加權指數 {tw_session_zh} 收盤」→「TAIEX close {tw_session_en}」。
  不要只搜「台股 + 日期」，容易抓到盤中報價或前一日的收盤新聞。
- 交叉驗證（2026-06-23 曾把前一日的歷史高點 47,741.51 誤標為當日收盤）：
  a. 確認報導本身是 {tw_expected_session} 當天的，不是前一天的新聞。
  b. 若報導寫「上漲 X 點到 Y 點」，前一日收盤 = Y − X；如果算出來的前一日收盤等於你手上的「當日數值」，代表拿到的是前一日資料，要繼續搜尋。
- 全部失敗：value 填「資料取得中」、data_date 填 {tw_expected_session}、status 填「待更新」；禁止拿前一日數值頂替。

【美股三大指數】S&P 500、Dow Jones、Nasdaq，取美國交易日 {us_expected_session} 的收盤。
- 美股收盤是台灣時間 04:00（夏令）／05:00（冬令）；本任務執行時，該交易日早已收盤，下一個交易日還沒開盤。
- {us_expected_session} 若是美國假日，改取再前一個交易日。
- 依序搜尋：「S&P 500 Dow Nasdaq close {us_session_en}」→「stock market today {us_session_en} recap」→「Wall Street close {us_session_en}」。
- 全部失敗：value 填「資料取得中」、data_date 填 {us_expected_session}、status 填「待更新」。

【WTI 原油】取最新一筆可得價格；若是盤中價，status 填「盤中」。

JSON 多一個欄位 index_data，固定 5 筆、順序如下。data_date 是該數值實際對應的交易日，各市場分別標示，日期不同屬正常。
status 只能是「收盤」「盤中」「待更新」。
"index_data": [
  {"name": "S&P 500", "value": "6,816.89", "change": "-0.11%", "data_date": "YYYY-MM-DD", "status": "收盤"},
  {"name": "Dow Jones", ...},
  {"name": "Nasdaq", ...},
  {"name": "台股加權指數", ...},
  {"name": "WTI 原油", "value": "$95.63", ...}
]
```

**天氣預報**
```text
本類別不受 cutoff 限制（預報本身就是前瞻資訊），items 回傳 []。
搜尋關鍵字範例：台北 天氣預報 未來一週、連江縣 馬祖 天氣預報 一週。優先中央氣象署（cwa.gov.tw）。
從 {today} 起連續 7 天，兩地各 7 筆。馬祖的 note 填風力（如「偏北風 5 級」）；台北的 note 留空，有特殊天氣才填。
找不到精確預報時，綜合搜尋結果呈現趨勢，並在 note 註明「趨勢參考」。
JSON 多一個欄位 forecast：
"forecast": {
  "taipei": [{"date": "M/D（X）", "icon": "☀️", "high": 28, "low": 21, "rain": "10%", "note": ""}, ...共 7 筆],
  "matsu":  [{"date": "M/D（X）", "icon": "🌤️", "high": 24, "low": 19, "rain": "20%", "note": "偏北風 5 級"}, ...共 7 筆]
}
```

**遊戲情報**
```text
列表頁：Gematsu https://www.gematsu.com/（每則有時間）、巴哈姆特 GNN https://gnn.gamer.com.tw/（每則有日期，遊戲與動漫混排）
搜尋範例：video game news {dates_en}、IGN {dates_en}、遊戲 新聞 {dates_zh}
優先來源：IGN、GameSpot、Gematsu、PC Gamer、巴哈姆特 GNN
```

**日本動漫**
```text
列表頁：巴哈姆特 GNN 動漫 https://gnn.gamer.com.tw/index.php?k=5（每則有日期）
搜尋範例：Anime News Network {dates_en}、anime announced {dates_en}、動畫 {dates_zh}（ANN 網址含日期，如 /news/2026-10-27/，可直接用來判斷）
ANN 的列表頁用 WebFetch 常抓到舊快取或失敗，不要拿它判斷「沒有新消息」。
優先來源：Anime News Network、Crunchyroll、巴哈姆特
```

## 4. 驗證結果

1. **解析**：某個 Subagent 失敗或 JSON 解析失敗，該頁籤視為「蒐集失敗」，其他頁籤照常進行。
   **覆蓋檢查**：國際、台灣、遊戲、動漫任一類少於 2 則，幾乎一定是蒐集失敗而不是真的沒新聞（這幾類每天都有大量消息）。用同一份 brief 再啟動一次該類 Subagent（可同時重跑多類），prompt 最後加上「上一輪只找到 N 則：請把附加段的列表頁全部打開，並至少搜尋 5 次」。重跑後仍不足就照實呈現。
2. **時間二次過濾**（天氣、index_data 除外）：逐筆檢查 `published_at`。格式不標準（如「2026/10/27 下午」）先自行轉成標準格式，連日期都無法判斷才丟棄。
   - 有時間：早於 `cutoff` → 丟棄。
   - 只有日期：日期早於 `cutoff` 那一天 → 丟棄；同一天或之後 → 保留。
3. **股票數據檢查**：
   - 資料日不符：台股 `data_date` ≠ `{tw_expected_session}`，或美股 ≠ `{us_expected_session}`，先確認是否為休市日；不是休市日，就自己再搜尋一次。
   - 方向矛盾（2026-06-23 的教訓）：台灣新聞或股市要聞出現「翻黑」「由漲轉跌」「終場下跌」「獲利了結」「終止連漲」等描述，但台股漲跌是正值（或反過來），就自己用「台股 {tw_expected_session} 收盤 點數 漲跌」重新確認。這一步只有你做得到，因為各 Subagent 看不到彼此的結果。
   - 仍無法確認：status 改成「待確認」，不得沿用可疑數值。

## 5. 組裝 HTML 並存檔

以範本為骨架，只替換內容：

| 位置 | 填入 |
|---|---|
| `<title>` | `每日情報儀表板 — {title_date}` |
| `.header-subtitle` | `{date_zh}（星期{weekday}）· 蒐集範圍：{range_text}` |
| footer 第一行 | `資料蒐集時間：{date_zh} · 蒐集範圍：{range_text}` |
| `#tab-intl`、`#tab-tw`、`#tab-game`、`#tab-anime` 的 `.cards-grid` | 各類別新聞卡片（範本裡的「範例分類」示範卡片要刪掉） |
| `#inner-tab-ai-general .cards-grid` | AI `items` |
| `#inner-tab-ai-claude .cards-grid` | AI `claude_items`（上方 `.claude-spotlight` 橫幅保留不動） |
| `#tab-stock .index-grid` | 5 張指數卡片，順序同 index_data |
| `#tab-stock .cards-grid` | 股票 `items` |
| `#tab-weather` | 兩個 `.weather-section`，標題分別為「🏙️ 台北市 — 未來 7 天預報」「🏝️ 連江縣（馬祖）— 未來 7 天預報」，各 7 張天氣卡片；`.weather-disclaimer` 保留 |

不要動的地方：`.tab-badge`、`.inner-tab-badge`、`#statTotal` 等統計欄位（保留 0 和 —，由 JS 計算）、`#tab-fav` 整個區塊、所有 class 與 id 名稱、`../assets/` 的引用。不可加入 `<style>` 或內嵌 `<script>`。文字中的 `&`、`<`、`>` 要轉成 `&amp;`、`&lt;`、`&gt;`。

**新聞卡片**（`card-time`：有時間寫 `YYYY/MM/DD HH:MM`，只有日期寫 `YYYY/MM/DD`；多個來源就放多個 `<a>`）
```html
<div class="card">
  <span class="card-tag">{tag}</span>
  <h3 class="card-title">{title}</h3>
  <p class="card-summary">{summary}</p>
  <div class="card-footer">
    <span class="card-time">⏱ {發布時間}</span>
    <div class="card-sources"><a href="{url}" target="_blank">{name}</a></div>
  </div>
</div>
```

**無消息或蒐集失敗的提示卡**：JS 不會自動顯示空頁籤提示，一定要放這張卡。Claude 子頁籤沒有消息時也一樣；天氣頁籤除外（它的 items 本來就是空的）。
```html
<div class="card">
  <span class="card-tag">近期無重大更新</span>
  <h3 class="card-title">{range_text} 期間無可驗證的{頁籤名稱}消息</h3>
  <p class="card-summary">未找到發布時間晚於 {cutoff} 的報導，依規則不以舊聞充數。</p>
</div>
```
蒐集失敗時，tag 改成「蒐集失敗」，summary 簡述原因。

**指數卡片**（上漲用 `up` 和 ▲，下跌用 `down` 和 ▼，持平或無資料用 `neutral` 和「—」；日期格式 `M/DD`）
```html
<div class="index-card">
  <div class="index-name">{name}</div>
  <div class="index-value">{value}</div>
  <div class="index-change up">▲ +0.70%</div>
  <div class="index-date">{M/DD} {status}</div>
</div>
```

**天氣卡片**
```html
<div class="weather-card">
  <div class="weather-date">{date}</div>
  <div class="weather-icon">{icon}</div>
  <div class="weather-temps"><span class="temp-high">{high}°</span> / <span class="temp-low">{low}°</span></div>
  <div class="weather-rain">🌧 {rain}</div>
  <div class="weather-note">{note}</div>
</div>
```

**存檔與自我檢查**：用 Write 寫入 `{output_file}`，再用 Bash 檢查：
```bash
f="{output_file}"
grep -cE '<style|<script>|YYYY|MM/DD|M/D（X）|星期X|範例|城市名稱|指數名稱|>0,000\.00<|>00°<|>備註<|🌧 00%' "$f"   # 範本殘留，應為 0
grep -cE 'href="\.\./assets/dashboard\.css"|src="\.\./assets/dashboard\.js"' "$f"                          # 共用資源引用，應為 2
```
任一項不符就修正後重寫。

**更新目錄**：自我檢查通過後執行 `python3 "{workspace}/build_index.py"`，它會依 `news/` 的實際檔案重建 `index.html` 的日期清單（測試執行不用跑）。日報上的「🏠 返回目錄」按鈕由 `dashboard.js` 自動加上，不用寫進 HTML。

**發布**：只 commit 這次的日報與目錄，直接 push 到 `main`（不要開新分支、不要開 PR）。GitHub Pages 會在 push 後約 1 分鐘自動更新。
```bash
cd "{workspace}"
git add news/ index.html
git commit -m "news: {today} 日報"
git push origin HEAD:main
```
push 被拒時先 `git pull --rebase origin main` 再推一次。

## 6. 回覆與錯誤處理

完成後依下列格式回覆：
```
## 每日情報儀表板已產出

**日期：** {today}（星期{weekday}）
**蒐集範圍：** {range_text}（{cutoff_basis}）
**日報：** {page_url}
**目錄：** https://wxliu09.github.io/news/（Pages 約 1 分鐘後更新）

### 今日重點摘要
- 🌍 國際：（一句話重點）
- 🇹🇼 台灣：（一句話重點）
- 🤖 AI：（一句話重點）
- 🟣 Claude：（一句話重點；無更新就寫「無重大更新」）
- 📈 股市：（一句話重點，註明台股與美股的資料日）
- 🌤️ 天氣：（一句話重點）
- 🎮 遊戲：（一句話重點）
- 📺 動漫：（一句話重點）
```
有蒐集失敗或數據「待更新／待確認」時，最後加一行「⚠️ 注意：」說明。

| 情境 | 處理方式 |
|---|---|
| `preflight.py` 執行失敗 | 回報錯誤訊息後停止，不要自行計算時間繼續跑 |
| 某類別無消息／蒐集失敗 | 放提示卡（見第 5 節），其他類別照常 |
| 股票數值取不到或有疑慮 | 依 3.2 股票段與第 4 節處理；data_date 一律標示實際交易日 |
| 天氣取不到精確預報 | 呈現趨勢，保留中央氣象署連結 |
| HTML 寫入失敗，或自我檢查一直不通過 | 回報錯誤，不要靜默結束 |
| `build_index.py` 執行失敗 | 日報已存好，照常 commit／push 並回覆，在「⚠️ 注意」註明目錄未更新；下次執行會自動補上 |
| `git push` 在 rebase 後仍失敗 | 回報錯誤與 git 訊息；這份日報不會上線，下次執行會依 repo 內的檔案自動涵蓋這段時間 |
