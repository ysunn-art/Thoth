import { useEffect, useState } from "react";
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
import { api, type SME, type KnowledgeEntry } from "../api/client";

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
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>{icon}</div>
      <div>
        <p className="text-xl font-bold text-neutral-900">{value}</p>
        <p className="text-xs text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900">
          <span className="text-magenta">{icon}</span>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

export default function AdminHome() {
  const [smes, setSmes] = useState<SME[]>([]);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  const refresh = async () => {
    try {
      const [sRes, kRes] = await Promise.all([api.listSmes(), api.listKnowledge()]);
      setSmes(sRes.smes);
      setEntries(kRes.entries);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const pendingEntries = entries.filter((e) => e.status === "sme_approved");
  const approvedEntries = entries.filter((e) => e.status === "approved");
  const draftEntries = entries.filter((e) => e.status === "draft");
  const rejectedEntries = entries.filter((e) => e.status === "rejected");

  async function handleApprove(entryId: string) {
    try {
      await api.adminApproveEntry(entryId);
      setActionMsg("Entry approved.");
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleReject(entryId: string) {
    try {
      await api.rejectEntry(entryId);
      setActionMsg("Entry rejected.");
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto bg-[#fafafa] p-8">
        <p className="text-neutral-400">Loading admin dashboard...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-[#fafafa] p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Admin Dashboard</h1>
        <p className="text-sm text-neutral-500">System overview and administrative controls</p>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}
      {actionMsg && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{actionMsg}</div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Users size={20} className="text-blue-600" />} iconBg="bg-blue-50" value={smes.length} label="Total SMEs" />
        <StatCard icon={<CheckCircle2 size={20} className="text-green-600" />} iconBg="bg-green-50" value={approvedEntries.length} label="Approved Entries" />
        <StatCard icon={<Clock size={20} className="text-yellow-600" />} iconBg="bg-yellow-50" value={pendingEntries.length + draftEntries.length} label="Pending Review" />
        <StatCard icon={<AlertTriangle size={20} className="text-red-600" />} iconBg="bg-red-50" value={rejectedEntries.length} label="Rejected" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Pending Admin Review" icon={<Shield size={18} />}>
          {pendingEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-400">No entries waiting for admin review.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingEntries.slice(0, 5).map((e) => {
                const sme = smes.find((s) => s.sme_id === e.sme_id);
                return (
                  <div key={e.entry_id} className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">{e.topic}</p>
                        <p className="text-xs text-neutral-500">By {sme?.name ?? e.sme_id}</p>
                      </div>
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">SME Approved</span>
                    </div>
                    <div className="mt-3 flex gap-3">
                      <button onClick={() => handleApprove(e.entry_id)} className="flex flex-1 items-center justify-center gap-1 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700">
                        <CheckCircle2 size={15} /> Approve
                      </button>
                      <button onClick={() => handleReject(e.entry_id)} className="flex flex-1 items-center justify-center gap-1 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700">
                        <AlertTriangle size={15} /> Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Escalated Questions" icon={<AlertTriangle size={18} />}>
          <div className="flex h-40 flex-col items-center justify-center text-neutral-400">
            <MessageSquare size={28} className="mb-2 opacity-40" />
            <p className="text-sm">No escalated questions</p>
            <p className="text-xs text-neutral-400">Questions are routed via the /query endpoint.</p>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Knowledge Maintenance" icon={<RefreshCw size={18} />}>
          {approvedEntries.length === 0 ? (
            <p className="text-sm text-neutral-400">No approved entries yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {approvedEntries.map((e) => {
                const sme = smes.find((s) => s.sme_id === e.sme_id);
                return (
                  <div key={e.entry_id} className="flex items-center justify-between rounded-md border border-border px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{e.topic}</p>
                      <p className="text-xs text-neutral-400">By {sme?.name ?? e.sme_id} · Updated {new Date(e.updated_at).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => handleReject(e.entry_id)} className="rounded-md border border-border px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                      Reject
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Subject Matter Experts" icon={<Users size={18} />}>
          <div className="flex flex-col gap-4">
            {smes.map((s) => (
              <div key={s.sme_id}>
                <p className="text-sm font-semibold text-neutral-900">{s.name}</p>
                <p className="text-xs text-neutral-400">{s.contact_email}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {s.sub_areas.map((a) => (
                    <span key={a} className="rounded bg-magenta-tint px-1.5 py-0.5 text-[11px] text-magenta">{a}</span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-neutral-400">
                  {entries.filter((e) => e.sme_id === s.sme_id).length} entries
                </p>
              </div>
            ))}
            {smes.length === 0 && <p className="text-sm text-neutral-400">No SMEs registered.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Knowledge Base Stats" icon={<BookOpen size={18} />}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3 text-sm text-neutral-700">
              <span>Total Entries</span>
              <span className="font-bold">{entries.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
              <span>Approved</span>
              <span className="font-bold">{approvedEntries.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
              <span>Pending Review</span>
              <span className="font-bold">{pendingEntries.length + draftEntries.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>Rejected</span>
              <span className="font-bold">{rejectedEntries.length}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Activity Overview" icon={<Activity size={18} />}>
          <div className="flex flex-col gap-2 text-sm text-neutral-500">
            <p>Approved entries are searchable from the Q&A interface.</p>
            <p>Use the <strong>Review & Approval</strong> page to manage entries by status.</p>
            <p>Create SMEs from the <strong>SME Onboarding</strong> page.</p>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
