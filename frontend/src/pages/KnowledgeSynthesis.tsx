import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileText,
  Mic,
  Sparkles,
  XCircle,
} from "lucide-react";

type EntryStatus = "draft" | "sme_approved" | "approved" | "rejected";

interface Entry {
  id: string;
  topic: string;
  sme: string;
  status: EntryStatus;
  updated: string;
  content: string;
  interviewIds: string[];
  materialIds: string[];
  tags: string[];
}

interface InterviewSource {
  id: string;
  topic: string;
  sme: string;
  messages: number;
  completed: string;
}

interface MaterialSource {
  id: string;
  title: string;
  sme: string;
  type: "PDF" | "TXT" | "MD";
  visibility: "internal" | "citable";
}

const SMES = ["Dr. Sarah Johnson", "Michael Chen", "Priya Raman"];

const INTERVIEWS: InterviewSource[] = [
  {
    id: "int_a1",
    topic: "5G handoff failure root-cause",
    sme: "Dr. Sarah Johnson",
    messages: 8,
    completed: "2026-06-03",
  },
  {
    id: "int_a2",
    topic: "Billing dispute escalation policy",
    sme: "Michael Chen",
    messages: 5,
    completed: "2026-06-03",
  },
  {
    id: "int_a3",
    topic: "SIM swap fraud signals",
    sme: "Dr. Sarah Johnson",
    messages: 12,
    completed: "2026-06-02",
  },
];

const MATERIALS: MaterialSource[] = [
  {
    id: "mat_a1",
    title: "techin513",
    sme: "Dr. Sarah Johnson",
    type: "PDF",
    visibility: "citable",
  },
  {
    id: "mat_a2",
    title: "HW1 (2)",
    sme: "Dr. Sarah Johnson",
    type: "PDF",
    visibility: "internal",
  },
];

const INITIAL_ENTRIES: Entry[] = [
  {
    id: "ke_1",
    topic: "Network Outage Incident Response Runbook",
    sme: "Dr. Sarah Johnson",
    status: "approved",
    updated: "2026-05-15",
    content:
      "When a region-wide outage is detected, the on-call SRE confirms the scope through the network telemetry dashboard, escalates to the incident commander, and opens a customer-facing status entry within 10 minutes. Restoration follows containment, mitigation, recovery, and review.",
    interviewIds: ["int_a1"],
    materialIds: ["mat_a1"],
    tags: ["Network Security", "5G Infrastructure"],
  },
  {
    id: "ke_2",
    topic: "5G Network Security Best Practices",
    sme: "Dr. Sarah Johnson",
    status: "approved",
    updated: "2026-05-04",
    content:
      "5G SA networks require mutual authentication at every interface. Rotate gNB certificates on the documented 90-day cycle, isolate signaling plane traffic, and apply the published TLS 1.3 cipher allowlist before exposing any new edge component.",
    interviewIds: ["int_a1"],
    materialIds: ["mat_a1", "mat_a2"],
    tags: ["Network Security", "5G Infrastructure"],
  },
  {
    id: "ke_3",
    topic: "Billing Dispute Resolution Process",
    sme: "Michael Chen",
    status: "approved",
    updated: "2026-05-20",
    content:
      "Customer-initiated billing disputes follow a 3-tier flow: front-line credit under $50, supervisor review from $50 to $500, and a formal claims case over $500. A goodwill response should be issued within 24 hours regardless of tier.",
    interviewIds: ["int_a2"],
    materialIds: [],
    tags: ["Billing Systems", "Customer Service Policy"],
  },
  {
    id: "ke_4",
    topic: "SIM Swap Fraud Prevention",
    sme: "Dr. Sarah Johnson",
    status: "approved",
    updated: "2026-05-24",
    content:
      "SIM swap requests are auto-frozen when two or more risk signals fire: new device fingerprint, geo distance greater than 500 km from last login, or a recent password reset. Manual fraud desk review is required before unfreezing.",
    interviewIds: ["int_a3"],
    materialIds: [],
    tags: ["Security", "Authentication"],
  },
  {
    id: "ke_5",
    topic: "Device Trade-In Program Guidelines",
    sme: "Michael Chen",
    status: "sme_approved",
    updated: "2026-05-28",
    content:
      "Eligible devices must power on, be factory-reset, and be included in the published model list. Carrier-locked devices are valued at 60% of the published trade-in price.",
    interviewIds: [],
    materialIds: [],
    tags: ["Customer Service Policy"],
  },
  {
    id: "ke_6",
    topic: "wwww",
    sme: "Dr. Sarah Johnson",
    status: "draft",
    updated: "2026-06-03",
    content:
      "Draft synthesized from the current Dr. Sarah Johnson source set. This entry is waiting for SME review before it can move to admin approval.",
    interviewIds: ["int_a1"],
    materialIds: ["mat_a1"],
    tags: ["Network Security", "5G Infrastructure"],
  },
];

const STATUS_META: Record<
  EntryStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  draft: {
    label: "Draft",
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    dot: "bg-yellow-500",
  },
  sme_approved: {
    label: "SME approved",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  approved: {
    label: "Approved",
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
  },
  rejected: {
    label: "Rejected",
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function sourceSummary(entry: Entry) {
  const interviewCount = entry.interviewIds.length;
  const materialCount = entry.materialIds.length;
  return `${interviewCount} interview${interviewCount === 1 ? "" : "s"} / ${materialCount} material${materialCount === 1 ? "" : "s"}`;
}

export default function KnowledgeSynthesis() {
  const [entries, setEntries] = useState(INITIAL_ENTRIES);
  const [view, setView] = useState<"list" | "detail">("list");
  const [activeId, setActiveId] = useState(INITIAL_ENTRIES[5].id);
  const [sme, setSme] = useState(SMES[0]);
  const [topic, setTopic] = useState("5G Network Security Best Practices");
  const [selectedInterviews, setSelectedInterviews] = useState(["int_a1"]);
  const [selectedMaterials, setSelectedMaterials] = useState(["mat_a1", "mat_a2"]);

  const active = entries.find((entry) => entry.id === activeId) ?? entries[0];
  const filteredInterviews = useMemo(
    () => INTERVIEWS.filter((interview) => interview.sme === sme),
    [sme],
  );
  const filteredMaterials = useMemo(
    () => MATERIALS.filter((material) => material.sme === sme),
    [sme],
  );

  function openEntry(id: string) {
    setActiveId(id);
    setView("detail");
  }

  function toggleSelected(list: string[], id: string, setList: (next: string[]) => void) {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  function generateDraft() {
    const safeTopic = topic.trim() || "Untitled knowledge entry";
    const draft: Entry = {
      id: `ke_${Math.random().toString(36).slice(2, 8)}`,
      topic: safeTopic,
      sme,
      status: "draft",
      updated: new Date().toISOString().slice(0, 10),
      content:
        `Draft generated from ${selectedInterviews.length} interview${selectedInterviews.length === 1 ? "" : "s"} and ${selectedMaterials.length} material${selectedMaterials.length === 1 ? "" : "s"} already captured in Project Thoth. Review the synthesized answer, tighten the operational steps, and submit it for admin approval when the SME content is ready.`,
      interviewIds: selectedInterviews,
      materialIds: selectedMaterials,
      tags:
        sme === "Dr. Sarah Johnson"
          ? ["Network Security", "5G Infrastructure"]
          : sme === "Michael Chen"
            ? ["Billing Systems", "Customer Service Policy"]
            : ["Knowledge Operations"],
    };
    setEntries([draft, ...entries]);
    setActiveId(draft.id);
    setView("detail");
  }

  function updateEntry(id: string, patch: Partial<Entry>) {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? { ...entry, ...patch, updated: new Date().toISOString().slice(0, 10) }
          : entry,
      ),
    );
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-white">
      {view === "list" ? (
        <SynthesisList
          entries={entries}
          sme={sme}
          topic={topic}
          interviews={filteredInterviews}
          materials={filteredMaterials}
          selectedInterviews={selectedInterviews}
          selectedMaterials={selectedMaterials}
          onChangeSme={(next) => {
            setSme(next);
            setSelectedInterviews(INTERVIEWS.filter((i) => i.sme === next).slice(0, 1).map((i) => i.id));
            setSelectedMaterials(MATERIALS.filter((m) => m.sme === next).map((m) => m.id));
          }}
          onChangeTopic={setTopic}
          onToggleInterview={(id) =>
            toggleSelected(selectedInterviews, id, setSelectedInterviews)
          }
          onToggleMaterial={(id) =>
            toggleSelected(selectedMaterials, id, setSelectedMaterials)
          }
          onGenerate={generateDraft}
          onOpen={openEntry}
        />
      ) : (
        <EntryDetail
          entry={active}
          onBack={() => setView("list")}
          onChangeContent={(content) => updateEntry(active.id, { content })}
          onTransition={(status) => updateEntry(active.id, { status })}
        />
      )}
    </main>
  );
}

function SynthesisList({
  entries,
  sme,
  topic,
  interviews,
  materials,
  selectedInterviews,
  selectedMaterials,
  onChangeSme,
  onChangeTopic,
  onToggleInterview,
  onToggleMaterial,
  onGenerate,
  onOpen,
}: {
  entries: Entry[];
  sme: string;
  topic: string;
  interviews: InterviewSource[];
  materials: MaterialSource[];
  selectedInterviews: string[];
  selectedMaterials: string[];
  onChangeSme: (sme: string) => void;
  onChangeTopic: (topic: string) => void;
  onToggleInterview: (id: string) => void;
  onToggleMaterial: (id: string) => void;
  onGenerate: () => void;
  onOpen: (id: string) => void;
}) {
  const readyCount = selectedInterviews.length + selectedMaterials.length;

  return (
    <>
      <header className="border-b border-border px-8 py-6">
        <h1 className="text-2xl font-semibold text-neutral-900">
          Knowledge Synthesis
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Generate and review knowledge entries from the interviews and uploaded materials already in this workspace.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
          <section className="rounded-lg border border-border bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">
                  Build a draft from current sources
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Choose the SME, topic, interviews, and materials. The generated draft opens in the second step for editing and approval.
                </p>
              </div>
              <span className="shrink-0 whitespace-nowrap rounded-md border border-border bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-600">
                {readyCount} selected
              </span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-neutral-900">SME</span>
                <select
                  value={sme}
                  onChange={(event) => onChangeSme(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-magenta focus:bg-white"
                >
                  {SMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-900">Entry topic</span>
                <input
                  value={topic}
                  onChange={(event) => onChangeTopic(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-magenta focus:bg-white"
                  placeholder="Use an existing topic or name a new entry"
                />
              </label>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <SourceGroup title="Interviews" empty={`No completed interviews for ${sme}.`}>
                {interviews.map((interview) => (
                  <SourceButton
                    key={interview.id}
                    icon={<Mic size={16} />}
                    title={interview.topic}
                    meta={`${interview.messages} messages - completed ${fmtDate(interview.completed)}`}
                    selected={selectedInterviews.includes(interview.id)}
                    onClick={() => onToggleInterview(interview.id)}
                  />
                ))}
              </SourceGroup>

              <SourceGroup title="Uploaded materials" empty={`No materials uploaded for ${sme}.`}>
                {materials.map((material) => (
                  <SourceButton
                    key={material.id}
                    icon={<FileText size={16} />}
                    title={material.title}
                    meta={`${material.type} - ${material.visibility === "citable" ? "Citable" : "Internal only"}`}
                    selected={selectedMaterials.includes(material.id)}
                    onClick={() => onToggleMaterial(material.id)}
                  />
                ))}
              </SourceGroup>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-5">
              <button
                onClick={onGenerate}
                disabled={!topic.trim() || readyCount === 0}
                className="inline-flex items-center gap-2 rounded-md bg-magenta px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-magenta/90 disabled:cursor-not-allowed disabled:bg-magenta/40"
              >
                <Sparkles size={16} />
                Generate synthesis
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">
                Current entries
              </h2>
              <span className="text-xs text-neutral-400">{entries.length} total</span>
            </div>
            <div className="mt-4 flex max-h-[560px] flex-col gap-2 overflow-y-auto pr-1">
              {entries.map((entry) => (
                <EntryListButton key={entry.id} entry={entry} onClick={() => onOpen(entry.id)} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function SourceGroup({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      <div className="mt-2 flex flex-col gap-2">
        {hasChildren ? (
          children
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-neutral-50 p-4 text-sm text-neutral-500">
            {empty}
          </p>
        )}
      </div>
    </div>
  );
}

function SourceButton({
  icon,
  title,
  meta,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 rounded-lg border bg-white p-3 text-left transition-colors ${
        selected
          ? "border-magenta shadow-[inset_3px_0_0_#e20074]"
          : "border-border hover:border-magenta/50 hover:bg-magenta-tint/20"
      }`}
    >
      <span className="mt-0.5 text-magenta">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-neutral-900">
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-neutral-500">{meta}</span>
      </span>
      <span className="ml-auto mt-0.5 shrink-0 text-magenta">
        {selected ? <CheckCircle2 size={16} /> : <Circle size={16} className="text-neutral-300" />}
      </span>
    </button>
  );
}

function EntryListButton({ entry, onClick }: { entry: Entry; onClick: () => void }) {
  const meta = STATUS_META[entry.status];
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-border bg-white p-3 text-left transition-colors hover:border-magenta hover:bg-magenta-tint/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">
            {entry.topic}
          </p>
          <p className="mt-0.5 truncate text-xs text-neutral-500">{entry.sme}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.bg} ${meta.text}`}>
          {meta.label}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400">
        <span>{sourceSummary(entry)}</span>
        <span>{fmtDate(entry.updated)}</span>
      </div>
    </button>
  );
}

function EntryDetail({
  entry,
  onBack,
  onChangeContent,
  onTransition,
}: {
  entry: Entry;
  onBack: () => void;
  onChangeContent: (content: string) => void;
  onTransition: (status: EntryStatus) => void;
}) {
  const meta = STATUS_META[entry.status];
  const editable = entry.status === "draft";

  return (
    <>
      <header className="border-b border-border px-8 py-5">
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-magenta"
        >
          <ArrowLeft size={16} />
          Back to synthesis queue
        </button>
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-neutral-900">
              {entry.topic}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {entry.sme} - updated {fmtDate(entry.updated)} - {sourceSummary(entry)}
            </p>
            {entry.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-magenta-tint px-2.5 py-1 text-xs font-medium text-magenta"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${meta.bg} ${meta.text}`}>
            <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-lg border border-border bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">
                Synthesized knowledge entry
              </h2>
              <span className="text-xs text-neutral-400">
                {editable ? "Editable" : "Locked"}
              </span>
            </div>
            <textarea
              value={entry.content}
              onChange={(event) => onChangeContent(event.target.value)}
              disabled={!editable}
              rows={17}
              className="mt-4 w-full resize-none rounded-lg border border-border bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-900 outline-none focus:border-magenta focus:bg-white disabled:opacity-75"
            />
            <p className="mt-2 text-xs text-neutral-400">
              Content stays synced to this page's current interview, upload, and review data.
            </p>
          </section>

          <aside className="flex flex-col gap-4">
            <SourcesPanel entry={entry} />
            <WorkflowPanel entry={entry} onTransition={onTransition} />
          </aside>
        </div>
      </div>
    </>
  );
}

function SourcesPanel({ entry }: { entry: Entry }) {
  const interviews = entry.interviewIds
    .map((id) => INTERVIEWS.find((interview) => interview.id === id))
    .filter(Boolean) as InterviewSource[];
  const materials = entry.materialIds
    .map((id) => MATERIALS.find((material) => material.id === id))
    .filter(Boolean) as MaterialSource[];

  return (
    <section className="rounded-lg border border-border bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Sources</h2>
      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Interviews
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {interviews.length ? (
            interviews.map((interview) => (
              <SourceMini key={interview.id} icon={<Mic size={13} />} title={interview.topic} />
            ))
          ) : (
            <p className="text-xs italic text-neutral-400">No interviews attached</p>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Materials
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {materials.length ? (
            materials.map((material) => (
              <SourceMini key={material.id} icon={<FileText size={13} />} title={material.title} />
            ))
          ) : (
            <p className="text-xs italic text-neutral-400">No materials attached</p>
          )}
        </div>
      </div>
    </section>
  );
}

function SourceMini({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
      <span className="text-magenta">{icon}</span>
      <span className="truncate">{title}</span>
    </div>
  );
}

function WorkflowPanel({
  entry,
  onTransition,
}: {
  entry: Entry;
  onTransition: (status: EntryStatus) => void;
}) {
  if (entry.status === "draft") {
    return (
      <section className="flex flex-col gap-2">
        <button
          onClick={() => onTransition("sme_approved")}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-magenta px-4 py-2 text-sm font-semibold text-white hover:bg-magenta/90"
        >
          <ClipboardCheck size={15} />
          Submit for admin review
        </button>
        <button
          onClick={() => onTransition("rejected")}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-muted"
        >
          <XCircle size={15} />
          Reject draft
        </button>
      </section>
    );
  }

  if (entry.status === "sme_approved") {
    return (
      <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="flex items-center gap-2 font-semibold">
          <ClipboardCheck size={15} />
          Submitted for admin review
        </p>
        <p className="mt-1 text-xs text-blue-700">
          This entry has left the SME synthesis flow and is waiting in the admin review queue.
        </p>
      </section>
    );
  }

  if (entry.status === "approved") {
    return (
      <section className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 size={15} />
          Approved and live
        </p>
        <p className="mt-1 text-xs text-green-700">
          This entry is available in the knowledge base.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="flex items-center gap-2 font-semibold">
        <XCircle size={15} />
        Rejected
      </p>
      <p className="mt-1 text-xs text-red-700">
        This entry is not available to users.
      </p>
    </section>
  );
}
