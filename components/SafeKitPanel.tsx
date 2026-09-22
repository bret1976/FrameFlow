import React, { useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Shield,
} from 'lucide-react';

type Contrast = {
  ratio: number;
  grade: string;
  wcagAA: boolean;
  wcagAAA: boolean;
  foreground?: string;
  background?: string;
};

type SafeArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SafeKitResult = {
  ok?: boolean;
  source?: string;
  action?: string;
  summary?: string;
  platform?: { key: string; label: string; margins?: { top: number; bottom: number; left: number; right: number } };
  safe_area?: SafeArea;
  caption_band?: SafeArea;
  rect_inside?: boolean | null;
  contrast?: Contrast;
  srt?: string;
  srt_stats?: { count: number; avgChars: number; durationSeconds: number };
  high_contrast_pairs?: { label: string; foreground: string; background: string }[];
  error?: string;
};

const SAMPLE =
  'Why most vertical crops fail in the first two seconds — keep titles inside the middle third and leave the bottom UI alone.';

const SafeKitPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState('all');
  const [foreground, setForeground] = useState('#ffffff');
  const [background, setBackground] = useState('#0a1628');
  const [transcript, setTranscript] = useState(SAMPLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SafeKitResult | null>(null);

  const run = async (action: 'safe-zone' | 'contrast' | 'srt' | 'demo' | 'defaults') => {
    setLoading(true);
    setError(null);
    try {
      const body =
        action === 'safe-zone'
          ? {
              action,
              platform,
              rect: { x: 80, y: 1720, width: 900, height: 100 },
              image_width: 1920,
              image_height: 1080,
            }
          : action === 'contrast'
            ? { action, foreground, background }
            : action === 'srt'
              ? { action, transcript, wordsPerCaption: 5, maxLineLength: 32 }
              : { action };

      const response = await fetch('/api/safe-kit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'SafeKit failed.');
        return;
      }
      setResult(data as SafeKitResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'SafeKit request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl mt-3 border border-white/10 rounded-[1.5rem] bg-black/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-300" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            SafeKit
          </span>
          <span className="text-[9px] uppercase tracking-wider text-white/35">
            zones · contrast · srt
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
          <p className="text-[11px] text-white/40 font-mono pt-3 leading-relaxed">
            Vertical preflight: platform UI safe zones (Shorts/TikTok/Reels), WCAG thumbnail
            contrast grades, and WPM-estimated SRT. Local only — no keys. Inspired by shorts-kit
            (reimplemented).
          </p>

          <div className="grid grid-cols-3 gap-2">
            <label className="text-[10px] text-white/40 font-mono col-span-1">
              Platform
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                className="mt-1 w-full rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-white"
              >
                <option value="all">All (worst)</option>
                <option value="shorts">YouTube Shorts</option>
                <option value="tiktok">TikTok</option>
                <option value="reels">Instagram Reels</option>
              </select>
            </label>
            <label className="text-[10px] text-white/40 font-mono">
              Text
              <input
                value={foreground}
                onChange={(event) => setForeground(event.target.value)}
                className="mt-1 w-full rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-white font-mono"
              />
            </label>
            <label className="text-[10px] text-white/40 font-mono">
              BG
              <input
                value={background}
                onChange={(event) => setBackground(event.target.value)}
                className="mt-1 w-full rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-white font-mono"
              />
            </label>
          </div>

          <textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            rows={3}
            placeholder="Paste transcript for SRT estimate"
            className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => run('safe-zone')}
              className="px-3 py-1.5 rounded-full bg-cyan-500/20 text-cyan-200 text-[10px] font-mono uppercase tracking-wider border border-cyan-400/20 hover:bg-cyan-500/30 disabled:opacity-40"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : null} Safe zone
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('contrast')}
              className="px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-200 text-[10px] font-mono uppercase tracking-wider border border-amber-400/20 hover:bg-amber-500/25 disabled:opacity-40"
            >
              Contrast
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('srt')}
              className="px-3 py-1.5 rounded-full bg-violet-500/15 text-violet-200 text-[10px] font-mono uppercase tracking-wider border border-violet-400/20 hover:bg-violet-500/25 disabled:opacity-40"
            >
              SRT
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('demo')}
              className="px-3 py-1.5 rounded-full bg-neon/15 text-neon text-[10px] font-mono uppercase tracking-wider hover:bg-neon/25 disabled:opacity-40"
            >
              Demo
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run('defaults')}
              className="px-3 py-1.5 rounded-full bg-white/5 text-white/50 text-[10px] font-mono uppercase tracking-wider hover:bg-white/10 disabled:opacity-40"
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
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-cyan-200 font-mono">{result.summary}</span>
                <span className="text-[9px] text-white/30 whitespace-nowrap">{result.source}</span>
              </div>

              {result.safe_area && (
                <div className="text-[10px] text-white/50 font-mono">
                  {result.platform?.label || 'Platform'} · safe {result.safe_area.width}×
                  {result.safe_area.height} @ ({result.safe_area.x},{result.safe_area.y})
                  {typeof result.rect_inside === 'boolean' && (
                    <span className={result.rect_inside ? ' text-emerald-300' : ' text-rose-300'}>
                      {' '}
                      · sample title {result.rect_inside ? 'INSIDE' : 'UNDER UI'}
                    </span>
                  )}
                </div>
              )}

              {result.contrast && (
                <div className="text-[10px] font-mono text-white/55">
                  {result.contrast.foreground} on {result.contrast.background} →{' '}
                  <span className="text-amber-200">
                    {result.contrast.ratio}:1 {result.contrast.grade}
                  </span>{' '}
                  · AA {result.contrast.wcagAA ? '✓' : '✗'} · AAA {result.contrast.wcagAAA ? '✓' : '✗'}
                </div>
              )}

              {result.srt_stats && (
                <div className="text-[10px] text-white/45 font-mono">
                  {result.srt_stats.count} cues · ~{result.srt_stats.durationSeconds.toFixed(1)}s · avg{' '}
                  {result.srt_stats.avgChars} chars
                </div>
              )}

              {result.srt && (
                <pre className="max-h-40 overflow-auto rounded-lg bg-black/60 border border-white/5 p-2 text-[9px] text-white/55 font-mono whitespace-pre-wrap">
                  {result.srt}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SafeKitPanel;
