import React, { useState } from 'react';
import {
  Loader2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

type Gap = {
  start_sec?: number;
  end_sec?: number;
  duration_sec?: number;
  trim?: boolean;
  reason?: string;
};

type Keep = {
  start_sec?: number;
  end_sec?: number;
  duration_sec?: number;
  label?: string;
};

type SilenceResult = {
  ok?: boolean;
  source?: string;
  action?: string;
  verdict?: 'PASS' | 'WARN' | 'FAIL';
  summary?: string;
  duration_sec?: number;
  threshold_db?: number;
  min_silence_sec?: number;
  padding_sec?: number;
  silence_gaps?: Gap[];
  keep_ranges?: Keep[];
  silence_total_sec?: number;
  keep_total_sec?: number;
  speech_ratio?: number;
  trim_sec?: number;
  ffmpeg_hint?: string;
  notes?: string[];
  error?: string;
};

const DEMO_HINT =
  'Dead-air detect + keep-range cut plan (−35 dB / 0.7s / 0.15s pad). Inspired by WVideoFlow silence remover (MIT, reimplemented). No LLM / no keys.';

const SilenceGatePanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState('24');
  const [segmentsJson, setSegmentsJson] = useState(
    '[{"start_sec":3.2,"end_sec":6.8},{"start_sec":11,"end_sec":14.5},{"start_sec":20.5,"end_sec":24}]'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SilenceResult | null>(null);

  const run = async (mode: 'plan' | 'demo' | 'defaults') => {
    setLoading(true);
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (mode === 'demo') {
        body = { demo: true };
      } else if (mode === 'defaults') {
        body = { action: 'defaults' };
      } else {
        let silence_segments: unknown = [];
        try {
          silence_segments = JSON.parse(segmentsJson);
        } catch {
          setError('silence_segments must be valid JSON array.');
          setLoading(false);
          return;
        }
        body = {
          action: 'plan',
          duration_sec: Number(duration) || undefined,
          silence_segments,
        };
      }
      const res = await fetch('/api/silence-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'SilenceGate failed.');
        return;
      }
      setResult(data as SilenceResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'SilenceGate request failed.');
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
          <VolumeX className="w-4 h-4 text-neon" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            Silence Gate
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
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="duration_sec"
            className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
          />
          <textarea
            value={segmentsJson}
            onChange={(e) => setSegmentsJson(e.target.value)}
            rows={3}
            placeholder='silence_segments JSON'
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
              onClick={() => run('defaults')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
            >
              Defaults
            </button>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-white/50 text-xs font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Planning…
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
              <p className="text-[11px] text-white/70 font-mono">{result.summary}</p>
              <p className="text-[10px] text-white/40 font-mono">
                trim {result.trim_sec}s · keep {result.keep_total_sec}s · speech{' '}
                {result.speech_ratio}
              </p>
              {result.keep_ranges && result.keep_ranges.length > 0 && (
                <ul className="text-[10px] text-white/50 font-mono space-y-1">
                  {result.keep_ranges.map((k, i) => (
                    <li key={i}>
                      {k.label}: {k.start_sec}→{k.end_sec} ({k.duration_sec}s)
                    </li>
                  ))}
                </ul>
              )}
              {result.ffmpeg_hint && (
                <pre className="text-[9px] text-white/35 font-mono whitespace-pre-wrap break-all">
                  {result.ffmpeg_hint}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SilenceGatePanel;
