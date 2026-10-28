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
    enableSubtitles: true, // 字幕の一括表示・ダウンロード機能
  };

  let settings = { ...DEFAULTS };

  const SUBTITLE_BTN_ID = "ytgc-subtitles-btn";
  const SUBTITLE_MODAL_ID = "ytgc-subtitle-modal";
  const SUBTITLE_PANEL_ATTR = "data-ytgc-subtitle-panel-open";
  const TRANSCRIPT_READING_ATTR = "data-ytgc-reading-transcript";
  const TRANSCRIPT_SUPPRESS_ATTR = "data-ytgc-suppress-transcript";
  let suppressedTranscriptVideoId = null;

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
    "ytm-shorts-lockup-view-model-v2",
    "ytm-shorts-lockup-view-model",
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
    "ytd-reel-shelf-renderer",
    "ytd-rich-section-renderer",
    "ytd-rich-shelf-renderer",
    "ytd-shelf-renderer",
    "ytd-horizontal-card-list-renderer",
    "grid-shelf-view-model",
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
      ytm-shorts-lockup-view-model-v2,
      ytm-shorts-lockup-view-model,
      grid-shelf-view-model:has(ytm-shorts-lockup-view-model-v2),
      grid-shelf-view-model:has(ytm-shorts-lockup-view-model),
      grid-shelf-view-model:has(a[href^="/shorts/"]),
      ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]) {
        display: none !important;
      }
      `;
    }

    if (settings.enableSubtitles) {
      css += `
      /* ---- 字幕ボタン & 字幕一括表示/DLモーダル ---- */
      #${SUBTITLE_BTN_ID} {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 36px;
        padding: 0 14px;
        margin-left: 8px;
        border: none;
        border-radius: 18px;
        background: var(--yt-spec-badge-chip-background, rgba(255, 255, 255, 0.1));
        color: var(--yt-spec-text-primary, #f1f1f1);
        font-family: Roboto, Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s ease, transform 0.1s ease;
        user-select: none;
        z-index: 100;
      }
      #${SUBTITLE_BTN_ID}:hover {
        background: var(--yt-spec-button-chip-background-hover, rgba(255, 255, 255, 0.2));
      }
      #${SUBTITLE_BTN_ID}:active {
        transform: scale(0.97);
      }
      #${SUBTITLE_BTN_ID} svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }

      /* 字幕モーダルダイアログ */
      #${SUBTITLE_MODAL_ID} {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background: rgba(0, 0, 0, 0.72);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: Roboto, Arial, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
      }
      #${SUBTITLE_MODAL_ID}.ytgc-active {
        opacity: 1;
        pointer-events: auto;
      }
      #${SUBTITLE_MODAL_ID} .ytgc-modal-card {
        background: #0f0f0f;
        color: #f1f1f1;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 16px;
        width: min(840px, 92vw);
        height: min(740px, 86vh);
        display: flex;
        flex-direction: column;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8);
        overflow: hidden;
        transform: scale(0.95);
        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      #${SUBTITLE_MODAL_ID}.ytgc-active .ytgc-modal-card {
        transform: scale(1);
      }
      #${SUBTITLE_MODAL_ID}.ytgc-side-panel {
        position: sticky;
        inset: auto;
        top: 64px;
        z-index: 10;
        width: 100%;
        height: calc(100vh - 80px);
        min-height: 420px;
        max-height: 760px;
        background: transparent;
        backdrop-filter: none;
        opacity: 1;
        pointer-events: auto;
        display: block;
      }
      #${SUBTITLE_MODAL_ID}.ytgc-side-panel .ytgc-modal-card {
        width: 100%;
        height: 100%;
        border-radius: 12px;
        box-shadow: none;
        transform: none;
      }
      ytd-watch-flexy[${SUBTITLE_PANEL_ATTR}] #secondary > :not(#${SUBTITLE_MODAL_ID}) {
        position: absolute !important;
        width: 100% !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      #${SUBTITLE_MODAL_ID}.ytgc-side-panel .ytgc-modal-header {
        padding: 12px 14px;
      }
      #${SUBTITLE_MODAL_ID}.ytgc-side-panel .ytgc-modal-subtitle {
        max-width: 260px;
      }
      #${SUBTITLE_MODAL_ID}.ytgc-side-panel .ytgc-modal-toolbar {
        padding: 10px 12px;
      }
      #${SUBTITLE_MODAL_ID}.ytgc-side-panel .ytgc-toolbar-left,
      #${SUBTITLE_MODAL_ID}.ytgc-side-panel .ytgc-toolbar-right {
        width: 100%;
      }
      #${SUBTITLE_MODAL_ID}.ytgc-side-panel .ytgc-input {
        min-width: 120px;
        flex: 1;
      }
      #${SUBTITLE_MODAL_ID}.ytgc-side-panel .ytgc-modal-body {
        padding: 10px 12px;
        gap: 2px;
      }
      #${SUBTITLE_MODAL_ID}.ytgc-side-panel .ytgc-sub-line {
        padding: 3px 6px;
        line-height: 1.35;
      }
      html[${TRANSCRIPT_READING_ATTR}]
        ytd-engagement-panel-section-list-renderer[target-id*="transcript"] {
        opacity: 0 !important;
        pointer-events: none !important;
      }
      html[${TRANSCRIPT_SUPPRESS_ATTR}]
        ytd-engagement-panel-section-list-renderer[target-id*="transcript"] {
        display: none !important;
      }
      .ytgc-modal-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .ytgc-modal-popout {
        font-size: 16px;
      }

      /* ヘッダー */
      .ytgc-modal-header {
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #181818;
      }
      .ytgc-modal-title-group {
        display: flex;
        align-items: center;
        gap: 10px;
        overflow: hidden;
      }
      .ytgc-modal-icon {
        width: 24px;
        height: 24px;
        fill: #3ea6ff;
        flex-shrink: 0;
      }
      .ytgc-modal-title {
        font-size: 16px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ytgc-modal-subtitle {
        font-size: 12px;
        color: #aaa;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ytgc-modal-close {
        background: transparent;
        border: none;
        color: #aaa;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        transition: background 0.2s, color 0.2s;
        flex-shrink: 0;
      }
      .ytgc-modal-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }

      /* ツールバー */
      .ytgc-modal-toolbar {
        padding: 12px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.02);
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
      }
      .ytgc-toolbar-left, .ytgc-toolbar-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .ytgc-select, .ytgc-input {
        background: #222;
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 13px;
        outline: none;
      }
      .ytgc-select:focus, .ytgc-input:focus {
        border-color: #3ea6ff;
      }
      .ytgc-input {
        width: 180px;
      }
      .ytgc-btn-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: #f1f1f1;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: background 0.2s;
      }
      .ytgc-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.16);
      }
      .ytgc-btn-primary {
        background: #3ea6ff;
        color: #0f0f0f;
        border: none;
        border-radius: 8px;
        padding: 6px 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: opacity 0.2s;
      }
      .ytgc-btn-primary:hover {
        opacity: 0.9;
      }

      /* トグルコントロール */
      .ytgc-checkbox-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: #ccc;
        cursor: pointer;
        user-select: none;
      }

      /* 本文エリア */
      .ytgc-modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .ytgc-modal-body::-webkit-scrollbar {
        width: 8px;
      }
      .ytgc-modal-body::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 4px;
      }

      .ytgc-sub-line {
        display: flex;
        align-items: baseline;
        gap: 12px;
        padding: 6px 8px;
        border-radius: 6px;
        transition: background 0.15s;
        line-height: 1.5;
        font-size: 14px;
        cursor: pointer;
      }
      .ytgc-sub-line:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .ytgc-sub-line.ytgc-current-subtitle {
        background: rgba(62, 166, 255, 0.18);
        box-shadow: inset 3px 0 #3ea6ff;
      }
      .ytgc-sub-time {
        color: #3ea6ff;
        font-family: ui-monospace, monospace;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(62, 166, 255, 0.1);
        flex-shrink: 0;
        text-decoration: none;
      }
      .ytgc-sub-time:hover {
        background: rgba(62, 166, 255, 0.25);
        text-decoration: underline;
      }
      .ytgc-sub-text {
        color: #e1e1e1;
        word-break: break-word;
      }
      .ytgc-highlight {
        background: rgba(255, 215, 0, 0.3);
        color: #fff;
        border-radius: 2px;
        padding: 0 2px;
      }

      /* ローディング / エラー状態 */
      .ytgc-status-msg {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #aaa;
        gap: 12px;
        font-size: 14px;
        padding: 40px;
        text-align: center;
      }

      /* フッター */
      .ytgc-modal-footer {
        padding: 10px 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        background: #141414;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        color: #888;
      }
      .ytgc-toast {
        color: #4caf50;
        font-weight: 500;
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
      const styleParent = document.head || document.documentElement;
      if (!styleParent) return;
      el = document.createElement("style");
      el.id = STYLE_ID;
      styleParent.appendChild(el);
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

  function isShortsSection(section) {
    if (
      section.matches("ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]") ||
      section.querySelector(
        [
          "ytd-reel-item-renderer",
          "ytd-rich-shelf-renderer[is-shorts]",
          "ytm-shorts-lockup-view-model-v2",
          "ytm-shorts-lockup-view-model",
          'a[href^="/shorts/"]',
        ].join(","),
      )
    ) {
      return true;
    }
    return /(^|\s)shorts?(\s|$)/i.test(sectionTitle(section));
  }

  function isGameRoomSection(section) {
    const text = (section.textContent || "").replace(/\s+/g, " ");
    return /ゲームルーム|YouTube\s*でプレイ|Playables/i.test(text);
  }

  function hideElement(element, reason) {
    // YouTube 側が display を再設定しても復活しないよう優先度を上げる。
    element.style.setProperty("display", "none", "important");
    element.setAttribute("data-ytgc-hidden", reason);
  }

  function restoreElement(element) {
    element.style.removeProperty("display");
    element.removeAttribute("data-ytgc-hidden");
  }

  function filterCard(card) {
    // 既に判定済みで、設定が変わっていなければスキップ
    if (settings.hideShorts && isShortsCard(card)) {
      hideElement(card, "ytgc-shorts");
      return;
    }

    if (
      !settings.hideShorts &&
      card.getAttribute("data-ytgc-hidden") === "ytgc-shorts"
    ) {
      restoreElement(card);
    }

    const title = getText(card, TITLE_SELECTORS);
    const channel = getText(card, CHANNEL_SELECTORS);
    if (!title && !channel) return; // まだ読み込まれていない

    const hit =
      matchesBlock(title, settings.blockTitleKeywords) ||
      matchesBlock(channel, settings.blockChannelKeywords);
    if (hit) {
      hideElement(card, hit);
    } else if (
      card.getAttribute("data-ytgc-hidden") !== null &&
      card.getAttribute("data-ytgc-hidden") !== "ytgc-shorts"
    ) {
      // 過去に非表示にしたが、設定変更で対象外になった場合は復帰
      restoreElement(card);
    }
  }

  function filterSections(root = document) {
    if (!root.querySelectorAll) return;

    root.querySelectorAll("[data-ytgc-hidden]").forEach((section) => {
      const reason = section.getAttribute("data-ytgc-hidden");
      const shouldRestore =
        (reason === "ytgc-game-room" && !settings.hideGameRoom) ||
        (reason === "ytgc-shorts-section" && !settings.hideShorts);
      if (shouldRestore) {
        restoreElement(section);
      }
    });

    const sections = root.querySelectorAll(SECTION_RENDERERS.join(","));
    sections.forEach((section) => {
      if (settings.hideShorts && isShortsSection(section)) {
        hideElement(section, "ytgc-shorts-section");
      } else if (settings.hideGameRoom && isGameRoomSection(section)) {
        hideElement(section, "ytgc-game-room");
      }
    });
  }

  function filterAll(root = document) {
    if (!settings.enabled || !hasAnyFilter()) {
      // フィルタ無効化: 過去に隠したものを戻す
      if (root.querySelectorAll) {
        root.querySelectorAll("[data-ytgc-hidden]").forEach((c) => {
          restoreElement(c);
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
      // YouTubeが初期化中にheadを再構築してstyle要素が失われた場合に復元する。
      if (!document.getElementById(STYLE_ID)) applyStyle();
      filterAll();
      updateSecondaryToggle();
      updateSubtitleButton();
    });
  }

  const observer = new MutationObserver(() => scheduleFilter());
  let observerStarted = false;

  function startObserving() {
    if (observerStarted || !document.documentElement) return;
    observerStarted = true;
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
  // 字幕取得 & 一括表示 / ダウンロード機能
  // ------------------------------------------------------------------

  function getCaptionTracks() {
    const watchFlexy = document.querySelector("ytd-watch-flexy");
    if (watchFlexy) {
      const tracks =
        watchFlexy.playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks ||
        watchFlexy.data?.playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks && tracks.length > 0) return tracks;
    }

    const scripts = Array.from(document.querySelectorAll("script"));
    for (const s of scripts) {
      const content = s.textContent || "";
      if (content.includes("captionTracks")) {
        const matchArray = content.match(/"captionTracks"\s*:\s*(\[\s*{.+?}\s*\])/);
        if (matchArray) {
          try {
            const tracks = JSON.parse(matchArray[1]);
            if (tracks && tracks.length > 0) return tracks;
          } catch (_e) {}
        }

        const matchObj = content.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
        if (matchObj) {
          try {
            const data = JSON.parse(matchObj[1]);
            const tracks =
              data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (tracks && tracks.length > 0) return tracks;
          } catch (_e) {}
        }
      }
    }
    return null;
  }

  function getVideoTitle() {
    const titleEl =
      document.querySelector("ytd-watch-metadata #title h1") ||
      document.querySelector("h1.ytd-watch-metadata") ||
      document.querySelector("#container > h1 > yt-formatted-string");
    return titleEl ? titleEl.textContent.trim() : "youtube_subtitle";
  }

  function decodeHtmlEntities(str) {
    if (!str) return "";
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
  }

  function parseXmlSubtitles(xmlText) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      const items = [];

      // Pattern 1: <text start="1.23" dur="2.34">text</text> (srv1)
      const textNodes = Array.from(xmlDoc.querySelectorAll("text"));
      if (textNodes.length > 0) {
        for (const node of textNodes) {
          const start = parseFloat(node.getAttribute("start") || "0");
          const dur = parseFloat(node.getAttribute("dur") || "0");
          const text = decodeHtmlEntities(node.textContent || "").replace(/\n/g, " ").trim();
          if (text) items.push({ start, dur, text });
        }
        if (items.length > 0) return items;
      }

      // Pattern 2: <p t="1230" d="2340"><s>part1</s><s>part2</s></p> (srv3)
      const pNodes = Array.from(xmlDoc.querySelectorAll("p"));
      if (pNodes.length > 0) {
        for (const node of pNodes) {
          const tMs = parseFloat(node.getAttribute("t") || "0");
          const dMs = parseFloat(node.getAttribute("d") || "0");
          const start = tMs / 1000;
          const dur = dMs / 1000;
          const text = decodeHtmlEntities(node.textContent || "").replace(/\n/g, " ").trim();
          if (text) items.push({ start, dur, text });
        }
        if (items.length > 0) return items;
      }
    } catch (_e) {}
    return [];
  }

  function parseVttSubtitles(vttText) {
    const items = [];
    const lines = vttText.split(/\r?\n/);
    const timeReg = /^(\d{2}:)?(\d{2}):(\d{2})[\.,](\d{3})\s*-->\s*(\d{2}:)?(\d{2}):(\d{2})[\.,](\d{3})/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(timeReg);
      if (match) {
        const h1 = parseInt(match[1] || "0", 10);
        const m1 = parseInt(match[2], 10);
        const s1 = parseInt(match[3], 10);
        const ms1 = parseInt(match[4], 10);
        const start = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000;

        const h2 = parseInt(match[5] || "0", 10);
        const m2 = parseInt(match[6], 10);
        const s2 = parseInt(match[7], 10);
        const ms2 = parseInt(match[8], 10);
        const end = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000;

        i++;
        const textLines = [];
        while (i < lines.length && lines[i].trim() !== "" && !timeReg.test(lines[i])) {
          const cleaned = lines[i].replace(/<[^>]+>/g, "").trim();
          if (cleaned) textLines.push(cleaned);
          i++;
        }
        i--;
        if (textLines.length > 0) {
          items.push({ start, dur: Math.max(0, end - start), text: textLines.join(" ") });
        }
      }
    }
    return items;
  }

  function getDomTranscriptItems() {
    const items = [];
    const segments = document.querySelectorAll(
      [
        "ytd-transcript-segment-renderer",
        ".ytd-transcript-segment-renderer",
        "transcript-segment-view-model",
        "yt-transcript-segment-view-model",
      ].join(", ")
    );
    segments.forEach((seg) => {
      const timeEl = seg.querySelector(
        "#timestamp, .segment-timestamp, [class*='timestamp']"
      );
      const textEl = seg.querySelector(
        "#segment-text, .segment-text, [class*='segment-text'], yt-formatted-string"
      );
      if (timeEl && textEl) {
        const timeStr = timeEl.textContent.trim();
        const parts = timeStr.split(":").map((p) => parseInt(p, 10));
        let start = 0;
        if (parts.length === 3) start = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) start = parts[0] * 60 + parts[1];
        const text = textEl.textContent.trim();
        if (text) items.push({ start, dur: 2, text });
      }
    });
    return items;
  }

  function waitForDomTranscript(timeoutMs = 12000) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        const items = getDomTranscriptItems();
        if (items.length > 0 || Date.now() - startedAt >= timeoutMs) {
          clearInterval(timer);
          resolve(items);
        }
      }, 200);
    });
  }

  async function fetchTranscriptFromYouTubePanel() {
    let items = getDomTranscriptItems();
    if (items.length > 0) return items;

    const selectors = [
      "ytd-video-description-transcript-section-renderer button",
      "ytd-video-description-transcript-section-renderer yt-button-shape button",
      "button[aria-label*='文字起こし']",
      "button[aria-label*='transcript' i]",
    ];
    let openButton = document.querySelector(selectors.join(", "));

    // 「文字起こし」セクションは概要欄を展開するまで生成されない場合がある。
    if (!openButton) {
      const expandButton = document.querySelector(
        "ytd-watch-metadata #description-inline-expander #expand, " +
        "ytd-text-inline-expander #expand, " +
        "tp-yt-paper-button#expand"
      );
      if (expandButton) {
        expandButton.click();
        await new Promise((resolve) => setTimeout(resolve, 300));
        openButton = document.querySelector(selectors.join(", "));
      }
    }

    if (!openButton) {
      const candidates = Array.from(
        document.querySelectorAll(
          "ytd-menu-service-item-renderer, tp-yt-paper-item, button, yt-button-shape"
        )
      );
      openButton = candidates.find((element) => {
        const label = (
          element.getAttribute("aria-label") ||
          element.textContent ||
          ""
        ).trim();
        return /文字起こしを表示|文字起こし|show transcript/i.test(label);
      });
    }

    if (openButton) {
      const clickable =
        openButton.matches("button, tp-yt-paper-item, ytd-menu-service-item-renderer")
          ? openButton
          : openButton.querySelector("button") || openButton;
      document.documentElement.setAttribute(TRANSCRIPT_READING_ATTR, "");
      try {
        clickable.click();
        items = await waitForDomTranscript();
      } finally {
        const transcriptPanel =
          document.querySelector(
            'ytd-engagement-panel-section-list-renderer[target-id*="transcript"]'
          ) ||
          document
            .querySelector(
              "ytd-transcript-segment-renderer, transcript-segment-view-model"
            )
            ?.closest("ytd-engagement-panel-section-list-renderer");
        const closeButton = transcriptPanel?.querySelector(
          "#visibility-button button, " +
          "button[aria-label*='閉じる'], " +
          "button[aria-label*='close' i]"
        );
        if (closeButton) closeButton.click();
        // プログラムで開いた公式パネルがYouTube内部に残ると、拡張機能の
        // サイドパネルを閉じた際に表へ現れるため、取得後に破棄する。
        if (transcriptPanel?.isConnected) transcriptPanel.remove();
        suppressedTranscriptVideoId = getVideoId();
        document.documentElement.setAttribute(TRANSCRIPT_SUPPRESS_ATTR, "");
        document.documentElement.removeAttribute(TRANSCRIPT_READING_ATTR);
      }
    }

    return items;
  }

  function extractTranscriptItems(data) {
    const items = [];
    const queue = [data];
    const seen = new Set();
    while (queue.length > 0) {
      const value = queue.shift();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);

      const segment =
        value.transcriptSegmentRenderer ||
        value.transcriptSegmentViewModel ||
        value.segmentViewModel;
      if (segment) {
        const startMs = Number(
          segment.startMs ?? segment.startTimeMs ?? segment.startTimeMilliseconds
        );
        const durationMs = Number(
          segment.durationMs ?? segment.durationMilliseconds ?? 0
        );
        const runs =
          segment.snippet?.runs ||
          segment.text?.runs ||
          segment.content?.runs ||
          [];
        const text =
          runs.map((run) => run.text || "").join("") ||
          segment.snippet?.simpleText ||
          segment.text?.simpleText ||
          segment.text ||
          "";
        if (Number.isFinite(startMs) && typeof text === "string" && text.trim()) {
          items.push({
            start: startMs / 1000,
            dur: durationMs / 1000,
            text: text.trim(),
          });
        }
      }

      for (const child of Object.values(value)) {
        if (child && typeof child === "object") queue.push(child);
      }
    }
    return items.sort((a, b) => a.start - b.start);
  }

  async function fetchTranscriptFromInternalAPI() {
    const config = modalState.transcriptApiConfig;
    if (!config?.params || !config?.apiKey || !config?.context) return [];
    try {
      const endpoint =
        `https://www.youtube.com/youtubei/v1/get_transcript` +
        `?key=${encodeURIComponent(config.apiKey)}&prettyPrint=false`;
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: config.context,
          params: config.params,
        }),
      });
      if (!response.ok) return [];
      return extractTranscriptItems(await response.json());
    } catch (_error) {
      return [];
    }
  }

  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    let v = urlParams.get("v");
    if (!v && window.location.pathname.startsWith("/shorts/")) {
      v = window.location.pathname.split("/")[2];
    }
    return v;
  }

  // 1. 同一ページのHTMLを取得して captionTracks を直接抽出 (CSP制限なし)
  async function fetchTracksFromPageHtml() {
    try {
      const res = await fetch(window.location.href, { credentials: "same-origin" });
      if (!res.ok) return null;
      const htmlText = await res.text();

      const matchArray = htmlText.match(/"captionTracks"\s*:\s*(\[\s*{.+?}\s*\])/);
      if (matchArray) {
        try {
          const tracks = JSON.parse(matchArray[1]);
          if (tracks && tracks.length > 0) return tracks;
        } catch (_e) {}
      }

      const matchObj = htmlText.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
      if (matchObj) {
        try {
          const data = JSON.parse(matchObj[1]);
          const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (tracks && tracks.length > 0) return tracks;
        } catch (_e) {}
      }
    } catch (_e) {}
    return null;
  }

  // YouTubei Player API から署名付き captionTracks を受領 (最も確実)
  async function fetchPlayerResponseFromAPI(videoId) {
    if (!videoId) return null;
    try {
      const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20240101.00.00",
              hl: "ja",
              gl: "JP"
            }
          },
          videoId: videoId
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        return tracks.map((t) => ({
          ...t,
          baseUrl: (t.baseUrl || "").replace(/\\u0026/g, "&").replace(/&amp;/g, "&")
        })).filter((t) => t.baseUrl);
      }
    } catch (_e) {}
    return null;
  }

  // 字幕データ取得処理
  async function fetchSubtitleItems(baseUrl) {
    if (!baseUrl) {
      const apiItems = await fetchTranscriptFromInternalAPI();
      return apiItems.length > 0 ? apiItems : fetchTranscriptFromYouTubePanel();
    }

    let cleanUrl = baseUrl
      .replace(/\\u0026/g, "&")
      .replace(/&amp;/g, "&");

    const baseWithoutFmt = cleanUrl
      .replace(/([?&])fmt=[^&]*/g, "$1")
      .replace(/[?&]$/, "");

    const urlsToTry = [
      cleanUrl,
      baseWithoutFmt.includes("?") ? `${baseWithoutFmt}&fmt=json3` : `${baseWithoutFmt}?fmt=json3`,
      baseWithoutFmt.includes("?") ? `${baseWithoutFmt}&fmt=srv1` : `${baseWithoutFmt}?fmt=srv1`,
      baseWithoutFmt.includes("?") ? `${baseWithoutFmt}&fmt=vtt` : `${baseWithoutFmt}?fmt=vtt`,
    ];

    for (const url of urlsToTry) {
      try {
        const res = await fetch(url, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) continue;
        const textData = await res.text();
        if (!textData || !textData.trim()) continue;

        const trimmed = textData.trim();

        // 1. JSON3
        if (trimmed.startsWith("{")) {
          try {
            const data = JSON.parse(trimmed);
            if (data && data.events && Array.isArray(data.events)) {
              const items = [];
              for (const ev of data.events) {
                if (!ev.segs || !Array.isArray(ev.segs)) continue;
                const start = (ev.tStartMs || 0) / 1000;
                const dur = (ev.dDurationMs || 0) / 1000;
                const text = ev.segs
                  .map((s) => s.utf8 || "")
                  .join("")
                  .replace(/[\r\n]+/g, " ")
                  .trim();
                if (text && text !== "") {
                  items.push({ start, dur, text });
                }
              }
              if (items.length > 0) return items;
            }
          } catch (_e) {}
        }

        // 2. WebVTT
        if (trimmed.includes("WEBVTT")) {
          const items = parseVttSubtitles(trimmed);
          if (items.length > 0) return items;
        }

        // 3. XML
        if (trimmed.includes("<") && trimmed.includes(">")) {
          const items = parseXmlSubtitles(trimmed);
          if (items.length > 0) return items;
        }
      } catch (_err) {}
    }

    const apiItems = await fetchTranscriptFromInternalAPI();
    if (apiItems.length > 0) return apiItems;

    return fetchTranscriptFromYouTubePanel();
  }

  function deduplicateSubtitleItems(items) {
    const seen = new Set();
    return (items || []).filter((item) => {
      const text = (item.text || "").replace(/\s+/g, " ").trim();
      // DOM内に同じ字幕パネルが複数生成される場合があるため、
      // 100ミリ秒単位の開始時刻と本文が一致する項目を1件にまとめる。
      const key = `${Math.round((item.start || 0) * 10)}\u0000${text}`;
      if (!text || seen.has(key)) return false;
      seen.add(key);
      item.text = text;
      return true;
    });
  }

  function formatTimestamp(seconds) {
    const sec = Math.floor(seconds);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function formatSrtTime(seconds) {
    const sec = Math.floor(seconds);
    const ms = Math.floor((seconds - sec) * 1000);
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    const mss = String(ms).padStart(3, "0");
    return `${h}:${m}:${s},${mss}`;
  }

  function formatVttTime(seconds) {
    return formatSrtTime(seconds).replace(",", ".");
  }

  function generateTxt(items, showTimestamp) {
    return items
      .map((item) =>
        showTimestamp
          ? `[${formatTimestamp(item.start)}] ${item.text}`
          : item.text
      )
      .join("\n");
  }

  function generateSrt(items) {
    return items
      .map((item, idx) => {
        const start = formatSrtTime(item.start);
        const end = formatSrtTime(item.start + (item.dur || 2));
        return `${idx + 1}\n${start} --> ${end}\n${item.text}\n`;
      })
      .join("\n");
  }

  function generateVtt(items) {
    const body = items
      .map((item) => {
        const start = formatVttTime(item.start);
        const end = formatVttTime(item.start + (item.dur || 2));
        return `${start} --> ${end}\n${item.text}\n`;
      })
      .join("\n");
    return `WEBVTT\n\n${body}`;
  }

  function downloadFile(filename, content, mimeType = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function seekToTime(seconds) {
    const video = document.querySelector("video");
    if (video) {
      video.currentTime = seconds;
      video.play().catch(() => {});
    }
  }

  let modalState = {
    captionTracks: [],
    currentTrackUrl: "",
    items: [],
    filteredItems: [],
    showTimestamp: true,
    searchQuery: "",
    videoTitle: "",
    currentActiveIndex: -1,
    playbackTimer: null,
    transcriptApiConfig: null,
  };

  function createSubtitleModal() {
    let modal = document.getElementById(SUBTITLE_MODAL_ID);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = SUBTITLE_MODAL_ID;
    modal.innerHTML = `
      <div class="ytgc-modal-card">
        <div class="ytgc-modal-header">
          <div class="ytgc-modal-title-group">
            <svg class="ytgc-modal-icon" viewBox="0 0 24 24">
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-9 3h2v2h-2V7zm0 4h2v2h-2v-2zm-4-4h2v2H7V7zm0 4h2v2H7v-2zm9 6H8v-2h8v2zm3-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>
            </svg>
            <div>
              <div class="ytgc-modal-title">字幕一覧・ダウンロード</div>
              <div class="ytgc-modal-subtitle" id="ytgc-modal-video-title">動画タイトル</div>
            </div>
          </div>
          <div class="ytgc-modal-header-actions">
            <button type="button" class="ytgc-modal-close ytgc-modal-popout" id="ytgc-modal-popout" title="大きく表示">↗</button>
            <button type="button" class="ytgc-modal-close" id="ytgc-modal-close" title="閉じる">&times;</button>
          </div>
        </div>

        <div class="ytgc-modal-toolbar">
          <div class="ytgc-toolbar-left">
            <select class="ytgc-select" id="ytgc-track-select" title="言語選択"></select>
            <label class="ytgc-checkbox-label">
              <input type="checkbox" id="ytgc-show-time" checked />
              タイムスタンプ
            </label>
            <input type="text" class="ytgc-input" id="ytgc-search-input" placeholder="字幕を検索..." />
          </div>
          <div class="ytgc-toolbar-right">
            <button type="button" class="ytgc-btn-secondary" id="ytgc-btn-copy" title="テキストをコピー">📋 コピー</button>
            <button type="button" class="ytgc-btn-secondary" id="ytgc-btn-dl-txt" title="テキスト保存">.txt DL</button>
            <button type="button" class="ytgc-btn-secondary" id="ytgc-btn-dl-srt" title="SRT字幕保存">.srt DL</button>
            <button type="button" class="ytgc-btn-primary" id="ytgc-btn-dl-vtt" title="VTT字幕保存">.vtt DL</button>
          </div>
        </div>

        <div class="ytgc-modal-body" id="ytgc-modal-body">
          <div class="ytgc-status-msg">字幕データを読み込んでいます...</div>
        </div>

        <div class="ytgc-modal-footer">
          <div id="ytgc-modal-count">0 行</div>
          <div id="ytgc-modal-toast" class="ytgc-toast"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector("#ytgc-modal-close");
    closeBtn.addEventListener("click", closeSubtitleModal);
    modal.querySelector("#ytgc-modal-popout").addEventListener("click", () => {
      showSubtitleAsModal();
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeSubtitleModal();
    });

    const trackSelect = modal.querySelector("#ytgc-track-select");
    trackSelect.addEventListener("change", (e) => {
      modalState.currentTrackUrl = e.target.value;
      loadSubtitleData();
    });

    const showTimeCb = modal.querySelector("#ytgc-show-time");
    showTimeCb.addEventListener("change", (e) => {
      modalState.showTimestamp = e.target.checked;
      renderSubtitleList();
    });

    const searchInput = modal.querySelector("#ytgc-search-input");
    searchInput.addEventListener("input", (e) => {
      modalState.searchQuery = e.target.value.toLowerCase().trim();
      renderSubtitleList();
    });

    modal.querySelector("#ytgc-btn-copy").addEventListener("click", () => {
      const text = generateTxt(modalState.filteredItems, modalState.showTimestamp);
      copyToClipboard(text).then(() => showToast("クリップボードにコピーしました！"));
    });

    modal.querySelector("#ytgc-btn-dl-txt").addEventListener("click", () => {
      const text = generateTxt(modalState.filteredItems, modalState.showTimestamp);
      const filename = `${sanitizeFilename(modalState.videoTitle)}_subtitles.txt`;
      downloadFile(filename, text);
      showToast(".txt ファイルを保存しました");
    });

    modal.querySelector("#ytgc-btn-dl-srt").addEventListener("click", () => {
      const srt = generateSrt(modalState.filteredItems);
      const filename = `${sanitizeFilename(modalState.videoTitle)}.srt`;
      downloadFile(filename, srt, "application/x-subrip");
      showToast(".srt ファイルを保存しました");
    });

    modal.querySelector("#ytgc-btn-dl-vtt").addEventListener("click", () => {
      const vtt = generateVtt(modalState.filteredItems);
      const filename = `${sanitizeFilename(modalState.videoTitle)}.vtt`;
      downloadFile(filename, vtt, "text/vtt;charset=utf-8");
      showToast(".vtt ファイルを保存しました");
    });

    return modal;
  }

  function sanitizeFilename(name) {
    return (name || "youtube_subtitle").replace(/[\\/:*?"<>|]/g, "_").slice(0, 100);
  }

  function showToast(msg) {
    const toast = document.getElementById("ytgc-modal-toast");
    if (toast) {
      toast.textContent = msg;
      setTimeout(() => {
        if (toast.textContent === msg) toast.textContent = "";
      }, 2500);
    }
  }

  function closeSubtitleModal() {
    const modal = document.getElementById(SUBTITLE_MODAL_ID);
    if (modal) {
      modal.classList.remove("ytgc-active", "ytgc-side-panel");
      if (modal.parentElement !== document.body) document.body.appendChild(modal);
    }
    const watch = document.querySelector("ytd-watch-flexy");
    if (watch) watch.removeAttribute(SUBTITLE_PANEL_ATTR);
    if (modalState.playbackTimer) {
      clearInterval(modalState.playbackTimer);
      modalState.playbackTimer = null;
    }
    modalState.currentActiveIndex = -1;
  }

  function showSubtitleAsModal() {
    const modal = createSubtitleModal();
    const watch = document.querySelector("ytd-watch-flexy");
    if (watch) watch.removeAttribute(SUBTITLE_PANEL_ATTR);
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    modal.classList.remove("ytgc-side-panel");
    modal.classList.add("ytgc-active");
    modal.querySelector("#ytgc-modal-popout").hidden = true;
  }

  function startSubtitlePlaybackSync() {
    if (modalState.playbackTimer) clearInterval(modalState.playbackTimer);
    modalState.playbackTimer = setInterval(syncSubtitlePlayback, 400);
    syncSubtitlePlayback();
  }

  function syncSubtitlePlayback() {
    const modal = document.getElementById(SUBTITLE_MODAL_ID);
    const video = document.querySelector("video");
    if (!modal || !video || modalState.filteredItems.length === 0) return;

    const currentTime = video.currentTime;
    let activeIndex = -1;
    for (let i = 0; i < modalState.filteredItems.length; i++) {
      if (modalState.filteredItems[i].start <= currentTime) activeIndex = i;
      else break;
    }
    if (activeIndex === modalState.currentActiveIndex) return;

    modal.querySelector(".ytgc-current-subtitle")?.classList.remove("ytgc-current-subtitle");
    modalState.currentActiveIndex = activeIndex;
    if (activeIndex < 0) return;

    const activeLine = modal.querySelector(`.ytgc-sub-line[data-index="${activeIndex}"]`);
    if (activeLine) {
      activeLine.classList.add("ytgc-current-subtitle");
      if (modal.classList.contains("ytgc-side-panel")) {
        activeLine.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }

  function getCaptionTracksFromMainWorld() {
    return new Promise((resolve) => {
      const eventName = "ytgc_caption_tracks_response_" + Math.random().toString(36).slice(2);
      let settled = false;

      function finish(tracks) {
        if (settled) return;
        settled = true;
        window.removeEventListener(eventName, handler);
        resolve(Array.isArray(tracks) ? tracks : null);
      }

      function handler(e) {
        try {
          const payload = JSON.parse(e.detail || "{}");
          if (Array.isArray(payload)) {
            finish(payload);
            return;
          }
          modalState.transcriptApiConfig = payload?.transcriptParams
            ? {
                params: payload.transcriptParams,
                apiKey: payload.apiKey,
                context: payload.context,
              }
            : null;
          finish(payload?.tracks);
        } catch (_error) {
          finish(null);
        }
      }
      window.addEventListener(eventName, handler);

      const script = document.createElement("script");
      const extensionRuntime =
        (typeof browser !== "undefined" && browser.runtime) ||
        (typeof chrome !== "undefined" && chrome.runtime);
      if (!extensionRuntime) {
        finish(null);
        return;
      }
      script.src = extensionRuntime.getURL("page-bridge.js");
      script.dataset.ytgcResponseEvent = eventName;
      script.addEventListener("load", () => script.remove(), { once: true });
      script.addEventListener("error", () => {
        script.remove();
        finish(null);
      }, { once: true });
      (document.head || document.documentElement).appendChild(script);

      setTimeout(() => {
        script.remove();
        finish(null);
      }, 1500);
    });
  }

  async function fetchTracksByVideoId(videoId) {
    if (!videoId) return [];
    try {
      const res = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&type=list`);
      if (!res.ok) return [];
      const xmlText = await res.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      const tracks = [];
      const trackNodes = Array.from(xmlDoc.querySelectorAll("track"));
      for (const node of trackNodes) {
        const langCode = node.getAttribute("lang_code") || "ja";
        const langName = node.getAttribute("lang_original") || node.getAttribute("lang_translated") || langCode;
        const kind = node.getAttribute("kind") || "";
        const nameAttr = node.getAttribute("name") || "";
        let baseUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${langCode}`;
        if (kind) baseUrl += `&kind=${kind}`;
        if (nameAttr) baseUrl += `&name=${encodeURIComponent(nameAttr)}`;

        tracks.push({
          baseUrl: baseUrl,
          name: { simpleText: langName + (kind === "asr" ? " (自動生成)" : "") },
          languageCode: langCode,
          kind: kind
        });
      }
      return tracks;
    } catch (_e) {
      return [];
    }
  }

  async function getCaptionTracksAsync() {
    // 字幕トラックと同時に内部文字起こしAPIの設定も受け取る。
    let tracks = await getCaptionTracksFromMainWorld();
    if (tracks && tracks.length > 0) return tracks;

    tracks = getCaptionTracks();
    if (tracks && tracks.length > 0) return tracks;

    const videoId = getVideoId();
    if (videoId) {
      tracks = await fetchPlayerResponseFromAPI(videoId);
      if (tracks && tracks.length > 0) return tracks;
    }

    tracks = await fetchTracksFromPageHtml();
    if (tracks && tracks.length > 0) return tracks;

    if (videoId) {
      tracks = await fetchTracksByVideoId(videoId);
      if (tracks && tracks.length > 0) return tracks;
    }

    return [];
  }

  async function openSubtitlePanel() {
    const modal = createSubtitleModal();
    const watch = document.querySelector("ytd-watch-flexy");
    const secondary = getWatchSecondary(watch);
    if (!watch || !secondary) {
      showSubtitleAsModal();
    } else {
      secondaryCollapsed = false;
      updateSecondaryToggle();
      watch.setAttribute(SUBTITLE_PANEL_ATTR, "");
      secondary.prepend(modal);
      modal.classList.add("ytgc-active", "ytgc-side-panel");
      modal.querySelector("#ytgc-modal-popout").hidden = false;
    }
    modalState.videoTitle = getVideoTitle();
    modal.querySelector("#ytgc-modal-video-title").textContent = modalState.videoTitle;
    modal.classList.add("ytgc-active");

    const bodyEl = modal.querySelector("#ytgc-modal-body");
    const trackSelect = modal.querySelector("#ytgc-track-select");
    bodyEl.innerHTML = `<div class="ytgc-status-msg">字幕トラックを読み込んでいます...</div>`;

    const tracks = await getCaptionTracksAsync();

    if (!tracks || tracks.length === 0) {
      bodyEl.innerHTML = `<div class="ytgc-status-msg">⚠️ この動画には利用可能な字幕データがありません。</div>`;
      trackSelect.innerHTML = "";
      modal.querySelector("#ytgc-modal-count").textContent = "0 行";
      return;
    }

    modalState.captionTracks = tracks;
    trackSelect.innerHTML = tracks
      .map((t) => {
        const name = t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode;
        const isAuto = t.kind === "asr" ? " (自動生成)" : "";
        return `<option value="${t.baseUrl}">${name}${isAuto}</option>`;
      })
      .join("");

    modalState.currentTrackUrl = tracks[0].baseUrl;
    await loadSubtitleData();
    startSubtitlePlaybackSync();
  }

  async function loadSubtitleData() {
    const modal = document.getElementById(SUBTITLE_MODAL_ID);
    if (!modal) return;
    const bodyEl = modal.querySelector("#ytgc-modal-body");
    bodyEl.innerHTML = `<div class="ytgc-status-msg">字幕データを読み込んでいます...</div>`;

    const items = deduplicateSubtitleItems(
      await fetchSubtitleItems(modalState.currentTrackUrl)
    );
    modalState.items = items;
    renderSubtitleList();
  }

  function renderSubtitleList() {
    const modal = document.getElementById(SUBTITLE_MODAL_ID);
    if (!modal) return;
    const bodyEl = modal.querySelector("#ytgc-modal-body");
    const countEl = modal.querySelector("#ytgc-modal-count");

    let items = modalState.items;
    if (modalState.searchQuery) {
      const q = modalState.searchQuery;
      items = items.filter((it) => it.text.toLowerCase().includes(q));
    }
    modalState.filteredItems = items;

    if (items.length === 0) {
      const message = modalState.searchQuery
        ? "該当する字幕が見つかりませんでした。"
        : "字幕本文を取得できませんでした。この動画では字幕データを利用できない可能性があります。";
      bodyEl.innerHTML = `<div class="ytgc-status-msg">${message}</div>`;
      countEl.textContent = "0 行";
      return;
    }

    const q = modalState.searchQuery;
    modalState.currentActiveIndex = -1;
    bodyEl.innerHTML = items
      .map((it, index) => {
        const timeStr = formatTimestamp(it.start);
        const timeHtml = modalState.showTimestamp
          ? `<span class="ytgc-sub-time" data-start="${it.start}">${timeStr}</span>`
          : "";

        let displayText = escapeHtml(it.text);
        if (q) {
          const reg = new RegExp(`(${escapeRegExp(q)})`, "gi");
          displayText = displayText.replace(reg, `<mark class="ytgc-highlight">$1</mark>`);
        }

        return `<div class="ytgc-sub-line" data-index="${index}" data-start="${it.start}">${timeHtml}<span class="ytgc-sub-text">${displayText}</span></div>`;
      })
      .join("");

    countEl.textContent = `${items.length} 行 (${items.reduce((acc, i) => acc + i.text.length, 0)} 文字)`;

    bodyEl.querySelectorAll(".ytgc-sub-line").forEach((line) => {
      line.addEventListener("click", () => {
        const start = parseFloat(line.getAttribute("data-start"));
        if (!isNaN(start)) seekToTime(start);
      });
    });
    bodyEl.querySelectorAll(".ytgc-sub-time").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const start = parseFloat(e.target.getAttribute("data-start"));
        if (!isNaN(start)) seekToTime(start);
      });
    });
    syncSubtitlePlayback();
  }

  function escapeHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function updateSubtitleButton() {
    const currentVideoId = getVideoId();
    if (
      suppressedTranscriptVideoId &&
      currentVideoId !== suppressedTranscriptVideoId
    ) {
      suppressedTranscriptVideoId = null;
      document.documentElement.removeAttribute(TRANSCRIPT_SUPPRESS_ATTR);
    }

    if (!settings.enabled || !settings.enableSubtitles) {
      const existing = document.getElementById(SUBTITLE_BTN_ID);
      if (existing) existing.remove();
      return;
    }

    if (!window.location.pathname.startsWith("/watch")) {
      const existing = document.getElementById(SUBTITLE_BTN_ID);
      if (existing) existing.remove();
      if (document.getElementById(SUBTITLE_MODAL_ID)?.classList.contains("ytgc-active")) {
        closeSubtitleModal();
      }
      return;
    }

    let btn = document.getElementById(SUBTITLE_BTN_ID);

    const targetContainer =
      document.querySelector("ytd-watch-metadata #actions-inner #top-level-buttons-computed") ||
      document.querySelector("ytd-watch-metadata #actions #top-level-buttons-computed") ||
      document.querySelector("#top-level-buttons-computed") ||
      document.querySelector("ytd-watch-metadata #actions-inner") ||
      document.querySelector("ytd-watch-metadata #owner");

    if (!targetContainer) return;

    if (!btn) {
      btn = document.createElement("button");
      btn.id = SUBTITLE_BTN_ID;
      btn.type = "button";
      btn.title = "動画の横に字幕を表示";
      btn.innerHTML = `
        <svg viewBox="0 0 24 24">
          <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-9 3h2v2h-2V7zm0 4h2v2h-2v-2zm-4-4h2v2H7V7zm0 4h2v2H7v-2zm9 6H8v-2h8v2zm3-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>
        </svg>
        <span>字幕</span>
      `;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const modal = document.getElementById(SUBTITLE_MODAL_ID);
        if (modal?.classList.contains("ytgc-active")) {
          closeSubtitleModal();
        } else {
          openSubtitlePanel();
        }
      });
    }

    if (!targetContainer.contains(btn)) {
      targetContainer.appendChild(btn);
    }
  }

  // ------------------------------------------------------------------
  // 初期化
  // ------------------------------------------------------------------
  function refresh() {
    applyStyle();
    filterAll();
    updateSecondaryToggle();
    updateSubtitleButton();
  }

  let refreshRetryTimers = [];
  function refreshWithRetries() {
    refreshRetryTimers.forEach((timer) => clearTimeout(timer));
    refreshRetryTimers = [];
    refresh();
    // YouTubeは初期データ取得後にグリッド要素とレイアウト変数を数段階で生成する。
    for (const delay of [200, 600, 1200, 2500]) {
      refreshRetryTimers.push(setTimeout(refresh, delay));
    }
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
    // ストレージ読込を待たず既定値のCSSを入れ、初回描画のレイアウトずれを防ぐ。
    applyStyle();
    loadSettings();
    startObserving();
    if (document.readyState !== "loading") refreshWithRetries();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      startObserving();
      refreshWithRetries();
    });
  }
  document.addEventListener("yt-navigate-start", applyStyle);
  document.addEventListener("yt-navigate-finish", refreshWithRetries);
  document.addEventListener("yt-page-data-updated", refreshWithRetries);
  window.addEventListener("pageshow", refreshWithRetries);
  window.addEventListener("resize", () => requestAnimationFrame(updateSecondaryToggle));
  document.addEventListener("fullscreenchange", updateSecondaryToggle);
  init();
})();
