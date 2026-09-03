import React, { useState } from 'react';
import { Loader2, Scissors, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

type ReelAction = 'silence' | 'build';

type TimeRange = {
  id?: string;
  start_s: number;
  end_s: number;
  duration_s?: number;
};

type ReelResult = {
  ok?: boolean;
  action?: ReelAction;
  source?: string | null;
  duration_s?: number;
  has_audio?: boolean;
  noise_db?: number;
  min_silence_s?: number;
  pad_s?: number;
  silences?: TimeRange[];
  keep?: TimeRange[];
  dropped_s?: number;
  kept_s?: number;
  saved_pct?: number;
  ffmpeg_proxy?: string;
  ffmpeg_final?: string;
  message?: string;
  error?: string;
  edl?: {
    version?: number;
    kind?: string;
    proxy?: { width: number; height: number };
    final?: { width: number; height: number };
    segments?: TimeRange[];
  };
};

const ReelEdlPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('');
  const [noiseDb, setNoiseDb] = useState('-30');
  const [minSilence, setMinSilence] = useState('0.4');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReelResult | null>(null);

  const run = async () => {
    if (!source.trim()) {
      setError('Paste a video URL or local path first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        action: 'silence',
        source: source.trim(),
      };
      const noise = Number(noiseDb);
      const minS = Number(minSilence);
      if (Number.isFinite(noise)) body.noise_db = noise;
      if (Number.isFinite(minS)) body.min_silence_s = minS;

      const res = await fetch('/api/reel-edl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'Reel EDL failed.');
        return;
      }
      setResult(data as ReelResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'Reel EDL request failed.');
    } finally {
      setLoading(false);
    }
  };

  const copyEdl = async () => {
    if (!result?.edl) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.edl, null, 2));
    } catch {
      setError('Could not copy EDL JSON.');
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 border border-white/10 bg-black/50 hover:border-neon/40 transition-colors rounded-2xl"
      >
        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-neon">
          <Scissors className="w-4 h-4" />
          Reel EDL
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
      </button>

      {open && (
        <div className="mt-3 border border-white/10 bg-black/40 rounded-2xl p-5 space-y-4">
          <p className="text-[11px] text-white/45 font-mono leading-relaxed">
            Silence-trim a clip into a typed reel EDL. Keeps speech, drops quiet gaps, and prints proxy (540×960) plus final (1080×1920) ffmpeg cut commands. Original file is never overwritten.
          </p>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="https://…/clip.mp4"
            className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono placeholder:text-white/25"
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[9px] font-black uppercase tracking-widest text-white/35 space-y-1">
              Noise dB
              <input
                value={noiseDb}
                onChange={(e) => setNoiseDb(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono"
              />
            </label>
            <label className="text-[9px] font-black uppercase tracking-widest text-white/35 space-y-1">
              Min silence (s)
              <input
                value={minSilence}
                onChange={(e) => setMinSilence(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neon/15 border border-neon/40 text-neon text-[10px] font-black uppercase tracking-[0.2em] disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
            Cut silences
          </button>

          {error && (
            <div className="flex items-start gap-2 text-red-400 text-xs font-mono">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="text-[9px] font-black uppercase tracking-widest text-neon">
                {result.message || 'EDL ready'}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ['Duration', result.duration_s != null ? `${result.duration_s.toFixed(2)}s` : '—'],
                  ['Kept', result.kept_s != null ? `${result.kept_s.toFixed(2)}s` : '—'],
                  ['Dropped', result.dropped_s != null ? `${result.dropped_s.toFixed(2)}s` : '—'],
                  ['Saved', result.saved_pct != null ? `${result.saved_pct}%` : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="border border-white/10 bg-black/40 p-3 rounded-xl">
                    <div className="text-[8px] font-black uppercase tracking-widest text-white/35 mb-1">{k}</div>
                    <div className="text-sm font-mono text-white/80">{v}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                <div className="text-[9px] font-black uppercase tracking-widest text-white/35">Keep ranges</div>
                {(result.keep || []).length === 0 && (
                  <p className="text-xs text-white/40 font-mono">None.</p>
                )}
                {(result.keep || []).map((seg) => (
                  <div key={seg.id || `${seg.start_s}-${seg.end_s}`} className="text-[11px] text-white/65 font-mono pl-3 border-l border-neon/30">
                    {seg.id || 'k'} · {seg.start_s.toFixed(2)}s–{seg.end_s.toFixed(2)}s
                    {seg.duration_s != null ? ` (${seg.duration_s.toFixed(2)}s)` : ''}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={copyEdl}
                className="text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-neon"
              >
                Copy EDL JSON
              </button>

              {result.ffmpeg_proxy && (
                <pre className="text-[10px] font-mono text-white/40 bg-black/50 border border-white/10 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
                  {result.ffmpeg_proxy}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReelEdlPanel;
