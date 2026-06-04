import {
  ArrowUpRight,
  Copy,
  Download,
  FileText,
  History,
  User,
  X,
} from "lucide-react";

export interface SourceItem {
  title: string;
  score: number; // 0-100
}

export interface ExpertItem {
  name: string;
  specialization: string;
  match: number; // 0-100
  lastReview?: string;
}

export interface AnswerDetail {
  title: string;
  updatedAt: string;
  answer: string;
  relatedTopics: string[];
  confidence: number; // 0-100
  sources: SourceItem[];
  experts: ExpertItem[];
}

function ConfidenceDonut({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const filled = (value / 100) * c;
  return (
    <div className="relative h-24 w-24">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e5e5" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="#00a63e"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-neutral-900">{value}%</span>
        <span className="text-[10px] text-neutral-400">confidence</span>
      </div>
    </div>
  );
}

export default function DetailPanel({
  detail,
  onClose,
}: {
  detail: AnswerDetail;
  onClose: () => void;
}) {
  return (
    <section className="flex h-full w-[44%] min-w-[420px] flex-col border-l border-border bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X size={16} className="text-neutral-500" />
          </button>
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              {detail.title}
            </p>
            <p className="text-xs text-neutral-400">
              Updated {detail.updatedAt}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-neutral-400">
          <button className="rounded-md p-1.5 hover:bg-muted">
            <History size={15} />
          </button>
          <button className="rounded-md p-1.5 hover:bg-muted">
            <Copy size={15} />
          </button>
          <button className="rounded-md p-1.5 hover:bg-muted">
            <Download size={15} />
          </button>
          <button className="ml-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-muted">
            Open in Google Docs
          </button>
          <button className="rounded-md bg-magenta px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
            Share
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* Answer card */}
        <div className="rounded-lg border border-border p-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
            {detail.answer}
          </p>
          {detail.relatedTopics.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Related Topics
              </p>
              <div className="flex flex-wrap gap-2">
                {detail.relatedTopics.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-muted px-2 py-1 text-xs text-neutral-600"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Confidence + sources + experts */}
        <div className="mt-5 grid grid-cols-3 gap-5 rounded-lg border border-border p-5">
          {/* Confidence */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Answer Confidence
            </p>
            <div className="flex flex-col items-center">
              <ConfidenceDonut value={detail.confidence} />
              <span className="mt-2 text-sm font-semibold text-green-600">
                {detail.confidence >= 80
                  ? "High Confidence"
                  : detail.confidence >= 50
                    ? "Medium Confidence"
                    : "Low Confidence"}
              </span>
            </div>
          </div>

          {/* Top sources */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Top Sources
            </p>
            <div className="flex flex-col gap-3">
              {detail.sources.map((s) => (
                <div key={s.title}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 truncate text-xs text-neutral-700">
                      <FileText size={12} className="shrink-0 text-magenta" />
                      <span className="truncate">{s.title}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-neutral-500">
                      {s.score}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-magenta"
                      style={{ width: `${s.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Relevant experts */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Relevant Experts
            </p>
            {detail.experts.map((e) => (
              <div key={e.name} className="mb-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-magenta-tint">
                      <User size={14} className="text-magenta" />
                    </span>
                    <span>
                      <span className="block text-xs font-semibold text-neutral-900">
                        {e.name}
                      </span>
                      <span className="block text-[10px] text-neutral-400">
                        {e.specialization}
                      </span>
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-green-600">
                    {e.match}%
                  </span>
                </div>
                {e.lastReview && (
                  <p className="mt-1 text-[10px] text-neutral-400">
                    Latest Review {e.lastReview}
                  </p>
                )}
              </div>
            ))}
            <button className="mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-magenta px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
              <ArrowUpRight size={14} />
              Escalate to Advisor
            </button>
            <p className="mt-2 text-center text-[10px] text-neutral-400">
              Connect directly with a subject matter expert
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
