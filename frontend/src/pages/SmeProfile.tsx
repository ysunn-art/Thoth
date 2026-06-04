import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Link,
  Mail,
  MessageSquare,
  Pencil,
  Save,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getUser, getToken, setToken, type SME, type KnowledgeEntry } from "../api/client";

const SUGGESTED_AREAS = [
  "5G SA",
  "RF Engineering",
  "Billing Systems",
  "CPNI",
  "VoLTE",
  "eSIM Provisioning",
];

export default function SmeProfile() {
  const { smeId } = useParams<{ smeId: string }>();
  const navigate = useNavigate();
  const [sme, setSme] = useState<SME | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [draftArea, setDraftArea] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [allSmes, setAllSmes] = useState<SME[]>([]);
  const [selectedSmeId, setSelectedSmeId] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    // Sync user info from backend first, THEN decide what to show
    api.getMe().then((fresh: any) => {
      const token = getToken();
      if (token) {
        setToken(token, {
          user_id: fresh.id ?? fresh.user_id,
          email: fresh.email ?? "",
          is_admin: fresh.is_admin ?? false,
          is_sme: fresh.is_sme ?? false,
          sme_id: fresh.sme_id ?? null,
        });
      }

      if (!smeId) {
        // No specific SME in URL — show own profile or empty state
        if (fresh.is_sme && fresh.sme_id) {
          navigate(`/profile/${fresh.sme_id}`, { replace: true });
        } else {
          setLoading(false);
        }
        return;
      }

      // Specific SME in URL — only the SME owner can see it
      if (!fresh.is_sme || fresh.sme_id !== smeId) {
        navigate("/profile", { replace: true });
        return;
      }

      loadSme(smeId);
    }).catch(() => {
      if (!smeId) {
        setLoading(false);
        return;
      }
      // Fallback: only allow if user claims ownership via localStorage
      const user = getUser();
      if (!user?.is_sme || user.sme_id !== smeId) {
        navigate("/profile", { replace: true });
        return;
      }
      loadSme(smeId);
    });
  }, [smeId, navigate]);

  function loadSme(id: string) {
    api
      .getSme(id)
      .then((s) => {
        setSme(s);
        setName(s.name);
        setEmail(s.contact_email);
        setAreas(s.sub_areas);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    api
      .listKnowledge()
      .then((res) => setEntries(res.entries))
      .catch(() => {});
  }

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

  async function saveProfile() {
    if (!smeId) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await api.updateSme(smeId, {
        name: name.trim(),
        specialization: areas[0] ?? sme?.specialization ?? "",
        sub_areas: areas,
        contact_email: email.trim(),
      });
      setSme(updated);
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function linkToSme() {
    if (!selectedSmeId) return;
    setLinking(true);
    setError("");
    try {
      await api.linkToSme(selectedSmeId);
      const token = getToken();
      if (token) {
        const user = getUser()!;
        setToken(token, { ...user, is_sme: true, sme_id: selectedSmeId });
      }
      navigate(`/profile/${selectedSmeId}`, { replace: true });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLinking(false);
    }
  }

  const entryCount = entries.filter((e) => e.sme_id === smeId).length;
  const liveCount = entries.filter((e) => e.sme_id === smeId && e.status === "approved").length;

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto bg-white p-8">
        <p className="text-neutral-400">Loading profile...</p>
      </main>
    );
  }

  if (!smeId) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-white p-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-magenta-tint">
          <UserPlus size={36} className="text-magenta" />
        </div>
        <h2 className="mt-6 text-xl font-semibold text-neutral-900">
          No SME Profile
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          You are not linked to any SME yet. Create one or link to an existing
          SME to manage your expert profile.
        </p>
        <button
          onClick={() => navigate("/onboarding")}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-magenta px-6 py-3 text-sm font-semibold text-white hover:bg-magenta/90"
        >
          <UserPlus size={16} />
          Create New SME
        </button>

        <div className="mt-8 border-t border-border pt-8 w-full max-w-md">
          <p className="text-sm font-medium text-neutral-700 mb-3 text-center">
            Or link to an existing SME:
          </p>
          <div className="flex gap-2">
            <select
              value={selectedSmeId}
              onChange={(e) => setSelectedSmeId(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-magenta"
              onClick={() => {
                if (allSmes.length === 0) {
                  api.listSmes().then((res) => setAllSmes(res.smes)).catch(() => {});
                }
              }}
            >
              <option value="">Select an SME...</option>
              {allSmes.map((s) => (
                <option key={s.sme_id} value={s.sme_id}>
                  {s.name} — {s.specialization}
                </option>
              ))}
            </select>
            <button
              onClick={linkToSme}
              disabled={!selectedSmeId || linking}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40"
            >
              <Link size={14} />
              {linking ? "Linking..." : "Link"}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-600 text-center">{error}</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-white p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Update your profile</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Keep your contact info and areas of expertise current.
        </p>
        {/* Navigate via the Directory page to switch SMEs */}
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Profile saved successfully.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-xl border border-border bg-white p-6">
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
              <p className="text-xs text-neutral-500">
                SME since {sme ? new Date(sme.created_at).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <label className="text-sm font-medium text-neutral-900">
              Full name <span className="text-magenta">*</span>
            </label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                <User size={16} />
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-neutral-50 py-2 pl-10 pr-3 text-sm text-neutral-900 outline-none transition-colors focus:border-magenta focus:bg-white"
              />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-neutral-900">
                Email <span className="text-magenta">*</span>
              </label>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <Mail size={16} />
                </span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-neutral-50 py-2 pl-10 pr-3 text-sm text-neutral-900 outline-none transition-colors focus:border-magenta focus:bg-white"
                />
              </div>
            </div>
          </div>

          <div className="mt-5">
            <label className="text-sm font-medium text-neutral-900">
              Areas of expertise <span className="text-magenta">*</span>
            </label>
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
            <p className="mt-1 text-xs text-neutral-500">
              Press Enter or comma to add. First area is the primary
              specialization.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <p className="text-xs text-neutral-500">Profile ID: {smeId}</p>
            <button
              onClick={saveProfile}
              disabled={saving || !name.trim() || !email.trim()}
              className="flex items-center gap-2 rounded-md bg-magenta px-4 py-2 text-sm font-semibold text-white hover:bg-magenta/90 disabled:bg-magenta/40"
            >
              <Save size={16} /> {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">Your contributions</h3>
            <div className="mt-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between rounded-lg bg-neutral-50/60 p-3">
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <MessageSquare size={16} className="text-magenta" />
                  Entries
                </div>
                <span className="text-lg font-bold text-neutral-900">{entryCount}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-neutral-50/60 p-3">
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <BookOpen size={16} className="text-magenta" />
                  Live entries
                </div>
                <span className="text-lg font-bold text-green-600">{liveCount}</span>
              </div>
            </div>
          </div>

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

          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">Suggested areas</h3>
            <p className="mt-1 text-xs text-neutral-500">Common T-Mobile domains. Click to add.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED_AREAS.filter((s) => !areas.includes(s)).map((s) => (
                <button
                  key={s}
                  onClick={() => addArea(s)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-magenta/40 px-2.5 py-0.5 text-xs font-medium text-magenta transition-colors hover:bg-magenta-tint"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
