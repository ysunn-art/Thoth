import { useLocation, useNavigate } from "react-router-dom";
import type { DashboardStats } from "../api/client";
import { getUser, logout } from "../api/client";
import { getSessions, timeAgo } from "../api/chatHistory";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Info,
  LogOut,
  MessageSquare,
  Mic,
  Plus,
  Sparkles,
  Upload,
  User,
  UserPlus,
} from "lucide-react";

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

function ChatHistory() {
  const navigate = useNavigate();
  const sessions = getSessions();

  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-magenta" />
          <span className="text-sm font-semibold text-neutral-900">
            Chat History
          </span>
        </div>
        <button
          onClick={() => navigate("/chat")}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
          aria-label="New conversation"
        >
          <Plus size={14} className="text-neutral-500" />
        </button>
      </div>
      {sessions.length === 0 ? (
        <div className="p-2">
          <button
            onClick={() => navigate("/chat")}
            className="w-full rounded-md border border-border p-3 text-left transition-colors hover:border-magenta hover:bg-magenta-tint"
          >
            <p className="text-sm font-semibold text-neutral-900">
              New Conversation
            </p>
            <p className="text-xs text-neutral-400">Start a new Q&A session</p>
          </button>
        </div>
      ) : (
        <>
          <p className="px-4 pb-2 pt-1 text-xs text-neutral-400">
            {sessions.length} conversation{sessions.length !== 1 ? "s" : ""}
          </p>
          <div className="max-h-56 overflow-y-auto border-t border-border p-2">
            {sessions.slice(0, 10).map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/chat?session=${s.id}`)}
                className="mb-1 block w-full rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-magenta hover:bg-magenta-tint"
              >
                <p className="line-clamp-1 text-sm font-medium text-neutral-900">
                  {s.title}
                </p>
                <p className="line-clamp-1 text-xs text-neutral-400">
                  {s.lastMessage}
                </p>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-neutral-400">
                  <MessageSquare size={10} />
                  <span>{timeAgo(s.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
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
  const user = getUser();

  return (
    <aside className="flex h-full w-80 flex-col gap-4 overflow-y-auto border-r border-border p-5">
      {/* Brand */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-3 pb-2 text-left"
      >
        <img src="/Tmobile_LOGO.png" alt="T-Mobile" className="h-8 w-auto" />
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

      <ChatHistory />

      {isChat ? (
        <SystemStatus stats={stats} />
      ) : (
        <>
          {/* SME Tools section — visible to SME and Admin */}
          {(user?.is_sme || user?.is_admin) && (
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
          )}

          {/* Admin Tools section — visible to Admin only */}
          {user?.is_admin && (
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
          )}
        </>
      )}

      {/* User badge */}
      {(() => {
        if (!user) {
          return (
            <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
              <User size={14} className="text-neutral-400" />
              <div>
                <p className="text-xs font-semibold text-neutral-700">Not logged in</p>
                <p className="text-[10px] text-neutral-400">Please sign in</p>
              </div>
            </div>
          );
        }
        return (
          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
            <div className="flex items-center gap-2 rounded-md bg-magenta-tint px-3 py-2">
              <CheckCircle2 size={12} className="text-magenta" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-neutral-900">
                  {user.email}
                </p>
                <p className="text-[10px] text-neutral-500">
                  {user.is_admin
                    ? "Administrator access"
                    : user.is_sme
                      ? "SME access"
                      : "User access"}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut size={12} />
              Sign out
            </button>
          </div>
        );
      })()}
    </aside>
  );
}
