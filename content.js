/*
 * YouTube Grid Customizer - content script
 *
 * 機能:
 *  1. トップ/登録チャンネル等のグリッド列数を増やす
 *  2. 検索結果をグリッド表示にして 1 画面あたりの表示件数を増やす
 *  3. タイトル/チャンネル名に指定キーワードを含む動画を非表示にする
 *  4. Shorts セクション/動画カードを非表示にする
 *  5. ゲームルームのセクションを非表示にする
 */
(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    itemsPerRow: 6, // トップページなどのグリッド列数
    searchColumns: 2, // 検索結果の列数 (1 で通常のリスト表示)
    blockTitleKeywords: [], // タイトルに含む場合に非表示
    blockChannelKeywords: [], // チャンネル名に含む場合に非表示
    caseSensitive: false,
    hideShorts: false,
    hideGameRoom: false,
  };

  let settings = { ...DEFAULTS };

  // ------------------------------------------------------------------
  // 動画カード要素と、そのタイトル/チャンネル名を取り出すためのセレクタ
  // ------------------------------------------------------------------
  const VIDEO_RENDERERS = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-reel-item-renderer",
    "ytd-rich-grid-media",
  ];

  const TITLE_SELECTORS = [
    // 新レイアウト (yt-lockup-view-model)
    "a.ytLockupMetadataViewModelTitle",
    ".ytLockupMetadataViewModelTitle",
    "h3.ytLockupMetadataViewModelHeadingReset",
    ".yt-lockup-metadata-view-model-wiz__title",
    // 旧レイアウト
    "#video-title",
    "#video-title-link",
    "yt-formatted-string#video-title",
    "a#video-title-link",
    "h3 a",
  ];

  const CHANNEL_SELECTORS = [
    // 新レイアウト: メタ行のリンク = チャンネル名
    ".ytContentMetadataViewModelMetadataRow a",
    "yt-content-metadata-view-model a",
    // 旧レイアウト
    "#channel-name #text",
    "ytd-channel-name #text",
    ".yt-content-metadata-view-model-wiz__metadata-text",
  ];

  const SECTION_RENDERERS = [
    "ytd-rich-section-renderer",
    "ytd-rich-shelf-renderer",
    "ytd-shelf-renderer",
    "ytd-horizontal-card-list-renderer",
  ];

  const SECTION_TITLE_SELECTORS = [
    "#title",
    "#title-container",
    "h2",
    "h3",
    "yt-formatted-string#title",
  ];

  const STYLE_ID = "ytgc-style";

  // ------------------------------------------------------------------
  // CSS 注入: グリッド列数 / 検索結果のグリッド化
  // ------------------------------------------------------------------
  function buildCss() {
    if (!settings.enabled) return "";

    const perRow = clampInt(settings.itemsPerRow, 1, 12, DEFAULTS.itemsPerRow);
    const searchCols = clampInt(settings.searchColumns, 1, 8, DEFAULTS.searchColumns);

    let css = `
      /* ---- トップ/登録チャンネル等のリッチグリッド列数 ---- */
      /* YouTube の CSS 変数を上書き（新レイアウト向け） */
      ytd-rich-grid-renderer {
        --ytd-rich-grid-items-per-row: ${perRow} !important;
        --ytd-rich-grid-posts-per-row: ${perRow} !important;
        --ytd-rich-grid-slim-items-per-row: ${perRow} !important;
        --ytd-rich-grid-gutter-margin: 8px !important;
      }
      /* 各カードの幅を直接 100%/列数 に固定（JS の幅計算より優先させる） */
      ytd-rich-grid-renderer #contents.ytd-rich-grid-renderer > ytd-rich-item-renderer {
        width: calc(100% / ${perRow}) !important;
        max-width: calc(100% / ${perRow}) !important;
        margin: 0 !important;
        padding: 0 8px 16px 8px !important;
        box-sizing: border-box !important;
      }
      /* 旧レイアウト (ytd-grid-renderer) にも対応 */
      ytd-grid-renderer #items.ytd-grid-renderer {
        display: grid !important;
        grid-template-columns: repeat(${perRow}, minmax(0, 1fr)) !important;
        gap: 16px !important;
      }
      ytd-grid-renderer ytd-grid-video-renderer {
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
      }
    `;

    if (searchCols > 1) {
      css += `
      /* ---- 検索結果をグリッド化して1画面の表示件数を増やす ---- */
      ytd-search ytd-item-section-renderer #contents.ytd-item-section-renderer {
        display: grid !important;
        grid-template-columns: repeat(${searchCols}, minmax(0, 1fr)) !important;
        gap: 16px !important;
      }
      ytd-search ytd-video-renderer {
        max-width: none !important;
      }
      /* サムネイルを小さめにして横並びを詰める */
      ytd-search ytd-video-renderer ytd-thumbnail {
        max-width: none !important;
      }
      `;
    }

    if (settings.hideShorts) {
      css += `
      ytd-reel-shelf-renderer,
      ytd-rich-shelf-renderer[is-shorts],
      ytd-reel-item-renderer,
      ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]) {
        display: none !important;
      }
      `;
    }

    return css;
  }

  function applyStyle() {
    let el = document.getElementById(STYLE_ID);
    const css = buildCss();
    if (!css) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = css;
  }

  // ------------------------------------------------------------------
  // キーワードフィルタ
  // ------------------------------------------------------------------
  function getText(card, selectors) {
    for (const sel of selectors) {
      const node = card.querySelector(sel);
      if (node) {
        const t = (node.getAttribute("title") || node.textContent || "").trim();
        if (t) return t;
      }
    }
    return "";
  }

  function matchesBlock(text, keywords) {
    if (!text || !keywords || keywords.length === 0) return false;
    const haystack = settings.caseSensitive ? text : text.toLowerCase();
    for (const kw of keywords) {
      if (!kw) continue;
      const needle = settings.caseSensitive ? kw : kw.toLowerCase();
      if (haystack.includes(needle)) return kw;
    }
    return false;
  }

  function hasAnyFilter() {
    return (
      settings.hideShorts ||
      settings.hideGameRoom ||
      settings.blockTitleKeywords.length > 0 ||
      settings.blockChannelKeywords.length > 0
    );
  }

  function isShortsCard(card) {
    return !!card.querySelector(
      [
        'a[href^="/shorts/"]',
        'a[href*="//www.youtube.com/shorts/"]',
        'a[href*="//youtube.com/shorts/"]',
      ].join(",")
    );
  }

  function sectionTitle(section) {
    return getText(section, SECTION_TITLE_SELECTORS);
  }

  function isGameRoomSection(section) {
    return sectionTitle(section).includes("ゲームルーム");
  }

  function filterCard(card) {
    // 既に判定済みで、設定が変わっていなければスキップ
    if (settings.hideShorts && isShortsCard(card)) {
      card.style.display = "none";
      card.setAttribute("data-ytgc-hidden", "ytgc-shorts");
      return;
    }

    if (card.getAttribute("data-ytgc-hidden") === "ytgc-shorts") {
      card.style.display = "";
      card.removeAttribute("data-ytgc-hidden");
    }

    const title = getText(card, TITLE_SELECTORS);
    const channel = getText(card, CHANNEL_SELECTORS);
    if (!title && !channel) return; // まだ読み込まれていない

    const hit =
      matchesBlock(title, settings.blockTitleKeywords) ||
      matchesBlock(channel, settings.blockChannelKeywords);
    if (hit) {
      card.style.display = "none";
      card.setAttribute("data-ytgc-hidden", hit);
    } else if (card.getAttribute("data-ytgc-hidden") !== null) {
      // 過去に非表示にしたが、設定変更で対象外になった場合は復帰
      card.style.display = "";
      card.removeAttribute("data-ytgc-hidden");
    }
  }

  function filterSections(root = document) {
    if (!root.querySelectorAll) return;

    root.querySelectorAll('[data-ytgc-hidden="ytgc-game-room"]').forEach((section) => {
      if (!settings.hideGameRoom || !isGameRoomSection(section)) {
        section.style.display = "";
        section.removeAttribute("data-ytgc-hidden");
      }
    });

    if (!settings.hideGameRoom) return;

    const sections = root.querySelectorAll(SECTION_RENDERERS.join(","));
    sections.forEach((section) => {
      if (isGameRoomSection(section)) {
        section.style.display = "none";
        section.setAttribute("data-ytgc-hidden", "ytgc-game-room");
      }
    });
  }

  function filterAll(root = document) {
    if (!settings.enabled || !hasAnyFilter()) {
      // フィルタ無効化: 過去に隠したものを戻す
      if (root.querySelectorAll) {
        root.querySelectorAll("[data-ytgc-hidden]").forEach((c) => {
          c.style.display = "";
          c.removeAttribute("data-ytgc-hidden");
        });
      }
      return;
    }
    filterSections(root);
    const cards = root.querySelectorAll
      ? root.querySelectorAll(VIDEO_RENDERERS.join(","))
      : [];
    cards.forEach(filterCard);
  }

  // ------------------------------------------------------------------
  // DOM 監視
  // ------------------------------------------------------------------
  let scheduled = false;
  function scheduleFilter() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      filterAll();
    });
  }

  const observer = new MutationObserver(() => scheduleFilter());

  function startObserving() {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    scheduleFilter();
  }

  // ------------------------------------------------------------------
  // ユーティリティ
  // ------------------------------------------------------------------
  function clampInt(v, min, max, fallback) {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function toKeywordArray(v) {
    if (typeof v === "string") v = v.split("\n");
    return (v || []).map((k) => (k || "").trim()).filter(Boolean);
  }

  function normalizeSettings(raw) {
    const s = { ...DEFAULTS, ...(raw || {}) };
    s.blockTitleKeywords = toKeywordArray(s.blockTitleKeywords);
    s.blockChannelKeywords = toKeywordArray(s.blockChannelKeywords);
    // 旧バージョンの blockKeywords が残っていればタイトル側へ移行
    if (raw && raw.blockKeywords && s.blockTitleKeywords.length === 0) {
      s.blockTitleKeywords = toKeywordArray(raw.blockKeywords);
    }
    return s;
  }

  // ------------------------------------------------------------------
  // 初期化
  // ------------------------------------------------------------------
  function refresh() {
    applyStyle();
    filterAll();
  }

  const storage =
    (typeof browser !== "undefined" && browser.storage && browser.storage.sync) ||
    (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) ||
    (typeof browser !== "undefined" && browser.storage && browser.storage.local) ||
    (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local);

  function loadSettings() {
    if (!storage) {
      refresh();
      return;
    }
    storage.get(DEFAULTS, (raw) => {
      settings = normalizeSettings(raw);
      refresh();
    });
  }

  const runtime =
    (typeof browser !== "undefined" && browser.storage) ||
    (typeof chrome !== "undefined" && chrome.storage);
  if (runtime && runtime.onChanged) {
    runtime.onChanged.addListener(() => loadSettings());
  }

  // document_start で走るため、head が無い場合に備える
  function init() {
    loadSettings();
    if (document.documentElement) startObserving();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      applyStyle();
      filterAll();
    });
  }
  init();
})();
