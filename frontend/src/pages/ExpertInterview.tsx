import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Link,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  StopCircle,
  UserPlus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  api,
  getUser,
  getToken,
  setToken,
  type SME,
  type InterviewSummary,
  type InterviewTranscript,
  type TurnResponse,
} from "../api/client";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Bubble({ role, text }: { role: "agent" | "user"; text: string }) {
  if (role === "agent") {
    return (
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-magenta-tint">
          <Sparkles size={14} className="text-magenta" />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-magenta">
            AI Agent
          </p>
          <div className="mt-1 inline-block rounded-2xl border border-border bg-white px-4 py-2.5 text-sm text-neutral-900">
            {text}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-end gap-3">
      <div className="max-w-md text-right">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          You
        </p>
        <div className="mt-1 inline-block rounded-2xl bg-magenta px-4 py-2.5 text-left text-sm text-white">
          {text}
        </div>
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <MessageSquare size={14} className="text-neutral-500" />
      </div>
    </div>
  );
}

export default function ExpertInterview() {
  const navigate = useNavigate();
  const [smeId, setSmeId] = useState("");
  const [smeName, setSmeName] = useState("");
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<InterviewTranscript | null>(null);
  const [topicDraft, setTopicDraft] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
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
        // Load SME name for display
        api.getSme(fresh.sme_id).then((s) => setSmeName(s.name)).catch(() => {});
        setNoSme(false);
      } else {
        setNoSme(true);
      }
      setLoading(false);
    }).catch(() => {
      const user = getUser();
      if (user?.is_sme && user?.sme_id) {
        setSmeId(user.sme_id);
        setNoSme(false);
      } else {
        setNoSme(true);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!smeId) return;
    api
      .getSmeInterviews(smeId)
      .then((res) => setInterviews(res.interviews))
      .catch((e) => setError(e.message));
  }, [smeId]);

  async function loadTranscript(interviewId: string) {
    try {
      const t = await api.getInterview(interviewId);
      setTranscript(t);
      setActiveId(interviewId);
      setShowForm(false);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function startInterview() {
    const topic = topicDraft.trim();
    if (!topic || !smeId) return;
    setError("");
    try {
      const interview = await api.createInterview(smeId, topic);
      setInterviews((prev) => [
        {
          interview_id: interview.interview_id,
          topic: interview.topic,
          status: interview.status,
          created_at: interview.created_at,
        },
        ...prev,
      ]);
      setActiveId(interview.interview_id);
      setShowForm(false);
      setTopicDraft("");
      setTranscript({
        interview_id: interview.interview_id,
        sme_id: smeId,
        topic: interview.topic,
        status: "in_progress",
        turns: [],
      });
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function sendReply() {
    if (!activeId || !transcript) return;
    const reply = replyDraft.trim();
    if (!reply) return;
    setSending(true);
    setError("");
    try {
      const turn: TurnResponse = await api.submitTurn(activeId, reply);
      const updatedTurns = [
        ...transcript.turns,
        { turn_number: turn.turn_number, sme_response: turn.sme_response, agent_follow_up: turn.agent_follow_up, timestamp: turn.timestamp },
      ];
      setTranscript({
        ...transcript,
        status: turn.agent_follow_up === null ? "completed" : "in_progress",
        turns: updatedTurns,
      });
      if (turn.agent_follow_up === null) {
        setInterviews((prev) =>
          prev.map((i) =>
            i.interview_id === activeId ? { ...i, status: "completed" } : i,
          ),
        );
      }
      setReplyDraft("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  function onReplyKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      sendReply();
    }
  }

  async function endInterview() {
    if (!activeId) return;
    setError("");
    try {
      await api.completeInterview(activeId);
      if (transcript) {
        setTranscript({ ...transcript, status: "completed" });
      }
      setInterviews((prev) =>
        prev.map((i) =>
          i.interview_id === activeId ? { ...i, status: "completed" } : i,
        ),
      );
    } catch (e: any) {
      setError(e.message);
    }
  }

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

  const isComplete = transcript?.status === "completed";
  const progress = transcript
    ? Math.min(100, Math.round((transcript.turns.length / 4) * 100))
    : 0;

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-white">
      {noSme ? (
        /* Not an SME — empty state with create/link options */
        <div className="flex flex-1 flex-col items-center justify-center p-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-magenta-tint">
            <UserPlus size={36} className="text-magenta" />
          </div>
          <h2 className="mt-6 text-xl font-semibold text-neutral-900">
            No SME Profile
          </h2>
          <p className="mt-2 max-w-md text-center text-sm text-neutral-500">
            You must be linked to an SME before running interviews. Create one or
            link to an existing SME.
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
            {error && (
              <p className="mt-3 text-sm text-red-600 text-center">{error}</p>
            )}
          </div>
        </div>
      ) : (
        <>
          <header className="border-b border-border p-6">
            <h1 className="text-2xl font-bold text-neutral-900">
              Expert Interview
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Share your expertise through an AI-guided conversation
            </p>
            <p className="mt-2 text-sm font-medium text-magenta">
              Interviewing as: {smeName || "..."}
            </p>
          </header>

      {error && (
        <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <section className="flex w-72 flex-col border-r border-border">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="text-sm font-semibold text-neutral-900">
              Interviews
            </h2>
            <button
              onClick={() => {
                setShowForm(true);
                setActiveId(null);
                setTranscript(null);
              }}
              className="flex items-center gap-1 rounded-md bg-magenta px-3 py-1.5 text-xs font-semibold text-white hover:bg-magenta/90"
            >
              <Plus size={14} /> New
            </button>
          </div>

          {loading ? (
            <p className="p-4 text-sm text-neutral-400">Loading...</p>
          ) : interviews.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <MessageSquare
                size={32}
                className="mb-2 text-neutral-300"
                strokeWidth={1.5}
              />
              <p className="text-sm font-medium text-neutral-700">
                No interviews yet
              </p>
              <p className="text-xs text-neutral-400">Click "New" to begin</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3">
              {interviews.map((i) => (
                <button
                  key={i.interview_id}
                  onClick={() => loadTranscript(i.interview_id)}
                  className={`mb-2 block w-full rounded-lg border p-3 text-left transition-colors ${
                    activeId === i.interview_id
                      ? "border-magenta bg-magenta-tint"
                      : "border-border hover:border-magenta/40 hover:bg-magenta-tint/40"
                  }`}
                >
                  <p className="line-clamp-1 text-sm font-semibold text-neutral-900">
                    {i.topic}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between text-[11px]">
                    {i.status === "completed" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 font-medium text-yellow-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                        In progress
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-neutral-400">
                      <Clock size={10} /> {fmtDate(i.created_at)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-1 flex-col overflow-hidden">
          {showForm ? (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-neutral-900">
                Start New Interview
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Choose a topic. The AI agent will begin the conversation with{" "}
                {smeName || "the selected SME"}.
              </p>
              <div className="mt-6 max-w-xl">
                <label className="text-sm font-medium text-neutral-900">
                  Interview Topic <span className="text-magenta">*</span>
                </label>
                <input
                  value={topicDraft}
                  onChange={(e) => setTopicDraft(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && topicDraft.trim() && startInterview()
                  }
                  placeholder="e.g., 5G Network Security Best Practices"
                  className="mt-1.5 w-full rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none transition-colors focus:border-magenta focus:bg-white"
                  autoFocus
                />
                <div className="mt-4 flex gap-2">
                  <button
                    disabled={!topicDraft.trim()}
                    onClick={startInterview}
                    className="flex items-center gap-2 rounded-md bg-magenta px-4 py-2 text-sm font-semibold text-white hover:bg-magenta/90 disabled:bg-magenta/50"
                  >
                    <Sparkles size={14} /> Begin Interview
                  </button>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setTopicDraft("");
                    }}
                    className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : transcript ? (
            <>
              <div className="border-b border-border p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-900">
                      {transcript.topic}
                    </h2>
                    <p className="text-xs text-neutral-500">
                      with {smeName} · {transcript.turns.length} turns
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-magenta transition-all duration-500"
                        style={{ width: `${isComplete ? 100 : progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-neutral-500">
                      {isComplete ? 100 : progress}%
                    </span>
                  </div>
                  {!isComplete && (
                    <button
                      onClick={endInterview}
                      className="flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                      <StopCircle size={14} />
                      End Interview
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto flex max-w-3xl flex-col gap-5">
                  {transcript.turns.flatMap((t) => {
                    const bubbles: React.ReactNode[] = [
                      <Bubble key={`${t.turn_number}-sme`} role="user" text={t.sme_response} />,
                    ];
                    if (t.agent_follow_up) {
                      bubbles.push(
                        <Bubble key={`${t.turn_number}-agent`} role="agent" text={t.agent_follow_up} />,
                      );
                    }
                    return bubbles;
                  })}

                  {isComplete && (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                        <CheckCircle2 size={22} className="text-green-600" />
                      </div>
                      <h3 className="mt-3 text-base font-semibold text-green-900">
                        Interview complete
                      </h3>
                      <p className="mt-1 text-sm text-green-800/90">
                        The AI agent has no more follow-up questions. Your
                        transcript has been saved and will be synthesized into a
                        knowledge entry for review.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {isComplete ? (
                <div className="border-t border-border bg-neutral-50/60 p-4 text-center text-sm text-neutral-500">
                  This interview is complete. Start a new one from the left
                  panel.
                </div>
              ) : (
                <div className="border-t border-border p-4">
                  <div className="mx-auto flex max-w-3xl items-end gap-2">
                    <textarea
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      onKeyDown={onReplyKey}
                      rows={2}
                      placeholder="Share your expertise in detail…  (⌘/Ctrl+Enter to send)"
                      disabled={sending}
                      className="flex-1 resize-none rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none transition-colors focus:border-magenta focus:bg-white disabled:opacity-60"
                    />
                    <button
                      onClick={sendReply}
                      disabled={!replyDraft.trim() || sending}
                      className={`flex h-10 w-10 items-center justify-center rounded-md text-white transition-colors ${
                        replyDraft.trim() && !sending
                          ? "bg-magenta hover:bg-magenta/90"
                          : "bg-magenta/40"
                      }`}
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-magenta-tint">
                <Sparkles size={28} className="text-magenta" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-neutral-900">
                Start a new interview
              </h2>
              <p className="mt-2 max-w-md text-sm text-neutral-500">
                The AI agent will ask follow-up questions and capture your
                expertise as a structured knowledge entry.
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-6 flex items-center gap-2 rounded-md bg-magenta px-5 py-3 text-sm font-semibold text-white hover:bg-magenta/90"
              >
                <Plus size={16} /> New Interview
              </button>
            </div>
          )}
        </section>
      </div>
        </>
      )}
    </main>
  );
}
