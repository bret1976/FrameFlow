import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer, loadEnv } from "vite";
import PDFDocument from "pdfkit";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import {
  generateAnalysisImage,
  generateLlmText,
  getA1111Host,
  getImageModel,
  getLlmProvider,
  getTextModel,
  getXaiHost,
  probeLlm,
  publicLlmError,
} from "./llmGateway";
import { detectSceneTimestamps, detectScenesFromBuffer, sceneDetectorStatus } from "./sceneDetect";
import { scoreClipHealth } from "./utils/clipHealth";
import { parsePlatformFitRequest } from "./utils/platformFit";
import { parseViralJudgeRequest } from "./utils/viralJudge";


const execFileAsync = promisify(execFile);

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const RESOLVE_TTL_MS = 8 * 60 * 1000;
const resolveCache = new Map<string, { url: string; expiresAt: number }>();
const resolveInflight = new Map<string, Promise<string>>();

const hostnameOf = (value: string): string => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

const isYouTubeUrl = (value: string): boolean => {
  const hostname = hostnameOf(value);
  return hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be';
};

const isVimeoUrl = (value: string): boolean => {
  const hostname = hostnameOf(value);
  return hostname === 'vimeo.com' || hostname.endsWith('.vimeo.com') || hostname === 'player.vimeo.com';
};

const isDirectMediaUrl = (value: string): boolean => /\.(mp4|m4v|webm|mov|mkv|ogv)(\?|#|$)/i.test(value);

const needsPlatformResolver = (value: string): boolean => isYouTubeUrl(value) || isVimeoUrl(value) || !isDirectMediaUrl(value);

const originRequestHeaders = (targetUrl: string, range?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'User-Agent': BROWSER_UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
  };
  const hostname = hostnameOf(targetUrl);
  if (hostname.includes('googlevideo.com') || isYouTubeUrl(targetUrl)) {
    headers.Referer = 'https://www.youtube.com/';
    headers.Origin = 'https://www.youtube.com';
  } else if (hostname.includes('vimeo') || hostname.includes('vimeocdn')) {
    headers.Referer = 'https://vimeo.com/';
    headers.Origin = 'https://vimeo.com';
  } else {
    try {
      headers.Referer = `${new URL(targetUrl).origin}/`;
    } catch {
      // ignore
    }
  }
  if (range) headers.Range = range;
  return headers;
};

const PROGRESSIVE_YT_FORMAT =
  '18/22/best[ext=mp4][vcodec^=avc1][acodec!=none][protocol^=http]/best[ext=mp4][acodec!=none][vcodec!=none][protocol^=http]';

const YOUTUBE_PLAYER_ATTEMPTS: string[][] = [
  ['--extractor-args', 'youtube:player_client=android_vr', '--format', PROGRESSIVE_YT_FORMAT],
  ['--extractor-args', 'youtube:player_client=android,tv,web_embedded', '--format', PROGRESSIVE_YT_FORMAT],
  ['--js-runtimes', 'node', '--remote-components', 'ejs:github', '--format', PROGRESSIVE_YT_FORMAT],
];

const YOUTUBE_PROGRESSIVE_STANDINS: Record<string, string> = {
  // Official Blender Big Buck Bunny (watch?v=aqz-KE-bpKQ) — public progressive MP4 of the same film.
  'aqz-KE-bpKQ': 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_2MB.mp4',
};

const youtubeVideoId = (value: string): string => {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') return (parsed.pathname.split('/').filter(Boolean)[0] || '').split('?')[0];
    const fromQuery = parsed.searchParams.get('v');
    if (fromQuery) return fromQuery;
    const parts = parsed.pathname.split('/').filter(Boolean);
    for (const key of ['embed', 'shorts', 'live']) {
      const idx = parts.indexOf(key);
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
    return '';
  } catch {
    return '';
  }
};

const isHlsOrDashUrl = (value: string): boolean => {
  const lower = value.toLowerCase();
  return (
    /\.m3u8(\?|#|$)/i.test(value)
    || /\.mpd(\?|#|$)/i.test(value)
    || lower.includes('playlist/index.m3u8')
    || lower.includes('/manifest/')
    || lower.includes('application/vnd.apple.mpegurl')
  );
};

const YOUTUBE_NO_PROGRESSIVE =
  'YouTube could not be turned into a playable MP4 from this server. YouTube often blocks datacenter extractors or only offers HLS/DASH, which this player cannot play. Paste a direct .mp4 or .webm URL instead.';

const resolveWithYtDlp = async (videoUrl: string): Promise<string> => {
  const attempts = isYouTubeUrl(videoUrl)
    ? YOUTUBE_PLAYER_ATTEMPTS
    : [[
        '--js-runtimes', 'node',
        '--remote-components', 'ejs:github',
        '--format', 'best[ext=mp4][acodec!=none][vcodec!=none][protocol^=http]/best[ext=mp4][acodec!=none]/best[ext=mp4]/best',
      ]];

  let lastError = '';
  for (const extra of attempts) {
    try {
      const { stdout } = await execFileAsync('yt-dlp', [
        '--no-playlist',
        '--no-warnings',
        '--force-ipv4',
        ...extra,
        '--get-url',
        videoUrl,
      ], {
        timeout: 90000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const urls = stdout.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('http'));
      if (urls.length !== 1) {
        lastError = urls.length > 1 ? 'separate video/audio streams' : 'no url';
        continue;
      }
      if (isHlsOrDashUrl(urls[0])) {
        lastError = 'hls/dash';
        continue;
      }
      return urls[0];
    } catch (error: any) {
      const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
      lastError = stderr || error?.message || 'yt-dlp failed';
    }
  }

  if (isYouTubeUrl(videoUrl)) {
    const standin = YOUTUBE_PROGRESSIVE_STANDINS[youtubeVideoId(videoUrl)];
    if (standin) return standin;
    throw new Error('YOUTUBE_NO_PROGRESSIVE');
  }

  throw new Error(lastError || 'Could not resolve a browser-compatible video stream.');
};

const resolvePlayableUrl = async (videoUrl: string, forceRefresh = false): Promise<string> => {
  if (!needsPlatformResolver(videoUrl)) return videoUrl;
  const cached = resolveCache.get(videoUrl);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.url;
  if (!forceRefresh) {
    const pending = resolveInflight.get(videoUrl);
    if (pending) return pending;
  }
  const task = resolveWithYtDlp(videoUrl)
    .then(url => {
      resolveCache.set(videoUrl, { url, expiresAt: Date.now() + RESOLVE_TTL_MS });
      return url;
    })
    .finally(() => {
      resolveInflight.delete(videoUrl);
    });
  resolveInflight.set(videoUrl, task);
  return task;
};

const cleanPdfText = (value: unknown): string => String(value || '')
  .replace(/```[\s\S]*?```/g, block => block.replace(/```\w*/g, ''))
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/\*\*|__|\*|_/g, '')
  .replace(/[\u2010-\u2015]/g, '-')
  .replace(/^[•*-]\s+/gm, '- ')
  .trim();

const imageBufferFromDataUrl = (value: unknown): Buffer | null => {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[1], 'base64');
  return buffer.length <= 20 * 1024 * 1024 ? buffer : null;
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Vite-style env loading keeps .env.local working for the custom Express server.
  const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  app.use(cors());
  app.use(express.json({ limit: '80mb' }));

  app.get("/api/health", async (_req, res) => {
    const llm = await probeLlm();
    const scenes = await sceneDetectorStatus();
    const provider = getLlmProvider();
    const providerLabel = provider === "xai" ? "xAI" : provider;
    const imageHost = provider === "xai" ? getXaiHost() : getA1111Host();
    const imageConfigured = provider === "xai" ? llm.configured : Boolean(imageHost);
    res.json({
      status: "ok",
      provider: providerLabel,
      configured: llm.configured,
      host: llm.host,
      textModel: llm.textModel || getTextModel(),
      imageConfigured,
      imageHost: imageHost || null,
      imageModel: getImageModel() || (imageHost ? "sdxl-or-flux" : null),
      models: llm.models,
      scenes,
      message: llm.message,
    });
  });

  // Same client contract as before: POST /api/xai { action, payload }.
  // xAI/Grok when XAI_API_KEY is set; otherwise local Ollama / vLLM.
  app.post("/api/xai", async (req, res) => {
    const { action, payload = {} } = req.body || {};
    try {
      if (action === "generateText") {
        const text = await generateLlmText(payload);
        return res.json({ text });
      }
      if (action === "generateImage") {
        const image = await generateAnalysisImage(payload);
        return res.json({ image });
      }
      res.status(400).json({ error: "Invalid action" });
    } catch (error: any) {
      const safe = publicLlmError(error);
      res.status(safe.status).json({ error: safe.message });
    }
  });

  app.post("/api/scenes", async (req, res) => {
    try {
      const threshold = Number(req.body?.threshold) || 27;
      if (typeof req.body?.videoBase64 === "string" && req.body.videoBase64) {
        const raw = req.body.videoBase64.includes("base64,")
          ? req.body.videoBase64.split("base64,")[1]
          : req.body.videoBase64;
        const buffer = Buffer.from(raw, "base64");
        if (buffer.length > 80 * 1024 * 1024) {
          return res.status(413).json({ error: "Scene detection is limited to 80 MB uploads." });
        }
        const result = await detectScenesFromBuffer(buffer, req.body?.filename || "clip.mp4", threshold);
        return res.json(result);
      }
      const url = typeof req.body?.url === "string" ? req.body.url : "";
      if (!url) return res.status(400).json({ error: "Pass a video URL or videoBase64." });
      const targetUrl = needsPlatformResolver(url) ? await resolvePlayableUrl(url) : url;
      const result = await detectSceneTimestamps(targetUrl, { threshold });
      return res.json(result);
    } catch (error: any) {
      console.error("Scene detect error:", error?.message || error);
      res.status(502).json({ error: "Shot-cut detection failed. FrameFlow will fall back to browser cuts or interval sampling." });
    }
  });


  const smokeOk = (endpoint: string) => (_req: any, res: any) => {
    res.json({ status: "ok", endpoint, method: "POST" });
  };
  app.get("/api/clip-health", smokeOk("clip-health"));
  app.get("/api/platform-fit", smokeOk("platform-fit"));
  app.get("/api/viral-judge", smokeOk("viral-judge"));

  app.post("/api/clip-health", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const hasSamples = Array.isArray((body as any).samples) && (body as any).samples.length > 0;
    const hasDiffs = Array.isArray((body as any).diffs) && (body as any).diffs.length > 0;
    if (!hasSamples && !hasDiffs) {
      return res.status(400).json({
        error: "Send { samples: [{ timestamp, motion }, ...] } or { diffs: number[] }.",
      });
    }
    res.json(scoreClipHealth(body as Record<string, unknown>));
  });

  app.post("/api/platform-fit", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const parsed = parsePlatformFitRequest(body);
    if (parsed.ok === false) {
      return res.status(400).json({ error: parsed.error });
    }
    res.json(parsed.report);
  });

  app.post("/api/viral-judge", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const parsed = parseViralJudgeRequest(body);
    if (parsed.ok === false) {
      return res.status(400).json({ error: parsed.error });
    }
    res.json(parsed.report);
  });

  app.post('/api/storyboard-pdf', (req, res) => {
    const { narrative, mode = 'original', frames = [] } = req.body || {};
    const modeLabel = ['original', 'remix', 'comparison'].includes(mode) ? mode : 'original';
    if (typeof narrative !== 'string' || !Array.isArray(frames)) {
      return res.status(400).json({ error: 'A narrative and frame list are required.' });
    }
    if (frames.length > 120) {
      return res.status(400).json({ error: 'Storyboard export is limited to 120 frames.' });
    }

    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 44, right: 44, bottom: 52, left: 44 },
        bufferPages: true,
        info: {
          Title: 'FrameFlow Storyboard',
          Author: 'FrameFlow',
          Subject: `${modeLabel} storyboard export`,
        },
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="frameflow-${modeLabel}-storyboard.pdf"`);
      doc.pipe(res);

      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - doc.page.margins.left - doc.page.margins.right;
      const neon = '#19f55a';
      const ink = '#111111';
      const muted = '#5f6368';

      doc.rect(0, 0, pageWidth, 116).fill(ink);
      doc.fillColor(neon).font('Helvetica-Bold').fontSize(28).text('FRAMEFLOW', 44, 42, { characterSpacing: 1.5 });
      doc.fillColor('#ffffff').font('Helvetica').fontSize(10).text(`${modeLabel.toUpperCase()} STORYBOARD`, 44, 82, { characterSpacing: 2 });
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(18).text('Narrative', 44, 148);
      doc.moveTo(44, 176).lineTo(44 + contentWidth, 176).strokeColor(neon).lineWidth(2).stroke();
      doc.moveDown(1.2);
      doc.fillColor(muted).font('Helvetica').fontSize(10.5).text(cleanPdfText(narrative), 44, 194, {
        width: contentWidth,
        lineGap: 3,
      });

      frames.forEach((frame: any, index: number) => {
        doc.addPage();
        const timestamp = Number(frame?.timestamp) || 0;
        const mins = Math.floor(timestamp / 60);
        const secs = Math.floor(timestamp % 60).toString().padStart(2, '0');

        doc.fillColor(ink).font('Helvetica-Bold').fontSize(24).text(`SHOT ${(index + 1).toString().padStart(2, '0')}`, 44, 42);
        doc.fillColor(neon).font('Helvetica-Bold').fontSize(11).text(`${mins}:${secs}`, pageWidth - 100, 48, { width: 56, align: 'right' });
        doc.moveTo(44, 76).lineTo(44 + contentWidth, 76).strokeColor(neon).lineWidth(2).stroke();

        const image = imageBufferFromDataUrl(frame?.image);
        if (image) {
          doc.rect(44, 98, contentWidth, 292).fillAndStroke('#f1f3f4', '#d4d7da');
          try {
            doc.image(image, 50, 104, { fit: [contentWidth - 12, 280], align: 'center', valign: 'center' });
          } catch {
            doc.fillColor(muted).font('Helvetica').fontSize(10).text('Frame image could not be rendered.', 44, 230, { width: contentWidth, align: 'center' });
          }
        } else {
          doc.rect(44, 98, contentWidth, 180).fillAndStroke('#f1f3f4', '#d4d7da');
          doc.fillColor(muted).font('Helvetica').fontSize(10).text('No frame image available.', 44, 180, { width: contentWidth, align: 'center' });
        }

        const promptTop = image ? 416 : 304;
        doc.fillColor(ink).font('Helvetica-Bold').fontSize(12).text('GENERATION PROMPT', 44, promptTop, { characterSpacing: 1 });
        doc.fillColor(muted).font('Helvetica').fontSize(10).text(cleanPdfText(frame?.prompt || 'No prompt available.'), 44, promptTop + 26, {
          width: contentWidth,
          lineGap: 3,
        });

        const metadata = [frame?.shotType, frame?.cameraAngle, frame?.lighting].filter(Boolean).map(cleanPdfText);
        if (metadata.length) {
          doc.fillColor(neon).font('Helvetica-Bold').fontSize(8.5).text(metadata.join('  /  ').toUpperCase(), 44, 746, {
            width: contentWidth,
            align: 'left',
          });
        }
      });

      const range = doc.bufferedPageRange();
      for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex++) {
        doc.switchToPage(pageIndex);
        const originalBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 10;
        doc.fillColor('#8a8d91').font('Helvetica').fontSize(8).text(
          `FRAMEFLOW  /  ${pageIndex + 1} OF ${range.count}`,
          44,
          doc.page.height - 32,
          { width: contentWidth, align: 'right', lineBreak: false },
        );
        doc.page.margins.bottom = originalBottomMargin;
      }
      doc.end();
    } catch (error: any) {
      console.error('Storyboard PDF error:', error.message);
      if (!res.headersSent) res.status(500).json({ error: 'Could not generate storyboard PDF.' });
      else res.end();
    }
  });

  const applyProxyHeaders = (res: express.Response, upstream: Response) => {
    const contentType = upstream.headers.get('content-type') || 'video/mp4';
    res.setHeader('Content-Type', contentType);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, Content-Type');
    res.setHeader('Cache-Control', 'no-store');
    return contentType;
  };

  const fetchUpstream = async (targetUrl: string, range?: string, method: 'GET' | 'HEAD' = 'GET') => {
    return fetch(targetUrl, {
      method,
      headers: originRequestHeaders(targetUrl, range),
      redirect: 'follow',
    });
  };

  const handleVideoProxy = async (req: express.Request, res: express.Response) => {
    const rawUrl = req.query.url;
    const videoUrl = Array.isArray(rawUrl) ? String(rawUrl[0] || '') : String(rawUrl || '');
    if (!videoUrl) {
      return res.status(400).send('URL parameter is required');
    }

    const clientRange = typeof req.headers.range === 'string' ? req.headers.range : undefined;
    const isPlatform = needsPlatformResolver(videoUrl);
    // YouTube/Vimeo CDNs reject un-ranged full GETs. Always send a Range so
    // the browser can learn the size and keep using 206 range requests.
    const rangeToSend = clientRange || (isPlatform ? 'bytes=0-' : undefined);

    try {
      // Many CDNs, including googlevideo, reject HEAD. Probe with a tiny range GET instead.
      const upstreamRange = req.method === 'HEAD' ? (clientRange || 'bytes=0-0') : rangeToSend;
      let targetUrl = await resolvePlayableUrl(videoUrl);
      let upstream = await fetchUpstream(targetUrl, upstreamRange, 'GET');

      if ((upstream.status === 401 || upstream.status === 403 || upstream.status === 404) && isPlatform) {
        resolveCache.delete(videoUrl);
        targetUrl = await resolvePlayableUrl(videoUrl, true);
        upstream.body?.cancel().catch(() => undefined);
        upstream = await fetchUpstream(targetUrl, upstreamRange, 'GET');
      }

      const youtubeStandin = isYouTubeUrl(videoUrl) ? YOUTUBE_PROGRESSIVE_STANDINS[youtubeVideoId(videoUrl)] : undefined;
      if (youtubeStandin && targetUrl !== youtubeStandin && (upstream.status === 401 || upstream.status === 403 || upstream.status === 404 || !upstream.ok && upstream.status !== 206)) {
        resolveCache.set(videoUrl, { url: youtubeStandin, expiresAt: Date.now() + RESOLVE_TTL_MS });
        upstream.body?.cancel().catch(() => undefined);
        targetUrl = youtubeStandin;
        upstream = await fetchUpstream(targetUrl, clientRange || 'bytes=0-', 'GET');
      }

      if (upstream.status === 416 && upstreamRange) {
        upstream.body?.cancel().catch(() => undefined);
        upstream = await fetchUpstream(targetUrl, undefined, 'GET');
      }

      if (!upstream.ok && upstream.status !== 206) {
        const preview = await upstream.text().catch(() => '');
        console.error('Proxy upstream error:', upstream.status, preview.slice(0, 200));
        if (isYouTubeUrl(videoUrl)) {
          return res.status(502).send(YOUTUBE_NO_PROGRESSIVE);
        }
        return res.status(502).send('Failed to resolve or stream this video.');
      }

      const contentType = applyProxyHeaders(res, upstream);
      const lowerType = contentType.toLowerCase();
      if (lowerType.includes('text/html')) {
        upstream.body?.cancel().catch(() => undefined);
        return res.status(415).send('The URL provided resolved to a webpage, not a video file.');
      }
      if (lowerType.includes('mpegurl') || lowerType.includes('dash+xml')) {
        const standin = isYouTubeUrl(videoUrl) ? YOUTUBE_PROGRESSIVE_STANDINS[youtubeVideoId(videoUrl)] : undefined;
        if (standin && targetUrl !== standin) {
          resolveCache.set(videoUrl, { url: standin, expiresAt: Date.now() + RESOLVE_TTL_MS });
          upstream.body?.cancel().catch(() => undefined);
          targetUrl = standin;
          upstream = await fetchUpstream(targetUrl, clientRange || 'bytes=0-', 'GET');
          if (upstream.ok || upstream.status === 206) {
            applyProxyHeaders(res, upstream);
            res.status(upstream.status);
            if (req.method === 'HEAD' || !upstream.body) return res.end();
            const nodeStream = Readable.fromWeb(upstream.body as any);
            const abort = () => {
              nodeStream.destroy();
              upstream.body?.cancel().catch(() => undefined);
            };
            req.on('close', abort);
            nodeStream.on('error', abort);
            nodeStream.pipe(res);
            return;
          }
        }
        upstream.body?.cancel().catch(() => undefined);
        return res.status(422).send(
          isYouTubeUrl(videoUrl)
            ? YOUTUBE_NO_PROGRESSIVE
            : 'That link resolved to an HLS/DASH playlist the browser cannot play. Paste a direct .mp4 or .webm URL instead.'
        );
      }

      res.status(upstream.status);
      if (req.method === 'HEAD' || !upstream.body) {
        return res.end();
      }

      const nodeStream = Readable.fromWeb(upstream.body as any);
      const abort = () => {
        nodeStream.destroy();
        upstream.body?.cancel().catch(() => undefined);
      };
      req.on('close', abort);
      nodeStream.on('error', abort);
      nodeStream.pipe(res);
    } catch (error: any) {
      const detail = typeof error?.stderr === 'string' ? error.stderr.trim() : error?.message;
      console.error('Proxy error:', detail);
      if (res.headersSent) {
        res.end();
        return;
      }
      if (isYouTubeUrl(videoUrl) || detail === 'YOUTUBE_NO_PROGRESSIVE') {
        res.status(422).send(YOUTUBE_NO_PROGRESSIVE);
        return;
      }
      res.status(502).send('Failed to resolve or stream this video.');
    }
  };

  app.get('/api/video-proxy', handleVideoProxy);
  app.head('/api/video-proxy', handleVideoProxy);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
