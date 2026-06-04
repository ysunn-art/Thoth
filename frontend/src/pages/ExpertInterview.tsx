import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  User,
} from "lucide-react";

type InterviewStatus = "in_progress" | "completed";

interface Turn {
  role: "agent" | "user";
  text: string;
}

interface Interview {
  id: string;
  topic: string;
  status: InterviewStatus;
  startedAt: string;
  turns: Turn[];
  progress: number; // 0..100
}

const FOLLOW_UPS = [
  "What is the topic you would like to share knowledge about?",
  "What are the best practices you recommend?",
  "Are there any critical considerations or warnings to be aware of?",
  "Can you provide a specific example or case study?",
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ExpertInterview() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [topicDraft, setTopicDraft] = useState("");
  const [replyDraft, setReplyDraft] = useState("");

  const active = interviews.find((i) => i.id === activeId) ?? null;

  function startInterview() {
    const topic = topicDraft.trim();
    if (!topic) return;
    const id = `int_${Math.random().toString(36).slice(2, 8)}`;
    const newInterview: Interview = {
      id,
      topic,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      turns: [{ role: "agent", text: FOLLOW_UPS[0] }],
      progress: 0,
    };
    setInterviews([newInterview, ...interviews]);
    setActiveId(id);
    setShowForm(false);
    setTopicDraft("");
  }

  function sendReply() {
    if (!active) return;
    const reply = replyDraft.trim();
    if (!reply) return;

    setInterviews((prev) =>
      prev.map((i) => {
        if (i.id !== active.id) return i;
        const newTurns: Turn[] = [...i.turns, { role: "user", text: reply }];
        const agentTurnsSoFar = newTurns.filter((t) => t.role === "agent").length;
        const nextQuestion = FOLLOW_UPS[agentTurnsSoFar];
        if (nextQuestion) {
          newTurns.push({ role: "agent", text: nextQuestion });
        }
        const completed = !nextQuestion;
        const progress = Math.min(
          100,
          Math.round((agentTurnsSoFar / FOLLOW_UPS.length) * 100),
        );
        return {
          ...i,
          turns: newTurns,
          status: completed ? "completed" : "in_progress",
          progress: completed ? 100 : progress,
        };
      }),
    );
    setReplyDraft("");
  }

  function onReplyKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      sendReply();
    }
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-white">
      {/* Header */}
      <header className="border-b border-border p-6">
        <h1 className="text-2xl font-bold text-neutral-900">Expert Interview</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Share your expertise through an AI-guided conversation
        </p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Interviews list */}
        <section className="flex w-72 flex-col border-r border-border">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="text-sm font-semibold text-neutral-900">Interviews</h2>
            <button
              onClick={() => {
                setShowForm(true);
                setActiveId(null);
              }}
              className="flex items-center gap-1 rounded-md bg-magenta px-3 py-1.5 text-xs font-semibold text-white hover:bg-magenta/90"
            >
              <Plus size={14} /> New
            </button>
          </div>

          {interviews.length === 0 ? (
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
                  key={i.id}
                  onClick={() => {
                    setActiveId(i.id);
                    setShowForm(false);
                  }}
                  className={`mb-2 block w-full rounded-lg border p-3 text-left transition-colors ${
                    activeId === i.id
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
                      <Clock size={10} /> {fmtDate(i.startedAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Right pane */}
        <section className="flex flex-1 flex-col overflow-hidden">
          {showForm ? (
            <StartForm
              topic={topicDraft}
              onChange={setTopicDraft}
              onBegin={startInterview}
              onCancel={() => {
                setShowForm(false);
                setTopicDraft("");
              }}
            />
          ) : active ? (
            <ActiveInterview
              interview={active}
              replyDraft={replyDraft}
              onChangeReply={setReplyDraft}
              onSend={sendReply}
              onReplyKey={onReplyKey}
            />
          ) : (
            <EmptyState onNew={() => setShowForm(true)} />
          )}
        </section>
      </div>
    </main>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-magenta-tint">
        <Sparkles size={28} className="text-magenta" />
      </div>
      <h2 className="mt-4 text-xl font-semibold text-neutral-900">
        Start a new interview
      </h2>
      <p className="mt-2 max-w-md text-sm text-neutral-500">
        The AI agent will ask follow-up questions and capture your expertise as
        a structured knowledge entry.
      </p>
      <button
        onClick={onNew}
        className="mt-6 flex items-center gap-2 rounded-md bg-magenta px-5 py-3 text-sm font-semibold text-white hover:bg-magenta/90"
      >
        <Plus size={16} /> New Interview
      </button>
    </div>
  );
}

function StartForm({
  topic,
  onChange,
  onBegin,
  onCancel,
}: {
  topic: string;
  onChange: (v: string) => void;
  onBegin: () => void;
  onCancel: () => void;
}) {
  const canBegin = topic.trim().length > 0;
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-neutral-900">
        Start New Interview
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        Choose the SME and topic. The AI agent will begin the conversation.
      </p>

      <div className="mt-6 max-w-xl">
        <label className="text-sm font-medium text-neutral-900">
          Interview Topic <span className="text-magenta">*</span>
        </label>
        <input
          value={topic}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canBegin && onBegin()}
          placeholder="e.g., 5G Network Security Best Practices"
          className="mt-1.5 w-full rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none transition-colors focus:border-magenta focus:bg-white"
          autoFocus
        />

        <div className="mt-4 flex gap-2">
          <button
            disabled={!canBegin}
            onClick={onBegin}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors ${
              canBegin ? "bg-magenta hover:bg-magenta/90" : "bg-magenta/50"
            }`}
          >
            <Sparkles size={14} /> Begin Interview
          </button>
          <button
            onClick={onCancel}
            className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ActiveInterview({
  interview,
  replyDraft,
  onChangeReply,
  onSend,
  onReplyKey,
}: {
  interview: Interview;
  replyDraft: string;
  onChangeReply: (v: string) => void;
  onSend: () => void;
  onReplyKey: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const isComplete = interview.status === "completed";
  return (
    <>
      {/* Topic header + progress */}
      <div className="border-b border-border p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              {interview.topic}
            </h2>
            <p className="text-xs text-neutral-500">
              with Dr. Sarah Johnson · started {fmtDate(interview.startedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-magenta transition-all duration-500"
                style={{ width: `${interview.progress}%` }}
              />
            </div>
            <span className="text-xs font-medium text-neutral-500">
              {interview.progress}%
            </span>
          </div>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {interview.turns.map((t, i) => (
            <Bubble key={i} turn={t} />
          ))}

          {isComplete && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 size={22} className="text-green-600" />
              </div>
              <h3 className="mt-3 text-base font-semibold text-green-900">
                Interview complete
              </h3>
              <p className="mt-1 text-sm text-green-800/90">
                The AI agent has no more follow-up questions. Your transcript
                has been saved and will be synthesized into a knowledge entry
                for review.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      {isComplete ? (
        <div className="border-t border-border bg-neutral-50/60 p-4 text-center text-sm text-neutral-500">
          This interview is complete. Start a new one from the left panel.
        </div>
      ) : (
        <div className="border-t border-border p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={replyDraft}
              onChange={(e) => onChangeReply(e.target.value)}
              onKeyDown={onReplyKey}
              rows={2}
              placeholder="Share your expertise in detail…  (⌘/Ctrl+Enter to send)"
              className="flex-1 resize-none rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none transition-colors focus:border-magenta focus:bg-white"
            />
            <button
              onClick={onSend}
              disabled={!replyDraft.trim()}
              className={`flex h-10 w-10 items-center justify-center rounded-md text-white transition-colors ${
                replyDraft.trim()
                  ? "bg-magenta hover:bg-magenta/90"
                  : "bg-magenta/40"
              }`}
              aria-label="Send reply"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  if (turn.role === "agent") {
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
            {turn.text}
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
          {turn.text}
        </div>
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <User size={14} className="text-neutral-500" />
      </div>
    </div>
  );
}
