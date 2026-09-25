import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Type,
} from 'lucide-react';

type StyleEntry = {
  id: string;
  name: string;
  category: string;
  animation: string;
  font?: string;
  primary?: string;
  highlight?: string;
  best_for?: string;
};

type StyleCheck = {
  id: string;
  ok: boolean;
  severity?: string;
  label: string;
  detail: string;
};

type StylePlanStep = {
  id: string;
  label: string;
  purpose: string;
  in_ass: string;
};

type StylePackResult = {
  ok?: boolean;
  source?: string;
  action?: string;
  summary?: string;
  verdict?: string;
  score?: number;
  style?: StyleEntry;
  styles?: StyleEntry[];
  checks?: StyleCheck[];
  failing?: string[];
  plan?: StylePlanStep[];
  notes?: string[];
  ass_preview?: string;
  error?: string;
};

const StylePackPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [styleId, setStyleId] = useState('pulse_cyan');
  const [niche, setNiche] = useState('business hooks');
  const [exportFormat, setExportFormat] = useState('ass');
  const [outlinePx, setOutlinePx] = useState('5');
  const [marginV, setMarginV] = useState('240');
  const [wordTiming, setWordTiming] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StylePackResult | null>(null);

  const run = async (
    action: 'check' | 'demo' | 'defaults' | 'list' | 'pick' | 'plan' | 'styles'
  ) => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> =
        action === 'demo' ||
        action === 'defaults' ||
        action === 'list' ||
        action === 'styles'
          ? { action }
          : action === 'pick'
            ? { action, niche, style_id: styleId }
            : {
                action,
                style_id: styleId,
                niche,
                export_format: exportFormat,
                outline_px: Number(outlinePx),
                margin_v: Number(marginV),
                width: 1080,
                height: 1920,
                word_timing: wordTiming,
                max_chars_per_line: 24,
              };

      const response = await fetch('/api/style-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult(null);
        setError(
          typeof data?.error === 'string' ? data.error : 'StylePack failed.'
        );
        return;
      }
      const packed = data as StylePackResult;
      setResult(packed);
      if (packed.style?.id) setStyleId(packed.style.id);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'StylePack request failed.');
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
          <Type className="w-4 h-4 text-cyan-300" />
          <div>
            <p className="text-sm font-semibold text-white tracking-wide">
              StylePack
            </p>
            <p className="text-[11px] text-white/40 font-mono">
              ASS caption style catalog + burn-in checklist
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
          <div className="grid grid-cols-2 gap-2 pt-3">
            <label className="text-[10px] uppercase tracking-wider text-white/40 font-mono">
              Style
              <select
                value={styleId}
                onChange={(e) => setStyleId(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white"
              >
                <option value="pulse_cyan">Pulse Cyan</option>
                <option value="amber_blast">Amber Blast</option>
                <option value="crimson_box">Crimson Box</option>
                <option value="karaoke_wave">Karaoke Wave</option>
                <option value="swiss_min">Swiss Min</option>
                <option value="spring_pop">Spring Pop</option>
                <option value="essay_gold">Essay Gold</option>
                <option value="luxe_serif">Luxe Serif</option>
                <option value="neon_duo">Neon Duo</option>
                <option value="podcast_mark">Podcast Mark</option>
                <option value="terminal_green">Terminal Green</option>
                <option value="noir_type">Noir Type</option>
              </select>
            </label>
            <label className="text-[10px] uppercase tracking-wider text-white/40 font-mono">
              Export
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white"
              >
                <option value="ass">ASS</option>
                <option value="burned">Burned-in</option>
                <option value="srt">SRT</option>
                <option value="vtt">VTT</option>
                <option value="none">None</option>
              </select>
            </label>
            <label className="text-[10px] uppercase tracking-wider text-white/40 font-mono col-span-2">
              Niche (for pick)
              <input
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[10px] uppercase tracking-wider text-white/40 font-mono">
              Outline (px)
              <input
                value={outlinePx}
                onChange={(e) => setOutlinePx(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[10px] uppercase tracking-wider text-white/40 font-mono">
              MarginV (px)
              <input
                value={marginV}
                onChange={(e) => setMarginV(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-white/60 mt-5 col-span-2">
              <input
                type="checkbox"
                checked={wordTiming}
                onChange={(e) => setWordTiming(e.target.checked)}
                className="rounded border-white/20"
              />
              Word-level timing available
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                'check',
                'pick',
                'plan',
                'list',
                'demo',
                'defaults',
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

              {result.style && (
                <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-2 py-1.5 text-xs">
                  <p className="text-cyan-100 font-medium">
                    {result.style.name}{' '}
                    <span className="text-white/40 font-mono">
                      {result.style.id}
                    </span>
                  </p>
                  <p className="text-white/45">
                    {result.style.category}/{result.style.animation}
                    {result.style.best_for ? ` — ${result.style.best_for}` : ''}
                  </p>
                </div>
              )}

              {result.checks?.map((c) => (
                <div key={c.id} className="flex items-start gap-2 text-xs">
                  {c.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle
                      className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                        c.severity === 'block' ? 'text-rose-300' : 'text-amber-300'
                      }`}
                    />
                  )}
                  <div>
                    <span className="text-white/80">{c.label}</span>
                    <span className="text-white/40"> — {c.detail}</span>
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
                  <p className="text-white/30 font-mono text-[10px]">
                    {step.in_ass}
                  </p>
                </div>
              ))}

              {result.styles && result.styles.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-white/35 font-mono">
                    Catalog ({result.styles.length})
                  </p>
                  {result.styles.slice(0, 8).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStyleId(s.id)}
                      className="block w-full text-left text-xs text-white/60 hover:text-cyan-200"
                    >
                      <span className="text-white/85">{s.name}</span>
                      <span className="text-white/35">
                        {' '}
                        · {s.category}/{s.animation}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {result.ass_preview && (
                <pre className="text-[10px] font-mono text-white/35 whitespace-pre-wrap max-h-32 overflow-auto">
                  {result.ass_preview}
                </pre>
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

export default StylePackPanel;
