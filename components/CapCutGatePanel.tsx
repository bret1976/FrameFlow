import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Scissors,
} from 'lucide-react';

type CapCutCheck = {
  id: string;
  ok: boolean;
  severity?: string;
  label: string;
  detail: string;
};

type CapCutPlanStep = {
  id: string;
  label: string;
  purpose: string;
  in_capcut: string;
};

type CapCutGateResult = {
  ok?: boolean;
  source?: string;
  action?: string;
  summary?: string;
  verdict?: string;
  score?: number;
  platform?: string;
  checks?: CapCutCheck[];
  failing?: string[];
  plan?: CapCutPlanStep[];
  checklist?: Array<{ id: string; label: string; why: string }>;
  notes?: string[];
  error?: string;
};

const CapCutGatePanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState('yt_shorts');
  const [duration, setDuration] = useState('18');
  const [firstCut, setFirstCut] = useState('1.2');
  const [draftName, setDraftName] = useState('retention-cut-0918');
  const [captionSource, setCaptionSource] = useState('srt');
  const [exportPreset, setExportPreset] = useState('1080p');
  const [watermarkRisk, setWatermarkRisk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CapCutGateResult | null>(null);

  const run = async (
    action: 'check' | 'demo' | 'defaults' | 'checklist' | 'plan'
  ) => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> =
        action === 'demo' || action === 'defaults' || action === 'checklist'
          ? { action }
          : {
              action,
              platform,
              width: 1080,
              height: 1920,
              duration_sec: Number(duration),
              first_cut_sec: Number(firstCut),
              fps: 30,
              draft_name: draftName,
              caption_source: captionSource,
              has_audio: true,
              watermark_risk: watermarkRisk,
              export_preset: exportPreset,
              template_intent: 'blank',
              wants_loop: false,
            };

      const response = await fetch('/api/cap-cut-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult(null);
        setError(
          typeof data?.error === 'string' ? data.error : 'CapCutGate failed.'
        );
        return;
      }
      setResult(data as CapCutGateResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'CapCutGate request failed.');
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
          <Scissors className="w-4 h-4 text-fuchsia-300" />
          <div>
            <p className="text-sm font-semibold text-white tracking-wide">
              CapCutGate
            </p>
            <p className="text-[11px] text-white/40 font-mono">
              CapCut draft / export handoff checklist
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
              Platform
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white"
              >
                <option value="yt_shorts">YouTube Shorts</option>
                <option value="ig_reels">IG Reels</option>
                <option value="tiktok">TikTok</option>
                <option value="capcut_generic">CapCut generic</option>
              </select>
            </label>
            <label className="text-[10px] uppercase tracking-wider text-white/40 font-mono">
              Duration (s)
              <input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[10px] uppercase tracking-wider text-white/40 font-mono">
              First cut (s)
              <input
                value={firstCut}
                onChange={(e) => setFirstCut(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[10px] uppercase tracking-wider text-white/40 font-mono">
              Export preset
              <input
                value={exportPreset}
                onChange={(e) => setExportPreset(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[10px] uppercase tracking-wider text-white/40 font-mono col-span-2">
              Draft name
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[10px] uppercase tracking-wider text-white/40 font-mono">
              Caption source
              <select
                value={captionSource}
                onChange={(e) => setCaptionSource(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-xs text-white"
              >
                <option value="srt">SRT</option>
                <option value="ass">ASS</option>
                <option value="burned">Burned-in</option>
                <option value="auto">Auto</option>
                <option value="none">None</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-[11px] text-white/60 mt-5">
              <input
                type="checkbox"
                checked={watermarkRisk}
                onChange={(e) => setWatermarkRisk(e.target.checked)}
                className="rounded border-white/20"
              />
              Watermark risk (free tier)
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['check', 'plan', 'demo', 'checklist', 'defaults'] as const).map(
              (action) => (
                <button
                  key={action}
                  type="button"
                  disabled={loading}
                  onClick={() => run(action)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider border border-fuchsia-400/30 text-fuchsia-200 hover:bg-fuchsia-400/10 disabled:opacity-40"
                >
                  {action}
                </button>
              )
            )}
            {loading && (
              <Loader2 className="w-4 h-4 text-fuchsia-300 animate-spin self-center" />
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
                  className="rounded-lg border border-fuchsia-400/20 bg-fuchsia-400/5 px-2 py-1.5 text-xs"
                >
                  <p className="text-fuchsia-100 font-medium">{step.label}</p>
                  <p className="text-white/50">{step.purpose}</p>
                  <p className="text-white/30 font-mono text-[10px]">
                    {step.in_capcut}
                  </p>
                </div>
              ))}

              {result.checklist?.map((item) => (
                <div key={item.id} className="text-xs text-white/60">
                  <span className="text-white/80">{item.label}</span>
                  <span className="text-white/35"> — {item.why}</span>
                </div>
              ))}

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

export default CapCutGatePanel;
