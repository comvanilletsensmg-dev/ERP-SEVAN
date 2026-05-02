import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Upload, FileSpreadsheet, ChevronRight, ChevronLeft, CheckCircle2,
  XCircle, AlertTriangle, Download, RefreshCw, ArrowRight, History,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────
type RowAction = "create" | "update" | "ignore";

interface ValidatedRow {
  rowIndex: number;
  raw: Record<string, unknown>;
  data: Record<string, unknown> | null;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
  duplicateSource: "file" | "db" | null;
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

// ─── Field definitions ────────────────────────────────────────────────────────
const INTERNAL_FIELDS = [
  { value: "__skip__",           label: "— Ignorer —" },
  { value: "reference",          label: "Référence *" },
  { value: "name",               label: "Nom du produit *" },
  { value: "category",           label: "Catégorie *" },
  { value: "subCategoryGousse",  label: "Sous-catégorie Gousse" },
  { value: "size",               label: "Taille (gousses)" },
  { value: "subCategoryExtrait", label: "Sous-catégorie Extrait" },
  { value: "subCategoryPate",    label: "Sous-catégorie Pâte" },
  { value: "description",        label: "Description courte" },
  { value: "aromaticProfile",    label: "Profil aromatique" },
  { value: "recommendedUsage",   label: "Usage recommandé" },
  { value: "packaging",          label: "Conditionnement" },
  { value: "moq",                label: "MOQ" },
  { value: "salesUnit",          label: "Unité de vente" },
  { value: "availability",       label: "Disponibilité" },
  { value: "purchasePriceKg",    label: "Prix d'achat / kg (MGA)" },
  { value: "minFobPriceKg",      label: "Prix min. FOB / kg (EUR)" },
];

const EXCEL_COLS_TO_FIELD: Record<string, string> = {
  "réference*": "reference", "reference*": "reference",
  "nom du produit*": "name",
  "catégories*": "category", "catégories": "category",
  "sous catégories gousse": "subCategoryGousse",
  "taille (gousses seulement)": "size",
  "sous catégories extrait": "subCategoryExtrait",
  "sous catégories pates de vanille": "subCategoryPate",
  "déscription courte": "description",
  "profil aromatique": "aromaticProfile",
  "usage recommandé": "recommendedUsage",
  "conditionement": "packaging",
  "moq": "moq",
  "unité de vente": "salesUnit",
  "disponibilité": "availability",
  "prix d'achat par kg": "purchasePriceKg",
  "prix min. fob par kg": "minFobPriceKg",
};

const STEPS = [
  { n: 1, label: "Upload" },
  { n: 2, label: "Aperçu" },
  { n: 3, label: "Mapping" },
  { n: 4, label: "Validation" },
  { n: 5, label: "Doublons" },
  { n: 6, label: "Résultats" },
];

const API = "/api";
async function apiJson(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? r.statusText); }
  return r.json();
}

// ─── Step bar ─────────────────────────────────────────────────────────────────
function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8 flex-wrap gap-y-2">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            current === s.n ? "bg-[#1a3c2a] text-white shadow" :
            current > s.n ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
          }`}>
            {current > s.n ? <CheckCircle2 className="w-3 h-3" /> : <span>{s.n}</span>}
            <span>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`w-5 h-0.5 ${current > s.n ? "bg-green-200" : "bg-gray-200"}`} />}
        </div>
      ))}
    </div>
  );
}

function RowBadge({ row }: { row: ValidatedRow }) {
  if (row.errors.length > 0)
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold flex items-center gap-0.5 whitespace-nowrap"><XCircle className="w-2.5 h-2.5" /> Erreur</span>;
  if (row.duplicate)
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold flex items-center gap-0.5 whitespace-nowrap"><AlertTriangle className="w-2.5 h-2.5" /> Doublon</span>;
  if (row.warnings.length > 0)
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-semibold flex items-center gap-0.5 whitespace-nowrap"><AlertTriangle className="w-2.5 h-2.5" /> Avertis.</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold flex items-center gap-0.5 whitespace-nowrap"><CheckCircle2 className="w-2.5 h-2.5" /> OK</span>;
}

const CATEGORY_COLORS: Record<string, string> = {
  gousses: "bg-[#1a3c2a]/10 text-[#1a3c2a]",
  poudre: "bg-amber-100 text-amber-700",
  graine: "bg-green-100 text-green-700",
  "extrait de vanille": "bg-purple-100 text-purple-700",
  "pates de vanille": "bg-orange-100 text-orange-700",
  oléorésine: "bg-blue-100 text-blue-700",
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function ImportProducts() {
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
    queryKey: ["import-product-batches"],
    queryFn: () => apiJson("/import-products/batches"),
    enabled: showHistory,
  });

  const validate = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Aucun fichier");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));
      const r = await fetch(`${API}/import-products/validate`, { method: "POST", credentials: "include", body: fd });
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

  const execute = useMutation({
    mutationFn: async () => {
      if (!validationResult) throw new Error("Aucune validation");
      const rows = validationResult.rows
        .filter(r => r.valid || rowActions[r.rowIndex] === "ignore")
        .map(r => ({ data: r.data ?? r.raw, action: rowActions[r.rowIndex] ?? "ignore" }));
      return apiJson("/import-products/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, fileName: file?.name ?? "import" }),
      }) as Promise<ExecuteResult>;
    },
    onSuccess: (data) => {
      setExecuteResult(data);
      setStep(6);
      if (data.failedCount === 0) toast.success(`${data.successCount} produit(s) importé(s) !`);
      else toast.warning(`Import partiel : ${data.successCount} succès, ${data.failedCount} erreurs`);
      refetchBatches();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) { toast.error("Format non supporté (.xlsx, .xls, .csv)"); return; }
    setFile(f);
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
          const autoMap: Record<string, string> = {};
          for (const col of cols) {
            const low = col.toLowerCase().trim();
            if (EXCEL_COLS_TO_FIELD[low]) autoMap[col] = EXCEL_COLS_TO_FIELD[low];
          }
          setMapping(autoMap);
        }
      } catch { /* skip */ }
      setStep(2);
    };
    reader.readAsArrayBuffer(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, []);

  const stats = validationResult ? {
    valid: validationResult.rows.filter(r => r.valid && !r.duplicate).length,
    errors: validationResult.rows.filter(r => r.errors.length > 0).length,
    warnings: validationResult.rows.filter(r => r.warnings.length > 0 && !r.errors.length && !r.duplicate).length,
    duplicates: validationResult.rows.filter(r => r.duplicate).length,
  } : null;

  const duplicateRows = validationResult?.rows.filter(r => r.duplicate) ?? [];
  const errorRows = validationResult?.rows.filter(r => r.errors.length > 0) ?? [];

  const downloadErrors = () => {
    if (!executeResult?.errors.length) return;
    const lines = ["Ligne,Référence,Erreur", ...executeResult.errors.map(e =>
      `${e.rowNumber},"${String((e.rowData as any).reference ?? "")}","${e.message}"`
    )];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "erreurs_import_produits.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep(1); setFile(null); setPreviewRows([]); setDetectedColumns([]);
    setMapping({}); setValidationResult(null); setRowActions({}); setExecuteResult(null);
  };

  const P = "#1a3c2a";

  return (
    <div className="min-h-screen bg-[#f5f0e8] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: P }}>Import Produits</h1>
            <p className="text-sm text-gray-500 mt-0.5">Importer le catalogue produits depuis Excel ou CSV</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowHistory(!showHistory); if (!showHistory) refetchBatches(); }}
              className="gap-2 border-[#1a3c2a]/30 text-[#1a3c2a]">
              <History className="w-4 h-4" /> Historique
            </Button>
            <a href="/api/import-products/template" target="_blank" rel="noopener noreferrer">
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

          {/* ── STEP 1 : Upload ─────────────────────────────────────────── */}
          {step === 1 && (
            <div className="p-8">
              <h2 className="text-lg font-semibold mb-1" style={{ color: P }}>Étape 1 — Upload du fichier</h2>
              <p className="text-sm text-gray-500 mb-6">Glissez votre catalogue produits (Excel ou CSV) ou cliquez pour sélectionner</p>
              <div
                onDrop={onDrop} onDragOver={e => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                  isDragging ? "border-[#1a3c2a] bg-[#1a3c2a]/5" : "border-gray-300 hover:border-[#1a3c2a]/40 hover:bg-gray-50/50"}`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDragging ? "bg-[#1a3c2a]/10" : "bg-gray-100"}`}>
                    <Upload className={`w-7 h-7 ${isDragging ? "text-[#1a3c2a]" : "text-gray-400"}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700">Glissez votre fichier ici</p>
                    <p className="text-sm text-gray-400 mt-1">ou cliquez pour parcourir</p>
                  </div>
                  <div className="flex gap-2">{[".xlsx", ".xls", ".csv"].map(e => (
                    <span key={e} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-mono">{e}</span>
                  ))}</div>
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

              <div className="mt-6 p-4 bg-[#f5f0e8] rounded-lg border border-[#1a3c2a]/10">
                <h3 className="text-sm font-semibold text-[#1a3c2a] mb-3">Colonnes du catalogue produits</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: "Réference*", req: true }, { label: "Nom du produit*", req: true }, { label: "Catégories*", req: true },
                    { label: "Sous catégories gousse", req: false }, { label: "Taille (gousses)", req: false },
                    { label: "Sous catégories extrait", req: false }, { label: "Sous catégories pates", req: false },
                    { label: "Description courte", req: false }, { label: "Profil aromatique", req: false },
                    { label: "Usage recommandé", req: false }, { label: "Conditionement", req: false },
                    { label: "MOQ", req: false }, { label: "Unité de vente", req: false },
                    { label: "Disponibilité", req: false }, { label: "Prix d'achat / kg", req: false }, { label: "Prix min. FOB / kg", req: false },
                  ].map(col => (
                    <div key={col.label} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${col.req ? "bg-[#1a3c2a]" : "bg-gray-300"}`} />
                      <span className="truncate">{col.label}{col.req && <span className="text-red-500 font-bold ml-0.5">*</span>}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2 : Aperçu ─────────────────────────────────────────── */}
          {step === 2 && file && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: P }}>Étape 2 — Aperçu du fichier</h2>
                  <p className="text-sm text-gray-500"><FileSpreadsheet className="w-4 h-4 inline mr-1" />{file.name} — {previewRows.length} premières lignes</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(1)} className="gap-1"><ChevronLeft className="w-4 h-4" />Retour</Button>
                  <Button size="sm" onClick={() => setStep(3)} className="gap-1 bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white">Mapper<ChevronRight className="w-4 h-4" /></Button>
                </div>
              </div>
              {previewRows.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-[420px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                      <tr>
                        <th className="px-2 py-2 text-left text-gray-400 font-semibold">#</th>
                        {detectedColumns.slice(0, 10).map(c => <th key={c} className="px-2 py-2 text-left text-gray-600 font-semibold whitespace-nowrap max-w-[120px] truncate">{c}</th>)}
                        {detectedColumns.length > 10 && <th className="px-2 py-2 text-gray-400">+{detectedColumns.length - 10}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                          <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                          {detectedColumns.slice(0, 10).map(c => (
                            <td key={c} className="px-2 py-1.5 text-gray-700 max-w-[120px] truncate">{String(row[c] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center py-10 text-gray-400 text-sm">Aperçu non disponible — le mapping sera appliqué à la validation</p>
              )}
            </div>
          )}

          {/* ── STEP 3 : Mapping ─────────────────────────────────────────── */}
          {step === 3 && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: P }}>Étape 3 — Mapping des colonnes</h2>
                  <p className="text-sm text-gray-500">Le fichier catalogue sera détecté automatiquement. Vérifiez et ajustez si besoin.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(2)} className="gap-1"><ChevronLeft className="w-4 h-4" />Retour</Button>
                  <Button size="sm" onClick={() => validate.mutate()} disabled={validate.isPending}
                    className="gap-1 bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white">
                    {validate.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" />Validation…</> : <>Valider<ChevronRight className="w-4 h-4" /></>}
                  </Button>
                </div>
              </div>
              {detectedColumns.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {detectedColumns.map(col => (
                    <div key={col} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">{col}</p>
                        <p className="text-xs text-gray-400 truncate">ex : {String(previewRows[0]?.[col] ?? "—")}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                      <select value={mapping[col] ?? "__skip__"} onChange={e => setMapping(m => ({ ...m, [col]: e.target.value }))}
                        className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a3c2a]/30">
                        {INTERNAL_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400 mb-4">Le mapping automatique sera appliqué lors de la validation.</p>
                  <Button size="sm" onClick={() => validate.mutate()} disabled={validate.isPending} className="bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white">
                    {validate.isPending ? "Validation…" : "Lancer la validation"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4 : Validation ──────────────────────────────────────── */}
          {step === 4 && validationResult && stats && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: P }}>Étape 4 — Validation</h2>
                  <p className="text-sm text-gray-500">{validationResult.totalRows} produits analysés</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(3)} className="gap-1"><ChevronLeft className="w-4 h-4" />Retour</Button>
                  <Button size="sm" onClick={() => setStep(5)} className="gap-1 bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white" disabled={stats.valid === 0 && stats.duplicates === 0}>
                    Suivant<ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Valides", value: stats.valid, c: "text-green-600", bg: "bg-green-50 border-green-200" },
                  { label: "Doublons", value: stats.duplicates, c: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
                  { label: "Avertissements", value: stats.warnings, c: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" },
                  { label: "Erreurs", value: stats.errors, c: "text-red-600", bg: "bg-red-50 border-red-200" },
                ].map(s => (
                  <div key={s.label} className={`rounded-lg border p-3 text-center ${s.bg}`}>
                    <p className={`text-2xl font-bold ${s.c}`}>{s.value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-400">#</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold">Référence</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold">Nom</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold">Catégorie</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-semibold">Prix achat</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-semibold">FOB EUR</th>
                      <th className="px-3 py-2 text-center text-gray-500 font-semibold">Statut</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold">Détails</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationResult.rows.map(row => (
                      <tr key={row.rowIndex} className={`border-t border-gray-100 ${row.errors.length ? "bg-red-50/30" : row.duplicate ? "bg-amber-50/30" : "hover:bg-gray-50/30"}`}>
                        <td className="px-3 py-2 text-gray-400">{row.rowIndex + 1}</td>
                        <td className="px-3 py-2 font-mono text-gray-700">{String(row.data?.reference ?? row.raw?.reference ?? "—")}</td>
                        <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate">{String(row.data?.name ?? row.raw?.name ?? "—")}</td>
                        <td className="px-3 py-2">
                          {row.data?.category ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[String(row.data.category)] ?? "bg-gray-100 text-gray-600"}`}>
                              {String(row.data.category)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500">{row.data?.purchasePriceKg ? `${Number(row.data.purchasePriceKg).toLocaleString("fr-FR")} Ar` : "—"}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{row.data?.minFobPriceKg ? `${Number(row.data.minFobPriceKg).toFixed(2)} €` : "—"}</td>
                        <td className="px-3 py-2 text-center"><RowBadge row={row} /></td>
                        <td className="px-3 py-2 text-gray-400 max-w-[180px] text-[10px]">
                          {[...row.errors.map(e => `❌ ${e}`), ...row.warnings.slice(0, 2).map(w => `⚠️ ${w}`)].join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── STEP 5 : Doublons ────────────────────────────────────────── */}
          {step === 5 && validationResult && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: P }}>Étape 5 — Gestion des doublons</h2>
                  <p className="text-sm text-gray-500">{duplicateRows.length} doublon(s) — choisissez l'action à appliquer</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(4)} className="gap-1"><ChevronLeft className="w-4 h-4" />Retour</Button>
                  <Button size="sm" onClick={() => execute.mutate()} disabled={execute.isPending}
                    className="gap-2 bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white">
                    {execute.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" />Import…</> : <>Lancer l'import<ArrowRight className="w-4 h-4" /></>}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs text-gray-500 self-center font-medium">Appliquer à tous :</span>
                {(["create", "update", "ignore"] as RowAction[]).map(action => (
                  <button key={action} onClick={() => { const u = { ...rowActions }; duplicateRows.forEach(r => { u[r.rowIndex] = action; }); setRowActions(u); }}
                    className={`text-xs px-3 py-1 rounded-full border font-medium ${
                      action === "create" ? "border-green-300 text-green-700 hover:bg-green-50" :
                      action === "update" ? "border-blue-300 text-blue-700 hover:bg-blue-50" :
                      "border-gray-300 text-gray-500 hover:bg-gray-50"}`}>
                    {action === "create" ? "Créer quand même" : action === "update" ? "Mettre à jour" : "Ignorer"}
                  </button>
                ))}
              </div>

              {duplicateRows.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-2" />
                  <p className="text-gray-500 mb-4">Aucun doublon détecté</p>
                  <Button size="sm" onClick={() => execute.mutate()} disabled={execute.isPending} className="bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white">
                    {execute.isPending ? "Import…" : "Lancer l'import"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto">
                  {duplicateRows.map(row => (
                    <div key={row.rowIndex} className={`flex items-center gap-3 p-3 rounded-lg border ${row.duplicateSource === "db" ? "bg-blue-50/40 border-blue-200" : "bg-amber-50/40 border-amber-200"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-gray-700">{String(row.data?.reference ?? "—")}</span>
                          <span className="text-xs font-medium text-gray-500">{String(row.data?.name ?? "—")}</span>
                          {row.data?.category && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[String(row.data.category)] ?? "bg-gray-100 text-gray-500"}`}>
                              {String(row.data.category)}
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${row.duplicateSource === "db" ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"}`}>
                            {row.duplicateSource === "db" ? "Doublon DB" : "Doublon fichier"}
                          </span>
                        </div>
                        {row.data?.purchasePriceKg && <p className="text-xs text-gray-400 mt-0.5">{Number(row.data.purchasePriceKg).toLocaleString("fr-FR")} Ar/kg · {row.data?.minFobPriceKg ? `${Number(row.data.minFobPriceKg).toFixed(2)} €/kg` : "FOB ?"}</p>}
                      </div>
                      <select value={rowActions[row.rowIndex] ?? "ignore"} onChange={e => setRowActions(a => ({ ...a, [row.rowIndex]: e.target.value as RowAction }))}
                        className="shrink-0 text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a3c2a]/30">
                        <option value="create">Créer quand même</option>
                        <option value="update">Mettre à jour</option>
                        <option value="ignore">Ignorer</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600">
                <p className="font-semibold text-gray-700 mb-1">Résumé :</p>
                <div className="flex gap-4 flex-wrap">
                  <span>✅ {validationResult.rows.filter(r => r.valid && !r.duplicate).length} à créer</span>
                  <span>🔄 {duplicateRows.filter(r => rowActions[r.rowIndex] === "update").length} à mettre à jour</span>
                  <span>⏭️ {duplicateRows.filter(r => rowActions[r.rowIndex] === "ignore").length} à ignorer</span>
                  <span>❌ {errorRows.length} erreur(s)</span>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 6 : Résultats ───────────────────────────────────────── */}
          {step === 6 && executeResult && (
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-5" style={{ color: P }}>Étape 6 — Résultats de l'import</h2>
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { label: "Total traité", value: executeResult.totalRows, c: "text-gray-700", bg: "bg-gray-50 border-gray-200" },
                  { label: "Succès", value: executeResult.successCount, c: "text-green-600", bg: "bg-green-50 border-green-200" },
                  { label: "Ignorés", value: executeResult.ignoredCount, c: "text-gray-400", bg: "bg-gray-50 border-gray-200" },
                  { label: "Erreurs", value: executeResult.failedCount, c: "text-red-600", bg: "bg-red-50 border-red-200" },
                ].map(s => (
                  <div key={s.label} className={`rounded-lg border p-4 text-center ${s.bg}`}>
                    <p className={`text-3xl font-bold ${s.c}`}>{s.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className={`rounded-xl p-5 mb-5 text-center ${executeResult.failedCount === 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
                {executeResult.failedCount === 0 ? (
                  <><CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                  <p className="font-semibold text-green-700">{executeResult.successCount} produit(s) importé(s) avec succès</p></>
                ) : (
                  <><AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-2" />
                  <p className="font-semibold text-amber-700">{executeResult.message}</p></>
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
                    <Download className="w-4 h-4" /> Erreurs CSV
                  </Button>
                )}
                <a href="/catalogue">
                  <Button className="gap-2 bg-[#1a3c2a] hover:bg-[#1a3c2a]/90 text-white">
                    <Eye className="w-4 h-4" /> Voir le catalogue
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
