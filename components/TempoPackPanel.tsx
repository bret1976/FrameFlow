import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Timer,
} from 'lucide-react';

type TempoFinding = {
  id: string;
  ok: boolean;
  severity?: string;
  label: string;
  detail: string;
  cue_index?: number;
  hint?: string;
};

type TempoPlanStep = {
  id: string;
  label: string;
  purpose: string;
  finding_ids?: string[];
};

type TempoCue = {
  start_ms: number;
  end_ms: number;
  text: string;
};

type TempoRepairChange = {
  cue_index: number;
  field: string;
  from: number;
  to: number;
  reason: string;
};

type TempoPackResult = {
  ok?: boolean;
  source?: string;
  action?: string;
  summary?: string;
  verdict?: string;
  score?: number;
  findings?: TempoFinding[];
  failing?: string[];
  plan?: TempoPlanStep[];
  cues?: TempoCue[];
  repaired_cues?: TempoCue[];
  changes?: TempoRepairChange[];
  notes?: string[];
  cue_count?: number;
  defaults?: Record<string, unknown>;
  error?: string;
};

const TempoPackPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [srt, setSrt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TempoPackResult | null>(null);

  const run = async (
    action: 'check' | 'repair' | 'plan' | 'demo' | 'defaults' | 'audit'
  ) => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> =
        action === 'demo' || action === 'defaults'
          ? { action }
          : srt.trim()
            ? { action, srt }
            : { action };

      const response = await fetch('/api/tempo-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult(null);
        setError(
          typeof data?.error === 'string' ? data.error : 'TempoPack failed.'
        );
        return;
      }
      setResult(data as TempoPackResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'TempoPack request failed.');
    } finally {
      setLoading(false);
    }
  };

  const verdictColor =
    result?.verdict === 'READY'
      ? 'text-emerald-300'
      : result?.verdict === 'BLOCKED'
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
          <Timer className="w-4 h-4 text-cyan-300" />
          <div>
            <p className="text-sm font-semibold text-white tracking-wide">
              TempoPack
            </p>
            <p className="text-[11px] text-white/40 font-mono">
              Caption timing audit + repair checklist
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-white/40" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/40" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5">
          <label className="block text-[10px] uppercase tracking-wider text-white/40 font-mono pt-3">
            Optional SRT (else use demo cues)
            <textarea
              value={srt}
              onChange={(e) => setSrt(e.target.value)}
              rows={4}
              placeholder={'1\n00:00:00,000 --> 00:00:01,200\nHello world'}
              className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white font-mono"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {(
              [
                'check',
                'repair',
                'plan',
                'demo',
                'defaults',
                'audit',
              ] as const
            ).map((action) => (
              <button
                key={action}
                type="button"
                disabled={loading}
                onClick={() => run(action)}
                className="px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider border border-cyan-400/30 text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-40"
              >
                {action}
              </button>
            ))}
            {loading && (
              <Loader2 className="w-4 h-4 text-cyan-300 animate-spin self-center" />
            )}
          </div>

          {error && (
            <p className="text-xs text-rose-300 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </p>
          )}

          {result && (
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-white/70">{result.summary}</p>
                {result.verdict && (
                  <span className={`text-[11px] font-mono ${verdictColor}`}>
                    {result.verdict}
                    {typeof result.score === 'number' ? ` ${result.score}` : ''}
                  </span>
                )}
              </div>

              {result.findings?.map((f, i) => (
                <div key={`${f.id}-${f.cue_index ?? i}`} className="flex items-start gap-2 text-xs">
                  {f.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle
                      className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                        f.severity === 'block' ? 'text-rose-300' : 'text-amber-300'
                      }`}
                    />
                  )}
                  <div>
                    <span className="text-white/80">{f.label}</span>
                    <span className="text-white/40"> — {f.detail}</span>
                    {f.hint && (
                      <p className="text-white/30 font-mono text-[10px]">
                        {f.hint}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {result.plan?.map((step) => (
                <div
                  key={step.id}
                  className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-2 py-1.5 text-xs"
                >
                  <p className="text-cyan-100 font-medium">{step.label}</p>
                  <p className="text-white/50">{step.purpose}</p>
                </div>
              ))}

              {result.changes && result.changes.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-white/35 font-mono">
                    Timing changes ({result.changes.length})
                  </p>
                  {result.changes.slice(0, 12).map((ch, i) => (
                    <p key={i} className="text-[11px] text-white/50 font-mono">
                      cue {ch.cue_index} {ch.field}: {ch.from} → {ch.to} —{' '}
                      {ch.reason}
                    </p>
                  ))}
                </div>
              )}

              {result.repaired_cues && result.repaired_cues.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-white/35 font-mono">
                    Repaired cues ({result.repaired_cues.length})
                  </p>
                  {result.repaired_cues.slice(0, 6).map((c, i) => (
                    <p key={i} className="text-[11px] text-white/55 font-mono">
                      [{c.start_ms}–{c.end_ms}]{' '}
                      {c.text.replace(/\s+/g, ' ').trim().slice(0, 48) || '(blank)'}
                    </p>
                  ))}
                </div>
              )}

              {result.notes?.map((n, i) => (
                <p key={i} className="text-[11px] text-white/35 font-mono">
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

export default TempoPackPanel;
