import React, { useState } from 'react';
import { Loader2, Sparkles, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

type ViralScores = {
  hook: number;
  retention: number;
  shareability: number;
  clarity: number;
};

type ViralResult = {
  ok: boolean;
  source: string;
  overall: 'GO' | 'WARN' | 'NO-GO';
  scores: ViralScores;
  reasons: string[];
  caption_variants: string[];
  highlight_windows?: { start_sec: number; end_sec: number; label: string }[];
};

const overallColor = (overall: string) => {
  if (overall === 'GO') return 'text-neon border-neon/40 bg-neon/10';
  if (overall === 'WARN') return 'text-amber-300 border-amber-400/40 bg-amber-400/10';
  return 'text-red-400 border-red-500/40 bg-red-500/10';
};

const ViralJudgePanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [hookText, setHookText] = useState('');
  const [durationSec, setDurationSec] = useState('30');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ViralResult | null>(null);

  const runJudge = async () => {
    setLoading(true);
    setError(null);
    try {
      const duration = Number(durationSec);
      const body: Record<string, unknown> = {};
      if (title.trim()) body.title = title.trim();
      if (transcript.trim()) body.transcript = transcript.trim();
      if (hookText.trim()) body.hook_text = hookText.trim();
      if (Number.isFinite(duration) && duration > 0) body.duration_sec = duration;

      const res = await fetch('/api/viral-judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'Viral judge failed.');
        return;
      }
      setResult(data as ViralResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'Viral judge request failed.');
    } finally {
      setLoading(false);
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
          <Sparkles className="w-4 h-4" />
          Viral Judge
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
      </button>

      {open && (
        <div className="mt-3 border border-white/10 bg-[#0a0a0a] rounded-2xl p-5 space-y-4">
          <p className="text-[9px] font-mono uppercase tracking-widest text-white/35">
            Paste title / transcript / duration — heuristic GO·WARN·NO-GO (no API keys)
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-[10px] font-bold text-neon uppercase tracking-widest">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent border border-white/10 px-3 py-2 text-sm text-white/80 focus:border-neon outline-none font-mono"
                placeholder="Clip title"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[10px] font-bold text-neon uppercase tracking-widest">Hook text</span>
              <input
                value={hookText}
                onChange={(e) => setHookText(e.target.value)}
                className="w-full bg-transparent border border-white/10 px-3 py-2 text-sm text-white/80 focus:border-neon outline-none font-mono"
                placeholder="First line spoken"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[10px] font-bold text-neon uppercase tracking-widest">Duration (sec)</span>
              <input
                value={durationSec}
                onChange={(e) => setDurationSec(e.target.value)}
                type="number"
                min={1}
                className="w-full bg-transparent border border-white/10 px-3 py-2 text-sm text-white/80 focus:border-neon outline-none font-mono"
              />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-[10px] font-bold text-neon uppercase tracking-widest">Transcript</span>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={4}
                className="w-full bg-transparent border border-white/10 p-3 text-sm text-white/80 focus:border-neon outline-none resize-none font-mono"
                placeholder="Paste spoken transcript…"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={runJudge}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neon text-black text-[10px] font-black uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Run Viral Judge
          </button>

          {error && (
            <div className="flex items-start gap-2 p-3 border border-red-500/30 bg-red-500/10 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs font-mono text-red-200/80">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-4 pt-2 border-t border-white/10">
              <div className={`inline-flex px-3 py-1 border rounded-full text-[10px] font-black tracking-widest ${overallColor(result.overall)}`}>
                {result.overall}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['hook', 'retention', 'shareability', 'clarity'] as const).map((key) => (
                  <div key={key} className="border border-white/10 bg-black/40 p-3 rounded-xl">
                    <div className="text-[8px] font-black uppercase tracking-widest text-white/35 mb-1">{key}</div>
                    <div className="text-2xl font-black font-display text-white">{result.scores[key]}</div>
                  </div>
                ))}
              </div>
              <ul className="space-y-1.5">
                {result.reasons.map((reason, idx) => (
                  <li key={idx} className="text-[11px] text-white/55 font-mono leading-relaxed pl-3 border-l border-neon/30">
                    {reason}
                  </li>
                ))}
              </ul>
              {result.caption_variants?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[9px] font-black uppercase tracking-widest text-neon">Caption variants</div>
                  {result.caption_variants.map((cap, idx) => (
                    <div key={idx} className="text-xs text-white/70 font-mono bg-white/5 border border-white/10 p-3 rounded-xl">
                      {cap}
                    </div>
                  ))}
                </div>
              )}
              {result.highlight_windows && result.highlight_windows.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.highlight_windows.map((win, idx) => (
                    <span
                      key={idx}
                      className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 border border-white/15 text-white/50 rounded-lg"
                    >
                      {win.label} {win.start_sec}s–{win.end_sec}s
                    </span>
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

export default ViralJudgePanel;
