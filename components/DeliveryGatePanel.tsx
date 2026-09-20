import React, { useState } from 'react';
import {
  Loader2,
  PackageCheck,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

type Checkpoint = {
  id?: string;
  label?: string;
  verdict?: 'PASS' | 'WARN' | 'FAIL';
  score?: number;
  evidence?: string;
  notes?: string[];
};

type DeliveryResult = {
  ok?: boolean;
  source?: string;
  action?: string;
  verdict?: 'PASS' | 'WARN' | 'FAIL';
  summary?: string;
  export_check?: {
    platform?: string;
    verdict?: string;
    issues?: string[];
    matches?: string[];
  };
  metadata?: { field: string; present: boolean; value_preview?: string }[];
  checkpoints?: Checkpoint[];
  matrix?: unknown[];
  error?: string;
};

const DEMO_HINT =
  'Preflight for TikTok / Reels / Shorts: export matrix + metadata + open/mid/close retention. Inspired by short-form-video-editing-kit (MIT, reimplemented). No LLM / no keys.';

const DeliveryGatePanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState('tiktok');
  const [hook, setHook] = useState('um so yeah');
  const [openText, setOpenText] = useState(
    'um so yeah today I wanted to talk a little bit about stuff'
  );
  const [closeText, setCloseText] = useState('okay bye');
  const [width, setWidth] = useState('1920');
  const [height, setHeight] = useState('1080');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeliveryResult | null>(null);

  const run = async (mode: 'check' | 'demo' | 'matrix') => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> =
        mode === 'demo'
          ? { demo: true }
          : mode === 'matrix'
            ? { action: 'matrix' }
            : {
                action: 'check',
                platform,
                width: Number(width) || undefined,
                height: Number(height) || undefined,
                fps: 24,
                video_codec: 'ProRes',
                audio_codec: 'PCM',
                audio_sample_rate_hz: 44100,
                peak_dbtp: 0.5,
                filename: 'final.mov',
                hook,
                title: '',
                hashtags: [],
                open_text: openText,
                mid_text: 'and then there is more context that kind of goes on',
                close_text: closeText,
                captions_readable: false,
                duration_sec: 42,
              };
      const res = await fetch('/api/delivery-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'DeliveryGate failed.');
        return;
      }
      setResult(data as DeliveryResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'DeliveryGate request failed.');
    } finally {
      setLoading(false);
    }
  };

  const verdictColor =
    result?.verdict === 'PASS'
      ? 'text-emerald-300'
      : result?.verdict === 'WARN'
        ? 'text-amber-300'
        : result?.verdict === 'FAIL'
          ? 'text-red-300'
          : 'text-white/70';

  return (
    <div className="w-full max-w-xl mt-3 border border-white/10 rounded-[1.5rem] bg-black/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2">
          <PackageCheck className="w-4 h-4 text-neon" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            Delivery Gate
          </span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-white/40" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/40" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5">
          <p className="text-[11px] text-white/40 font-mono pt-3">{DEMO_HINT}</p>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
          >
            <option value="tiktok">tiktok</option>
            <option value="instagram-reels">instagram-reels</option>
            <option value="youtube-shorts">youtube-shorts</option>
          </select>
          <textarea
            value={openText}
            onChange={(e) => setOpenText(e.target.value)}
            rows={2}
            placeholder="Opening 0–3s transcript"
            className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
          />
          <input
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="hook metadata"
            className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              placeholder="width"
              className="rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
            />
            <input
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="height"
              className="rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
            />
            <input
              value={closeText}
              onChange={(e) => setCloseText(e.target.value)}
              placeholder="close text"
              className="rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => run('demo')}
              className="px-3 py-1.5 rounded-full bg-neon/20 text-neon text-[10px] font-mono uppercase tracking-wider hover:bg-neon/30 disabled:opacity-40"
            >
              Demo fail
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('check')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
            >
              Check
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('matrix')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
            >
              Matrix
            </button>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-white/50 text-xs font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 text-red-300 text-xs">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {result?.verdict && (
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className={`font-mono text-xs uppercase tracking-wider ${verdictColor}`}>
                  {result.verdict}
                </span>
                {result.verdict === 'PASS' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-300" />
                )}
              </div>
              <p className="text-[11px] text-white/60">{result.summary}</p>
              {result.export_check?.issues && result.export_check.issues.length > 0 && (
                <ul className="text-[10px] font-mono text-red-200/80 list-disc pl-4 space-y-0.5">
                  {result.export_check.issues.slice(0, 4).map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
              {result.checkpoints?.map((cp) => (
                <div key={cp.id || cp.label} className="text-[10px] font-mono text-white/45">
                  <span className="text-white/70">
                    {cp.label}: {cp.verdict} ({cp.score})
                  </span>
                  {cp.evidence ? ` — “${cp.evidence}”` : ''}
                </div>
              ))}
            </div>
          )}
          {result?.action === 'matrix' && Array.isArray(result.matrix) && (
            <p className="text-[10px] font-mono text-white/40">
              Matrix rows: {result.matrix.length} (tiktok / reels / shorts masters)
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default DeliveryGatePanel;
