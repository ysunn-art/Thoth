import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileText,
  Link,
  Mic,
  Sparkles,
  UserPlus,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  api,
  getUser,
  getToken,
  setToken,
  type SME,
  type InterviewSummary,
  type MaterialSummary,
  type KnowledgeEntry,
  type SynthesizeRequest,
} from "../api/client";

type EntryStatus = "draft" | "sme_approved" | "approved" | "rejected";

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

export default function KnowledgeSynthesis() {
  const navigate = useNavigate();
  const [smeId, setSmeId] = useState("");
  const [smeName, setSmeName] = useState("");
  const [topic, setTopic] = useState("");
  const [selectedInterviews, setSelectedInterviews] = useState<string[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [view, setView] = useState<"list" | "detail">("list");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [noSme, setNoSme] = useState(false);
  const [allSmes, setAllSmes] = useState<SME[]>([]);
  const [selectedSmeId, setSelectedSmeId] = useState("");
  const [linking, setLinking] = useState(false);

  // Auto-detect SME from current user
  useEffect(() => {
    api.getMe().then((fresh: any) => {
      const token = getToken();
      if (token) {
        setToken(token, {
          user_id: fresh.id ?? fresh.user_id,
          email: fresh.email ?? "",
          is_admin: fresh.is_admin ?? false,
          is_sme: fresh.is_sme ?? false,
          sme_id: fresh.sme_id ?? null,
        });
      }
      if (fresh.is_sme && fresh.sme_id) {
        setSmeId(fresh.sme_id);
        api.getSme(fresh.sme_id).then((s) => setSmeName(s.name)).catch(() => {});
        setNoSme(false);
      } else {
        setNoSme(true);
      }
    }).catch(() => {
      const user = getUser();
      if (user?.is_sme && user?.sme_id) {
        setSmeId(user.sme_id);
        setNoSme(false);
      } else {
        setNoSme(true);
      }
    });
    api
      .listKnowledge()
      .then((res) => setEntries(res.entries))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!smeId) return;
    api
      .getSmeInterviews(smeId)
      .then((res) => setInterviews(res.interviews.filter((i) => i.status === "completed")))
      .catch(() => {});
    api
      .listMaterials(smeId)
      .then((res) => setMaterials(res.materials))
      .catch(() => {});
    setSelectedInterviews([]);
    setSelectedMaterials([]);
  }, [smeId]);

  const active = entries.find((e) => e.entry_id === activeId) ?? null;

  const readyCount = selectedInterviews.length + selectedMaterials.length;

  async function linkToSme() {
    if (!selectedSmeId) return;
    setLinking(true);
    setError("");
    try {
      await api.linkToSme(selectedSmeId);
      const token = getToken();
      if (token) {
        const user = getUser()!;
        setToken(token, { ...user, is_sme: true, sme_id: selectedSmeId });
      }
      setSmeId(selectedSmeId);
      setNoSme(false);
      const sme = allSmes.find((s) => s.sme_id === selectedSmeId);
      setSmeName(sme?.name ?? "");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLinking(false);
    }
  }

  async function generateDraft() {
    if (!topic.trim() || !smeId || readyCount === 0) return;
    setGenerating(true);
    setError("");
    try {
      const data: SynthesizeRequest = {
        interview_ids: selectedInterviews,
        material_ids: selectedMaterials,
        topic: topic.trim(),
      };
      const result = await api.synthesizeKnowledge(smeId, data);
      setEntries((prev) => [result as unknown as KnowledgeEntry, ...prev]);
      setActiveId(result.entry_id);
      setView("detail");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  const refreshEntries = useCallback(async () => {
    try {
      const res = await api.listKnowledge();
      setEntries(res.entries);
    } catch {}
  }, []);

  async function handleTransition(entryId: string, status: EntryStatus) {
    setError("");
    try {
      if (status === "sme_approved") {
        const r = await api.approveEntry(entryId);
        setEntries((prev) =>
          prev.map((e) =>
            e.entry_id === entryId ? { ...e, status: r.status } : e,
          ),
        );
      } else if (status === "rejected") {
        const r = await api.rejectEntry(entryId);
        setEntries((prev) =>
          prev.map((e) =>
            e.entry_id === entryId ? { ...e, status: r.status } : e,
          ),
        );
      }
      await refreshEntries();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleContentUpdate(entryId: string, content: string) {
    try {
      await api.updateKnowledge(entryId, content);
      setEntries((prev) =>
        prev.map((e) => (e.entry_id === entryId ? { ...e, content } : e)),
      );
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-white">
      {error && (
        <div className="mx-8 mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {noSme ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-magenta-tint">
            <UserPlus size={36} className="text-magenta" />
          </div>
          <h2 className="mt-6 text-xl font-semibold text-neutral-900">
            No SME Profile
          </h2>
          <p className="mt-2 max-w-md text-center text-sm text-neutral-500">
            You must be linked to an SME before synthesizing knowledge. Create
            one or link to an existing SME.
          </p>
          <button
            onClick={() => navigate("/onboarding")}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-magenta px-6 py-3 text-sm font-semibold text-white hover:bg-magenta/90"
          >
            <UserPlus size={16} />
            Create New SME
          </button>
          <div className="mt-8 border-t border-border pt-8 w-full max-w-md">
            <p className="text-sm font-medium text-neutral-700 mb-3 text-center">
              Or link to an existing SME:
            </p>
            <div className="flex gap-2">
              <select
                value={selectedSmeId}
                onChange={(e) => setSelectedSmeId(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-magenta"
                onClick={() => {
                  if (allSmes.length === 0) {
                    api.listSmes().then((res) => setAllSmes(res.smes)).catch(() => {});
                  }
                }}
              >
                <option value="">Select an SME...</option>
                {allSmes.map((s) => (
                  <option key={s.sme_id} value={s.sme_id}>
                    {s.name} — {s.specialization}
                  </option>
                ))}
              </select>
              <button
                onClick={linkToSme}
                disabled={!selectedSmeId || linking}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40"
              >
                <Link size={14} />
                {linking ? "Linking..." : "Link"}
              </button>
            </div>
          </div>
        </div>
      ) : view === "list" ? (
        <>
          <header className="border-b border-border px-8 py-6">
            <h1 className="text-2xl font-semibold text-neutral-900">
              Knowledge Synthesis
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Generate knowledge entries from interviews and uploaded materials.
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
                      Choose the SME, topic, interviews, and materials.
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded-md border border-border bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-600">
                    {readyCount} selected
                  </span>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-neutral-900">
                      SME
                    </span>
                    <p className="mt-2 text-sm font-medium text-magenta">
                      {smeName || smeId}
                    </p>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-neutral-900">
                      Entry topic
                    </span>
                    <input
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-magenta focus:bg-white"
                      placeholder="e.g., 5G Network Security Best Practices"
                    />
                  </label>
                </div>

                <div className="mt-6 grid gap-5 lg:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900">
                      Interviews
                    </h3>
                    <div className="mt-2 flex flex-col gap-2">
                      {interviews.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border bg-neutral-50 p-4 text-sm text-neutral-500">
                          No completed interviews for {smeName}.
                        </p>
                      ) : (
                        interviews.map((i) => (
                          <button
                            key={i.interview_id}
                            onClick={() =>
                              setSelectedInterviews((prev) =>
                                prev.includes(i.interview_id)
                                  ? prev.filter((x) => x !== i.interview_id)
                                  : [...prev, i.interview_id],
                              )
                            }
                            className={`flex items-start gap-3 rounded-lg border bg-white p-3 text-left transition-colors ${
                              selectedInterviews.includes(i.interview_id)
                                ? "border-magenta shadow-[inset_3px_0_0_#e20074]"
                                : "border-border hover:border-magenta/50 hover:bg-magenta-tint/20"
                            }`}
                          >
                            <span className="mt-0.5 text-magenta">
                              <Mic size={16} />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-neutral-900">
                                {i.topic}
                              </span>
                              <span className="mt-0.5 block text-xs text-neutral-500">
                                {fmtDate(i.created_at)}
                              </span>
                            </span>
                            <span className="ml-auto mt-0.5 shrink-0 text-magenta">
                              {selectedInterviews.includes(i.interview_id) ? (
                                <CheckCircle2 size={16} />
                              ) : (
                                <Circle size={16} className="text-neutral-300" />
                              )}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900">
                      Materials
                    </h3>
                    <div className="mt-2 flex flex-col gap-2">
                      {materials.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border bg-neutral-50 p-4 text-sm text-neutral-500">
                          No materials for {smeName}.
                        </p>
                      ) : (
                        materials.map((m) => (
                          <button
                            key={m.material_id}
                            onClick={() =>
                              setSelectedMaterials((prev) =>
                                prev.includes(m.material_id)
                                  ? prev.filter((x) => x !== m.material_id)
                                  : [...prev, m.material_id],
                              )
                            }
                            className={`flex items-start gap-3 rounded-lg border bg-white p-3 text-left transition-colors ${
                              selectedMaterials.includes(m.material_id)
                                ? "border-magenta shadow-[inset_3px_0_0_#e20074]"
                                : "border-border hover:border-magenta/50 hover:bg-magenta-tint/20"
                            }`}
                          >
                            <span className="mt-0.5 text-magenta">
                              <FileText size={16} />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-neutral-900">
                                {m.title}
                              </span>
                              <span className="mt-0.5 block text-xs text-neutral-500">
                                {m.file_type} · {m.status}
                              </span>
                            </span>
                            <span className="ml-auto mt-0.5 shrink-0 text-magenta">
                              {selectedMaterials.includes(m.material_id) ? (
                                <CheckCircle2 size={16} />
                              ) : (
                                <Circle size={16} className="text-neutral-300" />
                              )}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-5">
                  <button
                    onClick={generateDraft}
                    disabled={!topic.trim() || readyCount === 0 || generating}
                    className="inline-flex items-center gap-2 rounded-md bg-magenta px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-magenta/90 disabled:cursor-not-allowed disabled:bg-magenta/40"
                  >
                    <Sparkles size={16} />
                    {generating ? "Generating..." : "Generate synthesis"}
                  </button>
                </div>
              </section>

              <section className="rounded-lg border border-border bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-neutral-900">
                    Current entries
                  </h2>
                  <span className="text-xs text-neutral-400">
                    {entries.length} total
                  </span>
                </div>
                <div className="mt-4 flex max-h-[560px] flex-col gap-2 overflow-y-auto pr-1">
                  {entries.map((e) => {
                    const meta = STATUS_META[e.status as EntryStatus] ?? STATUS_META.draft;
                    return (
                      <button
                        key={e.entry_id}
                        onClick={() => {
                          setActiveId(e.entry_id);
                          setView("detail");
                        }}
                        className="rounded-lg border border-border bg-white p-3 text-left transition-colors hover:border-magenta hover:bg-magenta-tint/40"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-neutral-900">
                              {e.topic}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-neutral-500">
                              {e.sme_id === smeId ? smeName : e.sme_id}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.bg} ${meta.text}`}>
                            {meta.label}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400">
                          <span>
                            {e.sources.interviews.length} interview
                            {e.sources.interviews.length !== 1 ? "s" : ""} /{" "}
                            {e.sources.materials.length} material
                            {e.sources.materials.length !== 1 ? "s" : ""}
                          </span>
                          <span>{fmtDate(e.updated_at)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </>
      ) : active ? (
        <>
          <header className="border-b border-border px-8 py-5">
            <button
              onClick={() => {
                setView("list");
                setActiveId(null);
              }}
              className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-magenta"
            >
              <ArrowLeft size={16} />
              Back to synthesis queue
            </button>
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold text-neutral-900">
                  {active.topic}
                </h1>
                <p className="mt-1 text-sm text-neutral-500">
                  {active.sme_id === smeId ? smeName : active.sme_id}{" "}
                  · updated {fmtDate(active.updated_at)}
                </p>
              </div>
              {(() => {
                const meta = STATUS_META[active.status as EntryStatus] ?? STATUS_META.draft;
                return (
                  <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${meta.bg} ${meta.text}`}>
                    <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                );
              })()}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section className="rounded-lg border border-border bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-neutral-900">
                    Synthesized knowledge entry
                  </h2>
                </div>
                <textarea
                  value={active.content}
                  onChange={(e) =>
                    setEntries((prev) =>
                      prev.map((en) =>
                        en.entry_id === active.entry_id
                          ? { ...en, content: e.target.value }
                          : en,
                      ),
                    )
                  }
                  disabled={active.status !== "draft"}
                  rows={17}
                  className="mt-4 w-full resize-none rounded-lg border border-border bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-900 outline-none focus:border-magenta focus:bg-white disabled:opacity-75"
                />
                <div className="mt-2 flex justify-end">
                  {active.status === "draft" && (
                    <button
                      onClick={() => handleContentUpdate(active.entry_id, active.content)}
                      className="rounded-md bg-magenta px-3 py-1.5 text-xs font-semibold text-white hover:bg-magenta/90"
                    >
                      Save content
                    </button>
                  )}
                </div>
              </section>

              <aside className="flex flex-col gap-4">
                <section className="rounded-lg border border-border bg-white p-4">
                  <h2 className="text-sm font-semibold text-neutral-900">
                    Sources
                  </h2>
                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      Interviews
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {active.sources.interviews.length} linked
                    </p>
                  </div>
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      Materials
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {active.sources.materials.length} linked
                    </p>
                  </div>
                </section>

                {active.status === "draft" ? (
                  <section className="flex flex-col gap-2">
                    <button
                      onClick={() => handleTransition(active.entry_id, "sme_approved")}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-magenta px-4 py-2 text-sm font-semibold text-white hover:bg-magenta/90"
                    >
                      <ClipboardCheck size={15} />
                      Submit for admin review
                    </button>
                    <button
                      onClick={() => handleTransition(active.entry_id, "rejected")}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-muted"
                    >
                      <XCircle size={15} />
                      Reject draft
                    </button>
                  </section>
                ) : active.status === "sme_approved" ? (
                  <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                    <p className="flex items-center gap-2 font-semibold">
                      <ClipboardCheck size={15} />
                      Submitted for admin review
                    </p>
                  </section>
                ) : active.status === "approved" ? (
                  <section className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                    <p className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 size={15} />
                      Approved and live
                    </p>
                  </section>
                ) : (
                  <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <p className="flex items-center gap-2 font-semibold">
                      <XCircle size={15} />
                      Rejected
                    </p>
                  </section>
                )}
              </aside>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
