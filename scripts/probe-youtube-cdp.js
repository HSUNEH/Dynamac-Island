#!/usr/bin/env node
const http = require("node:http");
const net = require("node:net");
const crypto = require("node:crypto");

const DEFAULT_PORTS = [9222, 9223, 9224, 9225];

function parsePorts(value) {
  const text = String(value || "").trim();
  if (!text) return DEFAULT_PORTS;
  return text.split(",").map((item) => Number(item.trim())).filter((port) => Number.isInteger(port) && port > 0 && port < 65536);
}

function getJson(port, pathname, timeoutMs = 500) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: pathname, timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (_error) {
          resolve(null);
        }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

function websocketFrame(text) {
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(6);
    header[0] = 0x81;
    header[1] = 0x80 | payload.length;
    crypto.randomBytes(4).copy(header, 2);
  } else {
    header = Buffer.alloc(8);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
    crypto.randomBytes(4).copy(header, 4);
  }
  const maskOffset = header.length - 4;
  const mask = header.subarray(maskOffset);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([header, masked]);
}

function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      // DevTools responses for this probe should stay tiny. Ignore huge frames.
      break;
    }
    const masked = Boolean(second & 0x80);
    const maskLength = masked ? 4 : 0;
    const frameEnd = offset + headerLength + maskLength + length;
    if (frameEnd > buffer.length) break;
    const payloadStart = offset + headerLength + maskLength;
    let payload = buffer.subarray(payloadStart, frameEnd);
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }
    if (opcode === 1) messages.push(payload.toString("utf8"));
    offset = frameEnd;
  }
  return { messages, remaining: buffer.subarray(offset) };
}

function evaluateWebSocket(webSocketDebuggerUrl, expression, timeoutMs = 900) {
  return new Promise((resolve) => {
    const url = new URL(webSocketDebuggerUrl);
    const key = crypto.randomBytes(16).toString("base64");
    const socket = net.createConnection({ host: url.hostname, port: Number(url.port) || 80 });
    let handshaken = false;
    let handshakeBuffer = Buffer.alloc(0);
    let frameBuffer = Buffer.alloc(0);
    const id = 1;
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(null);
    }, timeoutMs);

    function finish(value) {
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    }

    socket.on("connect", () => {
      socket.write([
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.host}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        "",
        ""
      ].join("\r\n"));
    });

    socket.on("data", (chunk) => {
      if (!handshaken) {
        handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
        const marker = handshakeBuffer.indexOf("\r\n\r\n");
        if (marker === -1) return;
        const head = handshakeBuffer.subarray(0, marker).toString("utf8");
        const rest = handshakeBuffer.subarray(marker + 4);
        if (!/^HTTP\/1\.1 101/i.test(head)) return finish(null);
        handshaken = true;
        socket.write(websocketFrame(JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: {
            expression,
            awaitPromise: false,
            returnByValue: true,
            userGesture: false
          }
        })));
        if (!rest.length) return;
        chunk = rest;
      }
      frameBuffer = Buffer.concat([frameBuffer, chunk]);
      const decoded = decodeFrames(frameBuffer);
      frameBuffer = decoded.remaining;
      for (const message of decoded.messages) {
        try {
          const payload = JSON.parse(message);
          if (payload.id !== id) continue;
          if (payload.result?.exceptionDetails) return finish(null);
          const value = payload.result?.result?.value;
          return finish(typeof value === "string" ? value : JSON.stringify(value || null));
        } catch (_error) {
          // Ignore unrelated DevTools events.
        }
      }
    });
    socket.on("error", () => finish(null));
    socket.on("end", () => finish(null));
  });
}

function youtubePageProbeJavaScript() {
  return `(() => {
    const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
    const meta = (selector) => document.querySelector(selector)?.content || '';
    const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\\s+/g, ' ').trim() || '';
    const player = document.getElementById('movie_player');
    const videos = Array.from(document.querySelectorAll('video'));
    const video = document.querySelector('#movie_player video.video-stream') || document.querySelector('video.html5-main-video') || videos.find((item) => finite(item.duration) > 0) || videos[0] || null;
    const title = text('h1 yt-formatted-string') || meta('meta[property="og:title"]') || document.title.replace(/ - YouTube$/, '').trim();
    const artist = text('#owner #channel-name a') || text('#text.ytd-channel-name') || text('ytd-channel-name a') || 'YouTube';
    const artworkUrl = meta('meta[property="og:image"]');
    const durationSeconds = finite(player?.getDuration?.()) || finite(video?.duration);
    const positionSeconds = finite(player?.getCurrentTime?.()) || finite(video?.currentTime);
    const playerState = Number(player?.getPlayerState?.());
    const playbackState = playerState === 1 ? 'playing' : (playerState === 2 || playerState === 0 ? 'paused' : (video ? (video.paused ? 'paused' : 'playing') : 'unknown'));
    return JSON.stringify({ title, artist, album: 'YouTube', artworkUrl, durationSeconds, positionSeconds, playbackState });
  })()`;
}

function isYouTubeUrl(url) {
  return /(?:youtube\.com\/watch|music\.youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/i.test(String(url || ""));
}

async function main() {
  const ports = parsePorts(process.argv[2] || process.env.DYNAMAC_CDP_PORTS || process.env.DYNAMAC_CHROME_DEBUG_PORTS);
  const expression = youtubePageProbeJavaScript();
  for (const port of ports) {
    const targets = await getJson(port, "/json/list");
    if (!Array.isArray(targets)) continue;
    const pages = targets.filter((target) => target.type === "page" && isYouTubeUrl(target.url) && target.webSocketDebuggerUrl);
    for (const page of pages) {
      const payload = await evaluateWebSocket(page.webSocketDebuggerUrl, expression);
      if (payload) {
        process.stdout.write(`youtube-json||${payload}||${page.url}\n`);
        return;
      }
    }
  }
}

main().catch(() => process.exit(0));
