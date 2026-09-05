import React, { useState } from 'react';
import { Loader2, StickyNote, ChevronDown, ChevronUp, AlertCircle, Download } from 'lucide-react';

type StickyResult = {
  ok?: boolean;
  cue_count?: number;
  html?: string;
  js?: string;
  css?: string;
  preview_html?: string;
  error?: string;
};

const DEMO_SRT = `1
00:00:00,000 --> 00:00:02,680
You ever notice the harder you grind

2
00:00:02,680 --> 00:00:04,200
the stucker you feel?

3
00:00:04,240 --> 00:00:06,340
Specific knowledge compounds.
`;

const StickyCuePanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'cues' | 'srt'>('srt');
  const [cuesJson, setCuesJson] = useState('');
  const [subtitleText, setSubtitleText] = useState(DEMO_SRT);
  const [highlightWords, setHighlightWords] = useState('harder you grind, Specific knowledge');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StickyResult | null>(null);

  const run = async (demo = false) => {
    setLoading(true);
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (demo) {
        body = { demo: true };
      } else if (mode === 'cues') {
        const parsed = JSON.parse(cuesJson || '[]');
        if (!Array.isArray(parsed) || !parsed.length) {
          setError('Paste a non-empty cues JSON array.');
          setLoading(false);
          return;
        }
        body = { cues: parsed };
      } else {
        if (!subtitleText.trim()) {
          setError('Paste SRT/VTT text first.');
          setLoading(false);
          return;
        }
        body = {
          text: subtitleText,
          format: 'auto',
          highlight_words: highlightWords
            .split(/[,|\n]/)
            .map((w) => w.trim())
            .filter(Boolean),
          split_words: true,
        };
      }

      const res = await fetch('/api/sticky-cue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'StickyCue failed.');
        return;
      }
      setResult(data as StickyResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'StickyCue request failed.');
    } finally {
      setLoading(false);
    }
  };

  const downloadPart = (name: string, content: string, mime = 'text/plain;charset=utf-8') => {
    if (!content) return;
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-xl mx-auto mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-white/5 border border-white/10 hover:border-neon/40 transition-colors"
      >
        <div className="flex items-center gap-3 text-left">
          <StickyNote className="w-5 h-5 text-neon" />
          <div>
            <div className="text-white font-semibold text-sm tracking-wide">StickyCue</div>
            <div className="text-white/40 text-xs font-mono">
              Sticky-note word-highlight captions for HyperFrames
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
      </button>

      {open && (
        <div className="mt-3 p-5 rounded-2xl bg-black/40 border border-white/10 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('srt')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase ${
                mode === 'srt' ? 'bg-neon/20 text-neon border border-neon/40' : 'bg-white/5 text-white/50 border border-white/10'
              }`}
            >
              From SRT/VTT
            </button>
            <button
              type="button"
              onClick={() => setMode('cues')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase ${
                mode === 'cues' ? 'bg-neon/20 text-neon border border-neon/40' : 'bg-white/5 text-white/50 border border-white/10'
              }`}
            >
              Word cues JSON
            </button>
          </div>

          {mode === 'srt' ? (
            <>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Subtitles</span>
                <textarea
                  value={subtitleText}
                  onChange={(e) => setSubtitleText(e.target.value)}
                  rows={8}
                  className="w-full rounded-xl bg-white/5 border border-white/10 text-white/90 text-xs font-mono p-3 focus:outline-none focus:border-neon/50"
                  spellCheck={false}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">
                  Highlight words (comma-separated)
                </span>
                <input
                  value={highlightWords}
                  onChange={(e) => setHighlightWords(e.target.value)}
                  className="w-full rounded-xl bg-white/5 border border-white/10 text-white/90 text-xs font-mono p-3 focus:outline-none focus:border-neon/50"
                />
              </label>
            </>
          ) : (
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">
                cues JSON array
              </span>
              <textarea
                value={cuesJson}
                onChange={(e) => setCuesJson(e.target.value)}
                rows={10}
                placeholder='[{"start":0,"end":2.5,"group":1,"segs":[{"text":"Hook ","highlight":true},{"text":"line"}]}]'
                className="w-full rounded-xl bg-white/5 border border-white/10 text-white/90 text-xs font-mono p-3 focus:outline-none focus:border-neon/50"
                spellCheck={false}
              />
            </label>
          )}

          {error && (
            <div className="flex items-start gap-2 text-red-300 text-xs bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run(false)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neon text-black text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <StickyNote className="w-4 h-4" />}
              Build sticky pack
            </button>
            <button
              type="button"
              onClick={() => run(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white/80 text-xs font-mono uppercase border border-white/10 disabled:opacity-50"
            >
              Demo
            </button>
          </div>

          {result?.ok && (
            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="text-white/60 text-xs font-mono">{result.cue_count} sticky cue(s) ready</div>
              {result.preview_html && (
                <iframe
                  title="StickyCue preview"
                  srcDoc={result.preview_html}
                  className="w-full h-64 rounded-xl border border-white/10 bg-black"
                />
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadPart('sticky-cues.html', result.html || '')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs"
                >
                  <Download className="w-3.5 h-3.5" /> HTML
                </button>
                <button
                  type="button"
                  onClick={() => downloadPart('sticky-cues.js', result.js || '')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs"
                >
                  <Download className="w-3.5 h-3.5" /> GSAP JS
                </button>
                <button
                  type="button"
                  onClick={() => downloadPart('sticky-cues.css', result.css || '', 'text/css;charset=utf-8')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs"
                >
                  <Download className="w-3.5 h-3.5" /> CSS
                </button>
              </div>
              <details className="text-xs text-white/40">
                <summary className="cursor-pointer font-mono uppercase tracking-wider">HTML snippet</summary>
                <pre className="mt-2 max-h-40 overflow-auto p-3 rounded-lg bg-black/50 text-white/70 whitespace-pre-wrap">{result.html}</pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StickyCuePanel;
