# FrameFlow

FrameFlow turns a video into shot-cut frames, uses a local vision model to write production prompts and shot metadata, and can build storyboards, remix narratives, and optionally generate stills with SDXL or Flux.

The UI and browser frame split are unchanged. Analysis no longer uses Grok or xAI credits.

## Stack

- **Shot cuts:** PySceneDetect ContentDetector (HSV mean-abs-diff) in the browser. Optional server `/api/scenes` uses PySceneDetect if the `scenedetect` CLI is installed, otherwise ffmpeg scene scores.
- **Per-frame prompt + shot type / angle / lighting:** [Qwen2.5-VL 7B](https://ollama.com/library/qwen2.5vl) on [Ollama](https://ollama.com) (laptop). On a GPU box, point at [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL) 8B/32B via vLLM (`LLM_PROVIDER=vllm`).
- **Story / remix text:** the same Qwen chat head (or any local model Ollama/vLLM serves).
- **Optional stills:** Automatic1111 or Forge running Flux or SDXL (`A1111_HOST`).
- **HTTP pattern:** the browser still `POST /api/xai` with `{ action, payload }`. The server sends the frame image and asks for JSON.

App shape is closest to [byjlw/video-analyzer](https://github.com/byjlw/video-analyzer): local Ollama, image-in / JSON-out, no cloud key.

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
