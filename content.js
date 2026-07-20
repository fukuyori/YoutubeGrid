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
  const SECONDARY_TOGGLE_ID = "ytgc-secondary-toggle";
  const SECONDARY_COLLAPSED_ATTR = "data-ytgc-secondary-collapsed";
  const SECONDARY_STORAGE_KEY = "ytgc-secondary-collapsed";

  let secondaryCollapsed = false;
  try {
    secondaryCollapsed = localStorage.getItem(SECONDARY_STORAGE_KEY) === "true";
  } catch (_error) {
    // localStorage を利用できない環境では、ページを開いている間だけ状態を保持する。
  }

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

      /* ---- 動画ページ右側（関連動画）の開閉 ---- */
      ytd-watch-flexy[${SECONDARY_COLLAPSED_ATTR}] #secondary {
        display: none !important;
      }
      ytd-watch-flexy[${SECONDARY_COLLAPSED_ATTR}] #primary {
        flex: 1 1 auto !important;
        width: 100% !important;
        max-width: none !important;
      }
      #${SECONDARY_TOGGLE_ID} {
        position: fixed;
        z-index: 2200;
        top: 50%;
        width: 30px;
        height: 52px;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, .18);
        border-radius: 16px 0 0 16px;
        background: rgba(33, 33, 33, .92);
        color: #fff;
        font: 24px/1 Arial, sans-serif;
        cursor: pointer;
        transform: translateY(-50%);
        box-shadow: 0 2px 8px rgba(0, 0, 0, .35);
        opacity: 0;
        transition: opacity .15s ease;
        overflow: visible;
      }
      /* 見た目は変えず、透明なホバー判定を上下左右へ広げる。 */
      #${SECONDARY_TOGGLE_ID}::before {
        content: "";
        position: absolute;
        inset: -70px -12px;
        pointer-events: auto;
      }
      #${SECONDARY_TOGGLE_ID}:hover,
      #${SECONDARY_TOGGLE_ID}:focus-visible {
        background: #3f3f3f;
        opacity: 1;
      }
      #${SECONDARY_TOGGLE_ID}:focus-visible {
        outline: 2px solid #3ea6ff;
        outline-offset: 2px;
      }
      #${SECONDARY_TOGGLE_ID}[hidden] {
        display: none !important;
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
  // 動画ページの右カラム（secondary）開閉
  // ------------------------------------------------------------------
  function getWatchSecondary(watch) {
    if (!watch) return null;
    return (
      watch.querySelector(":scope > #columns > #secondary.ytd-watch-flexy") ||
      watch.querySelector("#secondary.ytd-watch-flexy")
    );
  }

  function toggleSecondary() {
    secondaryCollapsed = !secondaryCollapsed;
    try {
      localStorage.setItem(SECONDARY_STORAGE_KEY, String(secondaryCollapsed));
    } catch (_error) {
      // 保存できなくても開閉機能自体は継続する。
    }
    updateSecondaryToggle();
  }

  function isSecondaryToggleEvent(event) {
    return event
      .composedPath()
      .some((node) => node && node.id === SECONDARY_TOGGLE_ID);
  }

  // YouTube 側がボタンまで届く前にイベントを止める場合に備え、
  // document_start で登録したキャプチャリスナーから操作する。
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!isSecondaryToggleEvent(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleSecondary();
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      if (!isSecondaryToggleEvent(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      // Enter / Space による click は pointerdown が発生しない。
      if (event.detail === 0) toggleSecondary();
    },
    true,
  );

  function positionSecondaryToggle(button, watch, secondary) {
    if (secondaryCollapsed) {
      button.style.left = "auto";
      button.style.right = "0";
      return;
    }

    const secondaryRect = secondary.getBoundingClientRect();
    const watchRect = watch.getBoundingClientRect();
    const boundary = Math.max(watchRect.left, secondaryRect.left);
    button.style.left = `${Math.round(boundary - button.offsetWidth)}px`;
    button.style.right = "auto";
  }

  function updateSecondaryToggle() {
    const watch = document.querySelector("ytd-watch-flexy");
    const secondary = getWatchSecondary(watch);
    let button = document.getElementById(SECONDARY_TOGGLE_ID);

    if (!settings.enabled || !watch || !secondary) {
      if (button) button.remove();
      if (watch) watch.removeAttribute(SECONDARY_COLLAPSED_ATTR);
      if (secondary) {
        secondary.hidden = false;
        secondary.style.removeProperty("display");
      }
      return;
    }

    watch.toggleAttribute(SECONDARY_COLLAPSED_ATTR, secondaryCollapsed);
    if (secondaryCollapsed) {
      // YouTube が後から付与するインラインスタイルよりも確実に優先する。
      secondary.hidden = true;
      secondary.style.setProperty("display", "none", "important");
    } else {
      secondary.hidden = false;
      secondary.style.removeProperty("display");
    }

    if (!button) {
      button = document.createElement("button");
      button.id = SECONDARY_TOGGLE_ID;
      button.type = "button";
      document.body.appendChild(button);
    }

    const icon = secondaryCollapsed ? "‹" : "›";
    if (button.textContent !== icon) button.textContent = icon;
    button.title = secondaryCollapsed ? "関連動画を表示" : "関連動画を隠す";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-expanded", String(!secondaryCollapsed));
    button.hidden = !!document.fullscreenElement;
    positionSecondaryToggle(button, watch, secondary);
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
      updateSecondaryToggle();
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
    updateSecondaryToggle();
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
      updateSecondaryToggle();
    });
  }
  window.addEventListener("resize", () => requestAnimationFrame(updateSecondaryToggle));
  document.addEventListener("fullscreenchange", updateSecondaryToggle);
  init();
})();
