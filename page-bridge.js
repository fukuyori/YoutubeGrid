(() => {
  "use strict";

  const script = document.currentScript;
  const responseEvent = script?.dataset?.ytgcResponseEvent;
  if (!responseEvent) return;

  let tracks = null;
  let transcriptParams = null;
  let apiKey = null;
  let context = null;

  function findTranscriptParams(root) {
    if (!root || typeof root !== "object") return null;
    const queue = [root];
    const seen = new Set();
    let inspected = 0;
    while (queue.length > 0 && inspected < 20000) {
      const value = queue.shift();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      inspected++;
      if (value.getTranscriptEndpoint?.params) {
        return value.getTranscriptEndpoint.params;
      }
      for (const child of Object.values(value)) {
        if (child && typeof child === "object") queue.push(child);
      }
    }
    return null;
  }

  try {
    const watchFlexy = document.querySelector("ytd-watch-flexy");
    tracks =
      watchFlexy?.playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks ||
      watchFlexy?.data?.playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ||
      window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!tracks && window.ytplayer?.config?.args?.raw_player_response) {
      const rawResponse = window.ytplayer.config.args.raw_player_response;
      const playerResponse =
        typeof rawResponse === "string" ? JSON.parse(rawResponse) : rawResponse;
      tracks =
        playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    }
    transcriptParams = findTranscriptParams(window.ytInitialData);
    apiKey = window.ytcfg?.get?.("INNERTUBE_API_KEY") || null;
    context = window.ytcfg?.get?.("INNERTUBE_CONTEXT") || null;
  } catch (_error) {
    tracks = null;
  }

  // Firefoxではページ領域のオブジェクトをCustomEvent.detailに直接渡せないため、
  // JSON文字列に変換してコンテンツスクリプトへ返す。
  window.dispatchEvent(
    new CustomEvent(responseEvent, {
      detail: JSON.stringify({
        tracks: Array.isArray(tracks) ? tracks : [],
        transcriptParams,
        apiKey,
        context,
      }),
    })
  );
})();
