import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

const uniqueSorted = (values: number[]): number[] =>
  [...new Set(values.map((value) => Math.round(value * 100) / 100))]
    .filter((value) => value >= 0 && Number.isFinite(value))
    .sort((a, b) => a - b);

const detectWithPySceneDetect = async (inputPath: string, threshold: number): Promise<number[] | null> => {
  try {
    const { stdout } = await execFileAsync(
      "python3",
      [
        "-c",
        "from scenedetect import detect, ContentDetector\nimport json, sys\nscenes = detect(sys.argv[1], ContentDetector(threshold=float(sys.argv[2])))\nprint(json.dumps([scene[0].get_seconds() for scene in scenes]))",
        inputPath,
        String(threshold),
      ],
      { timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout.trim() || "[]");
    if (!Array.isArray(parsed)) return null;
    return uniqueSorted(parsed.map(Number));
  } catch {
    return null;
  }
};

const detectWithFfmpeg = async (inputPath: string, ffmpegThreshold: number): Promise<number[]> => {
  const timestamps: number[] = [0];
  try {
    const { stderr } = await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-i", inputPath,
        "-an",
        "-vf", `select='gt(scene\\,${ffmpegThreshold})',showinfo`,
        "-f", "null",
        "-",
      ],
      { timeout: 180000, maxBuffer: 16 * 1024 * 1024 },
    );
    const showinfo = stderr || "";
    for (const match of showinfo.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)) {
      timestamps.push(Number(match[1]));
    }
  } catch (error: any) {
    const showinfo = String(error?.stderr || "");
    for (const match of showinfo.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)) {
      timestamps.push(Number(match[1]));
    }
    if (timestamps.length <= 1 && !showinfo) throw error;
  }
  return uniqueSorted(timestamps);
};

export const detectSceneTimestamps = async (
  inputPath: string,
  options: { threshold?: number } = {},
): Promise<{ timestamps: number[]; backend: "pyscenedetect" | "ffmpeg" }> => {
  const contentThreshold = options.threshold ?? 27;
  const ffmpegThreshold = Math.min(0.8, Math.max(0.15, contentThreshold / 90));
  const fromPy = await detectWithPySceneDetect(inputPath, contentThreshold);
  if (fromPy && fromPy.length) {
    return { timestamps: fromPy, backend: "pyscenedetect" };
  }
  return { timestamps: await detectWithFfmpeg(inputPath, ffmpegThreshold), backend: "ffmpeg" };
};

export const detectScenesFromBuffer = async (
  buffer: Buffer,
  filename = "clip.mp4",
  threshold?: number,
): Promise<{ timestamps: number[]; backend: "pyscenedetect" | "ffmpeg" }> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "frameflow-scene-"));
  const filePath = path.join(dir, filename.replace(/[^\w.-]+/g, "_") || "clip.mp4");
  try {
    await writeFile(filePath, buffer);
    return await detectSceneTimestamps(filePath, { threshold });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

export const sceneDetectorStatus = async (): Promise<{ ffmpeg: boolean; pyscenedetect: boolean }> => {
  const ffmpeg = await execFileAsync("ffmpeg", ["-version"], { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  const pyscenedetect = await execFileAsync(
    "python3",
    ["-c", "import scenedetect; print(scenedetect.__version__)"],
    { timeout: 4000 },
  )
    .then(() => true)
    .catch(() => false);
  return { ffmpeg, pyscenedetect };
};
