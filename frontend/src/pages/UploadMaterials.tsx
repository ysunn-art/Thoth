import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import { api, type SME, type MaterialSummary } from "../api/client";

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
  const [smes, setSmes] = useState<SME[]>([]);
  const [smeId, setSmeId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .listSmes()
      .then((res) => {
        setSmes(res.smes);
        if (res.smes.length > 0) setSmeId(res.smes[0].sme_id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!smeId) return;
    setError("");
    api
      .listMaterials(smeId)
      .then((res) => setMaterials(res.materials))
      .catch((e) => setError(e.message));
  }, [smeId]);

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
            <select
              value={smeId}
              onChange={(e) => setSmeId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-magenta focus:bg-white"
              disabled={loading}
            >
              {smes.map((s) => (
                <option key={s.sme_id} value={s.sme_id}>
                  {s.name}
                </option>
              ))}
            </select>
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
    </main>
  );
}
