import React, { useState } from 'react';
import { Loader2, AudioLines, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';

type CutPoint = {
  t: number;
  label: string;
  note?: string;
};

type Plan = {
  duration_s?: number;
  bpm?: number;
  cuts?: CutPoint[];
  ffmpeg_cut_list?: string;
  concat_notes?: string[];
};

type Crop = {
  target?: { width: number; height: number; aspect: string };
  crop_filter_hint?: string;
  windows?: { t: number; x_pct: number; y_pct: number; zoom: number }[];
};

type Loudness = {
  slug: string;
  label: string;
  lufs: number;
  ffmpeg_loudnorm?: string;
};

type Overlay = {
  slug: string;
  label: string;
  when_to_use?: string;
};

type Result = {
  ok?: boolean;
  action?: string;
  summary?: string;
  plan?: Plan;
  smart_crop?: Crop;
  loudness?: Loudness[];
  overlays?: Overlay[];
  error?: string;
};

const DEMO_HINT =
  'Beat-sync cuts + smart-crop framing + loudness + kinetic overlays. Inspired by videofy (reimplemented).';

const ReelBeatPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [bpm, setBpm] = useState('128');
  const [duration, setDuration] = useState('16');
  const [aspect, setAspect] = useState('9:16');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = async (action: 'list' | 'plan' | 'demo' | 'loudness' | 'overlays') => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> =
        action === 'demo'
          ? { demo: true }
          : action === 'list' || action === 'overlays' || action === 'loudness'
            ? { action, loudness: aspect === '16:9' ? 'landscape' : 'reels' }
            : {
                action,
                bpm: Number(bpm) || 128,
                duration_s: Number(duration) || 16,
                target_aspect: aspect,
                source_width: 1920,
                source_height: 1080,
                loudness: aspect === '16:9' ? 'landscape' : 'reels',
              };

      const res = await fetch('/api/reel-beat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'ReelBeat failed.');
        return;
      }
      setResult(data as Result);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'ReelBeat request failed.');
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
          <AudioLines className="w-4 h-4 text-neon" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            Reel Beat
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
            <input
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              placeholder="BPM"
              className="w-20 rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
            />
            <input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Duration s"
              className="w-24 rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
            />
            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value)}
              className="flex-1 rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
            >
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="4:5">4:5</option>
              <option value="16:9">16:9</option>
            </select>
          </div>
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
              onClick={() => run('list')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
            >
              List
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('loudness')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
            >
              Loudness
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
          {result?.plan?.cuts && result.plan.cuts.length > 0 && (
            <ul className="space-y-1 max-h-32 overflow-auto">
              {result.plan.cuts.slice(0, 10).map((c, i) => (
                <li key={i} className="text-[11px] text-white/55 font-mono">
                  {c.t.toFixed(2)}s · {c.label}
                  {c.note ? ` — ${c.note}` : ''}
                </li>
              ))}
            </ul>
          )}
          {result?.loudness && result.loudness.length > 0 && (
            <p className="text-[11px] font-mono text-white/55">
              Loudness:{' '}
              {result.loudness.map((l) => `${l.label}`).join(' · ')}
            </p>
          )}
          {result?.overlays && result.overlays.length > 0 && (
            <p className="text-[11px] font-mono text-white/50">
              Overlays: {result.overlays.map((o) => o.slug).join(', ')}
            </p>
          )}
          {result?.smart_crop?.crop_filter_hint && (
            <pre className="text-[10px] font-mono text-white/45 whitespace-pre-wrap break-all rounded-xl bg-black/50 border border-white/5 p-3 max-h-36 overflow-auto">
              {result.smart_crop.crop_filter_hint}
            </pre>
          )}
          {result?.plan?.ffmpeg_cut_list && (
            <pre className="text-[10px] font-mono text-white/40 whitespace-pre-wrap break-all rounded-xl bg-black/50 border border-white/5 p-3 max-h-28 overflow-auto">
              {result.plan.ffmpeg_cut_list}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default ReelBeatPanel;
