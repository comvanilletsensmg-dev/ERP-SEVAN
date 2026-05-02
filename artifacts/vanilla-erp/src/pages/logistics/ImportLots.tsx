import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, ChevronRight, ChevronLeft, CheckCircle2, XCircle, AlertTriangle, Download, RefreshCw, Eye, ArrowRight, SkipForward, Pencil, History } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

type RowAction = "create" | "update" | "ignore";
type DuplicateSource = "file" | "db" | null;

interface ValidatedRow {
  rowIndex: number;
  raw: Record<string, unknown>;
  data: Record<string, unknown> | null;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
  duplicateSource: DuplicateSource;
  suggestedAction: RowAction;
  valid: boolean;
}

interface ValidateResponse {
  totalRows: number;
  detectedColumns: string[];
  rows: ValidatedRow[];
}

interface ExecuteResult {
  batchId: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  ignoredCount: number;
  errors: Array<{ rowNumber: number; rowData: Record<string, unknown>; message: string }>;
  message: string;
}

interface ImportBatch {
  id: string;
  fileName: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  ignoredCount: number;
  createdAt: string;
}

// ─── Internal fields ──────────────────────────────────────────────────────────

const INTERNAL_FIELDS = [
  { value: "__skip__",    label: "— Ignorer cette colonne —" },
  { value: "code",        label: "Code lot *" },
  { value: "supplier",    label: "Fournisseur *" },
  { value: "region",      label: "Région" },
  { value: "weightInitial", label: "Poids initial (kg) *" },
  { value: "humidity",    label: "Humidité (%) *" },
  { value: "grade",       label: "Grade" },
  { value: "warehouse",   label: "Entrepôt" },
];

const GRADE_LABELS: Record<string, string> = {
  "Grade A": "Grade A", "Grade B": "Grade B", "Grade C": "Grade C",
  "Premium": "Premium", "A": "Grade A", "B": "Grade B", "C": "Grade C",
};

const STEPS = [
  { n: 1, label: "Upload" },
  { n: 2, label: "Aperçu" },
  { n: 3, label: "Mapping" },
  { n: 4, label: "Validation" },
  { n: 5, label: "Doublons" },
  { n: 6, label: "Import" },
];

const API = "/api";
async function apiJson(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", ...opts });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error ?? r.statusText);
  }
  return r.json();
}

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            current === s.n ? "bg-[#1a3c2a] text-white shadow-md" :
            current > s.n ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
          }`}>
            {current > s.n ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">{s.n}</span>}
            <span className="hidden sm:inline">{s.label}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`w-6 h-0.5 ${current > s.n ? "bg-green-300" : "bg-gray-200"}`} />}
        </div>
      ))}
    </div>
  );
}

// ─── Row status badge ─────────────────────────────────────────────────────────

function RowBadge({ row }: { row: ValidatedRow }) {
  if (row.errors.length > 0)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1"><XCircle className="w-3 h-3" /> Erreur</span>;
  if (row.duplicate)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Doublon</span>;
  if (row.warnings.length > 0)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Avertissement</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> OK</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportLots() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validationResult, setValidationResult] = useState<ValidateResponse | null>(null);
  const [rowActions, setRowActions] = useState<Record<number, RowAction>>({});
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: batches = [], refetch: refetchBatches } = useQuery<ImportBatch[]>({
    queryKey: ["import-batches"],
    queryFn: () => apiJson("/import-lots/batches"),
    enabled: showHistory,
  });

  // ── Validate mutation ──
  const validate = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Aucun fichier");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));
      const r = await fetch(`${API}/import-lots/validate`, {
        method: "POST", credentials: "include", body: fd,
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "Erreur validation"); }
      return r.json() as Promise<ValidateResponse>;
    },
    onSuccess: (data) => {
      setValidationResult(data);
      const actions: Record<number, RowAction> = {};
      data.rows.forEach(r => { actions[r.rowIndex] = r.suggestedAction; });
      setRowActions(actions);
      setStep(4);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Execute mutation ──
  const execute = useMutation({
    mutationFn: async () => {
      if (!validationResult) throw new Error("Aucune validation");
      const rows = validationResult.rows
        .filter(r => r.valid || rowActions[r.rowIndex] === "ignore")
        .map(r => ({ data: r.data ?? r.raw, action: rowActions[r.rowIndex] ?? "ignore" }));
      return apiJson("/import-lots/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, fileName: file?.name ?? "import" }),
      }) as Promise<ExecuteResult>;
    },
    onSuccess: (data) => {
      setExecuteResult(data);
      setStep(6);
      if (data.failedCount === 0) toast.success(`${data.successCount} lot(s) importé(s) avec succès !`);
      else toast.warning(`Import partiel : ${data.successCount} succès, ${data.failedCount} erreurs`);
      refetchBatches();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Drag & drop ──
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleFile = (f: File) => {
    const valid = f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.name.endsWith(".csv");
    if (!valid) { toast.error("Format non supporté. Utilisez .xlsx, .xls ou .csv"); return; }
    setFile(f);
    // Parse preview with xlsx (client-side)
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const XLSX = (window as any).XLSX;
        if (XLSX) {
          const wb = XLSX.read(ev.target!.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
          setPreviewRows(rows.slice(0, 20));
          const cols = rows.length ? Object.keys(rows[0]) : [];
          setDetectedColumns(cols);
          // Auto-map obvious columns
          const autoMap: Record<string, string> = {};
          for (const col of cols) {
            const low = col.toLowerCase().trim();
            for (const field of INTERNAL_FIELDS.slice(1)) {
              if (low.includes(field.value.toLowerCase()) || low === field.label.toLowerCase().replace(" *", "")) {
                autoMap[col] = field.value;
                break;
              }
            }
            if (!autoMap[col]) {
              const aliases: Record<string, string> = {
                fournisseur: "supplier", "poids": "weightInitial", "poids (kg)": "weightInitial",
                "humidité (%)": "humidity", "humidite (%)": "humidity", région: "region", entrepôt: "warehouse", entrepot: "warehouse",
              };
              if (aliases[low]) autoMap[col] = aliases[low];
            }
          }
          setMapping(autoMap);
        }
      } catch { /* if xlsx not loaded in browser, skip preview */ }
      setStep(2);
    };
    reader.readAsArrayBuffer(f);
  };

  // ── Computed stats ──
  const stats = validationResult ? {
    valid: validationResult.rows.filter(r => r.valid && !r.duplicate).length,
    errors: validationResult.rows.filter(r => r.errors.length > 0).length,
    warnings: validationResult.rows.filter(r => r.warnings.length > 0 && !r.errors.length).length,
    duplicates: validationResult.rows.filter(r => r.duplicate).length,
  } : null;

  const duplicateRows = validationResult?.rows.filter(r => r.duplicate) ?? [];
  const errorRows = validationResult?.rows.filter(r => r.errors.length > 0) ?? [];

  const downloadErrors = () => {
    if (!executeResult?.errors.length) return;
    const lines = ["Ligne,Données,Erreur", ...executeResult.errors.map(e =>
      `${e.rowNumber},"${JSON.stringify(e.rowData).replace(/"/g, '""')}","${e.message}"`
    )];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "erreurs_import.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep(1); setFile(null); setPreviewRows([]); setDetectedColumns([]);
    setMapping({}); setValidationResult(null); setRowActions({}); setExecuteResult(null);
  };

  const BG = "bg-[#f5f0e8]";
  const PRIMARY = "#1a3c2a";

  return (
    <div className={`min-h-screen ${BG} p-6`}>
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: PRIMARY }}>Import Lots</h1>
            <p className="text-sm text-gray-500 mt-0.5">Importer des lots logistiques depuis Excel ou CSV</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowHistory(!showHistory); if (!showHistory) refetchBatches(); }}
              className="gap-2 border-[#1a3c2a]/30 text-[#1a3c2a]">
              <History className="w-4 h-4" /> Historique
            </Button>
            <a href="/api/import-lots/template" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2 border-[#1a3c2a]/30 text-[#1a3c2a]">
                <Download className="w-4 h-4" /> Modèle Excel
              </Button>
            </a>
          </div>
        </div>

        {/* History panel */}
        {showHistory && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-sm text-gray-700">Historique des imports</h2>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            </div>
            {batches.length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm">Aucun import effectué</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Fichier</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500">Total</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-green-600">Succès</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-red-500">Erreurs</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400">Ignorés</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Date</th>
                  </tr></thead>
                  <tbody>
                    {[...batches].reverse().map(b => (
                      <tr key={b.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-2 font-medium text-gray-700 max-w-[180px] truncate">{b.fileName}</td>
                        <td className="px-4 py-2 text-center text-gray-500">{b.totalRows}</td>
                        <td className="px-4 py-2 text-center text-green-600 font-semibold">{b.successCount}</td>
                        <td className="px-4 py-2 text-center text-red-500 font-semibold">{b.failedCount}</td>
                        <td className="px-4 py-2 text-center text-gray-400">{b.ignoredCount}</td>
                        <td className="px-4 py-2 text-right text-gray-400 text-xs">{new Date(b.createdAt).toLocaleString("fr-FR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <StepBar current={step} />

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">

          {/* ─── STEP 1: Upload ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="p-8">
              <h2 className="text-lg font-semibold mb-1" style={{ color: PRIMARY }}>Étape 1 — Upload du fichier</h2>
              <p className="text-sm text-gray-500 mb-6">Glissez-déposez votre fichier Excel ou CSV, ou cliquez pour sélectionner</p>
              <div
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                  isDragging ? "border-[#1a3c2a] bg-[#1a3c2a]/5 scale-[1.01]" : "border-gray-300 hover:border-[#1a3c2a]/50 hover:bg-gray-50/50"
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDragging ? "bg-[#1a3c2a]/10" : "bg-gray-100"}`}>
                    <Upload className={`w-7 h-7 ${isDragging ? "text-[#1a3c2a]" : "text-gray-400"}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700">Glissez votre fichier ici</p>
                    <p className="text-sm text-gray-400 mt-1">ou cliquez pour parcourir</p>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {[".xlsx", ".xls", ".csv"].map(ext => (
                      <span key={ext} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-mono">{ext}</span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">Taille maximale : 20 Mo</p>
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

              <div className="mt-6 p-4 bg-[#f5f0e8] rounded-lg border border-[#1a3c2a]/10">
                <h3 className="text-sm font-semibold text-[#1a3c2a] mb-2">Colonnes attendues</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { name: "Code", req: true }, { name: "Fournisseur", req: true },
                    { name: "Poids (kg)", req: true }, { name: "Humidité (%)", req: true },
                    { name: "Région", req: false }, { name: "Grade", req: false }, { name: "Entrepôt", req: false },
                  ].map(col => (
                    <div key={col.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className={`w-1.5 h-1.5 rounded-full ${col.req ? "bg-[#1a3c2a]" : "bg-gray-300"}`} />
                      {col.name}{col.req && <span className="text-red-500 font-bold">*</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── STEP 2: Preview ─────────────────────────────────────── */}
          {step === 2 && file && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: PRIMARY }}>Étape 2 — Aperçu du fichier</h2>
                  <p className="text-sm text-gray-500">
                    <FileSpreadsheet className="w-4 h-4 inline mr-1" />
                    {file.name} — {previewRows.length} lignes affichées (max 20)
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(1)} className="gap-1"><ChevronLeft className="w-4 h-4" /> Retour</Button>
                  <Button size="sm" onClick={() => setStep(3)} className="gap-1 bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white">
                    Mapper <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {previewRows.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500 font-semibold">#</th>
                        {detectedColumns.map(col => (
                          <th key={col} className="px-3 py-2 text-left text-gray-600 font-semibold whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          {detectedColumns.map(col => (
                            <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[150px] truncate">
                              {String(row[col] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-sm">Aperçu non disponible — le mapping sera appliqué au moment de la validation</p>
                  <p className="text-xs mt-1 text-gray-300">{detectedColumns.length} colonnes détectées</p>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 3: Mapping ─────────────────────────────────────── */}
          {step === 3 && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: PRIMARY }}>Étape 3 — Mapping des colonnes</h2>
                  <p className="text-sm text-gray-500">Associez chaque colonne du fichier à un champ ERP</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(2)} className="gap-1"><ChevronLeft className="w-4 h-4" /> Retour</Button>
                  <Button size="sm" onClick={() => validate.mutate()} disabled={validate.isPending}
                    className="gap-1 bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white">
                    {validate.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Validation…</> : <>Valider <ChevronRight className="w-4 h-4" /></>}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {detectedColumns.map(col => (
                  <div key={col} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{col}</p>
                      <p className="text-xs text-gray-400 truncate">ex : {String(previewRows[0]?.[col] ?? "—")}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                    <select
                      value={mapping[col] ?? "__skip__"}
                      onChange={e => setMapping(m => ({ ...m, [col]: e.target.value }))}
                      className="flex-1 text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a3c2a]/30"
                    >
                      {INTERNAL_FIELDS.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {detectedColumns.length === 0 && (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-sm">Aucune colonne détectée. Le mapping automatique sera appliqué.</p>
                  <Button size="sm" onClick={() => validate.mutate()} disabled={validate.isPending}
                    className="mt-4 bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white">
                    Lancer la validation directement
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 4: Validation ──────────────────────────────────── */}
          {step === 4 && validationResult && stats && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: PRIMARY }}>Étape 4 — Validation</h2>
                  <p className="text-sm text-gray-500">{validationResult.totalRows} lignes analysées</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(3)} className="gap-1"><ChevronLeft className="w-4 h-4" /> Retour</Button>
                  <Button size="sm" onClick={() => setStep(5)} className="gap-1 bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white" disabled={stats.valid === 0 && stats.duplicates === 0}>
                    Suivant <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Valides", value: stats.valid, color: "text-green-600", bg: "bg-green-50 border-green-200" },
                  { label: "Doublons", value: stats.duplicates, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
                  { label: "Avertissements", value: stats.warnings, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" },
                  { label: "Erreurs", value: stats.errors, color: "text-red-600", bg: "bg-red-50 border-red-200" },
                ].map(s => (
                  <div key={s.label} className={`rounded-lg border p-3 text-center ${s.bg}`}>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Rows table */}
              <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold">#</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold">Code</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold">Fournisseur</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-semibold">Poids</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-semibold">Humidité</th>
                      <th className="px-3 py-2 text-center text-gray-500 font-semibold">Statut</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold">Détails</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationResult.rows.map(row => (
                      <tr key={row.rowIndex} className={`border-t border-gray-100 ${row.errors.length ? "bg-red-50/30" : row.duplicate ? "bg-amber-50/30" : "hover:bg-gray-50/30"}`}>
                        <td className="px-3 py-2 text-gray-400">{row.rowIndex + 1}</td>
                        <td className="px-3 py-2 font-mono font-medium text-gray-700">{String(row.data?.code ?? row.raw?.code ?? "—")}</td>
                        <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate">{String(row.data?.supplier ?? row.raw?.supplier ?? "—")}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{row.data?.weightInitial != null ? `${row.data.weightInitial} kg` : "—"}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{row.data?.humidity != null ? `${row.data.humidity}%` : "—"}</td>
                        <td className="px-3 py-2 text-center"><RowBadge row={row} /></td>
                        <td className="px-3 py-2 text-gray-400 max-w-[200px]">
                          {[...row.errors.map(e => `❌ ${e}`), ...row.warnings.map(w => `⚠️ ${w}`)].join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── STEP 5: Duplicates ──────────────────────────────────── */}
          {step === 5 && validationResult && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: PRIMARY }}>Étape 5 — Gestion des doublons</h2>
                  <p className="text-sm text-gray-500">{duplicateRows.length} doublon(s) détecté(s) — choisissez l'action pour chacun</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(4)} className="gap-1"><ChevronLeft className="w-4 h-4" /> Retour</Button>
                  <Button size="sm" onClick={() => execute.mutate()} disabled={execute.isPending}
                    className="gap-1 bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white">
                    {execute.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Import…</> : <>Lancer l'import <ArrowRight className="w-4 h-4" /></>}
                  </Button>
                </div>
              </div>

              {/* Actions globales */}
              <div className="flex flex-wrap gap-2 mb-5">
                <span className="text-xs text-gray-500 self-center font-medium">Appliquer à tous les doublons :</span>
                {(["create", "update", "ignore"] as RowAction[]).map(action => (
                  <button key={action} onClick={() => {
                    const updated = { ...rowActions };
                    duplicateRows.forEach(r => { updated[r.rowIndex] = action; });
                    setRowActions(updated);
                  }} className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                    action === "create" ? "border-green-300 text-green-700 hover:bg-green-50" :
                    action === "update" ? "border-blue-300 text-blue-700 hover:bg-blue-50" :
                    "border-gray-300 text-gray-500 hover:bg-gray-50"
                  }`}>
                    {action === "create" ? "Créer quand même" : action === "update" ? "Mettre à jour" : "Ignorer"}
                  </button>
                ))}
              </div>

              {duplicateRows.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-2" />
                  <p className="text-gray-500">Aucun doublon détecté — l'import peut continuer directement</p>
                  <Button size="sm" onClick={() => execute.mutate()} disabled={execute.isPending}
                    className="mt-4 bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white">
                    {execute.isPending ? "Import en cours…" : "Lancer l'import"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {duplicateRows.map(row => (
                    <div key={row.rowIndex} className={`flex items-center gap-3 p-3 rounded-lg border ${
                      row.duplicateSource === "db" ? "bg-blue-50/40 border-blue-200" : "bg-amber-50/40 border-amber-200"
                    }`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-semibold text-gray-700">{String(row.data?.code ?? row.raw?.code ?? "—")}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            row.duplicateSource === "db" ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"
                          }`}>
                            {row.duplicateSource === "db" ? "Doublon DB" : "Doublon fichier"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {String(row.data?.supplier ?? "—")} · {String(row.data?.weightInitial ?? "?")}kg · {String(row.data?.humidity ?? "?")}%
                        </p>
                        {row.warnings.map((w, i) => (
                          <p key={i} className="text-xs text-yellow-600 mt-0.5">⚠️ {w}</p>
                        ))}
                      </div>
                      <div className="shrink-0">
                        <select
                          value={rowActions[row.rowIndex] ?? "ignore"}
                          onChange={e => setRowActions(a => ({ ...a, [row.rowIndex]: e.target.value as RowAction }))}
                          className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a3c2a]/30"
                        >
                          <option value="create">Créer quand même</option>
                          <option value="update">Mettre à jour</option>
                          <option value="ignore">Ignorer</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary of what will be imported */}
              {validationResult && (
                <div className="mt-5 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600">
                  <p className="font-semibold text-gray-700 mb-1">Résumé de l'import :</p>
                  <div className="flex gap-4">
                    <span>✅ {validationResult.rows.filter(r => r.valid && !r.duplicate && rowActions[r.rowIndex] !== "ignore").length} lot(s) à créer</span>
                    <span>🔄 {duplicateRows.filter(r => rowActions[r.rowIndex] === "update").length} à mettre à jour</span>
                    <span>⏭️ {duplicateRows.filter(r => rowActions[r.rowIndex] === "ignore").length} à ignorer</span>
                    <span>❌ {errorRows.length} en erreur (ignorés)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 6: Results ─────────────────────────────────────── */}
          {step === 6 && executeResult && (
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-5" style={{ color: PRIMARY }}>Étape 6 — Résultats de l'import</h2>

              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { label: "Total traité", value: executeResult.totalRows, color: "text-gray-700", bg: "bg-gray-50 border-gray-200" },
                  { label: "Succès", value: executeResult.successCount, color: "text-green-600", bg: "bg-green-50 border-green-200" },
                  { label: "Ignorés", value: executeResult.ignoredCount, color: "text-gray-400", bg: "bg-gray-50 border-gray-200" },
                  { label: "Erreurs", value: executeResult.failedCount, color: "text-red-600", bg: "bg-red-50 border-red-200" },
                ].map(s => (
                  <div key={s.label} className={`rounded-lg border p-4 text-center ${s.bg}`}>
                    <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className={`rounded-xl p-5 mb-5 text-center ${
                executeResult.failedCount === 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"
              }`}>
                {executeResult.failedCount === 0 ? (
                  <><CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                  <p className="font-semibold text-green-700">{executeResult.successCount} lot(s) importé(s) avec succès</p>
                  <p className="text-sm text-green-600 mt-1">Référence batch : <code className="font-mono bg-green-100 px-1 rounded">{executeResult.batchId.slice(0, 8)}…</code></p></>
                ) : (
                  <><AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-2" />
                  <p className="font-semibold text-amber-700">{executeResult.message}</p>
                  <p className="text-sm text-amber-600 mt-1">Batch ID : <code className="font-mono bg-amber-100 px-1 rounded">{executeResult.batchId.slice(0, 8)}…</code></p></>
                )}
              </div>

              {executeResult.errors.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-red-600 mb-2">Lignes en erreur :</h3>
                  <div className="max-h-[200px] overflow-y-auto rounded-lg border border-red-200 bg-red-50/30">
                    {executeResult.errors.map((e, i) => (
                      <div key={i} className="px-3 py-2 border-b border-red-100 last:border-0 text-xs">
                        <span className="font-semibold text-red-600">Ligne {e.rowNumber}</span>
                        <span className="text-gray-500 ml-2">{e.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={reset} className="gap-2 border-[#1a3c2a]/30 text-[#1a3c2a]">
                  <RefreshCw className="w-4 h-4" /> Nouvel import
                </Button>
                {executeResult.errors.length > 0 && (
                  <Button onClick={downloadErrors} variant="outline" className="gap-2 border-red-300 text-red-600 hover:bg-red-50">
                    <Download className="w-4 h-4" /> Télécharger erreurs CSV
                  </Button>
                )}
                <a href="/lots">
                  <Button className="gap-2 bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white">
                    <Eye className="w-4 h-4" /> Voir les lots
                  </Button>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
