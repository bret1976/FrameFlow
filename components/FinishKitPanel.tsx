import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
} from 'lucide-react';

type FinishCheck = {
  id: string;
  ok: boolean;
  label: string;
  detail: string;
};

type FinishStep = {
  id: string;
  label: string;
  purpose: string;
  ffmpeg: string;
};

type FinishKitResult = {
  ok?: boolean;
  source?: string;
  action?: string;
  verdict?: string;
  ready?: boolean;
  exit_hint?: number;
  summary?: string;
  checks?: FinishCheck[];
  failing?: string[];
  pipeline?: FinishStep[];
  commands?: Record<string, string>;
  notes?: string[];
  targets?: {
    width: number;
    height: number;
    lufs: number;
    true_peak_dbtp: number;
  };
  error?: string;
};

const FinishKitPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState('1920');
  const [height, setHeight] = useState('1080');
  const [lufs, setLufs] = useState('-19.4');
  const [truePeak, setTruePeak] = useState('-0.3');
  const [zoom, setZoom] = useState('1.05');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinishKitResult | null>(null);

  const run = async (action: 'check' | 'plan' | 'commands' | 'demo' | 'defaults') => {
    setLoading(true);
    setError(null);
    try {
      const body =
        action === 'demo' || action === 'defaults'
          ? { action }
          : {
              action,
              width: Number(width),
              height: Number(height),
              duration_sec: 42,
              lufs: Number(lufs),
              true_peak_dbtp: Number(truePeak),
              tags: ['major_brand', 'encoder', 'title'],
              faststart: false,
              has_audio: true,
              video_codec: 'h264',
              pix_fmt: 'yuv420p',
              zoom: Number(zoom) || 1,
              input_path: 'raw.mp4',
            };

      const response = await fetch('/api/finish-kit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'FinishKit failed.');
        return;
      }
      setResult(data as FinishKitResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'FinishKit request failed.');
    } finally {
      setLoading(false);
    }
  };

  const verdictColor =
    result?.verdict === 'READY'
      ? 'text-emerald-300'
      : result?.verdict === 'BLOCKED'
        ? 'text-rose-300'
        : 'text-amber-300';

  return (
    <div className="w-full max-w-xl mt-3 border border-white/10 rounded-[1.5rem] bg-black/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-300" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            FinishKit
          </span>
          <span className="text-[9px] uppercase tracking-wider text-white/35">
            −14 lufs · 9:16 · strip
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
          <p className="text-[11px] text-white/40 font-mono pt-3 leading-relaxed">
            Feed-ready finish planner: 1080×1920 cover-crop, −14 LUFS / −1.5 dBTP two-pass
            loudnorm, metadata strip, faststart. Complements SafeKit + PromoteGate.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-mono text-white/40 space-y-1">
              Width
              <input
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[10px] font-mono text-white/40 space-y-1">
              Height
              <input
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[10px] font-mono text-white/40 space-y-1">
              LUFS
              <input
                value={lufs}
                onChange={(e) => setLufs(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[10px] font-mono text-white/40 space-y-1">
              True peak dBTP
              <input
                value={truePeak}
                onChange={(e) => setTruePeak(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[10px] font-mono text-white/40 space-y-1 col-span-2">
              Punch-in zoom
              <input
                value={zoom}
                onChange={(e) => setZoom(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['check', 'plan', 'commands', 'demo', 'defaults'] as const).map((action) => (
              <button
                key={action}
                type="button"
                disabled={loading}
                onClick={() => run(action)}
                className="px-3 py-1.5 rounded-full border border-white/15 text-[10px] uppercase tracking-wider font-mono text-white/70 hover:bg-white/10 disabled:opacity-40"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : action}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-start gap-2 text-rose-300 text-[11px] font-mono">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={`font-mono text-xs uppercase tracking-wider ${verdictColor}`}>
                  {result.verdict || '—'}
                </span>
                <span className="text-[10px] font-mono text-white/35">
                  exit {result.exit_hint ?? '—'} · {result.source}
                </span>
              </div>
              <p className="text-[11px] text-white/70 font-mono leading-relaxed">
                {result.summary}
              </p>
              {result.checks && result.checks.length > 0 && (
                <ul className="space-y-1.5">
                  {result.checks.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start gap-2 text-[10px] font-mono text-white/55"
                    >
                      {c.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                      )}
                      <span>
                        <span className="text-white/80">{c.label}</span>
                        <br />
                        {c.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {result.pipeline && result.pipeline.length > 0 && (
                <div className="pt-1 space-y-1">
                  <p className="text-[9px] uppercase tracking-wider text-white/35 font-mono">
                    Pipeline
                  </p>
                  {result.pipeline.map((step) => (
                    <div key={step.id} className="text-[10px] font-mono text-white/50">
                      <span className="text-violet-300">{step.label}</span> — {step.purpose}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FinishKitPanel;
