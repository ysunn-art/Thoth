import { useState } from "react";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Info,
  MessageSquare,
  Mic,
  Send,
  Sparkles,
  Upload,
  User,
  UserPlus,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { DashboardStats } from "../api/client";

const CONVERSATIONS = [
  {
    id: "c1",
    title: "5G handoff failure root-cause",
    preview: "Looking at the latest network logs, the handoff failures appear to…",
    timestamp: "2m ago",
    messages: 8,
  },
  {
    id: "c2",
    title: "Billing dispute escalation policy",
    preview: "What is the proper escalation path when a customer disputes…",
    timestamp: "1h ago",
    messages: 5,
  },
  {
    id: "c3",
    title: "SIM swap fraud signals",
    preview: "Which signals should trigger an automatic SIM swap freeze?",
    timestamp: "Yesterday",
    messages: 12,
  },
];

function NavCard({
  icon,
  title,
  subtitle,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border px-4 py-4 transition-colors ${
        active
          ? "border-magenta bg-white"
          : "border-border hover:border-magenta hover:bg-magenta-tint"
      }`}
    >
      <div className="flex items-center gap-2 text-magenta">
        {icon}
        <span className="text-sm font-semibold text-neutral-900">{title}</span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>
    </button>
  );
}

function NavLink({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-magenta bg-white px-4 py-3 text-left text-sm font-medium text-neutral-900 transition-colors hover:bg-magenta-tint"
    >
      <span className="text-magenta">{icon}</span>
      {label}
    </button>
  );
}

function ChatHistoryExpandable() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-magenta-tint/40"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-magenta" />
          <span className="text-sm font-semibold text-neutral-900">
            Chat History
          </span>
        </div>
        <ChevronDown
          size={16}
          className={`text-neutral-500 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <p className="px-4 pb-3 text-xs text-neutral-400">
        {CONVERSATIONS.length} conversations
      </p>

      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="max-h-64 overflow-y-auto border-t border-border p-2">
            {CONVERSATIONS.map((c, i) => (
              <button
                key={c.id}
                onClick={() => navigate("/chat")}
                className="block w-full rounded-md border border-transparent p-2 text-left transition-colors hover:border-magenta hover:bg-magenta-tint"
                style={{ transitionDelay: open ? `${i * 40}ms` : "0ms" }}
              >
                <p className="line-clamp-1 text-sm font-medium text-neutral-900">
                  {c.title}
                </p>
                <p className="line-clamp-1 text-xs text-neutral-400">
                  {c.preview}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-400">
                  <MessageSquare size={10} />
                  <span>{c.messages} messages</span>
                  <span>·</span>
                  <span>{c.timestamp}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatHistoryActive() {
  const navigate = useNavigate();
  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-magenta" />
          <span className="text-sm font-semibold text-neutral-900">
            Chat History
          </span>
        </div>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="New conversation"
        >
          <Send size={14} className="text-neutral-500" />
        </button>
      </div>
      <p className="px-4 pb-2 text-xs text-neutral-400">
        {CONVERSATIONS.length} conversations
      </p>
      <div className="max-h-72 overflow-y-auto border-t border-border p-2">
        {CONVERSATIONS.map((c, i) => (
          <button
            key={c.id}
            onClick={() => navigate("/chat")}
            className={`mb-1 block w-full rounded-md border px-3 py-2 text-left transition-colors ${
              i === 0
                ? "border-magenta/30 bg-magenta-tint"
                : "border-transparent hover:border-magenta hover:bg-magenta-tint"
            }`}
          >
            <p className="line-clamp-1 text-sm font-medium text-neutral-900">
              {c.title}
            </p>
            <p className="line-clamp-1 text-xs text-neutral-500">{c.preview}</p>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-400">
              <MessageSquare size={10} />
              <span>{c.messages} messages</span>
              <span>·</span>
              <span>{c.timestamp}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatRow({
  label,
  sublabel,
  value,
  valueClass,
}: {
  label: string;
  sublabel: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="rounded-md bg-muted px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700">{label}</span>
        <span className={`text-lg font-bold ${valueClass}`}>{value}</span>
      </div>
      <p className="text-xs text-neutral-400">{sublabel}</p>
    </div>
  );
}

function SystemStatus({ stats }: { stats: DashboardStats | null }) {
  const v = (n: number | undefined) => (stats ? String(n) : "–");
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock size={16} className="text-magenta" />
        <span className="text-sm font-semibold text-neutral-900">
          System Status
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <StatRow
          label="Active SMEs"
          sublabel="Subject Matter Experts"
          value={v(stats?.smeCount)}
          valueClass="text-magenta"
        />
        <StatRow
          label="Knowledge Base"
          sublabel="Approved Entries"
          value={v(stats?.approvedArticles)}
          valueClass="text-green-600"
        />
        <StatRow
          label="Conversations"
          sublabel="Messages Exchanged"
          value="0"
          valueClass="text-blue-600"
        />
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-xs font-medium text-neutral-500">
          Performance Metrics
        </p>
        <div className="mt-2 flex justify-between text-xs text-neutral-500">
          <span>Avg. Latency</span>
          <span>0s</span>
        </div>
        <div className="flex justify-between text-xs text-neutral-500">
          <span>Total Tokens</span>
          <span>0</span>
        </div>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <p className="text-xs font-medium text-neutral-500">Model Usage</p>
      </div>

      <p className="mt-3 flex items-start gap-1 border-t border-border pt-3 text-[11px] text-neutral-400">
        <Info size={12} className="mt-0.5 shrink-0" />
        Real-time system metrics for demo purposes. Production metrics may vary.
      </p>
    </div>
  );
}

export default function Sidebar({ stats }: { stats: DashboardStats | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isChat = location.pathname.startsWith("/chat");

  return (
    <aside className="flex h-full w-80 flex-col gap-4 overflow-y-auto border-r border-border p-5">
      {/* Brand */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-3 pb-2 text-left"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-magenta text-lg font-bold text-white">
          T
        </div>
        <div>
          <p className="text-base font-bold leading-tight text-neutral-900">
            Project Thoth
          </p>
          <p className="text-xs text-neutral-400">T-Mobile Knowledge System</p>
        </div>
      </button>

      <NavCard
        icon={<BookOpen size={16} />}
        title="SME Directory"
        subtitle="View expertise and reach out directly"
        active
        onClick={() => navigate("/directory")}
      />

      {isChat && (
        <NavCard
          icon={<BookOpen size={16} />}
          title="My Escalations"
          subtitle="Bring question straight to the expert"
          active
        />
      )}

      {isChat ? <ChatHistoryActive /> : <ChatHistoryExpandable />}

      {isChat ? (
        <SystemStatus stats={stats} />
      ) : (
        <>
          {/* SME Tools section */}
          <div>
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              SME Tools
            </p>
            <div className="flex flex-col gap-3">
              <NavLink
                icon={<User size={16} />}
                label="My SME Profile"
                onClick={() => navigate("/profile")}
              />
              <NavLink
                icon={<Mic size={16} />}
                label="Expert Interview"
                onClick={() => navigate("/interview")}
              />
              <NavLink
                icon={<Upload size={16} />}
                label="Upload Materials"
                onClick={() => navigate("/materials")}
              />
              <NavLink
                icon={<Sparkles size={16} />}
                label="Knowledge Synthesis"
                onClick={() => navigate("/synthesis")}
              />
              <NavLink
                icon={<ClipboardCheck size={16} />}
                label="Review & Approve"
                onClick={() => navigate("/review")}
              />
            </div>
          </div>

          {/* Admin Tools section */}
          <div>
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Admin Tools
            </p>
            <div className="flex flex-col gap-3">
              <NavLink
                icon={<UserPlus size={16} />}
                label="SME Onboarding"
                onClick={() => navigate("/onboarding")}
              />
              <NavLink
                icon={<Activity size={16} />}
                label="Admin Dashboard"
                onClick={() => navigate("/admin")}
              />
            </div>
          </div>
        </>
      )}

      {/* Role badge */}
      {isChat ? (
        <div className="mt-auto flex items-center gap-2 rounded-md bg-magenta-tint px-3 py-2">
          <CheckCircle2 size={12} className="text-magenta" />
          <div>
            <p className="text-xs font-semibold text-neutral-900">Admin</p>
            <p className="text-[10px] text-neutral-500">Administrator access</p>
          </div>
        </div>
      ) : (
        <div className="mt-auto rounded-lg border border-border bg-magenta-tint p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-magenta text-white">
              <CheckCircle2 size={14} />
            </div>
            <div>
              <p className="text-xs font-semibold text-neutral-900">
                Admin
              </p>
              <p className="text-[10px] text-neutral-500">Administrator access</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
