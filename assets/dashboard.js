/* ============================================================
 * 每日情報儀表板 — Dashboard Script
 * ------------------------------------------------------------
 * 此檔案為所有日報 HTML 共用的互動邏輯。
 * 修改這支檔案會同步影響所有已產出與未來產出的日報。
 *
 * 模組：
 *   01. Constants & Helpers   — 全域常數與工具函式
 *   02. Storage               — localStorage 讀寫封裝
 *   03. Card Registry         — 卡片初始化與 UID 指派
 *   04. Tabs                  — 頁籤切換
 *   05. Theme Toggle          — 深 / 淺色主題
 *   06. Compact Mode          — 緊湊模式
 *   07. Font Size             — 字級切換
 *   08. Print                 — 列印
 *   09. Search                — 搜尋過濾 + 關鍵字高亮
 *   10. Favorites             — 收藏功能
 *   11. Stats                 — 統計資訊更新
 *   12. Last Updated          — 最後更新時間
 *   13. Keyboard Shortcuts    — 快捷鍵
 *   14. Back To Top           — 回到頂端
 *   15. Home Link             — 返回目錄按鈕
 *   16. Bootstrap             — 啟動
 * ============================================================ */

(function () {
    'use strict';

    // ============================================================
    // 01. Constants & Helpers
    // ============================================================

    const STORAGE_PREFIX = 'dailyNews.';
    const TAB_IDS = ['intl', 'tw', 'ai', 'stock', 'weather', 'game', 'anime', 'fav'];

    /** querySelector 簡寫 */
    const qs = (selector, root = document) => root.querySelector(selector);

    /** querySelectorAll 簡寫，回傳陣列 */
    const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));


    // ============================================================
    // 02. Storage
    // ============================================================

    const Storage = {
        get(key, fallback = null) {
            try {
                const raw = localStorage.getItem(STORAGE_PREFIX + key);
                return raw === null ? fallback : raw;
            } catch {
                return fallback;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(STORAGE_PREFIX + key, value);
            } catch {
                /* 忽略（隱私模式 / 空間滿） */
            }
        },
        getJSON(key, fallback) {
            try {
                const raw = localStorage.getItem(STORAGE_PREFIX + key);
                return raw ? JSON.parse(raw) : fallback;
            } catch {
                return fallback;
            }
        },
        setJSON(key, value) {
            this.set(key, JSON.stringify(value));
        },
    };


    // ============================================================
    // 03. Card Registry
    // ============================================================

    // 收集所有新聞卡片（排除「我的收藏」頁籤內的）
    const tabButtons = qsa('.tab-btn');
    const tabPanels  = qsa('.tab-panel');
    const newsCards  = qsa('.card').filter(card => !card.closest('#tab-fav'));

    /**
     * 為每張卡片指派唯一識別碼（UID），並加上收藏按鈕。
     * UID 格式：`{tabId}::{title}`
     */
    function initCards() {
        newsCards.forEach((card, index) => {
            const panel   = card.closest('.tab-panel');
            const tabId   = panel ? panel.id.replace('tab-', '') : 'misc';
            const title   = (qs('.card-title', card)?.textContent || '').trim();

            card.dataset.uid   = `${tabId}::${title || index}`;
            card.dataset.tabId = tabId;

            // 插入收藏按鈕
            const btn = document.createElement('button');
            btn.className = 'bookmark-btn';
            btn.innerHTML = '☆';
            btn.title     = '加入收藏';
            btn.addEventListener('click', event => {
                event.stopPropagation();
                Favorites.toggle(card.dataset.uid);
            });
            card.appendChild(btn);
        });

        // 為每個非收藏頁籤補一個「無結果」提示
        tabPanels.forEach(panel => {
            if (panel.id === 'tab-fav') return;
            if (!qs('.no-result', panel)) {
                const empty = document.createElement('div');
                empty.className = 'no-result';
                empty.textContent = '沒有符合搜尋條件的內容。';
                panel.appendChild(empty);
            }
        });
    }


    // ============================================================
    // 04. Tabs
    // ============================================================

    const Tabs = {
        activate(tabId) {
            tabButtons.forEach(btn =>
                btn.classList.toggle('active', btn.dataset.tab === tabId)
            );
            tabPanels.forEach(panel =>
                panel.classList.toggle('active', panel.id === `tab-${tabId}`)
            );

            if (tabId === 'fav') Favorites.render();
            Storage.set('activeTab', tabId);
        },

        init() {
            tabButtons.forEach(btn => {
                btn.addEventListener('click', () => this.activate(btn.dataset.tab));
            });

            // 還原上次選取的頁籤
            const saved = Storage.get('activeTab');
            if (saved && TAB_IDS.includes(saved)) this.activate(saved);
        },
    };


    // ============================================================
    // 04b. Inner Tabs (AI 頁籤內部子頁籤)
    // ============================================================

    const InnerTabs = {
        /** 初始化所有內部子頁籤 */
        init() {
            const innerBtns = qsa('.inner-tab-btn');
            if (!innerBtns.length) return;

            innerBtns.forEach(btn => {
                btn.addEventListener('click', () => this.activate(btn.dataset.innerTab));
            });

            // 還原上次選取的子頁籤
            const saved = Storage.get('innerTab.ai');
            if (saved && innerBtns.some(b => b.dataset.innerTab === saved)) {
                this.activate(saved);
            } else if (innerBtns[0]) {
                this.activate(innerBtns[0].dataset.innerTab);
            }
        },

        activate(innerTabId) {
            qsa('.inner-tab-btn').forEach(btn =>
                btn.classList.toggle('active', btn.dataset.innerTab === innerTabId)
            );
            qsa('.inner-tab-panel').forEach(panel =>
                panel.classList.toggle('active', panel.id === `inner-tab-${innerTabId}`)
            );
            Storage.set('innerTab.ai', innerTabId);
            this.updateBadges();
        },

        /** 更新每個子頁籤上的卡片數量徽章 */
        updateBadges() {
            qsa('.inner-tab-btn').forEach(btn => {
                const panelId = `inner-tab-${btn.dataset.innerTab}`;
                const panel   = document.getElementById(panelId);
                const badge   = qs('.inner-tab-badge', btn);
                if (badge && panel) {
                    badge.textContent = qsa('.card', panel).length;
                }
            });
        },
    };


    // ============================================================
    // 05. Theme Toggle
    // ============================================================

    const Theme = {
        toggleBtn: qs('#themeToggle'),

        apply(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            this.toggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
            this.toggleBtn.title       = theme === 'light' ? '切換為深色主題' : '切換為淺色主題';
            Storage.set('theme', theme);
        },

        init() {
            this.toggleBtn.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme') || 'dark';
                this.apply(current === 'dark' ? 'light' : 'dark');
            });
            this.apply(Storage.get('theme', 'dark'));
        },
    };


    // ============================================================
    // 06. Compact Mode
    // ============================================================

    const CompactMode = {
        toggleBtn: qs('#compactToggle'),

        apply(on) {
            document.body.classList.toggle('compact', on);
            this.toggleBtn.classList.toggle('active', on);
            Storage.set('compact', on ? '1' : '0');
        },

        init() {
            this.toggleBtn.addEventListener('click', () => {
                this.apply(!document.body.classList.contains('compact'));
            });
            this.apply(Storage.get('compact') === '1');
        },
    };


    // ============================================================
    // 07. Font Size
    // ============================================================

    const FontSize = {
        toggleBtn: qs('#fontToggle'),

        apply(large) {
            document.body.classList.toggle('font-lg', large);
            this.toggleBtn.classList.toggle('active', large);
            Storage.set('fontLg', large ? '1' : '0');
        },

        init() {
            this.toggleBtn.addEventListener('click', () => {
                this.apply(!document.body.classList.contains('font-lg'));
            });
            this.apply(Storage.get('fontLg') === '1');
        },
    };


    // ============================================================
    // 08. Print
    // ============================================================

    function initPrint() {
        qs('#printBtn').addEventListener('click', () => window.print());
    }


    // ============================================================
    // 09. Search (過濾 + 關鍵字高亮)
    // ============================================================

    const Search = {
        input: qs('#searchInput'),
        clearBtn: qs('#searchClear'),
        debounceTimer: null,
        debounceMs: 120,

        /** 清除某個節點下所有的搜尋高亮 */
        clearHighlights(root) {
            qsa('mark.search-hl', root).forEach(mark => {
                const parent = mark.parentNode;
                parent.replaceChild(document.createTextNode(mark.textContent), mark);
                parent.normalize();
            });
        },

        /** 在節點內對關鍵字加上 <mark> 高亮 */
        highlightText(root, keyword) {
            if (!keyword) return;

            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    const tag = node.parentNode.tagName;
                    return tag === 'SCRIPT' || tag === 'STYLE'
                        ? NodeFilter.FILTER_REJECT
                        : NodeFilter.FILTER_ACCEPT;
                },
            });

            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'gi');
            const matchedNodes = [];

            let node;
            while ((node = walker.nextNode())) {
                if (regex.test(node.nodeValue)) matchedNodes.push(node);
            }

            matchedNodes.forEach(textNode => {
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;

                textNode.nodeValue.replace(regex, (match, offset) => {
                    if (offset > lastIndex) {
                        fragment.appendChild(
                            document.createTextNode(textNode.nodeValue.slice(lastIndex, offset))
                        );
                    }
                    const mark = document.createElement('mark');
                    mark.className = 'search-hl';
                    mark.textContent = match;
                    fragment.appendChild(mark);
                    lastIndex = offset + match.length;
                });

                if (lastIndex < textNode.nodeValue.length) {
                    fragment.appendChild(
                        document.createTextNode(textNode.nodeValue.slice(lastIndex))
                    );
                }
                textNode.parentNode.replaceChild(fragment, textNode);
            });
        },

        apply(rawKeyword) {
            const keyword = rawKeyword.trim();
            this.clearBtn.classList.toggle('show', keyword.length > 0);

            // 過濾卡片 + 高亮
            newsCards.forEach(card => {
                this.clearHighlights(card);
                const text = card.textContent.toLowerCase();
                const hit  = !keyword || text.includes(keyword.toLowerCase());

                card.classList.toggle('hidden-filter', !hit);

                if (hit && keyword) {
                    ['.card-title', '.card-summary', '.card-tag'].forEach(selector => {
                        const el = qs(selector, card);
                        if (el) this.highlightText(el, keyword);
                    });
                }
            });

            // 更新「無結果」狀態
            tabPanels.forEach(panel => {
                if (panel.id === 'tab-fav') return;
                const cards   = qsa('.card', panel);
                const visible = cards.filter(c => !c.classList.contains('hidden-filter'));
                panel.classList.toggle('empty-filter', cards.length > 0 && visible.length === 0);
            });

            Stats.update();
        },

        init() {
            this.input.addEventListener('input', event => {
                clearTimeout(this.debounceTimer);
                const value = event.target.value;
                this.debounceTimer = setTimeout(() => this.apply(value), this.debounceMs);
            });

            this.clearBtn.addEventListener('click', () => {
                this.input.value = '';
                this.apply('');
                this.input.focus();
            });
        },
    };


    // ============================================================
    // 10. Favorites
    // ============================================================

    const Favorites = {
        get() {
            return Storage.getJSON('favs', []);
        },

        save(list) {
            Storage.setJSON('favs', list);
        },

        toggle(uid) {
            const favs  = this.get();
            const index = favs.indexOf(uid);

            if (index >= 0) favs.splice(index, 1);
            else             favs.push(uid);

            this.save(favs);
            this.refreshStates();
        },

        /** 重新整理所有卡片的收藏按鈕狀態 */
        refreshStates() {
            const favs = this.get();

            newsCards.forEach(card => {
                const isActive = favs.includes(card.dataset.uid);
                const btn = qs('.bookmark-btn', card);
                if (!btn) return;

                btn.classList.toggle('active', isActive);
                btn.innerHTML = isActive ? '★' : '☆';
                btn.title     = isActive ? '取消收藏' : '加入收藏';
            });

            Stats.updateTabCounts();
            Stats.update();

            const activePanel = qs('.tab-panel.active');
            if (activePanel?.id === 'tab-fav') this.render();
        },

        /** 渲染「我的收藏」頁籤內容 */
        render() {
            const favs  = this.get();
            const grid  = qs('#favGrid');
            const empty = qs('#favEmpty');

            grid.innerHTML = '';

            const items = newsCards.filter(card => favs.includes(card.dataset.uid));

            if (items.length === 0) {
                empty.style.display = 'block';
                grid.style.display  = 'none';
                return;
            }

            empty.style.display = 'none';
            grid.style.display  = '';

            items.forEach(source => {
                const clone = source.cloneNode(true);

                // 收藏面板裡的 ★ 也能取消
                const btn = qs('.bookmark-btn', clone);
                if (btn) {
                    btn.addEventListener('click', event => {
                        event.stopPropagation();
                        this.toggle(source.dataset.uid);
                    });
                }

                // 加入分類標示
                const tabBtn   = qs(`.tab-btn[data-tab="${source.dataset.tabId}"]`);
                const tabLabel = tabBtn ? tabBtn.childNodes[0].nodeValue.trim() : '';
                if (tabLabel) {
                    const origin = document.createElement('div');
                    origin.style.cssText =
                        'font-size:0.72rem;color:var(--color-text-muted);margin-bottom:6px;';
                    origin.textContent = '來自：' + tabLabel;
                    clone.insertBefore(origin, clone.firstChild);
                }

                grid.appendChild(clone);
            });
        },
    };


    // ============================================================
    // 11. Stats
    // ============================================================

    const Stats = {
        /** 更新每個頁籤上的數量徽章 */
        updateTabCounts() {
            const favs = Favorites.get();

            tabButtons.forEach(btn => {
                const tabId = btn.dataset.tab;
                const badge = qs('.tab-badge', btn);
                if (!badge) return;

                if (tabId === 'fav') {
                    badge.textContent = favs.length;
                } else {
                    const panel = document.getElementById(`tab-${tabId}`);
                    badge.textContent = panel ? qsa('.card', panel).length : 0;
                }
            });
        },

        /** 更新頂部統計列（總計 / 顯示中 / 收藏）
         *
         * 「顯示中」只在搜尋有關鍵字時顯示，
         * 沒有搜尋時隱藏，避免顯示與總計相同的無意義數字。
         */
        update() {
            const keyword    = qs('#searchInput')?.value?.trim() || '';
            const total      = newsCards.length;
            const visible    = newsCards.filter(
                card => !card.classList.contains('hidden-filter')
            ).length;

            qs('#statTotal').textContent = total;
            qs('#statVisible').textContent = visible;
            qs('#statFav').textContent = Favorites.get().length;

            // 只在搜尋時才顯示「顯示中」欄位
            const visibleItem = qs('#statVisible')?.closest('.stat-item');
            if (visibleItem) {
                visibleItem.style.display = keyword ? '' : 'none';
            }
        },
    };


    // ============================================================
    // 12. Last Updated
    // ============================================================

    function setLastUpdated() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const formatted =
            `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ` +
            `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        qs('#statUpdated').textContent = formatted;
    }


    // ============================================================
    // 13. Keyboard Shortcuts
    // ============================================================

    function initKeyboardShortcuts() {
        document.addEventListener('keydown', event => {
            // 正在輸入時只處理 Esc
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                if (event.key === 'Escape') {
                    event.target.blur();
                    Search.input.value = '';
                    Search.apply('');
                }
                return;
            }

            // "/" 聚焦搜尋
            if (event.key === '/') {
                event.preventDefault();
                Search.input.focus();
                return;
            }

            // "T" 切換主題
            if (event.key === 't' || event.key === 'T') {
                Theme.toggleBtn.click();
                return;
            }

            // 數字鍵 1-8 切換頁籤
            if (event.key >= '1' && event.key <= '8') {
                const index = parseInt(event.key, 10) - 1;
                if (TAB_IDS[index]) Tabs.activate(TAB_IDS[index]);
            }
        });
    }


    // ============================================================
    // 14. Back To Top
    // ============================================================

    function initBackToTop() {
        const btn = qs('#backTop');
        const threshold = 300;

        window.addEventListener('scroll', () => {
            btn.classList.toggle('show', window.scrollY > threshold);
        });

        btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }


    // ============================================================
    // 15. Home Link
    // ============================================================

    /** 在工具列最前面插入「返回目錄」按鈕；由這支共用 JS 注入，新舊日報都會出現 */
    function initHomeLink() {
        const actions = qs('.header-actions');
        if (!actions || qs('#homeLink')) return;

        const link = document.createElement('a');
        link.id          = 'homeLink';
        link.className   = 'icon-btn';
        link.href        = '../index.html';
        link.title       = '返回目錄';
        link.textContent = '🏠';
        link.setAttribute('aria-label', '返回目錄');
        actions.insertBefore(link, actions.firstChild);
    }


    // ============================================================
    // 16. Bootstrap
    // ============================================================

    initCards();
    Tabs.init();
    InnerTabs.init();
    Theme.init();
    CompactMode.init();
    FontSize.init();
    initPrint();
    Search.init();
    initKeyboardShortcuts();
    initBackToTop();
    initHomeLink();

    // 首次渲染
    Favorites.refreshStates();
    Stats.updateTabCounts();
    InnerTabs.updateBadges();
    Stats.update();
    setLastUpdated();
})();
