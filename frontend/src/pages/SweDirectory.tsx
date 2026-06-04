import { useEffect, useState } from "react";
import { MapPin, MessageCircle, Search } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type SME } from "../api/client";

const FALLBACK_TEAMS = [
  "5G Network Architecture",
  "Network Security",
  "Customer Care Operations",
  "Billing & Revenue Assurance",
  "Device Certification",
  "Cybersecurity & Fraud",
  "Retail Operations",
  "IoT & Connected Devices",
];

const TEAM_COLORS: Record<string, string> = {
  "5G Network Architecture": "text-blue-600",
  "Network Security": "text-blue-600",
  "Customer Care Operations": "text-purple-600",
  "Billing & Revenue Assurance": "text-orange-600",
  "Device Certification": "text-blue-600",
  "Cybersecurity & Fraud": "text-red-600",
  "Retail Operations": "text-orange-600",
  "IoT & Connected Devices": "text-amber-600",
};

function teamColor(team: string): string {
  return TEAM_COLORS[team] ?? "text-neutral-600";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

function Avatar({ sme, size = 40 }: { sme: SME; size?: number }) {
  const colors = [
    "bg-blue-500",
    "bg-teal-600",
    "bg-orange-500",
    "bg-purple-500",
    "bg-green-700",
    "bg-orange-600",
    "bg-pink-500",
    "bg-magenta",
    "bg-green-600",
    "bg-purple-600",
    "bg-purple-500",
    "bg-orange-500",
  ];
  const idx = sme.sme_id.length % colors.length;
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${colors[idx]} font-semibold text-white`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials(sme.name)}
    </span>
  );
}

export default function SweDirectory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [smes, setSmes] = useState<SME[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    api
      .listSmes()
      .then((res) => setSmes(res.smes))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const teams = [
    ...new Set(
      smes.map((s) => s.specialization).filter(Boolean),
    ),
  ];
  const displayTeams = teams.length > 0 ? teams : FALLBACK_TEAMS;

  let filtered = smes;
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.specialization.toLowerCase().includes(q) ||
        s.sub_areas.some((a) => a.toLowerCase().includes(q)),
    );
  }
  if (filter) {
    filtered = filtered.filter((s) => s.specialization === filter);
  }

  const selected = id ? smes.find((s) => s.sme_id === id) : undefined;

  return (
    <main className="flex h-full flex-1 flex-col overflow-hidden">
      <div className="border-b border-border bg-white px-8 pb-3 pt-6">
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
          <Search size={16} className="text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SME name, specialization, or expertise areas..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          <button
            onClick={() => setFilter(null)}
            className={`text-xs font-medium ${!filter ? "text-magenta" : "text-neutral-500"}`}
          >
            All ({smes.length})
          </button>
          {displayTeams.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(filter === t ? null : t)}
              className={`flex items-center gap-1 text-xs font-medium ${
                filter === t ? "text-magenta" : teamColor(t)
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {t}
            </button>
          ))}
          <span className="ml-auto text-xs text-neutral-400">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {selected ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-80 shrink-0 overflow-y-auto border-r border-border p-3">
            {smes.map((s) => (
              <button
                key={s.sme_id}
                onClick={() => navigate(`/directory/${s.sme_id}`)}
                className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                  s.sme_id === selected.sme_id
                    ? "bg-magenta-tint"
                    : "hover:bg-muted"
                }`}
              >
                <Avatar sme={s} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-900">
                    {s.name}
                  </span>
                  <span className="block truncate text-xs text-neutral-400">
                    {s.specialization}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <button
              onClick={() => navigate("/directory")}
              className="mb-4 text-sm text-neutral-500 hover:text-neutral-800"
            >
              ← All SMEs
            </button>
            <div className="flex items-center gap-4">
              <Avatar sme={selected} size={56} />
              <div>
                <p className="text-xl font-bold text-neutral-900">
                  {selected.name}
                </p>
                <p className="text-sm text-neutral-500">
                  {selected.specialization}
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                  <MapPin size={12} /> {selected.contact_email}
                </p>
              </div>
            </div>
            <p className="mt-4 rounded-md bg-muted p-4 text-sm text-neutral-700">
              Specializes in {selected.specialization} with expertise in{" "}
              {selected.sub_areas.join(", ")}.
            </p>
            <p className="mb-2 mt-6 flex items-center gap-1 text-sm font-semibold text-neutral-800">
              <MessageCircle size={15} className="text-magenta" /> Contact
            </p>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs font-medium text-neutral-700">Email</p>
              <p className="text-[11px] text-neutral-400">
                {selected.contact_email}
              </p>
            </div>
            <p className="mb-2 mt-6 text-sm font-semibold text-neutral-800">
              Areas of Expertise
            </p>
            <div className="flex flex-wrap gap-2">
              {selected.sub_areas.map((a) => (
                <span
                  key={a}
                  className="rounded bg-muted px-2 py-1 text-xs text-neutral-600"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <p className="text-neutral-400">Loading experts...</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
              <Search size={48} className="mb-3 opacity-40" />
              <p className="text-sm">No SMEs match your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((sme) => (
                <button
                  key={sme.sme_id}
                  onClick={() => navigate(`/directory/${sme.sme_id}`)}
                  className="flex flex-col rounded-lg border border-border p-4 text-left transition-colors hover:border-magenta hover:shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <Avatar sme={sme} />
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">
                        {sme.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {sme.specialization}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-neutral-500">
                    {sme.contact_email}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {sme.sub_areas.map((a) => (
                      <span
                        key={a}
                        className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-neutral-600"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
