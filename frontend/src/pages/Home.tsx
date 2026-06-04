import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import {
  BookOpen,
  ClipboardCheck,
  MessageSquare,
  Mic,
  Send,
  Shield,
  Sparkles,
  Upload,
  User,
} from "lucide-react";
import { getUser } from "../api/client";

// ── Shared helpers ─────────────────────────────────────────────────

function QuickAction({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center gap-4 rounded-lg border border-border p-6 text-left transition-colors hover:border-magenta hover:bg-magenta-tint"
    >
      <span className="text-magenta">{icon}</span>
      <span>
        <span className="block text-base font-semibold text-neutral-900">
          {title}
        </span>
        <span className="block text-sm text-magenta">{subtitle}</span>
      </span>
    </button>
  );
}

function PortalCard({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-3 rounded-lg border border-border bg-white p-5 text-left transition-colors hover:border-magenta hover:bg-magenta-tint"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-magenta-tint text-magenta">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-neutral-900">{title}</p>
        <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>
      </div>
    </button>
  );
}

// ── Dashboard home (SME / Admin) ───────────────────────────────────

function DashboardHome() {
  const navigate = useNavigate();

  return (
    <main className="flex-1 overflow-y-auto bg-white p-8">
      {/* Welcome banner */}
      <section className="rounded-lg bg-gradient-to-r from-magenta to-[rgba(226,0,116,0.8)] p-8 text-white">
        <h1 className="text-3xl font-bold">Welcome to Project Thoth</h1>
        <p className="mt-2 text-lg font-medium text-white/90">
          T-Mobile's AI-Powered Knowledge Management System
        </p>
        <p className="mt-3 max-w-2xl text-sm text-white/80">
          Project Thoth captures expert knowledge through structured
          interactions, organizes it for retrieval, and helps you find the right
          information or connect with the right expert when you need assistance.
        </p>
      </section>

      {/* Quick actions */}
      <section className="mt-6">
        <h2 className="text-xl font-bold text-neutral-900">Quick Actions</h2>
        <div className="mt-4 flex gap-4">
          <QuickAction
            icon={<MessageSquare size={32} />}
            title="Ask a Question"
            subtitle="Get answers from our knowledge base or connect with an expert"
            onClick={() => navigate("/chat")}
          />
          <QuickAction
            icon={<BookOpen size={32} />}
            title="SME Directory"
            subtitle="View expertise and reach out directly"
            onClick={() => navigate("/directory")}
          />
        </div>
      </section>

      {/* SME Portal */}
      <section className="mt-8">
        <h2 className="text-xl font-bold text-neutral-900">SME Portal</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <PortalCard
            icon={<User size={20} />}
            title="My SME Profile"
            subtitle="Update your expert profile"
            onClick={() => navigate("/profile")}
          />
          <PortalCard
            icon={<Mic size={20} />}
            title="Expert Interview"
            subtitle="Share your knowledge through structured conversation"
            onClick={() => navigate("/interview")}
          />
          <PortalCard
            icon={<Upload size={20} />}
            title="Upload Materials"
            subtitle="Provide supporting documents and resources"
            onClick={() => navigate("/materials")}
          />
          <PortalCard
            icon={<Sparkles size={20} />}
            title="Knowledge Synthesis"
            subtitle="View all generated knowledge entries"
            onClick={() => navigate("/synthesis")}
          />
          <PortalCard
            icon={<ClipboardCheck size={20} />}
            title="Review & Approve"
            subtitle="Validate synthesized content before publication"
            onClick={() => navigate("/review")}
          />
        </div>
      </section>

      {/* Admin Actions */}
      <section className="mt-8">
        <h2 className="text-xl font-bold text-neutral-900">Admin Actions</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <PortalCard
            icon={<Shield size={20} />}
            title="Admin Dashboard"
            subtitle="Manage SMEs, approve knowledge entries, and oversee the system"
            onClick={() => navigate("/admin")}
          />
        </div>
      </section>
    </main>
  );
}

// ── Normal user home (input that redirects to /chat) ──────────────

const SUGGESTED = [
  "What are the best practices for network security?",
  "How does the billing dispute process work?",
  "What are the SIM swap fraud prevention measures?",
  "How does the device trade-in program work?",
];

function NormalUserHome() {
  const [input, setInput] = useState("");
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);

  function handleSubmit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setInput("");
    gsap.to(mainRef.current, {
      opacity: 0,
      duration: 0.2,
      ease: "power2.in",
      onComplete: () => navigate("/chat", { state: { question: trimmed } }),
    });
  }

  return (
    <main ref={mainRef} className="flex flex-1 flex-col bg-white p-8">
      {/* Welcome banner */}
      <section className="rounded-lg bg-gradient-to-r from-magenta to-[rgba(226,0,116,0.8)] p-8 text-white">
        <h1 className="text-3xl font-bold">Welcome to Project Thoth</h1>
        <p className="mt-2 text-lg font-medium text-white/90">
          T-Mobile's AI-Powered Knowledge Management System
        </p>
        <p className="mt-3 max-w-2xl text-sm text-white/80">
          Ask anything about T-Mobile systems, policies, and expert knowledge.
          Thoth will answer from approved knowledge or connect you with the
          right specialist.
        </p>
      </section>

      {/* Central input area */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {/* Suggested questions */}
        <div className="w-full max-w-2xl">
          <p className="mb-2 flex items-center gap-1 text-sm text-neutral-500">
            <Sparkles size={14} className="text-magenta" /> Suggested questions
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {SUGGESTED.map((q) => (
              <button
                key={q}
                onClick={() => handleSubmit(q)}
                className="shrink-0 rounded-lg bg-magenta-tint px-4 py-3 text-left text-sm text-neutral-700 hover:bg-[rgba(226,0,116,0.18)]"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Chat box */}
        <div className="w-full max-w-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(input);
            }}
            className="flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-3 shadow-sm transition-shadow focus-within:border-magenta focus-within:shadow-md"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything about T-Mobile systems and policies..."
              className="flex-1 bg-transparent py-1 text-base outline-none placeholder:text-neutral-400"
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-magenta text-white transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              <Send size={18} />
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] text-neutral-400">
            Information provided is for reference only and does not constitute
            professional advice.
          </p>
        </div>
      </div>
    </main>
  );
}

// ── Home (role dispatcher) ─────────────────────────────────────────

export default function Home() {
  const user = getUser();
  if (user && !user.is_admin && !user.is_sme) return <NormalUserHome />;
  return <DashboardHome />;
}
