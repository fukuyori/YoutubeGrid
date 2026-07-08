/* options page logic */
(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    itemsPerRow: 6,
    searchColumns: 2,
    blockTitleKeywords: [],
    blockChannelKeywords: [],
    caseSensitive: false,
    hideShorts: false,
    hideGameRoom: false,
  };

  const api = typeof browser !== "undefined" ? browser : chrome;
  const storage =
    (api.storage && api.storage.sync) || (api.storage && api.storage.local);

  const $ = (id) => document.getElementById(id);

  function load() {
    storage.get(DEFAULTS, (raw) => {
      const s = { ...DEFAULTS, ...raw };
      $("enabled").checked = !!s.enabled;
      $("itemsPerRow").value = s.itemsPerRow;
      $("searchColumns").value = s.searchColumns;
      $("caseSensitive").checked = !!s.caseSensitive;
      $("hideShorts").checked = !!s.hideShorts;
      $("hideGameRoom").checked = !!s.hideGameRoom;
      $("blockTitleKeywords").value = toLines(s.blockTitleKeywords);
      $("blockChannelKeywords").value = toLines(s.blockChannelKeywords);
    });
  }

  function showVersion() {
    if (!api.runtime || !api.runtime.getManifest) return;
    const manifest = api.runtime.getManifest();
    const version = manifest.version_name || manifest.version;
    if (version) $("version").textContent = `v${version}`;
  }

  function toLines(v) {
    const arr = Array.isArray(v) ? v : String(v || "").split("\n");
    return arr.filter(Boolean).join("\n");
  }

  function fromLines(id) {
    return $(id)
      .value.split("\n")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  function save() {
    const data = {
      enabled: $("enabled").checked,
      itemsPerRow: clamp($("itemsPerRow").value, 1, 12, 6),
      searchColumns: clamp($("searchColumns").value, 1, 8, 2),
      caseSensitive: $("caseSensitive").checked,
      hideShorts: $("hideShorts").checked,
      hideGameRoom: $("hideGameRoom").checked,
      blockTitleKeywords: fromLines("blockTitleKeywords"),
      blockChannelKeywords: fromLines("blockChannelKeywords"),
    };
    storage.set(data, () => {
      const status = $("status");
      status.textContent = "保存しました";
      setTimeout(() => (status.textContent = ""), 1500);
    });
  }

  function clamp(v, min, max, fallback) {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  document.addEventListener("DOMContentLoaded", () => {
    showVersion();
    load();
    $("save").addEventListener("click", save);
  });
})();
