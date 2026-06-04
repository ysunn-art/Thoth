import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  Clock3,
  Github,
  Globe,
  GraduationCap,
  Mail,
  MapPin,
  MessageCircle,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  availabilityColor,
  availabilityDot,
  EXPERTS,
  teamColor,
  TEAMS,
  type Expert,
} from "../data/experts";

function Avatar({ expert, size = 40 }: { expert: Expert; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${expert.avatar} font-semibold text-white`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {expert.initials}
    </span>
  );
}

function AvailabilityBadge({ a }: { a: Expert["availability"] }) {
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${availabilityColor(a)}`}>
      <span className={`h-2 w-2 rounded-full ${availabilityDot(a)}`} />
      {a}
    </span>
  );
}

function DirectoryHeader() {
  return (
    <div className="border-b border-border bg-white px-8 pb-3 pt-6">
      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
        <Search size={16} className="text-neutral-400" />
        <input
          placeholder="Search topics, keywords, or expert names..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
        />
      </div>
      {/* Filters */}
      <div className="mt-3 flex items-center gap-2">
        <button className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-neutral-500">
          <SlidersHorizontal size={14} />
        </button>
        {["All Teams", "All Specialists", "Availability"].map((f) => (
          <button
            key={f}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-neutral-600"
          >
            {f}
            <ChevronDown size={12} />
          </button>
        ))}
        <span className="ml-auto text-xs text-neutral-400">
          {EXPERTS.length} results
        </span>
      </div>
      {/* Specialization chips */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {TEAMS.map((t) => (
          <span
            key={t}
            className={`flex items-center gap-1 text-xs font-medium ${teamColor(t)}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function ExpertCard({ expert }: { expert: Expert }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/directory/${expert.id}`)}
      className="flex flex-col rounded-lg border border-border p-4 text-left transition-colors hover:border-magenta hover:shadow-sm"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Avatar expert={expert} />
          <div>
            <p className="text-sm font-semibold text-neutral-900">{expert.name}</p>
            <p className="text-xs text-neutral-500">{expert.role}</p>
          </div>
        </div>
        <AvailabilityBadge a={expert.availability} />
      </div>
      <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-neutral-600">
        {expert.description}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {expert.skills.slice(0, 4).map((s) => (
          <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-neutral-600">
            {s}
          </span>
        ))}
        {expert.skills.length > 4 && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-neutral-500">
            +{expert.skills.length - 4}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
        <span className={`flex items-center gap-1 text-[11px] font-medium ${teamColor(expert.team)}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {expert.team}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-neutral-400">
          <MapPin size={11} />
          {expert.location}
        </span>
      </div>
    </button>
  );
}

function ContactRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
      <span className="text-neutral-400">{icon}</span>
      <div>
        <p className="text-xs font-medium text-neutral-700">{label}</p>
        <p className="text-[11px] text-neutral-400">{value}</p>
      </div>
    </div>
  );
}

function ExpertProfile({ expert }: { expert: Expert }) {
  const navigate = useNavigate();
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => navigate("/directory")}
          className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
        >
          <ArrowLeft size={15} /> All SMEs
        </button>
        <AvailabilityBadge a={expert.availability} />
      </div>

      <div className="flex items-center gap-4">
        <Avatar expert={expert} size={56} />
        <div>
          <p className="text-xl font-bold text-neutral-900">{expert.name}</p>
          <p className="text-sm text-neutral-500">{expert.role}</p>
          <p className="mt-1 flex items-center gap-3 text-xs text-neutral-400">
            <span className="flex items-center gap-1">
              <MapPin size={12} /> {expert.location}
            </span>
            <span className="flex items-center gap-1">
              <Clock3 size={12} /> {expert.timezone}
            </span>
            <span className="flex items-center gap-1">
              <Clock3 size={12} /> {expert.experience}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className={`flex items-center gap-1 text-xs font-medium ${teamColor(expert.team)}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {expert.team}
        </span>
        {expert.openToMentor && (
          <span className="flex items-center gap-1 text-xs font-medium text-magenta">
            <GraduationCap size={13} /> Open to mentor
          </span>
        )}
      </div>

      <p className="mt-4 rounded-md bg-muted p-4 text-sm leading-relaxed text-neutral-700">
        {expert.description}
      </p>

      {/* Contact */}
      <p className="mb-2 mt-6 flex items-center gap-1 text-sm font-semibold text-neutral-800">
        <MessageCircle size={15} className="text-magenta" /> Contact
      </p>
      <div className="grid grid-cols-1 gap-2">
        <ContactRow icon={<Mail size={15} />} label="Send Email" value={expert.email} />
        <ContactRow icon={<MessageCircle size={15} />} label="Message on Slack" value={expert.slack} />
        <ContactRow icon={<Calendar size={15} />} label="Schedule a Meeting" value={`${expert.timezone} timezone`} />
        <ContactRow icon={<Github size={15} />} label="View GitHub" value={expert.github} />
      </div>

      {/* Skills */}
      <p className="mb-2 mt-6 flex items-center gap-1 text-sm font-semibold text-neutral-800">
        <SlidersHorizontal size={15} className="text-magenta" /> Skills & Tech
      </p>
      <div className="flex flex-wrap gap-2">
        {expert.skills.map((s) => (
          <span key={s} className="rounded bg-muted px-2 py-1 text-xs text-neutral-600">
            {s}
          </span>
        ))}
      </div>

      {/* Languages */}
      <p className="mb-2 mt-6 flex items-center gap-1 text-sm font-semibold text-neutral-800">
        <Globe size={15} className="text-magenta" /> Languages
      </p>
      <div className="flex flex-wrap gap-2">
        {expert.languages.map((l) => (
          <span key={l} className="rounded bg-magenta-tint px-2 py-1 text-xs font-medium text-magenta">
            {l}
          </span>
        ))}
      </div>

      {/* Projects */}
      <p className="mb-2 mt-6 flex items-center gap-1 text-sm font-semibold text-neutral-800">
        <Clock3 size={15} className="text-magenta" /> Active Projects
      </p>
      <div className="flex flex-col gap-2">
        {expert.projects.map((p) => (
          <div key={p} className="rounded-md border border-border px-3 py-2 text-xs text-neutral-700">
            {p}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border p-4">
          <p className="text-2xl font-bold text-magenta">{expert.kbArticles}</p>
          <p className="text-xs text-neutral-500">KB Articles</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-2xl font-bold text-blue-600">{expert.consultations}</p>
          <p className="text-xs text-neutral-500">Consultations / mo</p>
        </div>
      </div>
    </div>
  );
}

export default function SweDirectory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const selected = id ? EXPERTS.find((e) => e.id === id) : undefined;

  return (
    <main className="flex h-full flex-1 flex-col overflow-hidden">
      <DirectoryHeader />

      {selected ? (
        // Master-detail (swe-directory-details)
        <div className="flex flex-1 overflow-hidden">
          <div className="w-80 shrink-0 overflow-y-auto border-r border-border p-3">
            {EXPERTS.map((e) => (
              <button
                key={e.id}
                onClick={() => navigate(`/directory/${e.id}`)}
                className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                  e.id === selected.id ? "bg-magenta-tint" : "hover:bg-muted"
                }`}
              >
                <Avatar expert={e} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-900">
                    {e.name}
                  </span>
                  <span className="block truncate text-xs text-neutral-400">
                    {e.role}
                  </span>
                </span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${availabilityDot(e.availability)}`} />
              </button>
            ))}
          </div>
          <ExpertProfile expert={selected} />
        </div>
      ) : (
        // Grid (swe-directory)
        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {EXPERTS.map((e) => (
              <ExpertCard key={e.id} expert={e} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
