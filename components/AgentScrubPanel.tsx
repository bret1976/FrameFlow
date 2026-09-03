import React, { useState } from 'react';
import { Loader2, Film, ChevronDown, ChevronUp, AlertCircle, Search, Activity, Image as ImageIcon, Info } from 'lucide-react';

type ScrubAction = 'info' | 'transcript' | 'motion' | 'frames';

type ScrubResult = {
  ok?: boolean;
  action?: ScrubAction;
  title?: string | null;
  duration_s?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  has_audio?: boolean;
  has_video?: boolean;
  chapters?: { start_s: number; title: string }[];
  transcript_status?: string;
  lines?: { start_s: number; end_s: number; text: string }[];
  query?: string | null;
  matched?: number;
  source_kind?: string;
  scores?: number[];
  max?: number;
  mean?: number;
  bucket_s?: number;
  start_s?: number;
  end_s?: number;
  frames?: { t_s: number; mime: string; base64: string }[];
  message?: string;
  error?: string;
};

const AgentScrubPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');
  const [startS, setStartS] = useState('0');
  const [endS, setEndS] = useState('8');
  const [fps, setFps] = useState('1');
  const [loading, setLoading] = useState<ScrubAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrubResult | null>(null);

  const run = async (action: ScrubAction) => {
    if (!source.trim()) {
      setError('Paste a video URL or local path first.');
      return;
    }
    setLoading(action);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        action,
        source: source.trim(),
      };
      const start = Number(startS);
      const end = Number(endS);
      const fpsN = Number(fps);
      if (Number.isFinite(start) && start >= 0) body.start_s = start;
      if (Number.isFinite(end) && end > 0) body.end_s = end;
      if (action === 'transcript' && query.trim()) body.query = query.trim();
      if (action === 'frames' && Number.isFinite(fpsN) && fpsN > 0) body.fps = fpsN;

      const res = await fetch('/api/agent-scrub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : `Agent scrub (${action}) failed.`);
        return;
      }
      setResult(data as ScrubResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'Agent scrub request failed.');
    } finally {
      setLoading(null);
    }
  };

  const maxScore = result?.scores?.length ? Math.max(...result.scores, 1) : 1;

  return (
    <div className="w-full max-w-xl mx-auto mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 border border-white/10 bg-black/50 hover:border-neon/40 transition-colors rounded-2xl"
      >
        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-neon">
          <Film className="w-4 h-4" />
          Agent Scrub
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
      </button>

      {open && (
        <div className="mt-3 border border-white/10 bg-[#0a0a0a] rounded-2xl p-5 space-y-4">
          <p className="text-[9px] font-mono uppercase tracking-widest text-white/35">
            Video URL or path → info · transcript search · motion timeline · frame samples (ffmpeg)
          </p>

          <label className="block space-y-1.5">
            <span className="text-[10px] font-bold text-neon uppercase tracking-widest">Source</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full bg-transparent border border-white/10 px-3 py-2 text-sm text-white/80 focus:border-neon outline-none font-mono"
              placeholder="https://…/clip.mp4 or /path/to/local.mp4"
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="space-y-1.5">
              <span className="text-[10px] font-bold text-neon uppercase tracking-widest">Start (s)</span>
              <input
                value={startS}
                onChange={(e) => setStartS(e.target.value)}
                type="number"
                min={0}
                step="0.1"
                className="w-full bg-transparent border border-white/10 px-3 py-2 text-sm text-white/80 focus:border-neon outline-none font-mono"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[10px] font-bold text-neon uppercase tracking-widest">End (s)</span>
              <input
                value={endS}
                onChange={(e) => setEndS(e.target.value)}
                type="number"
                min={0}
                step="0.1"
                className="w-full bg-transparent border border-white/10 px-3 py-2 text-sm text-white/80 focus:border-neon outline-none font-mono"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[10px] font-bold text-neon uppercase tracking-widest">FPS</span>
              <input
                value={fps}
                onChange={(e) => setFps(e.target.value)}
                type="number"
                min={0.2}
                max={8}
                step="0.1"
                className="w-full bg-transparent border border-white/10 px-3 py-2 text-sm text-white/80 focus:border-neon outline-none font-mono"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[10px] font-bold text-neon uppercase tracking-widest">Transcript query</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent border border-white/10 px-3 py-2 text-sm text-white/80 focus:border-neon outline-none font-mono"
              placeholder="Optional keyword filter"
            />
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { action: 'info' as const, label: 'Info', Icon: Info },
                { action: 'transcript' as const, label: 'Transcript', Icon: Search },
                { action: 'motion' as const, label: 'Motion', Icon: Activity },
                { action: 'frames' as const, label: 'Frames', Icon: ImageIcon },
              ]
            ).map(({ action, label, Icon }) => (
              <button
                key={action}
                type="button"
                onClick={() => run(action)}
                disabled={loading !== null}
                className="flex items-center justify-center gap-1.5 px-2 py-3 bg-neon text-black text-[9px] font-black uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-60 rounded-xl"
              >
                {loading === action ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                {label}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 border border-red-500/30 bg-red-500/10 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs font-mono text-red-200/80">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-4 pt-2 border-t border-white/10">
              {result.message && (
                <p className="text-[11px] font-mono text-amber-200/70 leading-relaxed">{result.message}</p>
              )}

              {result.action === 'info' && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Title', result.title || '—'],
                    ['Duration', result.duration_s != null ? `${result.duration_s.toFixed(2)}s` : '—'],
                    ['Size', result.width && result.height ? `${result.width}×${result.height}` : '—'],
                    ['FPS', result.fps != null ? String(result.fps) : '—'],
                    ['Audio', result.has_audio ? 'yes' : 'no'],
                    ['Transcript', result.transcript_status || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="border border-white/10 bg-black/40 p-3 rounded-xl">
                      <div className="text-[8px] font-black uppercase tracking-widest text-white/35 mb-1">{k}</div>
                      <div className="text-sm font-mono text-white/80 break-all">{v}</div>
                    </div>
                  ))}
                </div>
              )}

              {result.action === 'transcript' && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  <div className="text-[9px] font-black uppercase tracking-widest text-neon">
                    {result.source_kind} · {result.matched ?? result.lines?.length ?? 0} lines
                  </div>
                  {(result.lines || []).length === 0 && (
                    <p className="text-xs text-white/40 font-mono">No caption lines.</p>
                  )}
                  {(result.lines || []).map((line, idx) => (
                    <div key={idx} className="text-[11px] text-white/65 font-mono leading-relaxed pl-3 border-l border-neon/30">
                      <span className="text-white/30">{line.start_s.toFixed(1)}s</span> {line.text}
                    </div>
                  ))}
                </div>
              )}

              {result.action === 'motion' && result.scores && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3 text-[10px] font-mono uppercase tracking-wider text-white/45">
                    <span>{result.start_s?.toFixed(1)}s–{result.end_s?.toFixed(1)}s</span>
                    <span>bucket {result.bucket_s}s</span>
                    <span>max {result.max}</span>
                    <span>mean {result.mean}</span>
                  </div>
                  <div className="flex items-end gap-px h-24 bg-black/40 border border-white/10 rounded-xl p-2 overflow-hidden">
                    {result.scores.map((score, idx) => (
                      <div
                        key={idx}
                        title={`${score}`}
                        className="flex-1 min-w-[2px] bg-neon/80 rounded-t-sm"
                        style={{ height: `${Math.max(4, (score / maxScore) * 100)}%` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {result.action === 'frames' && (
                <div className="space-y-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-neon">
                    {result.frames?.length || 0} frames @ {result.fps} fps
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {(result.frames || []).map((frame, idx) => (
                      <div key={idx} className="border border-white/10 rounded-lg overflow-hidden bg-black/50">
                        <img
                          src={`data:${frame.mime};base64,${frame.base64}`}
                          alt={`t=${frame.t_s}`}
                          className="w-full aspect-video object-cover"
                        />
                        <div className="text-[8px] font-mono text-white/40 px-1.5 py-1">{frame.t_s.toFixed(2)}s</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgentScrubPanel;
