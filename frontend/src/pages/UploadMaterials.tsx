import { useRef, useState } from "react";
import { CheckCircle2, FileText, Upload, X } from "lucide-react";

type Visibility = "internal" | "citable";

interface MaterialItem {
  id: string;
  title: string;
  description: string;
  fileType: "PDF" | "TXT" | "MD";
  sizeKB: number;
  sme: string;
  visibility: Visibility;
}

const SMES = [
  "Dr. Sarah Johnson",
  "Michael Chen",
  "Priya Raman",
];

const INITIAL: MaterialItem[] = [
  {
    id: "m1",
    title: "techin513",
    description: "",
    fileType: "PDF",
    sizeKB: 664.2,
    sme: "Dr. Sarah Johnson",
    visibility: "citable",
  },
  {
    id: "m2",
    title: "HW1 (2)",
    description: "",
    fileType: "PDF",
    sizeKB: 2260,
    sme: "Dr. Sarah Johnson",
    visibility: "internal",
  },
];

const ACCEPT = ".pdf,.txt,.md,text/markdown,text/plain,application/pdf";
const MAX_BYTES = 10 * 1024 * 1024;

function fmtSize(kb: number) {
  if (kb >= 1024) return `${(kb / 1024).toFixed(2)} MB`;
  return `${kb.toFixed(1)} KB`;
}

function fileTypeFromName(name: string): MaterialItem["fileType"] | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "PDF";
  if (ext === "txt") return "TXT";
  if (ext === "md" || ext === "markdown") return "MD";
  return null;
}

export default function UploadMaterials() {
  const [sme, setSme] = useState(SMES[0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("citable");
  const [items, setItems] = useState<MaterialItem[]>(INITIAL);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function ingest(files: FileList | File[]) {
    const next: MaterialItem[] = [];
    for (const f of Array.from(files)) {
      const ft = fileTypeFromName(f.name);
      if (!ft) continue;
      if (f.size > MAX_BYTES) continue;
      next.push({
        id: `m_${Math.random().toString(36).slice(2, 8)}`,
        title: title.trim() || f.name,
        description: description.trim(),
        fileType: ft,
        sizeKB: f.size / 1024,
        sme,
        visibility,
      });
    }
    if (next.length) {
      setItems([...next, ...items]);
      setTitle("");
      setDescription("");
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) ingest(e.dataTransfer.files);
  }

  function removeItem(id: string) {
    setItems(items.filter((i) => i.id !== id));
  }

  return (
    <main className="flex-1 overflow-y-auto bg-white p-8">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-medium text-neutral-900">Material Ingestion</h1>
        <p className="mt-1 text-base text-neutral-500">
          Upload PDF, TXT, or Markdown files (max 10 MB each) to enrich the
          knowledge base.
        </p>
      </header>

      {/* Form */}
      <section className="rounded-lg border border-border bg-white p-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-sm font-medium text-neutral-900">
              SME <span className="text-magenta">*</span>
            </label>
            <select
              value={sme}
              onChange={(e) => setSme(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-magenta focus:bg-white"
            >
              {SMES.map((s) => (
                <option key={s} value={s}>
                  {s}
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

          <div>
            <label className="text-sm font-medium text-neutral-900">
              Visibility <span className="text-magenta">*</span>
              <span className="ml-1 text-xs font-normal text-neutral-500">
                (who can see this as a cited source)
              </span>
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => setVisibility("internal")}
                className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                  visibility === "internal"
                    ? "border-yellow-400 bg-yellow-50 text-yellow-900"
                    : "border-border bg-neutral-50 text-neutral-500 hover:border-yellow-300"
                }`}
              >
                Internal only
                <p className="mt-0.5 text-[10px] font-medium opacity-80">
                  Used by SMEs &amp; synthesis; never cited to end users.
                </p>
              </button>
              <button
                onClick={() => setVisibility("citable")}
                className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                  visibility === "citable"
                    ? "border-green-500 bg-green-50 text-green-900"
                    : "border-border bg-neutral-50 text-neutral-500 hover:border-green-400"
                }`}
              >
                Citable to users
                <p className="mt-0.5 text-[10px] font-medium opacity-80">
                  May be shown as a source in Ask Thoth answers.
                </p>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Drop zone */}
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

      {/* Uploads list */}
      <section className="mt-6">
        <h2 className="text-lg font-medium text-neutral-900">
          Uploads ({items.length})
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((m) => (
            <UploadCard key={m.id} item={m} onRemove={() => removeItem(m.id)} />
          ))}
        </div>
      </section>
    </main>
  );
}

function UploadCard({
  item,
  onRemove,
}: {
  item: MaterialItem;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-green-300 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-50">
          <FileText size={20} className="text-red-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-base font-medium text-neutral-900">
              {item.title}
            </p>
            <button
              onClick={onRemove}
              aria-label="Remove upload"
              className="flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:bg-muted hover:text-neutral-700"
            >
              <X size={14} />
            </button>
          </div>
          <p className="mt-0.5 truncate text-xs italic text-neutral-400">
            {item.description || "No description"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
            <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-800">
              {item.fileType}
            </span>
            <span className="text-neutral-500">{fmtSize(item.sizeKB)}</span>
            <span className="text-neutral-500">· {item.sme}</span>
            {item.visibility === "citable" ? (
              <span className="rounded bg-green-100 px-1.5 py-0.5 font-medium text-green-800">
                Citable
              </span>
            ) : (
              <span className="rounded bg-yellow-100 px-1.5 py-0.5 font-medium text-yellow-800">
                Internal
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800">
              <CheckCircle2 size={10} /> Processed
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-green-700">
            <CheckCircle2 size={12} />
            Ready to cite in knowledge entries
          </div>
        </div>
      </div>
    </div>
  );
}
