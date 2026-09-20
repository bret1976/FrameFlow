import React, { useState } from 'react';
import { Loader2, ShieldCheck, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';

type CoherenceResult = {
  ok?: boolean;
  source?: string;
  verdict?: 'PASS' | 'WARN' | 'FAIL';
  issue?: string;
  explanation?: string;
  evidence_quote?: string;
  clip?: { start_sec: number; end_sec: number; duration_sec: number };
  suggested?: {
    start_sec: number;
    end_sec: number;
    extended_sec: number;
    reason: string;
  };
  speech_tail?: string;
  error?: string;
};

const DEMO_HINT =
  'Cold-viewer story gate: rejects clips that end mid-thought. Inspired by Cutawan editorial-coherence (MIT, reimplemented). No LLM / no keys.';

const EndingCoherencePanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState(
    'Why does she do this? We already tried that one and then'
  );
  const [startSec, setStartSec] = useState('346.25');
  const [endSec, setEndSec] = useState('368.9');
  const [sourceDur, setSourceDur] = useState('420');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CoherenceResult | null>(null);

  const run = async (mode: 'check' | 'demo') => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> =
        mode === 'demo'
          ? { demo: true }
          : {
              action: 'check',
              transcript,
              start_sec: Number(startSec) || 0,
              end_sec: Number(endSec) || 30,
              source_duration_sec: Number(sourceDur) || undefined,
              max_extend_sec: 8,
            };
      const res = await fetch('/api/ending-coherence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'Ending Coherence failed.');
        return;
      }
      setResult(data as CoherenceResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'Ending Coherence request failed.');
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
          <ShieldCheck className="w-4 h-4 text-neon" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            Ending Coherence
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
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
            placeholder="Paste candidate-window transcript"
            className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              value={startSec}
              onChange={(e) => setStartSec(e.target.value)}
              placeholder="start_sec"
              className="rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
            />
            <input
              value={endSec}
              onChange={(e) => setEndSec(e.target.value)}
              placeholder="end_sec"
              className="rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
            />
            <input
              value={sourceDur}
              onChange={(e) => setSourceDur(e.target.value)}
              placeholder="source_dur"
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
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`font-mono text-xs uppercase tracking-wider ${verdictColor}`}>
                  {result.verdict} · {result.issue}
                </span>
                {result.verdict === 'PASS' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-300" />
                )}
              </div>
              <p className="text-[11px] text-white/60">{result.explanation}</p>
              {result.evidence_quote && (
                <p className="text-[10px] font-mono text-white/35">
                  quote: “{result.evidence_quote}”
                </p>
              )}
              {result.suggested && result.suggested.extended_sec > 0 && (
                <p className="text-[10px] font-mono text-neon/90">
                  suggest → {result.suggested.start_sec}s–{result.suggested.end_sec}s (+
                  {result.suggested.extended_sec}s) · {result.suggested.reason}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EndingCoherencePanel;
