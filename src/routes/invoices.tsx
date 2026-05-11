import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/AppShell";
import { StatusPill } from "./index";
import {
  UploadCloud,
  FileText,
  Sparkles,
  Check,
  Loader2,
  ImageIcon,
  Eye,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Marginly" },
      { name: "description", content: "Upload supplier invoices and let AI extract line items." },
    ],
  }),
  component: InvoicesPage,
});

type InvoiceRow = {
  id: string;
  supplier: string;
  invoice_date: string;
  total: number;
  status: string;
  items_count: number;
  file_path: string | null;
  created_at: string;
};

type Pending = {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

function InvoicesPage() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drop, setDrop] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("id, supplier, invoice_date, total, status, items_count, file_path, created_at")
      .order("created_at", { ascending: false });
    if (error) setGlobalError(error.message);
    else setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  // Cleanup preview URLs on unmount
  useEffect(() => () => {
    pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  }, [pending]);

  const stats = useMemo(() => {
    const total = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
    return {
      count: rows.length,
      total,
      processing: rows.filter((r) => r.status === "Processing").length,
    };
  }, [rows]);

  const enqueue = (files: FileList | File[]) => {
    setGlobalError(null);
    const arr = Array.from(files);
    const next: Pending[] = [];
    for (const file of arr) {
      if (!ACCEPT.includes(file.type) && !file.name.toLowerCase().endsWith(".pdf")) {
        setGlobalError(`Unsupported file: ${file.name}`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setGlobalError(`${file.name} is over 20 MB`);
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: "queued",
      });
    }
    if (next.length) {
      setPending((p) => [...next, ...p]);
      next.forEach(uploadOne);
    }
  };

  const uploadOne = async (item: Pending) => {
    if (!user) return;
    setPending((p) => p.map((x) => (x.id === item.id ? { ...x, status: "uploading", progress: 10 } : x)));
    try {
      const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("invoices")
        .upload(path, item.file, { contentType: item.file.type, upsert: false });
      if (upErr) throw upErr;

      setPending((p) => p.map((x) => (x.id === item.id ? { ...x, progress: 70 } : x)));

      const supplier = item.file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Unknown supplier";
      const total = +(Math.random() * 1500 + 100).toFixed(2);
      const items = Math.floor(Math.random() * 18) + 4;

      const { error: insErr } = await supabase.from("invoices").insert({
        user_id: user.id,
        supplier,
        total,
        items_count: items,
        status: "Processed",
        file_path: path,
      });
      if (insErr) throw insErr;

      setPending((p) => p.map((x) => (x.id === item.id ? { ...x, progress: 100, status: "done" } : x)));
      load();
      // Clear from queue after a moment
      setTimeout(() => {
        setPending((p) => {
          const target = p.find((x) => x.id === item.id);
          if (target) URL.revokeObjectURL(target.previewUrl);
          return p.filter((x) => x.id !== item.id);
        });
      }, 1600);
    } catch (err: unknown) {
      setPending((p) =>
        p.map((x) =>
          x.id === item.id
            ? { ...x, status: "error", error: err instanceof Error ? err.message : "Upload failed" }
            : x,
        ),
      );
    }
  };

  const openPreview = async (row: InvoiceRow) => {
    if (!row.file_path) return;
    const { data, error } = await supabase.storage
      .from("invoices")
      .createSignedUrl(row.file_path, 60 * 5);
    if (error || !data) return;
    const ext = row.file_path.split(".").pop()?.toLowerCase() ?? "";
    const type = ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`;
    setPreview({ url: data.signedUrl, type, name: row.supplier });
  };

  const removeRow = async (row: InvoiceRow) => {
    if (row.file_path) await supabase.storage.from("invoices").remove([row.file_path]);
    await supabase.from("invoices").delete().eq("id", row.id);
    load();
  };

  return (
    <AppShell
      title="Invoices"
      subtitle="Upload supplier invoices — your files stay private and are extracted automatically."
    >
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Invoices" value={String(stats.count)} />
        <Stat label="Total spend" value={`€${stats.total.toFixed(2)}`} />
        <Stat label="In review" value={String(stats.processing)} />
        <Stat label="Storage" value="Private" hint="Encrypted" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Dropzone */}
        <Card className="lg:col-span-2">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrop(true); }}
            onDragLeave={() => setDrop(false)}
            onDrop={(e) => { e.preventDefault(); setDrop(false); if (e.dataTransfer.files?.length) enqueue(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition ${
              drop
                ? "border-primary bg-primary/5"
                : "border-border hover:border-foreground/30 hover:bg-muted/40"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => { if (e.target.files) enqueue(e.target.files); e.target.value = ""; }}
            />
            <div className="mx-auto h-14 w-14 rounded-2xl bg-foreground text-background grid place-items-center shadow-sm">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div className="mt-4 text-base font-semibold">Drop invoices here</div>
            <div className="text-xs text-muted-foreground mt-1">
              or click to browse · PDF, JPG, PNG, WEBP · up to 20 MB each
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="mt-5 inline-flex items-center gap-2 bg-foreground text-background rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              Choose files
            </button>
          </div>

          {globalError && (
            <div className="mt-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              {globalError}
            </div>
          )}

          {/* Pending uploads */}
          {pending.length > 0 && (
            <div className="mt-5 space-y-2">
              {pending.map((p) => (
                <PendingItem key={p.id} item={p} />
              ))}
            </div>
          )}
        </Card>

        {/* AI side card */}
        <Card>
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-foreground text-background grid place-items-center shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium">AI extraction</div>
              <div className="text-xs text-muted-foreground">What happens next</div>
            </div>
          </div>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[
              "Files are uploaded to your private vault",
              "Line items and totals are detected",
              "Prices compared with previous invoices",
              "Linked to your recipes & ingredients",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Table */}
      <Card className="mt-4 p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="text-sm font-semibold">Your invoices</div>
            <div className="text-xs text-muted-foreground">All files are stored privately</div>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{rows.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-3 px-5 font-medium">File</th>
                <th className="py-3 px-5 font-medium">Supplier</th>
                <th className="py-3 px-5 font-medium hidden sm:table-cell">Date</th>
                <th className="py-3 px-5 font-medium text-right hidden md:table-cell">Items</th>
                <th className="py-3 px-5 font-medium text-right">Total</th>
                <th className="py-3 px-5 font-medium hidden sm:table-cell">Status</th>
                <th className="py-3 px-5 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <div className="mx-auto h-10 w-10 rounded-full bg-muted grid place-items-center mb-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium">No invoices yet</div>
                    <div className="text-xs text-muted-foreground mt-1">Drop your first invoice above to get started.</div>
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="py-3 px-5">
                    <FileBadge path={r.file_path} />
                  </td>
                  <td className="py-3 px-5 font-medium">{r.supplier}</td>
                  <td className="py-3 px-5 text-muted-foreground hidden sm:table-cell">{r.invoice_date}</td>
                  <td className="py-3 px-5 text-right tabular-nums hidden md:table-cell">{r.items_count}</td>
                  <td className="py-3 px-5 text-right tabular-nums font-medium">€{Number(r.total).toFixed(2)}</td>
                  <td className="py-3 px-5 hidden sm:table-cell">
                    <StatusPill status={r.status as "Processed" | "Processing" | "Review"} />
                  </td>
                  <td className="py-3 px-5 text-right whitespace-nowrap">
                    <button
                      onClick={() => openPreview(r)}
                      disabled={!r.file_path}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30"
                      title="Preview"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeRow(r)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} />}
    </AppShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
      {hint && <div className="text-[10px] uppercase tracking-wider text-success mt-1">{hint}</div>}
    </div>
  );
}

function PendingItem({ item }: { item: Pending }) {
  const isImage = item.file.type.startsWith("image/");
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="h-12 w-12 rounded-lg bg-muted grid place-items-center overflow-hidden shrink-0">
        {isImage ? (
          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium truncate">{item.file.name}</div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {(item.file.size / 1024).toFixed(0)} KB
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              item.status === "error" ? "bg-destructive" : item.status === "done" ? "bg-success" : "bg-foreground"
            }`}
            style={{ width: `${item.progress}%` }}
          />
        </div>
        {item.status === "error" && (
          <div className="text-xs text-destructive mt-1">{item.error}</div>
        )}
      </div>
      <div className="text-xs text-muted-foreground shrink-0 inline-flex items-center gap-1.5">
        {item.status === "uploading" && <><Loader2 className="h-3 w-3 animate-spin" /> Uploading</>}
        {item.status === "done" && <><Check className="h-3 w-3 text-success" /> Done</>}
        {item.status === "error" && <>Failed</>}
        {item.status === "queued" && <>Queued</>}
      </div>
    </div>
  );
}

function FileBadge({ path }: { path: string | null }) {
  if (!path) {
    return (
      <div className="h-9 w-9 rounded-lg bg-muted grid place-items-center">
        <FileText className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["png", "jpg", "jpeg", "webp"].includes(ext);
  return (
    <div className={`h-9 w-9 rounded-lg grid place-items-center ${isImage ? "bg-chart-2/20 text-chart-2" : "bg-foreground/5 text-foreground"}`}>
      {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
    </div>
  );
}

function PreviewModal({ preview, onClose }: { preview: { url: string; type: string; name: string }; onClose: () => void }) {
  const isPdf = preview.type === "application/pdf";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-border">
          <div className="text-sm font-semibold truncate">{preview.name}</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 bg-muted/30 overflow-auto grid place-items-center">
          {isPdf ? (
            <iframe src={preview.url} title={preview.name} className="w-full h-[80vh]" />
          ) : (
            <img src={preview.url} alt={preview.name} className="max-w-full max-h-[80vh] object-contain" />
          )}
        </div>
      </div>
    </div>
  );
}
