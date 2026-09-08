import React, { useState } from 'react';
import { Loader2, Crop, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';

type Plan = {
  aspect?: { slug: string; label: string; width: number; height: number; platforms?: string[] };
  layout?: { slug: string; label: string; description?: string };
  output?: { width: number; height: number };
  ffmpeg_vf?: string;
  ffmpeg_example?: string;
  subtitle?: { slug: string; label: string };
  notes?: string[];
  pan_x?: number;
};

type Hook = {
  score: number;
  band: string;
  reasons?: string[];
};

type Result = {
  ok?: boolean;
  action?: string;
  summary?: string;
  plan?: Plan;
  hook?: Hook;
  aspects?: { slug: string; label: string }[];
  layouts?: { slug: string; label: string }[];
  error?: string;
};

const DEMO_HINT =
  'Short-form framing presets + hook score (center-crop / blur-fit / split-stack). Inspired by xclips (reimplemented).';

const ShortFramePanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [aspect, setAspect] = useState('9x16');
  const [layout, setLayout] = useState('blur-fit');
  const [hookText, setHookText] = useState('Why most vertical crops fail in the first 2 seconds');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = async (action: 'list' | 'plan' | 'hook-score' | 'demo') => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> =
        action === 'demo'
          ? { demo: true }
          : action === 'list'
            ? { action }
            : action === 'hook-score'
              ? { action, hook_text: hookText }
              : {
                  action,
                  aspect,
                  layout,
                  hook_text: hookText,
                  subtitle_preset: 'hormozi-neon',
                  source_width: 1920,
                  source_height: 1080,
                };

      const res = await fetch('/api/short-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'ShortFrame failed.');
        return;
      }
      setResult(data as Result);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'ShortFrame request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl mt-3 border border-white/10 rounded-[1.5rem] bg-black/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2">
          <Crop className="w-4 h-4 text-neon" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            Short Frame
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
          <div className="flex gap-2">
            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value)}
              className="flex-1 rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
            >
              <option value="9x16">9:16</option>
              <option value="1x1">1:1</option>
              <option value="4x5">4:5</option>
              <option value="16x9">16:9</option>
            </select>
            <select
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              className="flex-1 rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
            >
              <option value="center-crop">Center crop</option>
              <option value="blur-fit">Blur fit</option>
              <option value="split-stack">Split stack</option>
            </select>
          </div>
          <input
            value={hookText}
            onChange={(e) => setHookText(e.target.value)}
            placeholder="Opening hook text (optional score)"
            className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => run('demo')}
              className="px-3 py-1.5 rounded-full bg-neon/20 text-neon text-[10px] font-mono uppercase tracking-wider hover:bg-neon/30 disabled:opacity-40"
            >
              Demo
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('plan')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
            >
              Plan
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('hook-score')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
            >
              Hook score
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('list')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
            >
              List
            </button>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-white/50 text-xs font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 text-red-300 text-xs">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {result?.summary && (
            <div className="flex items-start gap-2 text-emerald-300/90 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="font-mono">{result.summary}</span>
            </div>
          )}
          {result?.hook && (
            <p className="text-[11px] font-mono text-white/55">
              Hook {result.hook.band} {result.hook.score}/100
              {result.hook.reasons?.length ? ` · ${result.hook.reasons.slice(0, 2).join('; ')}` : ''}
            </p>
          )}
          {result?.plan?.ffmpeg_vf && (
            <pre className="text-[10px] font-mono text-white/45 whitespace-pre-wrap break-all rounded-xl bg-black/50 border border-white/5 p-3 max-h-40 overflow-auto">
              {result.plan.ffmpeg_vf}
            </pre>
          )}
          {result?.plan?.notes && result.plan.notes.length > 0 && (
            <ul className="space-y-1">
              {result.plan.notes.slice(0, 4).map((n, i) => (
                <li key={i} className="text-[11px] text-white/45 font-mono">
                  · {n}
                </li>
              ))}
            </ul>
          )}
          {result?.layouts && !result.plan && (
            <p className="text-[11px] font-mono text-white/50">
              Layouts: {result.layouts.map((l) => l.slug).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ShortFramePanel;
