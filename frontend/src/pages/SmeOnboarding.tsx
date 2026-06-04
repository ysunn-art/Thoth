import { useEffect, useState } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import { api, getUser, setToken, getToken, type SME } from "../api/client";

export default function SmeOnboarding() {
  const [smes, setSmes] = useState<SME[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [areas, setAreas] = useState("");

  useEffect(() => {
    api
      .listSmes()
      .then((res) => setSmes(res.smes))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const canRegister = name.trim() && email.trim() && areas.trim();

  async function register() {
    if (!canRegister) return;
    setSubmitting(true);
    setError("");
    const subAreas = areas
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const specialization = subAreas[0] ?? "";
    try {
      const sme = await api.createSme({
        name: name.trim(),
        contact_email: email.trim(),
        specialization,
        sub_areas: subAreas,
      });
      setSmes([sme, ...smes.filter((s) => s.sme_id !== sme.sme_id)]);
      setName("");
      setEmail("");
      setAreas("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function removeSme(smeId: string, smeName: string) {
    if (!confirm(`Delete SME "${smeName}" and all associated data? This cannot be undone.`)) return;
    setError("");
    try {
      await api.deleteSme(smeId);
      setSmes((prev) => prev.filter((s) => s.sme_id !== smeId));
      // If the deleted SME was the current user's linked SME, update localStorage
      const user = getUser();
      if (user && user.sme_id === smeId) {
        const token = getToken();
        if (token) setToken(token, { ...user, is_sme: false, sme_id: null });
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-white p-8">
      <header>
        <h1 className="text-2xl font-medium text-neutral-900">SME Onboarding</h1>
        <p className="mt-1 text-base text-neutral-500">
          Register as a Subject Matter Expert to share your knowledge with the
          organization
        </p>
      </header>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(420px,591px)_minmax(420px,631px)]">
        <section className="rounded-lg border border-border bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-magenta-tint text-magenta">
              <UserPlus size={24} />
            </div>
            <h2 className="text-xl font-medium text-neutral-900">
              Register New SME
            </h2>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-base font-medium text-neutral-900">
                Full Name *
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Sarah Johnson"
                className="mt-2 h-10 w-full rounded-lg border border-border bg-neutral-50 px-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-magenta focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-base font-medium text-neutral-900">
                Email Address *
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah.johnson@t-mobile.com"
                className="mt-2 h-10 w-full rounded-lg border border-border bg-neutral-50 px-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-magenta focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-base font-medium text-neutral-900">
                Areas of Expertise *
              </span>
              <input
                value={areas}
                onChange={(e) => setAreas(e.target.value)}
                placeholder="Network Security, 5G Infrastructure, Cloud Computing"
                className="mt-2 h-10 w-full rounded-lg border border-border bg-neutral-50 px-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-magenta focus:bg-white"
              />
              <p className="mt-1 text-sm text-neutral-500">
                Separate multiple areas with commas. The first area becomes the
                primary specialization.
              </p>
            </label>

            <button
              onClick={register}
              disabled={!canRegister || submitting}
              className="h-12 w-full rounded-lg bg-magenta px-4 text-base font-medium text-white transition-colors hover:bg-magenta/90 disabled:cursor-not-allowed disabled:bg-magenta/40"
            >
              {submitting ? "Registering..." : "Register as SME"}
            </button>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-border bg-white p-6">
            <h2 className="text-lg font-medium text-neutral-900">
              Current SMEs ({smes.length})
            </h2>
            <div className="mt-4 flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
              {loading ? (
                <p className="text-sm text-neutral-400">Loading...</p>
              ) : smes.length === 0 ? (
                <p className="text-sm text-neutral-400">No SMEs registered yet.</p>
              ) : (
                smes.map((sme) => (
                  <div
                    key={sme.sme_id}
                    className="relative rounded-lg border border-border bg-white p-4"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSme(sme.sme_id, sme.name);
                      }}
                      className="absolute right-3 top-3 rounded p-1 text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="Delete SME"
                    >
                      <Trash2 size={14} />
                    </button>
                    <h3 className="text-base font-medium text-neutral-900">
                      {sme.name}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      {sme.contact_email}
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">
                      {sme.specialization}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sme.sub_areas.map((a) => (
                        <span
                          key={a}
                          className="rounded bg-magenta-tint px-2 py-1 text-xs text-magenta"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border border-blue-200 bg-blue-50 p-6">
            <h2 className="text-lg font-medium text-blue-900">
              What happens next?
            </h2>
            <ol className="mt-3 space-y-2 text-sm text-blue-800">
              <li>1. Complete this registration form with your details</li>
              <li>2. Participate in expert interviews to share your knowledge</li>
              <li>3. Upload supporting materials and documents</li>
              <li>
                4. Review and approve AI-synthesized knowledge entries
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}
