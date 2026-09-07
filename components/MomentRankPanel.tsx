import React, { useState } from 'react';
import { Loader2, Sparkles, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';

type RankedMoment = {
  id: string;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  transcript: string;
  scores: { overall: number; hook: number; punchline: number; surprise: number };
  strongest: string;
  explanation: string;
};

type RankResult = {
  ok?: boolean;
  action?: string;
  summary?: string;
  auto_count?: number;
  candidate_count?: number;
  selected?: RankedMoment[];
  error?: string;
};

const DEMO_HINT =
  'Multi-candidate viral moment ranker with overlap + lexical diversity suppression. Inspired by MediaViralClipper (MIT, reimplemented). Differs from Viral Judge (single-clip GO/WARN).';

const MomentRankPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState(
    'Wait — what if the whole playbook was wrong? Watch this. And then she said the budget was fine. No. Seriously. No. Here are three mistakes every creator makes on day one. Subscribe if this saved you an hour.'
  );
  const [duration, setDuration] = useState('180');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RankResult | null>(null);

  const run = async (action: 'rank' | 'demo') => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> =
        action === 'demo'
          ? { demo: true }
          : {
              action: 'rank',
              transcript,
              media_duration_sec: Number(duration) || 180,
              min_duration_sec: 8,
              max_duration_sec: 45,
            };
      const res = await fetch('/api/moment-rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'MomentRank failed.');
        return;
      }
      setResult(data as RankResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'MomentRank request failed.');
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
          <Sparkles className="w-4 h-4 text-neon" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            Moment Rank
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
            rows={4}
            placeholder="Paste transcript (or send timed candidates via API)"
            className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
          />
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Media duration seconds"
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
              onClick={() => run('rank')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
            >
              Rank
            </button>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-white/50 text-xs font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Ranking…
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
          {result?.selected && result.selected.length > 0 && (
            <ul className="space-y-2">
              {result.selected.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
                >
                  <div className="flex justify-between gap-2">
                    <span className="text-xs text-white font-semibold">
                      {m.start_sec}s–{m.end_sec}s{' '}
                      <span className="text-white/40 font-mono">({m.strongest})</span>
                    </span>
                    <span className="text-[10px] font-mono text-neon">{m.scores.overall}</span>
                  </div>
                  <p className="text-[11px] text-white/50 mt-1">{m.transcript}</p>
                  <p className="text-[10px] font-mono text-white/35 mt-1">{m.explanation}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default MomentRankPanel;
