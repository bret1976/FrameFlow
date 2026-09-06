import React, { useState } from 'react';
import { Loader2, Factory, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';

type Quality = {
  passed?: boolean;
  needsHumanFactCheck?: boolean;
  blockers?: string[];
  warnings?: string[];
};

type Dup = {
  candidateId: string;
  topicSimilarity: number;
  titleSimilarity: number;
  scriptSimilarity: number;
  shouldBlock: boolean;
};

type ReviewResult = {
  ok?: boolean;
  quality?: Quality;
  duplicates?: Dup[];
  status?: string;
  allowed_next?: string[];
  batch?: { count: number; topics: Array<{ id: string; topic: string }>; errors: string[] };
  summary?: string;
  error?: string;
};

const DEMO_HINT =
  'Review-first batch gate: quality + lexical duplicates + CSV/JSON topic import. Inspired by content-factory (reimplemented).';

const ReviewFactoryPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [scriptJson, setScriptJson] = useState('');
  const [batchText, setBatchText] = useState(
    'id,topic,language,target_duration_sec,hook\n1,compound interest for creators,en,45,Watch the math\n2,warm skin grades for reels,en,30,Lift shadows first\n'
  );
  const [action, setAction] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);

  const run = async (demo = false) => {
    setLoading(true);
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (demo) {
        body = { demo: true };
      } else {
        body = {};
        if (scriptJson.trim()) {
          try {
            body.script = JSON.parse(scriptJson);
          } catch {
            setError('Script JSON is invalid.');
            setLoading(false);
            return;
          }
        }
        if (batchText.trim()) body.batch_text = batchText;
        if (action) body.action = action;
        if (!body.script && !body.batch_text && !body.action) {
          setError('Paste a script JSON and/or batch CSV, or run Demo.');
          setLoading(false);
          return;
        }
      }

      const res = await fetch('/api/review-factory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(typeof data?.error === 'string' ? data.error : 'ReviewFactory failed.');
        return;
      }
      setResult(data as ReviewResult);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'ReviewFactory request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl mt-3 border border-white/10 rounded-[1.5rem] bg-black/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2">
          <Factory className="w-4 h-4 text-neon" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/80">
            Review Factory
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
          <p className="text-[11px] text-white/40 font-mono pt-3 leading-relaxed">{DEMO_HINT}</p>

          <label className="block text-[10px] uppercase tracking-widest text-white/30 font-mono">
            Script JSON (optional)
          </label>
          <textarea
            value={scriptJson}
            onChange={(e) => setScriptJson(e.target.value)}
            placeholder='{"title":"...","hook":"...","target_duration_sec":45,"scenes":[...],"cta":"..."}'
            className="w-full h-28 bg-black/60 border border-white/10 rounded-xl p-3 text-xs font-mono text-white/80"
          />

          <label className="block text-[10px] uppercase tracking-widest text-white/30 font-mono">
            Batch topics CSV / JSON
          </label>
          <textarea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            className="w-full h-24 bg-black/60 border border-white/10 rounded-xl p-3 text-xs font-mono text-white/80"
          />

          <label className="block text-[10px] uppercase tracking-widest text-white/30 font-mono">
            Review action (optional)
          </label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white/80"
          >
            <option value="">(auto from quality)</option>
            <option value="queue">queue</option>
            <option value="fact_check">fact_check → qa_pending</option>
            <option value="ready">ready_for_review</option>
            <option value="approve">approve</option>
            <option value="reject">reject</option>
          </select>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => run(false)}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-neon/20 border border-neon/40 text-neon text-xs font-mono uppercase tracking-wider py-2.5 hover:bg-neon/30 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Factory className="w-3.5 h-3.5" />}
              Run gate
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => run(true)}
              className="px-4 rounded-xl border border-white/15 text-white/60 text-xs font-mono uppercase tracking-wider hover:bg-white/5 disabled:opacity-50"
            >
              Demo
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-red-300/90 text-xs bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center gap-2 text-white/70">
                {result.quality?.passed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>{result.summary}</span>
              </div>
              {result.status && (
                <div className="text-white/50">
                  status: <span className="text-neon">{result.status}</span>
                  {result.allowed_next?.length ? (
                    <span className="text-white/30"> → {result.allowed_next.join(', ')}</span>
                  ) : null}
                </div>
              )}
              {result.quality?.blockers?.length ? (
                <ul className="text-amber-200/80 list-disc pl-4 space-y-0.5">
                  {result.quality.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
              {result.quality?.warnings?.length ? (
                <ul className="text-white/35 list-disc pl-4 space-y-0.5">
                  {result.quality.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              {result.duplicates?.length ? (
                <div className="bg-white/5 rounded-xl p-2 space-y-1">
                  {result.duplicates.map((d) => (
                    <div key={d.candidateId} className="text-white/45 flex justify-between gap-2">
                      <span>
                        {d.candidateId}
                        {d.shouldBlock ? ' ⛔' : ''}
                      </span>
                      <span>
                        t{d.topicSimilarity.toFixed(2)} / ti{d.titleSimilarity.toFixed(2)} / s
                        {d.scriptSimilarity.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {result.batch ? (
                <div className="text-white/45">
                  batch: {result.batch.count} topics
                  {result.batch.errors?.length
                    ? ` · ${result.batch.errors.length} parse error(s)`
                    : ''}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReviewFactoryPanel;
