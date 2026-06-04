import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  FileText,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Save,
  User,
  X,
} from "lucide-react";

const SUGGESTED_AREAS = [
  "5G SA",
  "RF Engineering",
  "Billing Systems",
  "CPNI",
  "VoLTE",
  "eSIM Provisioning",
];

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-sm font-medium text-neutral-900">
      {children}
      {required && <span className="text-magenta">*</span>}
    </label>
  );
}

function Input({
  icon,
  value,
  onChange,
  className = "",
}: {
  icon?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
          {icon}
        </span>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border border-border bg-neutral-50 py-2 text-sm text-neutral-900 outline-none transition-colors focus:border-magenta focus:bg-white ${
          icon ? "pl-10 pr-3" : "px-3"
        }`}
      />
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-neutral-50/60 p-3">
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <span className="text-magenta">{icon}</span>
        {label}
      </div>
      <span className={`text-lg font-bold text-neutral-900 ${valueClass ?? ""}`}>
        {value}
      </span>
    </div>
  );
}

export default function SmeProfile() {
  const [name, setName] = useState("Dr. Sarah Johnson");
  const [email, setEmail] = useState("sarah.johnson@t-mobile.com");
  const [phone, setPhone] = useState("555-0101");
  const [areas, setAreas] = useState<string[]>([
    "Network Security",
    "5G Infrastructure",
  ]);
  const [draftArea, setDraftArea] = useState("");

  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function addArea(a: string) {
    const v = a.trim();
    if (v && !areas.includes(v)) setAreas([...areas, v]);
  }

  function handleAreaKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addArea(draftArea);
      setDraftArea("");
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-white p-8">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Update your profile</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Keep your contact info and areas of expertise current — this is what
          end users see when their questions get routed to you.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Form */}
        <section className="rounded-xl border border-border bg-white p-6">
          {/* Avatar */}
          <div className="flex items-center gap-4 border-b border-border pb-5">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-magenta-tint text-lg font-semibold text-magenta">
                {initials}
              </div>
              <button
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white text-neutral-500 transition-colors hover:text-magenta"
                aria-label="Edit avatar"
              >
                <Pencil size={12} />
              </button>
            </div>
            <div>
              <p className="text-base font-semibold text-neutral-900">{name}</p>
              <p className="text-xs text-neutral-500">SME since May 2026</p>
            </div>
          </div>

          {/* Full name */}
          <div className="mt-5">
            <FieldLabel required>Full name</FieldLabel>
            <Input
              icon={<User size={16} />}
              value={name}
              onChange={setName}
              className="mt-1.5"
            />
          </div>

          {/* Email + Phone */}
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <FieldLabel required>Email</FieldLabel>
              <Input
                icon={<Mail size={16} />}
                value={email}
                onChange={setEmail}
                className="mt-1.5"
              />
            </div>
            <div>
              <FieldLabel>Phone</FieldLabel>
              <Input
                icon={<Phone size={16} />}
                value={phone}
                onChange={setPhone}
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-neutral-500">
                Optional — used by admin for urgent escalations
              </p>
            </div>
          </div>

          {/* Areas of expertise */}
          <div className="mt-5">
            <FieldLabel required>Areas of expertise</FieldLabel>
            <div className="mt-1.5 flex min-h-[44px] flex-wrap items-center gap-2 rounded-lg border border-border bg-neutral-50 p-2">
              {areas.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 rounded-full border border-magenta/30 bg-magenta-tint px-2.5 py-0.5 text-xs font-medium text-magenta"
                >
                  {a}
                  <button
                    onClick={() => setAreas(areas.filter((x) => x !== a))}
                    aria-label={`Remove ${a}`}
                    className="text-magenta/70 hover:text-magenta"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                value={draftArea}
                onChange={(e) => setDraftArea(e.target.value)}
                onKeyDown={handleAreaKey}
                placeholder="Add another…"
                className="min-w-32 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
              />
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
              <span>{areas.length} areas ·</span>
              <button
                onClick={() => setAreas([])}
                className="font-medium text-magenta hover:underline"
              >
                Clear all
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Press Enter or comma to add. These determine which questions get
              routed to you.
            </p>
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <p className="text-xs text-neutral-500">All changes saved</p>
            <div className="flex gap-2">
              <button className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-neutral-900 opacity-50">
                Discard
              </button>
              <button className="flex items-center gap-2 rounded-md bg-magenta px-4 py-2 text-sm font-semibold text-white opacity-60">
                <Save size={16} /> Save changes
              </button>
            </div>
          </div>
        </section>

        {/* Right sidebar */}
        <aside className="flex flex-col gap-4">
          {/* Your contributions */}
          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">
              Your contributions
            </h3>
            <div className="mt-3 flex flex-col gap-2.5">
              <StatRow
                icon={<MessageSquare size={16} />}
                label="Interviews"
                value="0"
              />
              <StatRow
                icon={<FileText size={16} />}
                label="Materials"
                value="0"
              />
              <StatRow
                icon={<BookOpen size={16} />}
                label="Live entries"
                value="3"
                valueClass="text-green-600"
              />
            </div>
          </div>

          {/* Why this matters */}
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 text-yellow-700" />
              <h3 className="text-sm font-semibold text-yellow-900">
                Why keeping this current matters
              </h3>
            </div>
            <ul className="mt-2 space-y-1.5 text-xs text-yellow-900/90">
              <li>· End users see your name attributed to approved entries.</li>
              <li>· New questions are routed by your expertise areas.</li>
              <li>· Admins use your contact info for urgent escalations.</li>
            </ul>
          </div>

          {/* Suggested areas */}
          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">
              Suggested areas
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              Common T-Mobile domains. Click to add.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED_AREAS.filter((s) => !areas.includes(s)).map((s) => (
                <button
                  key={s}
                  onClick={() => addArea(s)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-magenta/40 px-2.5 py-0.5 text-xs font-medium text-magenta transition-colors hover:bg-magenta-tint"
                >
                  <Plus size={10} /> {s}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
