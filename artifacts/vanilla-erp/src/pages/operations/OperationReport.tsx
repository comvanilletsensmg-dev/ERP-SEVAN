import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Save, Package, Beaker, CheckCircle2, Skull, Activity,
  Plus, Trash2, ChevronDown, Loader2, RefreshCw, X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface LotOption { id: string; code: string; weightCurrent: number; status: string }
interface LotStatusRow { id: string; reportId: string; lotId: string; status: string; quantityKg: number; lotCode: string; lotWeightCurrent: number; lotStatus: string }
interface UsageRow { id: string; consumableId: string; quantityUsed: number; name: string; unit: string; stock: number; minStock: number }
interface Consumable { id: string; name: string; unit: string; stock: number; minStock: number }
interface Report { id: string; date: string; quantityReceivedKg: number; quantityPreparedKg: number; notes: string | null }

interface TodayData {
  report: Report;
  lotStatuses: LotStatusRow[];
  usages: UsageRow[];
  activeLots: LotOption[];
}

// ── API helper ──────────────────────────────────────────────────────────────────
const api = async (path: string, opts?: RequestInit) => {
  const r = await fetch(`/api${path}`, { credentials: "include", ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error ?? "Erreur"); }
  return r.json();
};

// ── Constants ────────────────────────────────────────────────────────────────────
const LOT_STATUSES = [
  { value: "processing", label: "En traitement",  icon: Activity,    color: "text-blue-600"   },
  { value: "phenole",    label: "Phénolé",        icon: Beaker,      color: "text-orange-600" },
  { value: "moldy",      label: "Moisi",          icon: Skull,       color: "text-red-600"    },
  { value: "ready",      label: "Prêt",           icon: CheckCircle2,color: "text-green-600"  },
  { value: "preparing",  label: "Préparation",    icon: Package,     color: "text-purple-600" },
];

const QUICK_KG = [5, 10, 25, 50, 100];

// ── Stepper Input ─────────────────────────────────────────────────────────────
function StepperInput({ value, onChange, step = 1, min = 0, unit = "kg", compact = false }: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; unit?: string; compact?: boolean;
}) {
  const dec = () => onChange(Math.max(min, +(value - step).toFixed(2)));
  const inc = () => onChange(+(value + step).toFixed(2));

  return (
    <div className={`flex items-center border border-gray-200 rounded-xl overflow-hidden ${compact ? "h-10" : "h-12"}`}>
      <button type="button" onClick={dec}
        className={`${compact ? "w-9" : "w-12"} h-full bg-gray-50 text-gray-600 hover:bg-gray-100 text-xl font-bold flex items-center justify-center active:bg-gray-200 shrink-0`}>
        −
      </button>
      <input
        type="number" min={min} step={step} value={value}
        onChange={e => onChange(Math.max(min, Number(e.target.value)))}
        className="flex-1 text-center font-semibold text-gray-900 focus:outline-none bg-white text-sm min-w-0 h-full"
      />
      <span className="text-xs text-gray-400 pr-1 shrink-0">{unit}</span>
      <button type="button" onClick={inc}
        className={`${compact ? "w-9" : "w-12"} h-full bg-gray-50 text-gray-600 hover:bg-gray-100 text-xl font-bold flex items-center justify-center active:bg-gray-200 shrink-0`}>
        +
      </button>
    </div>
  );
}

// ── Section Card ──────────────────────────────────────────────────────────────
function SectionCard({ label, emoji, children }: { label: string; emoji: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b bg-gray-50 flex items-center gap-2">
        <span className="text-lg">{emoji}</span>
        <h2 className="font-semibold text-gray-800 text-sm">{label}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Main Report Page ──────────────────────────────────────────────────────────
export default function OperationReport() {
  const qc = useQueryClient();
  const [saving, setSaving]           = useState(false);
  const [lastSaved, setLastSaved]     = useState<Date | null>(null);
  const [newLotId, setNewLotId]       = useState("");
  const [newLotStatus, setNewLotStatus] = useState("processing");
  const [newLotKg, setNewLotKg]       = useState(0);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Consumables from DB
  const { data: allConsumables = [] } = useQuery<Consumable[]>({
    queryKey: ["consumables"],
    queryFn: () => api("/operations/consumables"),
  });

  // Today's report data
  const { data, isLoading, refetch } = useQuery<TodayData>({
    queryKey: ["operation-today"],
    queryFn: () => api("/operations/reports/today"),
  });

  // Local state mirrors (for snappy UI)
  const [receivedKg, setReceivedKg]   = useState(0);
  const [preparedKg, setPreparedKg]   = useState(0);
  const [notes, setNotes]             = useState("");
  const [usages, setUsages]           = useState<Record<string, number>>({});

  // Sync from server data on load
  useEffect(() => {
    if (!data) return;
    setReceivedKg(data.report.quantityReceivedKg ?? 0);
    setPreparedKg(data.report.quantityPreparedKg ?? 0);
    setNotes(data.report.notes ?? "");
    const u: Record<string, number> = {};
    for (const usage of data.usages) u[usage.consumableId] = usage.quantityUsed;
    setUsages(u);
  }, [data?.report.id]);

  const reportId = data?.report.id;
  const lotStatuses = data?.lotStatuses ?? [];
  const activeLots = data?.activeLots ?? [];
  const usedLotIds = new Set(lotStatuses.map(l => l.lotId));
  const availableLots = activeLots.filter(l => !usedLotIds.has(l.id));

  // ── Save functions ────────────────────────────────────────────────────────
  const saveReport = useCallback(async (fields: { receivedKg?: number; preparedKg?: number; notes?: string }) => {
    if (!reportId) return;
    setSaving(true);
    try {
      await api(`/operations/reports/${reportId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantityReceivedKg: fields.receivedKg ?? receivedKg,
          quantityPreparedKg: fields.preparedKg ?? preparedKg,
          notes: fields.notes ?? notes,
        }),
      });
      setLastSaved(new Date());
    } catch { /* silent auto-save */ }
    finally { setSaving(false); }
  }, [reportId, receivedKg, preparedKg, notes]);

  // Debounced auto-save
  const scheduleAutoSave = useCallback((fields: { receivedKg?: number; preparedKg?: number; notes?: string }) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveReport(fields), 1500);
  }, [saveReport]);

  const handleReceivedChange = (v: number) => { setReceivedKg(v); scheduleAutoSave({ receivedKg: v }); };
  const handlePreparedChange = (v: number) => { setPreparedKg(v); scheduleAutoSave({ preparedKg: v }); };
  const handleNotesChange    = (v: string) => { setNotes(v);      scheduleAutoSave({ notes: v });       };

  // ── Consumable usage save ─────────────────────────────────────────────────
  const saveUsage = async (consumableId: string, qty: number) => {
    if (!reportId) return;
    setUsages(prev => ({ ...prev, [consumableId]: qty }));
    try {
      await api(`/operations/reports/${reportId}/consumable-usage`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumableId, quantityUsed: qty }),
      });
      setLastSaved(new Date());
      qc.invalidateQueries({ queryKey: ["consumables"] });
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erreur sauvegarde"); }
  };

  // ── Lot status add ────────────────────────────────────────────────────────
  const addLotStatus = async () => {
    if (!newLotId || !reportId) { toast.error("Sélectionner un lot"); return; }
    if (newLotKg <= 0) { toast.error("Saisir une quantité > 0"); return; }
    try {
      await api(`/operations/reports/${reportId}/lot-status`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId: newLotId, status: newLotStatus, quantityKg: newLotKg }),
      });
      setNewLotId(""); setNewLotKg(0);
      setLastSaved(new Date());
      refetch();
      toast.success("Lot ajouté au rapport");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const removeLotStatus = async (lotId: string) => {
    if (!reportId) return;
    try {
      await api(`/operations/reports/${reportId}/lot-status/${lotId}`, { method: "DELETE" });
      refetch();
      toast.success("Lot retiré");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const updateLotStatus = async (lotId: string, field: "status" | "quantityKg", value: string | number) => {
    if (!reportId) return;
    const existing = lotStatuses.find(l => l.lotId === lotId);
    if (!existing) return;
    const updated = { lotId, status: existing.status, quantityKg: existing.quantityKg, [field]: value };
    try {
      await api(`/operations/reports/${reportId}/lot-status`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      setLastSaved(new Date());
      refetch();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const manualSave = async () => {
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); }
    await saveReport({});
    toast.success("Rapport sauvegardé !");
  };

  const dateDisplay = data?.report.date
    ? new Date(data.report.date).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    : "…";

  if (isLoading) return (
    <div className="p-8 flex flex-col items-center justify-center gap-3 text-gray-400">
      <Loader2 className="w-8 h-8 animate-spin" />
      <p>Chargement du rapport…</p>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Rapport Journalier</h1>
          <p className="text-sm text-gray-500 capitalize mt-0.5">{dateDisplay}</p>
          {lastSaved && (
            <p className="text-[11px] text-green-600 flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3 h-3" />Sauvegardé {lastSaved.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
          <button onClick={manualSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 shadow-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="hidden sm:inline">Sauvegarder</span>
          </button>
        </div>
      </div>

      {/* A. LOTS */}
      <SectionCard label="Lots vanille" emoji="📦">
        {/* Existing lot rows */}
        <div className="space-y-3 mb-4">
          {lotStatuses.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-3">Aucun lot · Ajouter ci-dessous</p>
          )}
          {lotStatuses.map(lot => {
            const stCfg = LOT_STATUSES.find(s => s.value === lot.status);
            const StIcon = stCfg?.icon ?? Activity;
            return (
              <div key={lot.lotId} className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900">{lot.lotCode}</p>
                  <p className="text-xs text-gray-400">{lot.lotWeightCurrent} kg dispo</p>
                </div>
                {/* Status selector */}
                <div className="relative">
                  <select value={lot.status}
                    onChange={e => updateLotStatus(lot.lotId, "status", e.target.value)}
                    className="appearance-none bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none pr-5">
                    {LOT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                </div>
                {/* Qty stepper */}
                <div className="w-32">
                  <StepperInput compact value={lot.quantityKg} onChange={v => updateLotStatus(lot.lotId, "quantityKg", v)} />
                </div>
                <button onClick={() => removeLotStatus(lot.lotId)}
                  className="text-gray-300 hover:text-red-500 p-1 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add new lot row */}
        {availableLots.length > 0 && (
          <div className="border border-dashed border-gray-200 rounded-xl p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase">Ajouter un lot</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={newLotId} onChange={e => setNewLotId(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                <option value="">— Sélectionner lot —</option>
                {availableLots.map(l => (
                  <option key={l.id} value={l.id}>{l.code} ({l.weightCurrent} kg)</option>
                ))}
              </select>
              <select value={newLotStatus} onChange={e => setNewLotStatus(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                {LOT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex gap-1.5 flex-wrap">
                {QUICK_KG.map(kg => (
                  <button key={kg} type="button" onClick={() => setNewLotKg(kg)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      newLotKg === kg ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600 hover:border-primary hover:text-primary"
                    }`}>
                    {kg} kg
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <StepperInput value={newLotKg} onChange={setNewLotKg} />
                </div>
                <button onClick={addLotStatus}
                  className="flex items-center gap-1.5 px-4 py-3 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90">
                  <Plus className="w-4 h-4" />Ajouter
                </button>
              </div>
            </div>
          </div>
        )}
        {availableLots.length === 0 && lotStatuses.length > 0 && (
          <p className="text-xs text-gray-400 text-center pt-2">Tous les lots actifs sont déjà dans le rapport</p>
        )}
      </SectionCard>

      {/* B. CONSOMMABLES */}
      <SectionCard label="Consommables utilisés" emoji="📊">
        {allConsumables.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">Aucun consommable configuré</p>
        ) : (
          <div className="space-y-4">
            {allConsumables.map(c => {
              const qty = usages[c.id] ?? 0;
              const isLow = c.stock <= c.minStock;
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{c.name}</p>
                      <p className={`text-xs ${isLow ? "text-red-500 font-medium" : "text-gray-400"}`}>
                        Stock : {c.stock} {c.unit}{isLow ? " ⚠ Faible" : ""}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-gray-700">{qty} {c.unit}</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex gap-1.5 flex-wrap">
                      {QUICK_KG.filter(k => k <= Math.max(c.stock, 10)).map(k => (
                        <button key={k} type="button"
                          onClick={() => saveUsage(c.id, k)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                            qty === k ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-500 hover:border-primary hover:text-primary"
                          }`}>
                          {k}
                        </button>
                      ))}
                    </div>
                    <StepperInput
                      value={qty} unit={c.unit} compact
                      onChange={v => saveUsage(c.id, v)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* C. ENTRÉES MARCHANDISE */}
      <SectionCard label="Entrées marchandise" emoji="📥">
        <div className="space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_KG.map(kg => (
              <button key={kg} type="button" onClick={() => handleReceivedChange(kg)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                  receivedKg === kg ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600 hover:border-primary hover:text-primary"
                }`}>
                {kg} kg
              </button>
            ))}
          </div>
          <StepperInput value={receivedKg} onChange={handleReceivedChange} step={5} />
          <p className="text-xs text-gray-400 text-center">Quantité de vanille reçue en kg</p>
        </div>
      </SectionCard>

      {/* D. PRÉPARATION */}
      <SectionCard label="Préparation / Conditionnement" emoji="📤">
        <div className="space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_KG.map(kg => (
              <button key={kg} type="button" onClick={() => handlePreparedChange(kg)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                  preparedKg === kg ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600 hover:border-primary hover:text-primary"
                }`}>
                {kg} kg
              </button>
            ))}
          </div>
          <StepperInput value={preparedKg} onChange={handlePreparedChange} step={5} />
          <p className="text-xs text-gray-400 text-center">Quantité préparée pour expédition en kg</p>
        </div>
      </SectionCard>

      {/* E. NOTES */}
      <SectionCard label="Notes & observations" emoji="📝">
        <textarea
          value={notes}
          onChange={e => handleNotesChange(e.target.value)}
          placeholder="Observations, incidents, qualité, météo…"
          rows={4}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </SectionCard>

      {/* Floating save bar (mobile) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between sm:hidden z-40">
        <div>
          {saving && <p className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Sauvegarde…</p>}
          {!saving && lastSaved && <p className="text-xs text-green-600">✓ Sauvegardé {lastSaved.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>}
          {!saving && !lastSaved && <p className="text-xs text-gray-400">Non sauvegardé</p>}
        </div>
        <button onClick={manualSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
          <Save className="w-4 h-4" />Sauvegarder
        </button>
      </div>
    </div>
  );
}
