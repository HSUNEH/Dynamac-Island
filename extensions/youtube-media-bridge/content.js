(() => {
  const endpoint = "http://127.0.0.1:17654/youtube-media";
  let lastSignature = "";

  const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const meta = (selector) => document.querySelector(selector)?.content || "";
  const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || "";

  function readPlayer() {
    const player = document.getElementById("movie_player");
    const videos = Array.from(document.querySelectorAll("video"));
    const video = document.querySelector("#movie_player video.video-stream")
      || document.querySelector("video.html5-main-video")
      || videos.find((item) => finite(item.duration) > 0)
      || videos[0]
      || null;
    const title = text("h1 yt-formatted-string") || meta('meta[property="og:title"]') || document.title.replace(/ - YouTube$/, "").trim();
    const artist = text("#owner #channel-name a") || text("#text.ytd-channel-name") || text("ytd-channel-name a") || "YouTube";
    const durationSeconds = finite(player?.getDuration?.()) || finite(video?.duration);
    const positionSeconds = finite(player?.getCurrentTime?.()) || finite(video?.currentTime);
    const playerState = Number(player?.getPlayerState?.());
    const playbackState = playerState === 1
      ? "playing"
      : ((playerState === 2 || playerState === 0) ? "paused" : (video ? (video.paused ? "paused" : "playing") : "unknown"));
    return {
      source: "youtube",
      title: title || "YouTube",
      artist,
      album: "YouTube",
      artworkUrl: meta('meta[property="og:image"]'),
      durationSeconds,
      positionSeconds,
      playbackState,
      pageUrl: location.href,
      browserName: navigator.userAgentData?.brands?.map((brand) => brand.brand).join(", ") || navigator.userAgent
    };
  }

  async function publish() {
    const payload = readPlayer();
    if (!payload.durationSeconds && payload.playbackState === "unknown") return;
    const signature = JSON.stringify({
      title: payload.title,
      playbackState: payload.playbackState,
      positionBucket: Math.floor(payload.positionSeconds),
      durationSeconds: Math.floor(payload.durationSeconds),
      pageUrl: payload.pageUrl
    });
    if (signature === lastSignature) return;
    lastSignature = signature;
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true
      });
    } catch (_error) {
      // Dynamac bridge is optional; stay quiet when it is not running.
    }
  }

  publish();
  setInterval(publish, 750);
  document.addEventListener("visibilitychange", publish);
})();
