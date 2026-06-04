import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  api,
  type KnowledgeEntry,
  type SME,
} from "../api/client";

type EntryStatus = "draft" | "sme_approved" | "approved" | "rejected";
type FilterKey = "needs" | "all" | EntryStatus;

const STATUS_META: Record<
  EntryStatus,
  { label: string; bg: string; border: string; text: string; dot: string; card: string }
> = {
  draft: {
    label: "Draft",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    text: "text-yellow-800",
    dot: "bg-yellow-500",
    card: "border-border bg-white",
  },
  sme_approved: {
    label: "SME Approved",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    dot: "bg-blue-500",
    card: "border-border bg-white",
  },
  approved: {
    label: "Approved",
    bg: "bg-green-50",
    border: "border-green-200",
    text: "text-green-800",
    dot: "bg-green-600",
    card: "border-green-200 bg-green-50/35",
  },
  rejected: {
    label: "Rejected",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    dot: "bg-red-500",
    card: "border-red-200 bg-red-50/35",
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: EntryStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${meta.bg} ${meta.border} ${meta.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export default function ReviewApprove() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [smes, setSmes] = useState<SME[]>([]);
  const [filter, setFilter] = useState<FilterKey>("needs");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reasonDraft, setReasonDraft] = useState("");

  useEffect(() => {
    Promise.all([api.listKnowledge(), api.listSmes()])
      .then(([kRes, sRes]) => {
        setEntries(kRes.entries);
        setSmes(sRes.smes);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const smeNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    smes.forEach((s) => (m[s.sme_id] = s.name));
    return m;
  }, [smes]);

  const visibleEntries = useMemo(() => {
    if (filter === "all") return entries;
    if (filter === "needs") return entries.filter((e) => e.status === "draft" || e.status === "sme_approved");
    return entries.filter((e) => e.status === filter);
  }, [entries, filter]);

  const active = activeId ? entries.find((e) => e.entry_id === activeId) ?? null : null;

  async function handleApprove(entryId: string) {
    setError("");
    try {
      const r = await api.approveEntry(entryId);
      setEntries((prev) => prev.map((e) => (e.entry_id === entryId ? { ...e, status: r.status } : e)));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleAdminApprove(entryId: string) {
    setError("");
    try {
      const r = await api.adminApproveEntry(entryId);
      setEntries((prev) => prev.map((e) => (e.entry_id === entryId ? { ...e, status: r.status } : e)));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleReject(entryId: string, reason?: string) {
    setError("");
    try {
      const r = await api.rejectEntry(entryId, reason || undefined);
      setEntries((prev) => prev.map((e) => (e.entry_id === entryId ? { ...e, status: r.status } : e)));
      setReasonDraft("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-white p-8">
      <header>
        <h1 className="text-2xl font-medium text-neutral-900">Review & Approval</h1>
        <p className="mt-1 text-base text-neutral-500">
          Review and approve synthesized knowledge entries before publication
        </p>
      </header>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {([
          { key: "needs" as FilterKey, label: "Needs my action", icon: <Sparkles size={14} /> },
          { key: "all" as FilterKey, label: "All" },
          { key: "draft" as FilterKey, label: "Draft" },
          { key: "sme_approved" as FilterKey, label: "SME Approved" },
          { key: "approved" as FilterKey, label: "Approved" },
          { key: "rejected" as FilterKey, label: "Rejected" },
        ]).map((f) => {
          const sel = filter === f.key;
          const count = filter === f.key ? visibleEntries.length : entries.filter((e) => {
            if (f.key === "all") return true;
            if (f.key === "needs") return e.status === "draft" || e.status === "sme_approved";
            return e.status === f.key;
          }).length;
          return (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setActiveId(null); }}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                sel ? "border-magenta bg-magenta text-white" : "border-border bg-white text-neutral-900 hover:border-magenta hover:bg-magenta-tint"
              }`}
            >
              {f.icon}
              <span>{f.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${sel ? "bg-white/20 text-white" : "bg-muted text-neutral-500"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <section className="mt-6 grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-medium text-neutral-900">
            {filter === "needs" ? "Needs my action" : filter === "all" ? "All" : STATUS_META[filter]?.label ?? filter} ({visibleEntries.length})
          </h2>
          <div className="mt-4 flex max-h-[650px] flex-col gap-3 overflow-y-auto pr-1">
            {loading ? (
              <p className="text-sm text-neutral-400">Loading...</p>
            ) : visibleEntries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-neutral-50 p-4 text-sm text-neutral-500">No entries in this queue.</p>
            ) : (
              visibleEntries.map((e) => {
                const meta = STATUS_META[e.status as EntryStatus] ?? STATUS_META.draft;
                return (
                  <button
                    key={e.entry_id}
                    onClick={() => setActiveId(e.entry_id)}
                    className={`w-full rounded-lg border p-4 text-left transition-colors ${
                      activeId === e.entry_id ? "border-magenta bg-magenta-tint/50" : `${meta.card} hover:border-magenta hover:bg-magenta-tint/30`
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {e.status === "approved" && <ShieldCheck size={16} className="mt-0.5 shrink-0 text-green-700" />}
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{e.topic}</p>
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">By {smeNameMap[e.sme_id] ?? e.sme_id}</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <StatusBadge status={e.status as EntryStatus} />
                      <span className="shrink-0 text-xs text-neutral-500">{formatDate(e.created_at)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {active ? (
          <section className={`rounded-lg border bg-white p-6 ${active.status === "approved" ? "border-green-300" : "border-border"}`}>
            {active.status === "approved" && (
              <div className="mb-5 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
                <ShieldCheck size={16} /> Live & searchable in the knowledge base
              </div>
            )}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={active.status as EntryStatus} />
                  <span className="text-xs text-neutral-500">Created {formatDate(active.created_at)}</span>
                </div>
                <h2 className="mt-2 truncate text-xl font-medium text-neutral-900">{active.topic}</h2>
                <p className="mt-1 text-sm text-neutral-500">By {smeNameMap[active.sme_id] ?? active.sme_id}</p>
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-border bg-muted p-5">
              <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-900">{active.content}</p>
            </div>

            <div className="mt-6">
              <h3 className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                <FileText size={14} className="text-magenta" /> Sources
              </h3>
              <p className="mt-2 text-xs text-neutral-500">
                {active.sources.interviews.length} interview{active.sources.interviews.length !== 1 ? "s" : ""}, {active.sources.materials.length} material{active.sources.materials.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="mt-6 rounded-lg bg-muted p-4">
              <h3 className="text-sm font-medium text-neutral-900">Entry Details</h3>
              <div className="mt-3 grid gap-2 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-neutral-500">Status:</span>
                  <StatusBadge status={active.status as EntryStatus} />
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-neutral-500">Created:</span>
                  <span className="text-neutral-900">{formatDate(active.created_at)}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-neutral-500">Updated:</span>
                  <span className="text-neutral-900">{formatDate(active.updated_at)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {active.status === "draft" && (
                <>
                  <button onClick={() => handleApprove(active.entry_id)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-base font-medium text-white hover:bg-green-700">
                    <CheckCircle2 size={20} /> Confirm accurate
                  </button>
                  <button onClick={() => handleReject(active.entry_id, reasonDraft)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                    <XCircle size={16} /> Reject
                  </button>
                </>
              )}
              {active.status === "sme_approved" && (
                <>
                  <button onClick={() => handleAdminApprove(active.entry_id)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-base font-medium text-white hover:bg-green-700">
                    <CheckCircle2 size={20} /> Admin Approve
                  </button>
                  <input
                    value={reasonDraft}
                    onChange={(e) => setReasonDraft(e.target.value)}
                    placeholder="Rejection reason (optional)"
                    className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-magenta"
                  />
                  <button onClick={() => handleReject(active.entry_id, reasonDraft)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                    <XCircle size={16} /> Reject
                  </button>
                </>
              )}
            </div>
          </section>
        ) : (
          <section className="flex min-h-[190px] items-center justify-center rounded-lg border border-border bg-white p-10 text-center">
            <div>
              <CheckCircle2 size={64} className="mx-auto text-neutral-300" />
              <h2 className="mt-4 text-lg font-medium text-neutral-500">No Entry Selected</h2>
              <p className="mt-2 text-sm text-neutral-500">Select an entry from the left panel to review</p>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
