import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import gsap from "gsap";
import { Send, Sparkles } from "lucide-react";
import { api, getUser } from "../api/client";
import { fetchSessionMessages, generateSessionId, saveSession } from "../api/chatHistory";
import { useStats } from "../Layout";
import DetailPanel, { type AnswerDetail } from "../components/DetailPanel";

interface Message {
  id: string;
  role: "user" | "assistant";
  timestamp: string;
  content: string;
  relatedTopics?: string[];
  detail?: AnswerDetail;
  responseType?: string;
  routedTo?: { type: string; sme_name: string | null; specialization: string; reason: string }[] | null;
}

const SUGGESTED = [
  "What are the best practices for network security?",
  "How does the billing dispute process work?",
  "What are the SIM swap fraud prevention measures?",
  "How does the device trade-in program work?",
];

export default function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [detail, setDetail] = useState<AnswerDetail | null>(null);
  const { setSidebarHidden } = useStats();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const sessionParam = searchParams.get("session");
  const sessionId = useRef(sessionParam || generateSessionId());
  const firedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chatHovering, setChatHovering] = useState(false);

  const collapsed = messages.length > 0;

  // GSAP fade-in on mount
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" },
      );
    });
    return () => ctx.revert();
  }, []);

  // Load session messages from API when ?session= is present
  useEffect(() => {
    if (sessionParam) {
      fetchSessionMessages(sessionParam).then((msgs) => {
        if (msgs.length > 0) {
          setMessages(
            msgs.map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: "",
            })),
          );
        }
      });
    }
  }, [sessionParam]);

  // Auto-send question passed from Home page
  useEffect(() => {
    const q = (location.state as { question?: string })?.question;
    if (q && !firedRef.current) {
      firedRef.current = true;
      // Delay to let the fade-in animation complete before sending
      setTimeout(() => send(q), 350);
    }
  }, []);

  function closeDetail() {
    setDetail(null);
    setSidebarHidden(false);
  }
  useEffect(() => () => setSidebarHidden(false), [setSidebarHidden]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || sending) return;
    setInput("");
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg: Message = { id: `u${Date.now()}`, role: "user", content: q, timestamp: now };
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    try {
      const res = await api.query(q, sessionId.current);
      const assistantMsg: Message = {
        id: `a${Date.now()}`,
        role: "assistant",
        content: res.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        relatedTopics: res.sources.map((s) => s.topic),
        responseType: res.response_type,
        routedTo: res.routed_to,
        detail: {
          title: res.sources[0]?.topic ?? q.slice(0, 60),
          updatedAt: "just now",
          answer: res.answer,
          relatedTopics: res.sources.map((s) => s.topic),
          sources: res.sources.map((s) => ({ entry_id: s.entry_id, title: s.topic, score: res.grounded ? 85 : 40 })),
          experts: (res.routed_to ?? []).map((r) => ({ name: r.sme_name ?? "Subject Matter Expert", specialization: r.specialization })),
        },
      };
      setMessages((m) => [...m, assistantMsg]);
      saveSession({
        id: sessionId.current,
        userId: getUser()?.user_id ?? "",
        title: q.length > 50 ? q.slice(0, 50) + "..." : q,
        lastMessage: res.answer.slice(0, 80),
        updatedAt: Date.now(),
        messages: [],
      });
    } catch (err) {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: "assistant", content: "I couldn't reach the knowledge service. Make sure the backend is running on port 8000.", timestamp: now }]);
      console.warn("query failed", err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div ref={containerRef} className="flex h-full flex-1 overflow-hidden">
      <main className="flex h-full flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-neutral-400">
              <Sparkles size={48} className="mb-4 text-magenta/40" />
              <p className="text-lg font-medium text-neutral-500">Ask Thoth anything</p>
              <p className="mt-1 text-sm">Ask a question about approved knowledge entries.</p>
            </div>
          )}
          {messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="mb-6 flex flex-col items-end">
                <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-magenta px-4 py-3 text-sm text-white">{msg.content}</div>
                <span className="mt-1 text-[11px] text-neutral-400">{msg.timestamp}</span>
              </div>
            ) : (
              <div key={msg.id} className="mb-6 max-w-[80%]">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-magenta-tint"><Sparkles size={14} className="text-magenta" /></span>
                  <span className="text-sm font-semibold text-neutral-700">Thoth</span>
                  <span className="rounded bg-magenta-tint px-1.5 py-0.5 text-[10px] font-semibold text-magenta">AI</span>
                  {msg.responseType && msg.responseType !== "answer" && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${msg.responseType === "routing" ? "bg-yellow-50 text-yellow-700" : "bg-blue-50 text-blue-700"}`}>
                      {msg.responseType === "routing" ? "Routing" : "Clarifying"}
                    </span>
                  )}
                </div>
                <div className="rounded-lg border border-border p-5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{msg.content}</p>
                  {msg.responseType === "routing" && msg.routedTo && msg.routedTo.length > 0 && (
                    <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                      <p className="text-xs font-semibold text-yellow-800">Routed to:</p>
                      <ul className="mt-2 space-y-1">
                        {msg.routedTo.map((r, i) => (
                          <li key={i} className="text-xs text-yellow-700">{r.sme_name ?? "Admin"} — {r.specialization}: {r.reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {msg.responseType === "clarification" && (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-xs text-blue-700">Please provide more details to help me answer your question accurately.</p>
                    </div>
                  )}
                </div>
                <span className="mt-1 block text-[11px] text-neutral-400">{msg.timestamp}</span>
              </div>
            ),
          )}
          {sending && <div className="mb-6 text-sm text-neutral-400">Thoth is thinking…</div>}
        </div>

        {/* Bottom bar: spacer + suggested questions + input */}
        <div className="shrink-0 relative">
          {collapsed ? (
            /* Absolute overlay — never affects flex layout */
            <div className="absolute top-0 left-0 right-0 flex items-center px-8 h-[40px]">
              <div
                className="flex items-center"
                onMouseEnter={() => setChatHovering(true)}
                onMouseLeave={() => setChatHovering(false)}
              >
                <button className="flex shrink-0 items-center rounded-xl bg-magenta-tint px-4 py-3 text-sm text-magenta">
                  <Sparkles size={16} />
                </button>
                <div
                  className="ml-2 shrink-0 overflow-x-auto overflow-y-hidden"
                  style={{
                    maxWidth: chatHovering ? 2000 : 0,
                    opacity: chatHovering ? 1 : 0,
                    transition: "max-width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  <div className="flex gap-3" style={{ whiteSpace: "nowrap" }}>
                    {SUGGESTED.map((s) => (
                      <button key={s} onClick={() => send(s)} className="shrink-0 rounded-xl bg-magenta-tint px-4 py-3 text-left text-sm text-neutral-700 hover:bg-[rgba(226,0,116,0.18)]">{s}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-8">
              <p className="mb-2 flex items-center gap-1 text-sm text-neutral-500"><Sparkles size={14} className="text-magenta" /> Suggested questions</p>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {SUGGESTED.map((s) => (
                  <button key={s} onClick={() => send(s)} className="shrink-0 rounded-xl bg-magenta-tint px-4 py-3 text-left text-sm text-neutral-700 hover:bg-[rgba(226,0,116,0.18)]">{s}</button>
                ))}
              </div>
            </div>
          )}
          {/* Spacer: matches uncollapsed height when collapsed */}
          <div style={{ height: collapsed ? 40 : "auto" }} />
        </div>

        {/* Input bar */}
        <div className="px-8 pt-2 pb-4">
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask me anything about T-Mobile systems and policies..." className="flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-neutral-400" disabled={sending} />
            <button type="submit" disabled={sending || !input.trim()} className="flex h-9 w-9 items-center justify-center rounded-md bg-magenta text-white disabled:opacity-40"><Send size={16} /></button>
          </form>
          <p className="mt-2 text-[11px] text-neutral-400">Information provided is for reference only and does not constitute professional advice.</p>
        </div>
      </main>
      {detail && <DetailPanel detail={detail} onClose={closeDetail} />}
    </div>
  );
}
