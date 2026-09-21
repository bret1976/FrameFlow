import React, { useState } from 'react';
import {
  Loader2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

type GateRow = {
  id?: string;
  label?: string;
  verdict?: 'PASS' | 'WARN' | 'FAIL';
  evidence?: string;
  notes?: string[];
};

type PromoteResult = {
  ok?: boolean;
  source?: string;
  action?: string;
  slug?: string;
  verdict?: 'PASS' | 'WARN' | 'FAIL';
  promote?: 'PROMOTE-OK' | 'PROMOTE-BLOCKED';
  summary?: string;
  gates?: GateRow[];
  blocked_reasons?: string[];
  error?: string;
};

const DEMO_HINT =
  'Multi-gate refuse-to-ship: 45–58s window, −16 LUFS, word integrity, boundary words, filler final, evidence freshness → PROMOTE-OK / BLOCKED. Inspired by jayemaoFYNO/clip-factory (MIT, reimplemented). No LLM / no keys.';

const PromoteGatePanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('02-half-word');
  const [duration, setDuration] = useState('61.2');
  const [lufs, setLufs] = useState('-12.4');
  const [tp, setTp] = useState('0.2');
  const [transcript, setTranscript] = useState(
    'uh so yeah the uh product then ships um tomorrow'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PromoteResult | null>(null);

  const run = async (mode: 'check' | 'demo' | 'demo-pass' | 'defaults') => {
    setLoading(true);
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (mode === 'demo') body = { demo: true };
      else if (mode === 'demo-pass') body = { demo: true, demo_mode: 'pass' };
      else if (mode === 'defaults') body = { action: 'defaults' };
      else {
        body = {
          action: 'check',
          slug,
          duration_sec: Number(duration) || undefined,
          lufs: Number(lufs) || undefined,
          true_peak_dbtp: Number(tp),
          transcript,
          junctions: [
            {
              at_sec: 12.1,
              prev_word: 'the',
              next_word: 'product',
              eaten_sec: 0.18,
            },
            {
              at_sec: 30.0,
              prev_word: 'ships',
              next_word: 'tomorrow',
              eaten_sec: 0.02,
            },
          ],
          words: [
            { word: 'uh', start_sec: 0.0, end_sec: 0.2 },
            { word: 'so', start_sec: 0.25, end_sec: 0.4 },
            { word: 'yeah', start_sec: 0.45, end_sec: 0.7 },
            { word: 'the', start_sec: 12.0, end_sec: 12.15 },
            { word: 'uh', start_sec: 12.2, end_sec: 12.35 },
            { word: 'product', start_sec: 12.4, end_sec: 12.8 },
          ],
          candidate_mtime: 1_700_000_100_000,
          evidence: [
            { name: 'built.json', mtime: 1_700_000_050_000 },
            { name: 'loudness.json', mtime: 1_700_000_090_000 },
          ],
        };
      }
      const res = await fetch('/api/promote-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'PromoteGate failed.');
        return;
      }
      setResult(data as PromoteResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'PromoteGate request failed.');
    } finally {
      setLoading(false);
    }
  };

  const verdictColor =
    result?.promote === 'PROMOTE-OK'
      ? 'text-emerald-300'
      : result?.promote === 'PROMOTE-BLOCKED'
        ? 'text-red-300'
        : result?.verdict === 'WARN'
          ? 'text-amber-300'
          : 'text-white/70';

  return (
    <div className="w-full max-w-xl mt-3 border border-white/10 rounded-[1.5rem] bg-black/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-300" />
          <span className="text-sm font-medium text-white/90">PromoteGate</span>
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            refuse-to-ship
          </span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-white/50" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/50" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5">
          <p className="text-[11px] text-white/45 leading-relaxed pt-3">{DEMO_HINT}</p>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-white/50 space-y-1">
              Slug
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[11px] text-white/50 space-y-1">
              Duration (s)
              <input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[11px] text-white/50 space-y-1">
              LUFS
              <input
                value={lufs}
                onChange={(e) => setLufs(e.target.value)}
                className="w-full rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[11px] text-white/50 space-y-1">
              True peak (dBTP)
              <input
                value={tp}
                onChange={(e) => setTp(e.target.value)}
                className="w-full rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
          </div>

          <label className="block text-[11px] text-white/50 space-y-1">
            Finished transcript
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={2}
              className="w-full rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-white"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => run('check')}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 hover:bg-cyan-500/30 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : null} Run gates
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('demo')}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 disabled:opacity-50"
            >
              Demo block
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('demo-pass')}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-200 border border-emerald-400/20 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              Demo pass
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('defaults')}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 disabled:opacity-50"
            >
              Defaults
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/50 p-3">
              <div className="flex items-center gap-2">
                {result.promote === 'PROMOTE-OK' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-300" />
                )}
                <span className={`text-sm font-semibold ${verdictColor}`}>
                  {result.promote || result.verdict || '—'}
                </span>
                <span className="text-[10px] text-white/35">{result.source}</span>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">{result.summary}</p>
              {Array.isArray(result.gates) && result.gates.length > 0 && (
                <ul className="space-y-1.5">
                  {result.gates.map((g) => (
                    <li
                      key={g.id || g.label}
                      className="text-[11px] border border-white/5 rounded-lg px-2 py-1.5 bg-white/[0.02]"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="text-white/80">{g.label || g.id}</span>
                        <span
                          className={
                            g.verdict === 'PASS'
                              ? 'text-emerald-300'
                              : g.verdict === 'WARN'
                                ? 'text-amber-300'
                                : 'text-red-300'
                          }
                        >
                          {g.verdict}
                        </span>
                      </div>
                      {g.evidence && (
                        <div className="text-white/35 mt-0.5">{g.evidence}</div>
                      )}
                      {g.notes?.[0] && (
                        <div className="text-white/45 mt-0.5">{g.notes[0]}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {Array.isArray(result.blocked_reasons) &&
                result.blocked_reasons.length > 0 && (
                  <div className="text-[11px] text-red-200/80 space-y-0.5">
                    {result.blocked_reasons.slice(0, 6).map((r, i) => (
                      <div key={i}>✗ {r}</div>
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

export default PromoteGatePanel;
