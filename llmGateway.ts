import axios from "axios";

export type LlmProvider = "ollama" | "vllm";

const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
const DEFAULT_TEXT_MODEL = "qwen2.5vl:7b";

const extractUpstreamMessage = (error: any): string => {
  const upstream = error?.response?.data?.error;
  if (typeof upstream === "string") return upstream;
  if (upstream && typeof upstream.message === "string") return upstream.message;
  if (typeof error?.response?.data?.message === "string") return error.response.data.message;
  if (typeof error?.message === "string") return error.message;
  return "";
};

export const publicLlmError = (error: any): { status: number; message: string } => {
  const upstreamStatus = error?.response?.status;
  const raw = extractUpstreamMessage(error);
  const text = raw.toLowerCase();
  const code = error?.code || "";

  console.error("LLM proxy error:", upstreamStatus || code || "unknown", raw);

  if (
    code === "ECONNREFUSED"
    || code === "ENOTFOUND"
    || code === "ECONNRESET"
    || /connect econnrefused|fetch failed|socket hang up/.test(text)
  ) {
    return {
      status: 503,
      message: `Ollama is not reachable at ${getOllamaHost()}. Install from https://ollama.com, run \`ollama serve\`, then \`ollama pull ${getTextModel()}\`.`,
    };
  }
  if (/not found|model .* not found|pull model|unknown model/.test(text) || upstreamStatus === 404) {
    return {
      status: 400,
      message: `Vision model "${getTextModel()}" is not installed. Run: ollama pull ${getTextModel()}`,
    };
  }
  if (error?.code === "ECONNABORTED" || /timeout/.test(text) || upstreamStatus === 504) {
    return {
      status: 504,
      message: "The vision model timed out. Try qwen2.5vl:3b on a laptop, or Qwen3-VL on a GPU box / vLLM.",
    };
  }
  if (error?.message?.includes("IMAGE_PROVIDER") || error?.message?.includes("A1111_HOST")) {
    return { status: 501, message: error.message };
  }
  if (upstreamStatus === 429 || /rate limit|too many requests/.test(text)) {
    return { status: 429, message: "The local model is busy. Retry in a moment." };
  }
  return {
    status: upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 502,
    message: raw || "Local AI analysis failed. Check Ollama and retry.",
  };
};

export const getLlmProvider = (): LlmProvider =>
  process.env.LLM_PROVIDER === "vllm" ? "vllm" : "ollama";

export const getOllamaHost = (): string =>
  (process.env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST).replace(/\/$/, "");

export const getVllmBaseUrl = (): string =>
  (process.env.VLLM_BASE_URL || "http://127.0.0.1:8000/v1").replace(/\/$/, "");

export const getTextModel = (): string =>
  process.env.LLM_TEXT_MODEL || process.env.XAI_TEXT_MODEL || DEFAULT_TEXT_MODEL;

export const getA1111Host = (): string =>
  (process.env.A1111_HOST || "").replace(/\/$/, "");

export const getImageModel = (): string =>
  process.env.LLM_IMAGE_MODEL || process.env.A1111_MODEL || "";

const llmHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = process.env.VLLM_API_KEY || process.env.LLM_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
};

const stripDataUrl = (value: string): string => {
  const marker = "base64,";
  const idx = value.indexOf(marker);
  return idx >= 0 ? value.slice(idx + marker.length) : value;
};

const inlineFileToText = (file: { data?: string; filename?: string; mimeType?: string } | undefined): string => {
  if (!file?.data) return "";
  const mime = (file.mimeType || "").toLowerCase();
  const name = file.filename || "attachment";
  if (mime.includes("pdf") || mime.includes("octet-stream")) {
    return `\n\n[Attached file ${name} could not be inlined. Paste the script text instead.]`;
  }
  try {
    const text = Buffer.from(file.data, "base64").toString("utf8");
    if (!text.trim() || /[\u0000-\u0008]/.test(text.slice(0, 200))) {
      return `\n\n[Attached file ${name} is not plain text.]`;
    }
    return `\n\nATTACHED SCRIPT (${name}):\n${text.slice(0, 120000)}`;
  } catch {
    return `\n\n[Attached file ${name} could not be decoded.]`;
  }
};

const fromContent = (content: any): string => {
  if (typeof content === "string" && content.trim()) return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part: any) => {
      if (typeof part === "string") return part;
      if (typeof part?.text === "string") return part.text;
      return "";
    })
    .join("")
    .trim();
};

export const extractResponseText = (response: any): string => {
  const ollama = response?.message?.content;
  if (typeof ollama === "string" && ollama.trim()) return ollama;

  if (Array.isArray(response?.output)) {
    for (const item of [...response.output].reverse()) {
      if (item?.type && item.type !== "message" && item.type !== "output_text") continue;
      const text = fromContent(item?.content) || (typeof item?.text === "string" ? item.text : "");
      if (text) return text;
    }
  }

  const chatText = fromContent(response?.choices?.[0]?.message?.content);
  if (chatText) return chatText;
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  throw new Error("The model returned no text output.");
};

type ChatMessage = { role: string; content: any; images?: string[] };

const flattenUserContent = (content: any): { text: string; images: string[] } => {
  if (typeof content === "string") return { text: content, images: [] };
  if (!Array.isArray(content)) return { text: "", images: [] };
  const texts: string[] = [];
  const images: string[] = [];
  for (const part of content) {
    if (part?.type === "input_text" || part?.type === "text") {
      texts.push(part.text || "");
    } else if (part?.type === "input_image" || part?.type === "image_url") {
      const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
      if (url) images.push(stripDataUrl(url));
    } else if (part?.type === "input_file") {
      texts.push(inlineFileToText(part.inline_file));
    } else if (typeof part === "string") {
      texts.push(part);
    }
  }
  return { text: texts.join("\n").trim(), images };
};

export const toOllamaMessages = (input: any, instructions?: string): ChatMessage[] => {
  const messages: ChatMessage[] = [];
  if (instructions) messages.push({ role: "system", content: instructions });
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
    return messages;
  }
  if (!Array.isArray(input)) return messages;
  for (const item of input) {
    const role = item?.role || "user";
    const { text, images } = flattenUserContent(item?.content);
    const message: ChatMessage = { role, content: text || " " };
    if (images.length) message.images = images;
    messages.push(message);
  }
  return messages;
};

export const toOpenAIMessages = (input: any, instructions?: string): any[] => {
  const messages: any[] = [];
  if (instructions) messages.push({ role: "system", content: instructions });
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
    return messages;
  }
  if (!Array.isArray(input)) return messages;
  for (const item of input) {
    const role = item?.role || "user";
    if (typeof item?.content === "string") {
      messages.push({ role, content: item.content });
      continue;
    }
    if (!Array.isArray(item?.content)) continue;
    const content: any[] = [];
    for (const part of item.content) {
      if (part?.type === "input_text" || part?.type === "text") {
        content.push({ type: "text", text: part.text || "" });
      } else if (part?.type === "input_image" || part?.type === "image_url") {
        const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
        content.push({ type: "image_url", image_url: { url } });
      } else if (part?.type === "input_file") {
        content.push({ type: "text", text: inlineFileToText(part.inline_file) });
      }
    }
    messages.push({ role, content });
  }
  return messages;
};

export const probeLlm = async (): Promise<{
  configured: boolean;
  provider: LlmProvider;
  host: string;
  textModel: string;
  models: string[];
  message?: string;
}> => {
  const provider = getLlmProvider();
  const textModel = getTextModel();
  if (provider === "vllm") {
    const host = getVllmBaseUrl();
    try {
      const result = await axios.get(`${host}/models`, { headers: llmHeaders(), timeout: 4000 });
      const models = (result.data?.data || []).map((item: any) => item.id).filter(Boolean);
      return { configured: true, provider, host, textModel, models };
    } catch (error: any) {
      return {
        configured: false,
        provider,
        host,
        textModel,
        models: [],
        message: `vLLM is not reachable at ${host}. Start vLLM with Qwen3-VL, or switch LLM_PROVIDER=ollama.`,
      };
    }
  }

  const host = getOllamaHost();
  try {
    const result = await axios.get(`${host}/api/tags`, { timeout: 4000 });
    const models = (result.data?.models || []).map((item: any) => item.name).filter(Boolean);
    const modelBase = textModel.split(":")[0];
    const hasModel = models.some((name: string) => name === textModel || name.startsWith(`${modelBase}:`) || name === modelBase);
    if (!hasModel) {
      return {
        configured: false,
        provider,
        host,
        textModel,
        models,
        message: `Ollama is running but ${textModel} is not installed. Run: ollama pull ${textModel}`,
      };
    }
    return { configured: true, provider, host, textModel, models };
  } catch {
    return {
      configured: false,
      provider,
      host,
      textModel,
      models: [],
      message: `Ollama is not reachable at ${host}. Install from https://ollama.com, run \`ollama serve\`, then \`ollama pull ${textModel}\`.`,
    };
  }
};

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, initialDelay = 1000): Promise<T> => {
  let currentDelay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error.response?.status || error.status;
      const retryable = status === 429 || status === 408 || status === 500 || status === 502 || status === 503 || status === 504;
      if (i < retries - 1 && retryable) {
        await new Promise((resolve) => setTimeout(resolve, currentDelay + Math.random() * 400));
        currentDelay *= 2;
        continue;
      }
      throw error;
    }
  }
  throw new Error("Maximum retries exceeded");
};

export const generateLlmText = async (payload: any): Promise<string> => {
  const provider = getLlmProvider();
  const model = payload.model || getTextModel();
  const temperature = typeof payload.temperature === "number" ? payload.temperature : 0.4;
  const schema = payload.responseSchema?.schema;

  if (provider === "vllm") {
    const chatBody: any = {
      model,
      messages: toOpenAIMessages(payload.input, payload.instructions),
      temperature,
    };
    if (schema) {
      chatBody.response_format = {
        type: "json_schema",
        json_schema: {
          name: payload.responseSchema.name || "result",
          schema,
          strict: true,
        },
      };
    }
    const url = `${getVllmBaseUrl()}/chat/completions`;
    try {
      const result = await withRetry(() => axios.post(url, chatBody, {
        headers: llmHeaders(),
        timeout: 300000,
      }));
      return extractResponseText(result.data);
    } catch (error: any) {
      if (error?.response?.status === 400 && schema) {
        const loose = { ...chatBody, response_format: { type: "json_object" } };
        const result = await withRetry(() => axios.post(url, loose, {
          headers: llmHeaders(),
          timeout: 300000,
        }));
        return extractResponseText(result.data);
      }
      throw error;
    }
  }

  const body: any = {
    model,
    messages: toOllamaMessages(payload.input, payload.instructions),
    stream: false,
    options: { temperature },
  };
  if (schema) body.format = schema;

  try {
    const result = await withRetry(() => axios.post(`${getOllamaHost()}/api/chat`, body, {
      timeout: 300000,
    }));
    return extractResponseText(result.data);
  } catch (error: any) {
    if (schema && (error?.response?.status === 400 || /format/.test(extractUpstreamMessage(error).toLowerCase()))) {
      const loose = { ...body, format: "json" };
      const result = await withRetry(() => axios.post(`${getOllamaHost()}/api/chat`, loose, {
        timeout: 300000,
      }));
      return extractResponseText(result.data);
    }
    throw error;
  }
};

const sizeToPixels = (resolution?: string): { width: number; height: number } => {
  if (resolution === "2k" || resolution === "2K") return { width: 1920, height: 1080 };
  return { width: 1280, height: 720 };
};

export const generateLocalImage = async (payload: any): Promise<string> => {
  const host = getA1111Host();
  if (!host) {
    throw new Error("Optional stills are not configured. Start Automatic1111 or Forge with SDXL or Flux and set A1111_HOST (for example http://127.0.0.1:7860).");
  }
  if (typeof payload.prompt !== "string" || !payload.prompt.trim()) {
    throw new Error("Image prompt is required.");
  }

  const { width, height } = sizeToPixels(payload.resolution);
  const hasReference = typeof payload.referenceImage === "string" && payload.referenceImage.length > 0;
  const model = getImageModel();
  const body: any = {
    prompt: payload.prompt,
    negative_prompt: "blurry, watermark, text, logo, extra fingers, deformed",
    width,
    height,
    steps: 20,
    cfg_scale: 7,
    sampler_name: "Euler a",
  };
  if (model) body.override_settings = { sd_model_checkpoint: model };

  let path = "/sdapi/v1/txt2img";
  if (hasReference) {
    path = "/sdapi/v1/img2img";
    body.init_images = [stripDataUrl(payload.referenceImage)];
    body.denoising_strength = payload.resolution === "2k" || payload.resolution === "2K" ? 0.35 : 0.5;
  }

  const result = await withRetry(() => axios.post(`${host}${path}`, body, { timeout: 360000 }), 2, 2000);
  const b64 = result.data?.images?.[0];
  if (!b64) throw new Error("Automatic1111 returned no image.");
  return `data:image/png;base64,${stripDataUrl(b64)}`;
};
