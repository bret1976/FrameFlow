import React, { useState } from 'react';
import { Loader2, Subtitles, ChevronDown, ChevronUp, AlertCircle, Download } from 'lucide-react';

type CueCounts = {
  input: number;
  output: number;
  unchanged: number;
  shifted: number;
  trimmed: number;
  removed: number;
  split: number;
};

type CueReportRow = {
  kind: string;
  original_index: number;
  original_start_s: number;
  original_end_s: number;
  text_preview: string;
  new_start_s?: number;
  new_end_s?: number;
  parts?: number;
  note?: string;
};

type CueResult = {
  ok?: boolean;
  format?: 'srt' | 'vtt';
  text?: string;
  counts?: CueCounts;
  report?: CueReportRow[];
  deleted_s?: number;
  deleted?: { start_s: number; end_s: number }[];
  error?: string;
};

/** Parse lines of "start end" (seconds or HH:MM:SS.mmm) or a JSON array. */
const parseRangesInput = (raw: string): { start_s: number; end_s: number }[] | { error: string } => {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.keep)
          ? parsed.keep
          : Array.isArray(parsed?.segments)
            ? parsed.segments
            : Array.isArray(parsed?.deleted)
              ? parsed.deleted
              : null;
      if (!arr) return { error: 'JSON must be an array or { keep|segments|deleted: [...] }.' };
      const list = arr
        .map((row: any) => ({
          start_s: Number(row?.start_s ?? row?.start ?? row?.[0]),
          end_s: Number(row?.end_s ?? row?.end ?? row?.[1]),
        }))
        .filter((r: { start_s: number; end_s: number }) => Number.isFinite(r.start_s) && Number.isFinite(r.end_s) && r.end_s > r.start_s);
      return list;
    } catch {
      return { error: 'Could not parse ranges JSON.' };
    }
  }

  const parseTs = (s: string): number | null => {
    const t = s.trim().replace(',', '.');
    if (/^\d+(\.\d+)?$/.test(t)) {
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    }
    const parts = t.split(':');
    if (parts.length < 2 || parts.length > 3) return null;
    const nums = parts.map((p) => Number(p));
    if (nums.some((n) => !Number.isFinite(n))) return null;
    if (parts.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
    return nums[0] * 60 + nums[1];
  };

  const list: { start_s: number; end_s: number }[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const bits = l.split(/[\s,]+/).filter(Boolean);
    if (bits.length < 2) continue;
    const start_s = parseTs(bits[0]);
    const end_s = parseTs(bits[1]);
    if (start_s == null || end_s == null || end_s <= start_s) continue;
    list.push({ start_s, end_s });
  }
  return list;
};

const CueSplicePanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [subtitleText, setSubtitleText] = useState('');
  const [fileName, setFileName] = useState('subtitles.srt');
  const [deletedRaw, setDeletedRaw] = useState('');
  const [keepRaw, setKeepRaw] = useState('');
  const [durationS, setDurationS] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CueResult | null>(null);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setSubtitleText(text);
  };

  const run = async () => {
    if (!subtitleText.trim()) {
      setError('Paste or upload an SRT/VTT file first.');
      return;
    }
    const deletedParsed = parseRangesInput(deletedRaw);
    if ('error' in deletedParsed) {
      setError(deletedParsed.error);
      return;
    }
    const keepParsed = parseRangesInput(keepRaw);
    if ('error' in keepParsed) {
      setError(keepParsed.error);
      return;
    }
    if (!deletedParsed.length && !keepParsed.length) {
      setError('Provide deleted ranges, or Reel EDL keep JSON + duration.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { text: subtitleText };
      const lower = fileName.toLowerCase();
      if (lower.endsWith('.vtt')) body.format = 'vtt';
      else if (lower.endsWith('.srt')) body.format = 'srt';
      else body.format = 'auto';

      if (deletedParsed.length) body.deleted = deletedParsed;
      if (keepParsed.length) body.keep = keepParsed;
      const dur = Number(durationS);
      if (Number.isFinite(dur) && dur > 0) body.duration_s = dur;

      const res = await fetch('/api/cue-splice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'CueSplice failed.');
        return;
      }
      setResult(data as CueResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'CueSplice request failed.');
    } finally {
      setLoading(false);
    }
  };

  const downloadResult = () => {
    if (!result?.text) return;
    const ext = result.format === 'vtt' ? 'vtt' : 'srt';
    const base = fileName.replace(/\.(srt|vtt)$/i, '') || 'subtitles';
    const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}.retimed.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-xl mx-auto mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 border border-white/10 bg-black/50 hover:border-neon/40 transition-colors rounded-2xl"
      >
        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-neon">
          <Subtitles className="w-4 h-4" />
          CueSplice
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
      </button>

      {open && (
        <div className="mt-3 border border-white/10 bg-black/40 rounded-2xl p-5 space-y-4">
          <p className="text-[11px] text-white/45 font-mono leading-relaxed">
            Retime SRT/WebVTT after cuts. Paste deleted ranges, or invert Reel EDL keep ranges with duration. Local, millisecond-accurate; original file never overwritten.
          </p>

          <label className="text-[9px] font-black uppercase tracking-widest text-white/35 space-y-1 block">
            Subtitles (SRT / VTT)
            <textarea
              value={subtitleText}
              onChange={(e) => setSubtitleText(e.target.value)}
              rows={6}
              placeholder={'1\n00:00:01,000 --> 00:00:04,000\nHello world'}
              className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono placeholder:text-white/25"
            />
          </label>

          <label className="text-[9px] font-black uppercase tracking-widest text-white/35 space-y-1 block">
            Upload file
            <input
              type="file"
              accept=".srt,.vtt,text/vtt,application/x-subrip,text/plain"
              onChange={(e) => onFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-neon/40 file:bg-neon/10 file:text-neon file:text-[10px] file:font-black file:uppercase file:tracking-widest"
            />
          </label>

          <label className="text-[9px] font-black uppercase tracking-widest text-white/35 space-y-1 block">
            Deleted ranges (lines: start end — or JSON array)
            <textarea
              value={deletedRaw}
              onChange={(e) => setDeletedRaw(e.target.value)}
              rows={3}
              placeholder={'10 15\n00:00:20.000 00:00:25.500'}
              className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono placeholder:text-white/25"
            />
          </label>

          <label className="text-[9px] font-black uppercase tracking-widest text-white/35 space-y-1 block">
            Optional: Reel EDL keep JSON (invert → deleted)
            <textarea
              value={keepRaw}
              onChange={(e) => setKeepRaw(e.target.value)}
              rows={3}
              placeholder='[{"start_s":0,"end_s":10},{"start_s":15,"end_s":30}]'
              className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono placeholder:text-white/25"
            />
          </label>

          <label className="text-[9px] font-black uppercase tracking-widest text-white/35 space-y-1 block">
            Duration (s) — required when inverting keep
            <input
              value={durationS}
              onChange={(e) => setDurationS(e.target.value)}
              placeholder="60"
              className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono placeholder:text-white/25"
            />
          </label>

          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neon/15 border border-neon/40 text-neon text-[10px] font-black uppercase tracking-[0.2em] disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Subtitles className="w-4 h-4" />}
            Retime subtitles
          </button>

          {error && (
            <div className="flex items-start gap-2 text-red-400 text-xs font-mono">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="text-[9px] font-black uppercase tracking-widest text-neon">
                Retimed · {result.format?.toUpperCase()} · deleted {result.deleted_s != null ? `${result.deleted_s.toFixed(2)}s` : '—'}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ['In', result.counts?.input ?? '—'],
                  ['Out', result.counts?.output ?? '—'],
                  ['Shifted', result.counts?.shifted ?? '—'],
                  ['Removed', result.counts?.removed ?? '—'],
                  ['Trimmed', result.counts?.trimmed ?? '—'],
                  ['Split', result.counts?.split ?? '—'],
                  ['Unchanged', result.counts?.unchanged ?? '—'],
                ].map(([k, v]) => (
                  <div key={String(k)} className="border border-white/10 bg-black/40 p-3 rounded-xl">
                    <div className="text-[8px] font-black uppercase tracking-widest text-white/35 mb-1">{k}</div>
                    <div className="text-sm font-mono text-white/80">{v}</div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={downloadResult}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/15 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-neon hover:border-neon/40"
              >
                <Download className="w-4 h-4" />
                Download retimed file
              </button>

              <pre className="text-[10px] font-mono text-white/40 bg-black/50 border border-white/10 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap max-h-40">
                {result.text || '(empty)'}
              </pre>

              <div className="space-y-2 max-h-56 overflow-y-auto">
                <div className="text-[9px] font-black uppercase tracking-widest text-white/35">Change report</div>
                {(result.report || []).length === 0 && (
                  <p className="text-xs text-white/40 font-mono">No cues.</p>
                )}
                {(result.report || []).map((row, i) => (
                  <div key={`${row.original_index}-${i}`} className="text-[11px] text-white/65 font-mono pl-3 border-l border-neon/30">
                    #{row.original_index} · {row.kind}
                    {row.new_start_s != null && row.new_end_s != null
                      ? ` · ${row.original_start_s.toFixed(2)}→${row.new_start_s.toFixed(2)}s`
                      : ` · ${row.original_start_s.toFixed(2)}–${row.original_end_s.toFixed(2)}s`}
                    {row.note ? ` · ${row.note}` : ''}
                    {row.text_preview ? ` · “${row.text_preview}”` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CueSplicePanel;
