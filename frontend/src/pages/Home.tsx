import { BookOpen, Clock, MessageSquare, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStats } from "../Layout";

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

function StatCard({
  icon,
  iconBg,
  value,
  label,
  description,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: string;
  label: string;
  description: string;
}) {
  return (
    <div className="flex-1 rounded-lg border border-border p-6">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-lg ${iconBg}`}
        >
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-neutral-900">{value}</p>
          <p className="text-sm text-neutral-500">{label}</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-neutral-400">{description}</p>
    </div>
  );
}

export default function Home() {
  const { stats } = useStats();
  const navigate = useNavigate();
  const v = (n: number | undefined) => (stats ? String(n) : "–");

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
      <section className="mt-6 rounded-lg border border-border p-6">
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
            title="SWE Directory"
            subtitle="View expertise and reach out directly"
            onClick={() => navigate("/directory")}
          />
        </div>
      </section>

      {/* Stat cards */}
      <section className="mt-6 flex gap-4">
        <StatCard
          icon={<BookOpen size={24} className="text-magenta" />}
          iconBg="bg-magenta-tint"
          value={v(stats?.approvedArticles)}
          label="Approved Articles"
          description="Verified knowledge entries from subject matter experts"
        />
        <StatCard
          icon={<Users size={24} className="text-magenta" />}
          iconBg="bg-magenta-tint"
          value={v(stats?.smeCount)}
          label="Subject Matter Experts"
          description="Specialists ready to help with your questions"
        />
        <StatCard
          icon={<Clock size={24} className="text-magenta" />}
          iconBg="bg-magenta-tint"
          value={v(stats?.pendingReview)}
          label="Pending Review"
          description="Knowledge entries awaiting approval"
        />
      </section>

      {/* Disclaimer */}
      <section className="mt-6 rounded-lg border border-[#fff085] bg-[#fefce8] p-6">
        <h3 className="text-base font-bold text-[#894b00]">
          Important Disclaimer
        </h3>
        <p className="mt-2 text-sm text-[#733e0a]">
          This system provides information for reference purposes only and does
          not constitute professional advice. All content is attributed to
          subject matter experts and should be verified for your specific use
          case. When in doubt, consult with the relevant specialist directly.
        </p>
      </section>
    </main>
  );
}
