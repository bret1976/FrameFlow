# FrameFlow

FrameFlow turns a video into shot-cut frames, writes production prompts and shot metadata, and can build storyboards, remix narratives, and generate stills.

Production uses **xAI/Grok** whenever `XAI_API_KEY` is set. Ollama (Qwen2.5-VL) is the local-only fallback when no xAI key is present.

## Stack

- **Shot cuts:** PySceneDetect ContentDetector (HSV mean-abs-diff) in the browser. Optional server `/api/scenes` uses PySceneDetect if the `scenedetect` CLI is installed, otherwise ffmpeg scene scores.
- **Per-frame prompt + shot type / angle / lighting:** xAI Grok (`XAI_API_KEY`) in production. Local fallback: [Qwen2.5-VL 7B](https://ollama.com/library/qwen2.5vl) on [Ollama](https://ollama.com). GPU box: [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL) via vLLM when no xAI key is set.
- **Story / remix text:** the same provider as frame analysis.
- **Stills:** Grok image models when xAI is configured, otherwise Automatic1111 or Forge (`A1111_HOST`).
- **HTTP pattern:** the browser still `POST /api/xai` with `{ action, payload }`.

## Run locally

Prerequisites: Node.js 20+, [Ollama](https://ollama.com), and ffmpeg (`brew install ffmpeg`).

1. Install and pull the vision model:

   ```bash
   ollama serve
   ollama pull qwen2.5vl:7b
   ```

   Laptops with 8 GB RAM can use `qwen2.5vl:3b`. A GPU box can use `qwen3-vl:8b` or a vLLM Qwen3-VL endpoint.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the environment template (optional — defaults talk to local Ollama):

   ```bash
   cp .env.example .env.local
   ```

   ```dotenv
   LLM_PROVIDER=ollama
   OLLAMA_HOST=http://127.0.0.1:11434
   LLM_TEXT_MODEL=qwen2.5vl:7b
   ```

4. Start FrameFlow:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

### GPU / vLLM

```dotenv
LLM_PROVIDER=vllm
VLLM_BASE_URL=http://127.0.0.1:8000/v1
LLM_TEXT_MODEL=Qwen/Qwen3-VL-8B-Instruct
```

### Optional stills (Flux or SDXL)

Start Automatic1111 or Forge with `--api`, load a Flux or SDXL checkpoint, then:

```dotenv
A1111_HOST=http://127.0.0.1:7860
```

Analysis works without this. Image generation and 2K enhance need it.

### Optional PySceneDetect CLI

Browser cuts are the default. For server-side detection on a URL or uploaded clip:

```bash
pip install scenedetect
```

The `scenedetect` binary is used when present; otherwise `/api/scenes` uses ffmpeg.

## Verify and deploy

```bash
npm run lint
npm run build
npm start
```

Production serves the built app and API from port `3000`. For Railway, set `OLLAMA_HOST` (or `VLLM_BASE_URL`) to a machine that actually runs the model. Railway's container does not run Ollama.

## Agent Scrub

`POST /api/agent-scrub` (GET smoke) exposes agent-style video scrub tools inspired by videoscrub:

- `info` — ffprobe duration / size / fps / chapters / transcript status
- `transcript` — embedded captions + optional query filter (Whisper optional; no invented keys)
- `motion` — frame-difference scores over time buckets
- `frames` — JPEG base64 thumbnails for a time range

Requires ffmpeg/ffprobe on PATH (present in the Railway Dockerfile). UI: **Agent Scrub** panel on the home screen.

## Reel EDL

`POST /api/reel-edl` (GET smoke) builds a typed, JSON-ready reel edit decision list inspired by EdiDoctor:

- `silence` — detects quiet gaps with ffmpeg, returns keep ranges and time saved
- `build` — validates caller-supplied keep ranges into the same EDL contract
- Produces proxy (540×960) and final (1080×1920) ffmpeg cut commands from one EDL
- Never overwrites the source; remote media is downloaded into a temporary working copy

UI: **Reel EDL** panel on the home screen. No model key is required.

## Notes

- Config → Shot Cuts uses scene detection; Interval is the older every-N-seconds path.
- Remote video URLs still depend on the source allowing retrieval. YouTube URLs are resolved with yt-dlp to a progressive MP4; HLS/DASH is rejected. The YouTube_Sample chip (`watch?v=aqz-KE-bpKQ`) falls back to a public Big Buck Bunny MP4 if YouTube blocks the server.
- Frame images stay in browser local storage. Analysis sends the selected frame to Ollama/vLLM only.
- Script attachments are inlined as text. Paste the script if the file is a PDF.

## Production packet and verify pass

After frame analysis, FrameFlow runs a local verify pass (no extra API keys) and can export a production packet:

- Continuity passport — locked subject, wardrobe, lighting, and palette language to paste into every shot prompt
- Quality report — missing prompts, analysis errors, coverage gaps, duplicate prompts, lighting drift
- Shot inventory / EDL — timestamped shot list as `frameflow-packet.json` plus `frameflow-edl.md`

Use **Verify** to reopen the report, **Lock Passport** to stamp it into Config (`{{PASSPORT}}` + directives), and **Export Packet** to download JSON + markdown. Re-run analysis after locking so every prompt carries the same identity block.


## Ending Coherence

`POST /api/ending-coherence` (GET smoke) is a cold-viewer story gate inspired by Cutawan's editorial-coherence study (MIT ideas only, reimplemented):

- Detects unresolved endings, mid-sentence cuts, dangling connectives, open quotes, trailing filler
- Returns PASS / WARN / FAIL with an evidence quote
- Suggests a sentence-boundary extend (`suggested.end_sec`) when the cut is incomplete
- Pure heuristics — no LLM keys

`POST /api/silence-gate` (GET smoke) is a dead-air / keep-range planner inspired by WVideoFlow's Smart Silence Removal (MIT ideas only, reimplemented):
thresholds −35 dB / 0.7s min / 0.15s pad, silence gaps → keep ranges + ffmpeg filter hint. Pure JSON, no keys.

## FinishKit

`POST /api/finish-kit` (GET smoke) is a feed-ready finish planner inspired by reelsmith/reelkit (MIT ideas only, reimplemented):

- Checklist: 1080×1920, duration ≤180s, −14±1 LUFS, true peak ≤ −1.5 dBTP, clean metadata, faststart, H.264/yuv420p
- Pipeline + ffmpeg command templates: vertical cover-crop (optional punch-in), two-pass loudnorm, strip, faststart, cover thumb
- Actions: `check` | `plan` | `commands` | `demo` | `defaults` — pure JSON, no API keys
- Complements SafeKit (UI zones) and PromoteGate (−16 promote loudness); does not replace them

UI: **FinishKit** panel on the home screen.

## CapCutGate

`POST /api/cap-cut-gate` (GET smoke) is a CapCut draft / export handoff checklist inspired by Hao0321/video-autopilot-kit (MIT ideas only, reimplemented):

- Platform-aware duration bands (YT Shorts dead zone 26–44s does not apply to IG/TikTok)
- First cut ≤2s, 9:16 canvas, CapCut-friendly FPS, named draft, caption handoff (SRT/ASS/burned/auto)
- Export preset 1080p+, watermark-risk flag, template intent, optional loop-seam
- Actions: `check` | `plan` | `demo` | `checklist` | `defaults` — pure JSON, no API keys
- Complements FinishKit (ffmpeg finish) and DeliveryGate (publish meta); does not replace them

UI: **CapCutGate** panel on the home screen.



