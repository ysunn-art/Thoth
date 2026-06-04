import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Edit3,
  FileText,
  Link,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type EntryStatus = "draft" | "sme_approved" | "approved" | "rejected";
type FilterKey = "needs" | "all" | EntryStatus;

interface ReviewEntry {
  id: string;
  title: string;
  sme: string;
  status: EntryStatus;
  created: string;
  nextReview: string;
  tags: string[];
  content: string;
  sources: Array<{ type: "interview" | "material"; title: string; meta: string }>;
}

const INITIAL_ENTRIES: ReviewEntry[] = [
  {
    id: "draft-billing",
    title: "Billing Dispute Resolution Process",
    sme: "Dr. Sarah Johnson",
    status: "draft",
    created: "2026-06-03T13:18:19",
    nextReview: "2026-09-01",
    tags: ["Billing Systems", "Customer Service Policy"],
    content:
      "Customer-initiated billing disputes follow a 3-tier flow: front-line credit under $50, supervisor review from $50 to $500, and a formal claims case over $500. Always issue a goodwill response within 24 hours regardless of tier, then attach the customer-visible case note before closing the escalation.",
    sources: [
      { type: "interview", title: "Billing dispute escalation policy", meta: "6/3/2026" },
      { type: "material", title: "HW1 (2)", meta: "PDF - 6/3/2026" },
      { type: "material", title: "techin513", meta: "PDF - 6/3/2026" },
    ],
  },
  {
    id: "approved-5g",
    title: "5G Network Security Best Practices",
    sme: "Dr. Sarah Johnson",
    status: "approved",
    created: "2026-05-10T07:30:00",
    nextReview: "2026-08-15",
    tags: ["Network Security", "5G Infrastructure"],
    content:
      "5G SA networks require mutual authentication at every interface. Rotate gNB certificates on the documented 90-day cycle, isolate signaling plane traffic, and apply the published TLS 1.3 cipher allowlist before exposing any new edge component.",
    sources: [],
  },
  {
    id: "approved-billing",
    title: "Billing Dispute Resolution Process",
    sme: "Michael Chen",
    status: "approved",
    created: "2026-05-12T08:45:00",
    nextReview: "2026-08-20",
    tags: ["Billing Systems", "Customer Service Policy"],
    content:
      "Customer-initiated billing disputes follow a 3-tier flow: front-line credit under $50, supervisor review from $50 to $500, and a formal claims case over $500. A goodwill response should be issued within 24 hours regardless of tier.",
    sources: [],
  },
  {
    id: "approved-outage",
    title: "Network Outage Incident Response Runbook",
    sme: "Dr. Sarah Johnson",
    status: "approved",
    created: "2026-05-14T09:10:00",
    nextReview: "2026-07-21",
    tags: ["Network Security", "5G Infrastructure"],
    content:
      "When a region-wide outage is detected, the on-call SRE confirms the scope through the network telemetry dashboard, escalates to the incident commander, and opens a customer-facing status entry within 10 minutes. Restoration follows containment, mitigation, recovery, and review.",
    sources: [],
  },
  {
    id: "approved-trade",
    title: "Device Trade-In Program Guidelines",
    sme: "Michael Chen",
    status: "approved",
    created: "2026-05-16T10:20:00",
    nextReview: "2026-09-22",
    tags: ["Customer Service Policy"],
    content:
      "Eligible devices must power on, be factory-reset, and be included in the published model list. Carrier-locked devices are valued at 60% of the published trade-in price.",
    sources: [],
  },
  {
    id: "approved-sim",
    title: "SIM Swap Fraud Prevention",
    sme: "Dr. Sarah Johnson",
    status: "approved",
    created: "2026-05-18T11:40:00",
    nextReview: "2026-08-24",
    tags: ["Security", "Authentication"],
    content:
      "SIM swap requests are auto-frozen when two or more risk signals fire: new device fingerprint, geo distance greater than 500 km from last login, or a recent password reset. Manual fraud desk review is required before unfreezing.",
    sources: [],
  },
];

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

function statusCount(entries: ReviewEntry[], filter: FilterKey) {
  if (filter === "all") return entries.length;
  if (filter === "needs") return entries.filter((e) => e.status === "draft").length;
  return entries.filter((e) => e.status === filter).length;
}

export default function ReviewApprove() {
  const [entries, setEntries] = useState(INITIAL_ENTRIES);
  const [filter, setFilter] = useState<FilterKey>("needs");
  const [activeId, setActiveId] = useState<string | null>(null);

  const visibleEntries = useMemo(() => {
    if (filter === "all") return entries;
    if (filter === "needs") return entries.filter((entry) => entry.status === "draft");
    return entries.filter((entry) => entry.status === filter);
  }, [entries, filter]);

  const active = activeId ? entries.find((entry) => entry.id === activeId) ?? null : null;

  function confirmAccurate(entryId: string) {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId ? { ...entry, status: "sme_approved" } : entry,
      ),
    );
    setFilter("sme_approved");
  }

  function selectFilter(next: FilterKey) {
    setFilter(next);
    setActiveId(null);
  }

  return (
    <main className="flex-1 overflow-y-auto bg-white p-8">
      <header>
        <h1 className="text-2xl font-medium text-neutral-900">Review & Approval</h1>
        <p className="mt-1 text-base text-neutral-500">
          Review and approve synthesized knowledge entries before publication
        </p>
      </header>

      <FilterBar
        entries={entries}
        active={filter}
        onChange={selectFilter}
      />

      <section className="mt-6 grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <EntryQueue
          title={queueTitle(filter)}
          entries={visibleEntries}
          activeId={activeId}
          onSelect={(id) => setActiveId(id)}
        />
        {active ? (
          <ReviewDetail entry={active} onConfirm={() => confirmAccurate(active.id)} />
        ) : (
          <EmptyDetail />
        )}
      </section>
    </main>
  );
}

function queueTitle(filter: FilterKey) {
  if (filter === "needs") return "Needs my action";
  if (filter === "all") return "All";
  return STATUS_META[filter].label;
}

function FilterBar({
  entries,
  active,
  onChange,
}: {
  entries: ReviewEntry[];
  active: FilterKey;
  onChange: (filter: FilterKey) => void;
}) {
  const filters: Array<{ key: FilterKey; label: string; icon?: React.ReactNode }> = [
    { key: "needs", label: "Needs my action", icon: <Sparkles size={14} /> },
    { key: "all", label: "All" },
    { key: "draft", label: "Draft" },
    { key: "sme_approved", label: "SME Approved" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {filters.map((filter) => {
        const selected = active === filter.key;
        return (
          <button
            key={filter.key}
            onClick={() => onChange(filter.key)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              selected
                ? "border-magenta bg-magenta text-white"
                : "border-border bg-white text-neutral-900 hover:border-magenta hover:bg-magenta-tint"
            }`}
          >
            {filter.icon}
            <span>{filter.label}</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs ${
                selected ? "bg-white/20 text-white" : "bg-muted text-neutral-500"
              }`}
            >
              {statusCount(entries, filter.key)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EntryQueue({
  title,
  entries,
  activeId,
  onSelect,
}: {
  title: string;
  entries: ReviewEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="rounded-lg border border-border bg-white p-5">
      <h2 className="text-lg font-medium text-neutral-900">
        {title} ({entries.length})
      </h2>
      <div className="mt-4 flex max-h-[650px] flex-col gap-3 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-neutral-50 p-4 text-sm text-neutral-500">
            No entries in this queue.
          </p>
        ) : (
          entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              active={activeId === entry.id}
              onClick={() => onSelect(entry.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function EntryCard({
  entry,
  active,
  onClick,
}: {
  entry: ReviewEntry;
  active: boolean;
  onClick: () => void;
}) {
  const meta = STATUS_META[entry.status];
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border p-4 text-left transition-colors ${
        active
          ? "border-magenta bg-magenta-tint/50"
          : `${meta.card} hover:border-magenta hover:bg-magenta-tint/30`
      }`}
    >
      <div className="flex items-start gap-2">
        {entry.status === "approved" && (
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-green-700" />
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">
          {entry.title}
        </p>
      </div>
      <p className="mt-2 text-xs text-neutral-500">By {entry.sme}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusBadge status={entry.status} />
          {entry.status === "approved" && (
            <span className="truncate text-[10px] font-medium text-green-700">
              Live & searchable
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs text-neutral-500">
          {formatDate(entry.created)}
        </span>
      </div>
    </button>
  );
}

function EmptyDetail() {
  return (
    <section className="flex min-h-[190px] items-center justify-center rounded-lg border border-border bg-white p-10 text-center">
      <div>
        <CheckCircle2 size={64} className="mx-auto text-neutral-300" />
        <h2 className="mt-4 text-lg font-medium text-neutral-500">No Entry Selected</h2>
        <p className="mt-2 text-sm text-neutral-500">
          Select an entry from the left panel to review
        </p>
      </div>
    </section>
  );
}

function ReviewDetail({
  entry,
  onConfirm,
}: {
  entry: ReviewEntry;
  onConfirm: () => void;
}) {
  const approved = entry.status === "approved";
  return (
    <section
      className={`rounded-lg border bg-white p-6 ${
        approved ? "border-green-300" : "border-border"
      }`}
    >
      {approved && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
          <ShieldCheck size={16} />
          Live & searchable in the knowledge base
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={entry.status} />
            <span className="text-xs text-neutral-500">
              Created {formatDate(entry.created)}
            </span>
          </div>
          <h2 className="mt-2 truncate text-xl font-medium text-neutral-900">
            {entry.title}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">Contributed by {entry.sme}</p>
        </div>
        {entry.status !== "approved" && (
          <button className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-muted">
            <Edit3 size={15} />
            Edit
          </button>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-muted p-5">
        <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-900">
          {entry.content}
        </p>
      </div>

      <Sources entry={entry} />
      <EntryDetails entry={entry} />

      {entry.status === "draft" && (
        <button
          onClick={onConfirm}
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-6 text-base font-medium text-white hover:bg-green-700"
        >
          <CheckCircle2 size={20} />
          Confirm accurate
        </button>
      )}
    </section>
  );
}

function Sources({ entry }: { entry: ReviewEntry }) {
  return (
    <div className="mt-6">
      <h3 className="flex items-center gap-2 text-sm font-medium text-neutral-900">
        <Link size={14} className="text-magenta" />
        Sources
      </h3>
      {entry.sources.length === 0 ? (
        <p className="mt-3 text-sm italic text-neutral-500">
          No linked interviews or materials.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {entry.sources.map((source) => (
            <div
              key={`${source.type}-${source.title}`}
              className="flex items-start gap-2 rounded-lg border border-border bg-neutral-50/70 p-3"
            >
              <FileText size={15} className="mt-0.5 shrink-0 text-magenta" />
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {source.type === "interview" ? "Interview - " : ""}
                  {source.title}
                </p>
                <p className="text-xs text-neutral-500">{source.meta}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryDetails({ entry }: { entry: ReviewEntry }) {
  return (
    <div className="mt-6 rounded-lg bg-muted p-4">
      <h3 className="text-sm font-medium text-neutral-900">Entry Details</h3>
      <dl className="mt-3 grid gap-2 text-sm">
        <DetailRow label="Status" value={<StatusBadge status={entry.status} />} />
        <DetailRow label="Created" value={formatDate(entry.created)} />
        <DetailRow label="Next Review" value={formatDate(entry.nextReview)} />
        <DetailRow label="Expertise Areas" value={entry.tags.join(", ")} />
      </dl>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-neutral-500">{label}:</dt>
      <dd className="max-w-[70%] text-right text-neutral-900">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: EntryStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${meta.bg} ${meta.border} ${meta.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
