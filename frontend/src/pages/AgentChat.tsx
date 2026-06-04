import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Send, Sparkles } from "lucide-react";
import { api } from "../api/client";
import { useStats } from "../Layout";
import DetailPanel, { type AnswerDetail } from "../components/DetailPanel";

interface Message {
  id: string;
  role: "user" | "assistant";
  timestamp: string;
  steps?: string[]; // numbered steps (seeded / structured)
  content?: string; // free-form answer (live /query)
  relatedTopics?: string[];
  detail?: AnswerDetail;
}

const SUGGESTED = [
  "What are the best practices for 5G network security?",
  "What are the authentication protocols for network access?",
  "How do I handle customer billing disputes?",
  "Can you explain the customer escalation process?",
];

// Seeded conversation mirroring the Figma design.
const SEED: Message[] = [
  {
    id: "u1",
    role: "user",
    timestamp: "11:10 PM",
    content:
      "How should I escalate a customer billing dispute that was not resolved at the first level?",
  },
  {
    id: "a1",
    role: "assistant",
    timestamp: "11:52 AM",
    steps: [
      "When implementing 5G network security, always ensure proper authentication protocols are in place. Key considerations include:",
      "Network Slicing Security: Each network slice must have its own security domain with isolated authentication. Never share credentials across slices.",
      "Mutual Authentication: Always use mutual TLS (mTLS) between the gNB and core network. One-way auth is insufficient for 5G environments.",
      "Zero Trust Architecture: Assume every device and endpoint is untrusted until verified. Apply least-privilege access at every layer.",
      "SIM-based Authentication: 5G-AKA (Authentication and Key Agreement) is the preferred mechanism. Ensure your SIM provisioning pipeline is end-to-end encrypted.",
      "Monitoring: Deploy real-time anomaly detection on the N2 and N3 interfaces. Alert on unusual signaling patterns which may indicate IMSI catchers or rogue base stations.",
    ],
    relatedTopics: [
      "Network Security",
      "5G Infrastructure",
      "Billing Dispute Resolution",
      "Network Outage Incident",
      "Device Trade-In Program",
    ],
    detail: {
      title: "5g network security best practices",
      updatedAt: "today at 12:15",
      answer:
        "To address your question about \"5g network security best practices\", here are the key steps:\n\n1. When implementing 5G network security, always ensure proper authentication protocols are in place.\n2. Network Slicing Security: Each network slice must have its own security domain with isolated authentication.\n3. Mutual Authentication: Always use mutual TLS (mTLS) between the gNB and core network.\n4. Zero Trust Architecture: Assume every device and endpoint is untrusted until verified.\n5. SIM-based Authentication: 5G-AKA is the preferred mechanism.\n6. Monitoring: Deploy real-time anomaly detection on the N2 and N3 interfaces.",
      relatedTopics: [
        "Network Security",
        "5G Infrastructure",
        "Billing Dispute Resolution",
        "Network Outage Incident",
      ],
      confidence: 87,
      sources: [
        { title: "5G Network Security Best Practices", score: 95 },
        { title: "Billing Dispute Resolution", score: 84 },
        { title: "Network Outage Incident Response Runbo...", score: 73 },
      ],
      experts: [
        {
          name: "Dr. Sarah Johnson",
          specialization: "Network Security",
          match: 92,
          lastReview: "May 6, 2026",
        },
      ],
    },
  },
];

function ChipRow({
  topics,
  onExpand,
}: {
  topics: string[];
  onExpand?: () => void;
}) {
  return (
    <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-3">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
          Related Topics
        </p>
        <div className="flex flex-wrap gap-2">
          {topics.map((t) => (
            <span
              key={t}
              className="rounded-md bg-muted px-2 py-1 text-xs text-neutral-600"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      {onExpand && (
        <button
          onClick={onExpand}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-magenta text-white hover:opacity-90"
          aria-label="Open answer details"
        >
          <ArrowUpRight size={18} />
        </button>
      )}
    </div>
  );
}

export default function AgentChat() {
  const [messages, setMessages] = useState<Message[]>(SEED);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [detail, setDetail] = useState<AnswerDetail | null>(null);
  const { setSidebarHidden } = useStats();
  const sessionId = useRef(
    `sess_${Math.random().toString(36).slice(2, 10)}`,
  ).current;

  // The detail view is a two-pane layout (chat + panel) that hides the main
  // sidebar, matching the agent-chat-details design. Restore it on leave.
  function openDetail(d: AnswerDetail) {
    setDetail(d);
    setSidebarHidden(true);
  }
  function closeDetail() {
    setDetail(null);
    setSidebarHidden(false);
  }
  useEffect(() => () => setSidebarHidden(false), [setSidebarHidden]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || sending) return;
    setInput("");
    const now = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    setMessages((m) => [
      ...m,
      { id: `u${Date.now()}`, role: "user", content: q, timestamp: now },
    ]);
    setSending(true);
    try {
      const res = await api.query(q, sessionId);
      setMessages((m) => [
        ...m,
        {
          id: `a${Date.now()}`,
          role: "assistant",
          content: res.answer,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          relatedTopics: res.sources.map((s) => s.topic),
          detail: {
            title: q.slice(0, 60),
            updatedAt: "just now",
            answer: res.answer,
            relatedTopics: res.sources.map((s) => s.topic),
            confidence: res.grounded ? 87 : 40,
            sources: res.sources.map((s) => ({ title: s.topic, score: 80 })),
            experts: (res.routed_to ?? []).map((r) => ({
              name: r.sme_name ?? "Subject Matter Expert",
              specialization: r.specialization,
              match: 90,
            })),
          },
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `e${Date.now()}`,
          role: "assistant",
          content:
            "I couldn't reach the knowledge service. Make sure the backend is running on port 8000.",
          timestamp: now,
        },
      ]);
      console.warn("query failed", err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      {/* Chat column */}
      <main className="flex h-full flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="mb-6 flex flex-col items-end">
                <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-magenta px-4 py-3 text-sm text-white">
                  {msg.content}
                </div>
                <span className="mt-1 text-[11px] text-neutral-400">
                  {msg.timestamp}
                </span>
              </div>
            ) : (
              <div key={msg.id} className="mb-6 max-w-[80%]">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-magenta-tint">
                    <Sparkles size={14} className="text-magenta" />
                  </span>
                  <span className="text-sm font-semibold text-neutral-700">
                    Thoth Responds
                  </span>
                  <span className="rounded bg-magenta-tint px-1.5 py-0.5 text-[10px] font-semibold text-magenta">
                    AI
                  </span>
                </div>
                <div className="rounded-lg border border-border p-5">
                  {msg.steps ? (
                    <ol className="space-y-3">
                      {msg.steps.map((s, i) => (
                        <li key={i} className="flex gap-3 text-sm text-neutral-700">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-magenta-tint text-[11px] font-semibold text-magenta">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">{s}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                      {msg.content}
                    </p>
                  )}
                  {msg.relatedTopics && msg.relatedTopics.length > 0 && (
                    <ChipRow
                      topics={msg.relatedTopics}
                      onExpand={
                        msg.detail ? () => openDetail(msg.detail!) : undefined
                      }
                    />
                  )}
                </div>
                <span className="mt-1 block text-[11px] text-neutral-400">
                  {msg.timestamp}
                </span>
              </div>
            ),
          )}
          {sending && (
            <div className="mb-6 text-sm text-neutral-400">Thoth is thinking…</div>
          )}
        </div>

        {/* Suggested questions */}
        <div className="px-8">
          <p className="mb-2 flex items-center gap-1 text-sm text-neutral-500">
            <Sparkles size={14} className="text-magenta" /> Suggested questions
          </p>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="shrink-0 rounded-lg bg-magenta-tint px-4 py-3 text-left text-sm text-neutral-700 hover:bg-[rgba(226,0,116,0.18)]"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border px-8 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything about T-Mobile systems and policies..."
              className="flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-neutral-400"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-md bg-magenta text-white disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </form>
          <p className="mt-2 text-[11px] text-neutral-400">
            ⓘ Information provided is for reference only and does not constitute
            professional advice.
          </p>
        </div>
      </main>

      {/* Detail panel (agent-chat-details) */}
      {detail && <DetailPanel detail={detail} onClose={closeDetail} />}
    </div>
  );
}
