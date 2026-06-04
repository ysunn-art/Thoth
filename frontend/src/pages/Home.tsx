import {
  BookOpen,
  ClipboardCheck,
  MessageSquare,
  Mic,
  Shield,
  Sparkles,
  Upload,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

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

export default function Home() {
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
