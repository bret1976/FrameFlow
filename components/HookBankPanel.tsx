import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
} from 'lucide-react';

type HookPick = {
  id: string;
  trigger: string;
  formula: string;
  filled: string;
  example: string;
  needs_data?: boolean;
};

type HookCheck = {
  id: string;
  ok: boolean;
  label: string;
  detail: string;
};

type HookBankResult = {
  ok?: boolean;
  source?: string;
  action?: string;
  summary?: string;
  verdict?: string;
  picks?: HookPick[];
  checks?: HookCheck[];
  notes?: string[];
  error?: string;
};

const HookBankPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('faceless YouTube Shorts');
  const [trigger, setTrigger] = useState('');
  const [hook, setHook] = useState('Stop posting every day — do this instead');
  const [usedIds, setUsedIds] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HookBankResult | null>(null);

  const run = async (
    action: 'pick' | 'rotate' | 'check' | 'demo' | 'defaults' | 'triggers' | 'list'
  ) => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> =
        action === 'demo' || action === 'defaults' || action === 'triggers'
          ? { action }
          : action === 'check'
            ? { action, hook }
            : action === 'list'
              ? { action, trigger: trigger || undefined }
              : {
                  action,
                  topic,
                  niche: topic,
                  count: 3,
                  trigger: trigger || undefined,
                  used_ids: usedIds
                    .split(/[\s,]+/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                  slots: {
                    thing: 'end-card chaining',
                    problem: 'dropping at second 3',
                    number: '3',
                    result: 'better retention',
                  },
                };

      const response = await fetch('/api/hook-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'HookBank failed.');
        return;
      }
      setResult(data as HookBankResult);
      if (
        (action === 'pick' || action === 'rotate') &&
        Array.isArray(data?.picks) &&
        data.picks.length
      ) {
        const next = data.picks.map((p: HookPick) => p.id).join(',');
        setUsedIds((prev) =>
          [prev, next]
            .filter(Boolean)
            .join(',')
            .split(/[\s,]+/)
            .filter(Boolean)
            .slice(-24)
            .join(',')
        );
      }
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'HookBank request failed.');
    } finally {
      setLoading(false);
    }
  };

  const verdictColor =
    result?.verdict === 'STRONG'
      ? 'text-emerald-300'
      : result?.verdict === 'WEAK'
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
          <Sparkles className="w-4 h-4 text-fuchsia-300" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            HookBank
          </span>
          <span className="text-[9px] uppercase tracking-wider text-white/35">
            rotate · fill · check
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
            Rotating English hook formulas for Shorts / Reels / TikTok. Inspired by
            ShortsForgeAI (MIT) — original FrameFlow bank, no vendored JSON.
          </p>

          <label className="block text-[10px] uppercase tracking-wider text-white/40">
            Topic / niche
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block text-[10px] uppercase tracking-wider text-white/40">
            Trigger (optional)
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            >
              <option value="">any</option>
              <option value="curiosity">curiosity</option>
              <option value="contrarian">contrarian</option>
              <option value="authority">authority</option>
              <option value="emotional">emotional</option>
              <option value="list">list</option>
              <option value="question">question</option>
              <option value="story">story</option>
              <option value="negation">negation</option>
            </select>
          </label>

          <label className="block text-[10px] uppercase tracking-wider text-white/40">
            Check this hook
            <input
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {(['pick', 'rotate', 'check', 'demo', 'defaults'] as const).map((a) => (
              <button
                key={a}
                type="button"
                disabled={loading}
                onClick={() => run(a)}
                className="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-mono bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-400/30 hover:bg-fuchsia-500/30 disabled:opacity-50"
              >
                {a}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-white/50 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running HookBank…
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
                  <span className={`font-mono text-xs ${verdictColor}`}>{result.verdict}</span>
                )}
              </div>
              {result.summary && (
                <p className="text-sm text-white/80">{result.summary}</p>
              )}
              {result.picks?.map((p) => (
                <div
                  key={`${p.id}-${p.filled}`}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 space-y-1"
                >
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/40 font-mono">
                    <span>{p.id}</span>
                    <span>·</span>
                    <span>{p.trigger}</span>
                    {p.needs_data && (
                      <span className="text-amber-300">needs data</span>
                    )}
                  </div>
                  <p className="text-sm text-white font-medium leading-snug">{p.filled}</p>
                  <p className="text-[11px] text-white/35">{p.formula}</p>
                </div>
              ))}
              {result.checks?.map((c) => (
                <div key={c.id} className="flex items-start gap-2 text-xs">
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

export default HookBankPanel;
