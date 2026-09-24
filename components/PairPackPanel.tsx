import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
} from 'lucide-react';

type PairIssue = {
  id: string;
  ok: boolean;
  label: string;
  detail: string;
};

type PairScore = {
  title: string;
  thumb?: string;
  chars: number;
  score: number;
  verdict: string;
  issues: PairIssue[];
  goods: string[];
};

type PairPackResult = {
  ok?: boolean;
  source?: string;
  action?: string;
  summary?: string;
  verdict?: string;
  score?: number;
  pair?: PairScore;
  ranked?: PairScore[];
  brief?: {
    title: string;
    thumb_words: string[];
    expression: string;
    framing: string;
    contrast_note: string;
    do_not_repeat: string[];
  };
  notes?: string[];
  error?: string;
};

const PairPackPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('I cut Shorts retention drop by 37%');
  const [thumb, setThumb] = useState('DO THIS');
  const [titles, setTitles] = useState(
    'I cut Shorts retention drop by 37%\nThe ULTIMATE INSANE Secret to Amazing Growth\nStop posting every day — do this instead'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PairPackResult | null>(null);

  const run = async (
    action: 'check' | 'rank' | 'demo' | 'defaults' | 'brief'
  ) => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> =
        action === 'demo' || action === 'defaults'
          ? { action }
          : action === 'rank'
            ? { action, titles, thumb }
            : action === 'brief'
              ? { action, title, niche: 'faceless YouTube Shorts' }
              : { action, title, thumb };

      const response = await fetch('/api/pair-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'PairPack failed.');
        return;
      }
      setResult(data as PairPackResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'PairPack request failed.');
    } finally {
      setLoading(false);
    }
  };

  const verdictColor =
    result?.verdict === 'SHIP'
      ? 'text-emerald-300'
      : result?.verdict === 'REWRITE'
        ? 'text-rose-300'
        : 'text-amber-300';

  const renderPair = (p: PairScore, key: string) => (
    <div
      key={key}
      className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 space-y-1"
    >
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider font-mono text-white/40">
        <span>
          {p.score}/100 · {p.chars} chars
        </span>
        <span
          className={
            p.verdict === 'SHIP'
              ? 'text-emerald-300'
              : p.verdict === 'REWRITE'
                ? 'text-rose-300'
                : 'text-amber-300'
          }
        >
          {p.verdict}
        </span>
      </div>
      <p className="text-sm text-white font-medium leading-snug">"{p.title}"</p>
      {p.thumb && (
        <p className="text-[11px] text-cyan-200/70 font-mono">thumb: {p.thumb}</p>
      )}
      {p.issues?.slice(0, 6).map((c) => (
        <div key={`${key}-${c.id}`} className="flex items-start gap-2 text-xs">
          {c.ok ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
          )}
          <div>
            <span className="text-white/80">{c.label}</span>
            <span className="text-white/40"> — {c.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="w-full max-w-xl mt-3 border border-white/10 rounded-[1.5rem] bg-black/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-300" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            PairPack
          </span>
          <span className="text-[9px] uppercase tracking-wider text-white/35">
            title · thumb · score
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
          <p className="text-[11px] text-white/45 pt-3 leading-relaxed">
            Lint title + thumbnail as one click-surface unit. Inspired by
            youtube-agent-skill /yt-package (MIT) — original FrameFlow TypeScript,
            no vendored Python.
          </p>

          <label className="block text-[10px] uppercase tracking-wider text-white/40">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block text-[10px] uppercase tracking-wider text-white/40">
            Thumbnail text (≤3 words)
            <input
              value={thumb}
              onChange={(e) => setThumb(e.target.value)}
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block text-[10px] uppercase tracking-wider text-white/40">
            Rank list (one title per line)
            <textarea
              value={titles}
              onChange={(e) => setTitles(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white font-mono"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {(['check', 'rank', 'brief', 'demo', 'defaults'] as const).map((a) => (
              <button
                key={a}
                type="button"
                disabled={loading}
                onClick={() => run(a)}
                className="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-mono bg-cyan-500/20 text-cyan-100 border border-cyan-400/30 hover:bg-cyan-500/30 disabled:opacity-50"
              >
                {a}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-white/50 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running PairPack…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-rose-300 text-xs">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-white/50">
                  {result.source} · {result.action}
                </span>
                {result.verdict && (
                  <span className={`font-mono text-xs ${verdictColor}`}>
                    {result.verdict}
                    {typeof result.score === 'number' ? ` · ${result.score}` : ''}
                  </span>
                )}
              </div>
              {result.summary && (
                <p className="text-sm text-white/80">{result.summary}</p>
              )}
              {result.pair && renderPair(result.pair, 'pair')}
              {result.ranked?.map((p, i) => renderPair(p, `rank-${i}`))}
              {result.brief && (
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-3 py-2 space-y-1 text-xs">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-cyan-200/70">
                    thumb brief
                  </p>
                  <p className="text-white/80">
                    words: <span className="font-mono text-cyan-100">{result.brief.thumb_words.join(' ')}</span>
                  </p>
                  <p className="text-white/50">{result.brief.expression}</p>
                  <p className="text-white/50">{result.brief.framing}</p>
                  <p className="text-white/40">{result.brief.contrast_note}</p>
                  {result.brief.do_not_repeat?.length > 0 && (
                    <p className="text-amber-200/60">
                      do not repeat: {result.brief.do_not_repeat.join(', ')}
                    </p>
                  )}
                </div>
              )}
              {result.notes?.map((n) => (
                <p key={n} className="text-[11px] text-white/40">
                  {n}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PairPackPanel;
