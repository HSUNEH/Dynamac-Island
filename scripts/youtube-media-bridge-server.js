#!/usr/bin/env node
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const port = Number(process.env.DYNAMAC_YOUTUBE_BRIDGE_PORT || 17654);
const outputPath = process.env.DYNAMAC_YOUTUBE_MEDIA_FILE || path.join(repoRoot, ".build", "youtube-media.json");

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, outputPath });
  if (req.method !== "POST" || req.url !== "/youtube-media") return send(res, 404, { ok: false });

  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 65536) req.destroy();
  });
  req.on("end", () => {
    try {
      const payload = JSON.parse(body || "{}");
      const normalized = {
        source: "youtube",
        title: String(payload.title || "YouTube"),
        artist: String(payload.artist || "YouTube"),
        album: "YouTube",
        artworkUrl: String(payload.artworkUrl || ""),
        durationSeconds: Number(payload.durationSeconds || 0),
        positionSeconds: Number(payload.positionSeconds || 0),
        playbackState: String(payload.playbackState || "unknown"),
        pageUrl: String(payload.pageUrl || ""),
        browserName: String(payload.browserName || "Browser"),
        updatedAt: new Date().toISOString()
      };
      writeJsonAtomic(outputPath, normalized);
      send(res, 200, { ok: true });
    } catch (error) {
      send(res, 400, { ok: false, error: error.message });
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`DYNAMAC_YOUTUBE_BRIDGE_READY port=${port} output=${outputPath}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(130)));
