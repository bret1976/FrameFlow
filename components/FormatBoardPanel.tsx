import React, { useState } from 'react';
import { Loader2, LayoutGrid, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';

type FormatRow = {
  slug: string;
  name: string;
  hypothesis: string;
  avoid_when: string;
  duration_sec: number;
  tags: string[];
  format: { n: number; status: string; avg_retention_pct?: number | null };
};

type Match = {
  format: FormatRow;
  score: number;
  reasons: string[];
  honesty_label: string;
};

type BoardResult = {
  ok?: boolean;
  action?: string;
  formats?: FormatRow[];
  matches?: Match[];
  honesty?: { ok: boolean; rules: string[]; violations: string[] };
  summary?: string;
  error?: string;
};

const DEMO_HINT =
  'Retention format board with honesty rules (n=0 untested; n<5 direction). Inspired by keepwatching (reimplemented).';

const FormatBoardPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('ranking list for creator finance tips');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BoardResult | null>(null);

  const run = async (action: 'list' | 'match' | 'score' | 'honesty' | 'demo') => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> =
        action === 'demo'
          ? { demo: true }
          : action === 'list' || action === 'honesty'
            ? { action }
            : { action, topic, limit: 6 };

      const res = await fetch('/api/format-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'FormatBoard failed.');
        return;
      }
      setResult(data as BoardResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'FormatBoard request failed.');
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
          <LayoutGrid className="w-4 h-4 text-neon" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            Format Board
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
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic / brief for match & score"
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
              onClick={() => run('list')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
            >
              List
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('match')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
            >
              Match
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('score')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
            >
              Score
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('honesty')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
            >
              Honesty
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
          {result?.matches && result.matches.length > 0 && (
            <ul className="space-y-2">
              {result.matches.map((m) => (
                <li
                  key={m.format.slug}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
                >
                  <div className="flex justify-between gap-2">
                    <span className="text-xs text-white font-semibold">
                      {m.format.name}{' '}
                      <span className="text-white/40 font-mono">({m.format.slug})</span>
                    </span>
                    <span className="text-[10px] font-mono text-neon">{m.score}</span>
                  </div>
                  <p className="text-[11px] text-white/50 mt-1">{m.format.hypothesis}</p>
                  <p className="text-[10px] font-mono text-white/35 mt-1">
                    {m.honesty_label}
                    {m.reasons?.length ? ` · ${m.reasons.slice(0, 3).join('; ')}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {!result?.matches?.length && result?.formats && result.formats.length > 0 && (
            <ul className="space-y-1 max-h-48 overflow-auto">
              {result.formats.map((f) => (
                <li key={f.slug} className="text-[11px] font-mono text-white/55">
                  {f.slug} · n={f.format?.n ?? 0} · {f.format?.status}
                </li>
              ))}
            </ul>
          )}
          {result?.honesty && !result.honesty.ok && (
            <p className="text-[11px] text-amber-300/90 font-mono">
              Violations: {result.honesty.violations.join('; ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default FormatBoardPanel;
