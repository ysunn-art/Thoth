import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Link, Upload, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, getUser, getToken, setToken, type SME, type MaterialSummary } from "../api/client";

const ACCEPT = ".pdf,.txt,.md,text/markdown,text/plain,application/pdf";
const MAX_BYTES = 10 * 1024 * 1024;

function fileTypeFromName(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "txt") return "text/plain";
  if (ext === "md" || ext === "markdown") return "text/markdown";
  return null;
}

export default function UploadMaterials() {
  const navigate = useNavigate();
  const [smeId, setSmeId] = useState("");
  const [smeName, setSmeName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [noSme, setNoSme] = useState(false);
  const [allSmes, setAllSmes] = useState<SME[]>([]);
  const [selectedSmeId, setSelectedSmeId] = useState("");
  const [linking, setLinking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-detect SME from current user
  useEffect(() => {
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
      if (fresh.is_sme && fresh.sme_id) {
        setSmeId(fresh.sme_id);
        api.getSme(fresh.sme_id).then((s) => setSmeName(s.name)).catch(() => {});
        setNoSme(false);
      } else {
        setNoSme(true);
      }
      setLoading(false);
    }).catch(() => {
      const user = getUser();
      if (user?.is_sme && user?.sme_id) {
        setSmeId(user.sme_id);
        setNoSme(false);
        setLoading(false);
      } else {
        setNoSme(true);
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!smeId) return;
    setError("");
    api
      .listMaterials(smeId)
      .then((res) => setMaterials(res.materials))
      .catch((e) => setError(e.message));
  }, [smeId]);

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
      setSmeId(selectedSmeId);
      setNoSme(false);
      const sme = allSmes.find((s) => s.sme_id === selectedSmeId);
      setSmeName(sme?.name ?? "");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLinking(false);
    }
  }

  async function ingest(files: FileList | File[]) {
    let count = 0;
    setUploading(true);
    setError("");
    setSuccess("");
    for (const f of Array.from(files)) {
      const ft = fileTypeFromName(f.name);
      if (!ft) {
        setError(`Unsupported file type: ${f.name}. Accepted: PDF, TXT, MD`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`File too large: ${f.name} (max 10 MB)`);
        continue;
      }
      try {
        await api.uploadMaterial(
          smeId,
          f,
          title.trim() || f.name,
          description.trim() || undefined,
        );
        count++;
      } catch (e: any) {
        setError(e.message);
      }
    }
    if (count > 0) {
      setSuccess(`Uploaded ${count} file${count > 1 ? "s" : ""}`);
      setTitle("");
      setDescription("");
      const res = await api.listMaterials(smeId);
      setMaterials(res.materials);
    }
    setUploading(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) ingest(e.dataTransfer.files);
  }

  return (
    <main className="flex-1 overflow-y-auto bg-white p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-medium text-neutral-900">
          Material Ingestion
        </h1>
        <p className="mt-1 text-base text-neutral-500">
          Upload PDF, TXT, or Markdown files (max 10 MB each) to enrich the
          knowledge base.
        </p>
      </header>

      {noSme ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-magenta-tint">
            <UserPlus size={36} className="text-magenta" />
          </div>
          <h2 className="mt-6 text-xl font-semibold text-neutral-900">
            No SME Profile
          </h2>
          <p className="mt-2 max-w-md text-center text-sm text-neutral-500">
            You must be linked to an SME before uploading materials. Create one
            or link to an existing SME.
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
          </div>
        </div>
      ) : (
        <>
          {(error || success) && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {error || success}
        </div>
      )}

      <section className="rounded-lg border border-border bg-white p-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-neutral-900">
              SME *
            </label>
            <p className="mt-2 text-sm font-medium text-magenta">
              {smeName || smeId}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-900">
              Title (optional)
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Defaults to file name"
              className="mt-2 w-full rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-magenta focus:bg-white"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-900">
              Description (optional)
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief context for reviewers"
              className="mt-2 w-full rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-magenta focus:bg-white"
            />
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
            isDragging
              ? "border-magenta bg-magenta-tint/40"
              : "border-border hover:border-magenta/60 hover:bg-magenta-tint/20"
          }`}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-magenta-tint">
            <Upload size={28} className="text-magenta" />
          </div>
          <p className="mt-3 text-base font-medium text-neutral-900">
            Drag &amp; drop files, or click to browse
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Accepted: <span className="font-medium">PDF · TXT · Markdown</span>{" "}
            · Max <span className="font-medium">10 MB</span> per file
          </p>
          {uploading && (
            <p className="mt-2 text-sm text-magenta">Uploading...</p>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => e.target.files && ingest(e.target.files)}
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-medium text-neutral-900">
          Uploads ({materials.length})
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {materials.map((m) => (
            <div
              key={m.material_id}
              className="rounded-lg border border-green-300 bg-white p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-50">
                  <FileText size={20} className="text-red-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-neutral-900">
                    {m.title}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-800">
                      {m.file_type}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-medium ${
                        m.status === "processed"
                          ? "bg-green-100 text-green-800"
                          : m.status === "failed"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {m.status === "processed" ? (
                        <>
                          <CheckCircle2
                            size={10}
                            className="mr-1 inline"
                          />
                          Processed
                        </>
                      ) : m.status === "failed" ? (
                        "Failed"
                      ) : (
                        "Processing"
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    {m.material_id}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {!loading && materials.length === 0 && (
            <p className="text-sm text-neutral-400">
              No materials uploaded for this SME yet.
            </p>
          )}
        </div>
      </section>
        </>
      )}
    </main>
  );
}
