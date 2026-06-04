import {
  BookOpen,
  Clock,
  MessageSquare,
  Plus,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { DashboardStats } from "../api/client";

function NavCard({
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
      className="w-full text-left rounded-lg border border-border px-4 py-4 transition-colors hover:border-magenta hover:bg-magenta-tint"
    >
      <div className="flex items-center gap-2 text-magenta">
        {icon}
        <span className="text-sm font-semibold text-neutral-900">{title}</span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>
    </button>
  );
}

function StatusRow({
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

export default function Sidebar({ stats }: { stats: DashboardStats | null }) {
  const navigate = useNavigate();
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
        title="SWE Directory"
        subtitle="View expertise and reach out directly"
        onClick={() => navigate("/directory")}
      />
      <NavCard
        icon={<BookOpen size={16} />}
        title="My Escalations"
        subtitle="Bring question straight to the expert"
      />

      {/* Chat history */}
      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-magenta" />
            <span className="text-sm font-semibold text-neutral-900">
              Chat History
            </span>
          </div>
          <button
            onClick={() => navigate("/chat")}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label="New conversation"
          >
            <Plus size={16} className="text-neutral-500" />
          </button>
        </div>
        <p className="px-4 py-2 text-xs text-neutral-400">1 conversation</p>
        <div className="p-2">
          <button
            onClick={() => navigate("/chat")}
            className="w-full rounded-md border border-border p-3 text-left transition-colors hover:border-magenta hover:bg-magenta-tint"
          >
            <p className="text-sm font-semibold text-neutral-900">
              New Conversation
            </p>
            <p className="text-xs text-neutral-400">No messages yet</p>
            <div className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
              <MessageSquare size={12} />
              <span>0 messages</span>
              <span>•</span>
              <span>1m ago</span>
            </div>
          </button>
        </div>
      </div>

      {/* System status */}
      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center gap-2">
          <Clock size={16} className="text-magenta" />
          <span className="text-sm font-semibold text-neutral-900">
            System Status
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <StatusRow
            label="Active SMEs"
            sublabel="Subject Matter Experts"
            value={stats ? String(stats.smeCount) : "–"}
            valueClass="text-magenta"
          />
          <StatusRow
            label="Knowledge Base"
            sublabel="Approved Entries"
            value={stats ? String(stats.approvedArticles) : "–"}
            valueClass="text-green-600"
          />
          <StatusRow
            label="Conversations"
            sublabel="Messages Exchanged"
            value="0"
            valueClass="text-blue-600"
          />
        </div>

        <div className="mt-4">
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

        <p className="mt-3 text-xs font-medium text-neutral-500">Model Usage</p>
        <p className="mt-3 flex items-start gap-1 text-[11px] text-neutral-400">
          <Clock size={12} className="mt-0.5 shrink-0" />
          Real-time system metrics for demo purposes. Production metrics may
          vary.
        </p>
      </div>

      {/* Role badge */}
      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
        <User size={14} className="text-neutral-400" />
        <div>
          <p className="text-xs font-semibold text-neutral-700">End User</p>
          <p className="text-[10px] text-neutral-400">Read-only access</p>
        </div>
      </div>
    </aside>
  );
}
