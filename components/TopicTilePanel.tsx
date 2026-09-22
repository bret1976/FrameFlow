import React, { useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Layers3,
  Loader2,
} from 'lucide-react';

type TopicSegment = {
  id: string;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  transcript: string;
  cohesion: number;
  label: string;
};

type TopicTileResult = {
  ok?: boolean;
  source?: string;
  action?: string;
  summary?: string;
  token_count?: number;
  block_count?: number;
  segments?: TopicSegment[];
  defaults?: {
    block_size: number;
    window_k: number;
    min_segment_sec: number;
    max_segment_sec: number;
  };
  error?: string;
};

const SAMPLE = [
  'Camera crews compare lenses, lighting, and studio angles before recording the product shoot.',
  'Gardeners prepare tomato soil with compost, water the roots, and move basil into morning sun.',
  'A solar flare sends particles toward Earth while satellites monitor radiation and aurora forecasts.',
].join(' ');

const TopicTilePanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState(SAMPLE);
  const [duration, setDuration] = useState('90');
  const [blockSize, setBlockSize] = useState('10');
  const [windowK, setWindowK] = useState('2');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TopicTileResult | null>(null);

  const run = async (action: 'segment' | 'demo' | 'defaults') => {
    setLoading(true);
    setError(null);
    try {
      const body = action === 'segment'
        ? {
            action,
            transcript,
            media_duration_sec: Number(duration) || undefined,
            block_size: Number(blockSize) || 10,
            window_k: Number(windowK) || 2,
            min_segment_sec: 8,
            max_segment_sec: 45,
          }
        : { action };
      const response = await fetch('/api/topic-tile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'TopicTile failed.');
        return;
      }
      setResult(data as TopicTileResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'TopicTile request failed.');
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
          <Layers3 className="w-4 h-4 text-violet-300" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            TopicTile
          </span>
          <span className="text-[9px] uppercase tracking-wider text-white/35">no-AI clips</span>
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
            Lexical TextTiling proposes topic-coherent clip windows when AI ranking is unavailable:
            gap cosine → smoothing → depth peaks → timed boundaries. Local only; no keys.
          </p>
          <textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            rows={5}
            placeholder="Paste a plain transcript"
            className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white font-mono"
          />
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[10px] text-white/40 font-mono">
              Duration
              <input
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className="mt-1 w-full rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[10px] text-white/40 font-mono">
              Block words
              <input
                value={blockSize}
                onChange={(event) => setBlockSize(event.target.value)}
                className="mt-1 w-full rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[10px] text-white/40 font-mono">
              Window K
              <input
                value={windowK}
                onChange={(event) => setWindowK(event.target.value)}
                className="mt-1 w-full rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-white"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => run('segment')}
              className="px-3 py-1.5 rounded-full bg-violet-500/20 text-violet-200 text-[10px] font-mono uppercase tracking-wider border border-violet-400/20 hover:bg-violet-500/30 disabled:opacity-40"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : null} Segment
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
                <span className="text-xs text-violet-200 font-mono">{result.summary}</span>
                <span className="text-[9px] text-white/30 whitespace-nowrap">{result.source}</span>
              </div>
              {result.defaults && result.action === 'defaults' && (
                <div className="text-[10px] text-white/50 font-mono">
                  block {result.defaults.block_size} · k {result.defaults.window_k} · {result.defaults.min_segment_sec}–{result.defaults.max_segment_sec}s
                </div>
              )}
              {result.segments?.map((segment) => (
                <div key={segment.id} className="rounded-lg border border-white/5 bg-white/[0.025] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                    <span className="text-white/80">{segment.label}</span>
                    <span className="text-violet-200 whitespace-nowrap">
                      {segment.start_sec.toFixed(1)}–{segment.end_sec.toFixed(1)}s
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-white/45 leading-relaxed line-clamp-3">
                    {segment.transcript}
                  </p>
                  <div className="mt-1 text-[9px] text-white/25 font-mono">
                    cohesion {segment.cohesion.toFixed(3)} · {segment.duration_sec.toFixed(1)}s
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TopicTilePanel;
