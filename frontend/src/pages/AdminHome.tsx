import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  MessageSquare,
  RefreshCw,
  Shield,
  Users,
} from "lucide-react";

// Self-consistent demo data matching the AdminDashboard Figma design.
const PENDING_REVIEW = {
  title: "wwww",
  author: "Dr. Sarah Johnson",
  tags: ["Network Security", "5G Infrastructure"],
};

const MAINTENANCE = [
  { title: "Network Outage Incident Response Runbook", by: "Dr. Sarah Johnson", review: "7/21/2026", due: "In 48d" },
  { title: "5G Network Security Best Practices", by: "Dr. Sarah Johnson", review: "8/15/2026", due: "In 73d" },
  { title: "Billing Dispute Resolution Process", by: "Michael Chen", review: "8/20/2026", due: "In 78d" },
  { title: "SIM Swap Fraud Prevention", by: "Dr. Sarah Johnson", review: "8/24/2026", due: "In 82d" },
  { title: "Device Trade-In Program Guidelines", by: "Michael Chen", review: "9/22/2026", due: "In 111d" },
];

const SMES = [
  {
    name: "Dr. Sarah Johnson",
    email: "sarah.johnson@t-mobile.com",
    tags: ["Network Security", "5G Infrastructure"],
    interviews: 1,
    materials: 2,
    entries: 4,
  },
  {
    name: "Michael Chen",
    email: "michael.chen@t-mobile.com",
    tags: ["Customer Service Policy", "Billing Systems"],
    interviews: 0,
    materials: 0,
    entries: 2,
  },
];

function StatCard({
  icon,
  iconBg,
  value,
  label,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-white p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold text-neutral-900">{value}</p>
        <p className="text-xs text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

function StatsRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "plain" | "green" | "yellow" | "red" | "blue";
}) {
  const bg = {
    plain: "bg-muted",
    green: "bg-green-50",
    yellow: "bg-yellow-50",
    red: "bg-red-50",
    blue: "bg-blue-50",
  }[tone];
  const text = {
    plain: "text-neutral-700",
    green: "text-green-700",
    yellow: "text-yellow-700",
    red: "text-red-700",
    blue: "text-blue-700",
  }[tone];
  return (
    <div className={`flex items-center justify-between rounded-md ${bg} px-4 py-3`}>
      <span className={`text-sm ${text}`}>{label}</span>
      <span className={`text-sm font-bold ${text}`}>{value}</span>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
  right,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900">
          <span className="text-magenta">{icon}</span>
          {title}
        </h2>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function AdminHome() {
  return (
    <main className="flex-1 overflow-y-auto bg-[#fafafa] p-8">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Admin Dashboard</h1>
        <p className="text-sm text-neutral-500">
          System overview and administrative controls
        </p>
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Users size={20} className="text-blue-600" />} iconBg="bg-blue-50" value={2} label="Total SMEs" />
        <StatCard icon={<CheckCircle2 size={20} className="text-green-600" />} iconBg="bg-green-50" value={5} label="Approved Entries" />
        <StatCard icon={<Clock size={20} className="text-yellow-600" />} iconBg="bg-yellow-50" value={1} label="Pending Review" />
        <StatCard icon={<AlertTriangle size={20} className="text-red-600" />} iconBg="bg-red-50" value={0} label="Escalated Questions" />
      </div>

      {/* Pending review + escalated */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Pending Admin Review" icon={<Shield size={18} />}>
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-neutral-900">{PENDING_REVIEW.title}</p>
                <p className="text-xs text-neutral-500">By {PENDING_REVIEW.author}</p>
              </div>
              <span className="rounded bg-yellow-50 px-2 py-0.5 text-[11px] font-medium text-yellow-700">
                Admin Review
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PENDING_REVIEW.tags.map((t) => (
                <span key={t} className="rounded bg-magenta-tint px-1.5 py-0.5 text-[11px] text-magenta">
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-3">
              <button className="flex flex-1 items-center justify-center gap-1 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700">
                <CheckCircle2 size={15} /> Approve
              </button>
              <button className="flex flex-1 items-center justify-center gap-1 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700">
                <AlertTriangle size={15} /> Reject
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Escalated Questions" icon={<AlertTriangle size={18} />}>
          <div className="flex h-40 flex-col items-center justify-center text-neutral-400">
            <MessageSquare size={28} className="mb-2 opacity-40" />
            <p className="text-sm">No escalated questions</p>
          </div>
        </SectionCard>
      </div>

      {/* Knowledge maintenance */}
      <div className="mt-6">
        <SectionCard
          title="Knowledge Maintenance"
          icon={<RefreshCw size={18} />}
          right={
            <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
              <CheckCircle2 size={13} /> All entries current
            </span>
          }
        >
          <div className="flex flex-col gap-2">
            {MAINTENANCE.map((m) => (
              <div key={m.title} className="flex items-center justify-between rounded-md border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{m.title}</p>
                  <p className="text-xs text-neutral-400">By {m.by} · Next review {m.review}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-neutral-500">{m.due}</span>
                  <button className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-neutral-600 hover:bg-muted">
                    <RefreshCw size={12} /> Extend 3 mo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Three columns */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Subject Matter Experts" icon={<Users size={18} />}>
          <div className="flex flex-col gap-4">
            {SMES.map((s) => (
              <div key={s.name}>
                <p className="text-sm font-semibold text-neutral-900">{s.name}</p>
                <p className="text-xs text-neutral-400">{s.email}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {s.tags.map((t) => (
                    <span key={t} className="rounded bg-magenta-tint px-1.5 py-0.5 text-[11px] text-magenta">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-neutral-400">
                  {s.interviews} interviews&nbsp;&nbsp;&nbsp;{s.materials} materials&nbsp;&nbsp;&nbsp;{s.entries} entries
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Knowledge Base Stats" icon={<BookOpen size={18} />}>
          <div className="flex flex-col gap-2">
            <StatsRow label="Total Entries" value={6} tone="plain" />
            <StatsRow label="Approved" value={5} tone="green" />
            <StatsRow label="Pending Review" value={1} tone="yellow" />
            <StatsRow label="Rejected" value={0} tone="red" />
          </div>
        </SectionCard>

        <SectionCard title="Activity Overview" icon={<Activity size={18} />}>
          <div className="flex flex-col gap-2">
            <StatsRow label="Total Interviews" value={1} tone="plain" />
            <StatsRow label="Uploaded Materials" value={2} tone="plain" />
            <StatsRow label="Total Questions" value={1} tone="plain" />
            <StatsRow label="Answered" value={1} tone="blue" />
          </div>
        </SectionCard>
      </div>

      {/* Admin responsibilities */}
      <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-5">
        <h3 className="text-sm font-bold text-blue-900">Admin Responsibilities</h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-800">
          {[
            "Final approval of knowledge entries after SME review",
            "Monitor and manage escalated questions without clear SME routing",
            "Oversee SME registrations and expertise areas",
            "Ensure knowledge base maintains quality and accuracy standards",
            "Track system usage and identify areas for improvement",
          ].map((r) => (
            <li key={r} className="flex gap-2">
              <span className="text-blue-400">•</span>
              {r}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
