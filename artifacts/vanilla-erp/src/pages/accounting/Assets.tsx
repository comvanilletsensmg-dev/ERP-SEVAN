import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCreateAsset } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import {
  Package, TrendingDown, BarChart3, AlertTriangle, Plus, ChevronRight,
  Wrench, Building2, Car, Monitor, HelpCircle, CheckCircle2, Clock, Archive,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORIES: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  equipment: { label: "Équipement",  icon: Monitor,   color: "bg-blue-100 text-blue-700" },
  vehicle:   { label: "Véhicule",    icon: Car,       color: "bg-purple-100 text-purple-700" },
  building:  { label: "Bâtiment",    icon: Building2, color: "bg-orange-100 text-orange-700" },
  furniture: { label: "Mobilier",    icon: Package,   color: "bg-teal-100 text-teal-700" },
  other:     { label: "Autre",       icon: HelpCircle, color: "bg-gray-100 text-gray-600" },
};

const ACQUISITION: Record<string, string> = {
  purchase: "Achat", donation: "Donation", contribution: "Apport",
};

const fmt = (n: number) => new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string | Date | null | undefined) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";

type AssetForm = {
  name: string; category: string; value: number; residualValue: number;
  startDate: string; durationMonths: number; currency: string; notes: string;
  location: string; serialNumber: string; acquisitionType: string;
};

export default function AssetsPage() {
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const createAsset = useCreateAsset();

  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "fully_depreciated" | "disposed">("all");
  const [filterCat, setFilterCat] = useState("all");

  const { register, handleSubmit, reset } = useForm<AssetForm>({
    defaultValues: { currency: "MGA", residualValue: 0, category: "equipment", acquisitionType: "purchase", durationMonths: 60 },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["assets-dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/assets/dashboard", { credentials: "include" });
      if (!r.ok) throw new Error("Erreur");
      return r.json() as Promise<{
        kpis: any; byCategory: any; upcomingMaintenance: any[]; assets: any[];
      }>;
    },
  });

  const onSubmit = async (formData: AssetForm) => {
    await createAsset.mutateAsync({
      data: {
        name: formData.name, category: formData.category,
        value: Number(formData.value), residualValue: Number(formData.residualValue ?? 0),
        startDate: formData.startDate, durationMonths: Number(formData.durationMonths),
        currency: formData.currency, notes: formData.notes || undefined, status: "active",
      },
    });
    toast.success("Actif créé");
    setShowModal(false);
    reset({ currency: "MGA", residualValue: 0, category: "equipment", acquisitionType: "purchase", durationMonths: 60 });
    qc.invalidateQueries({ queryKey: ["assets-dashboard"] });
  };

  const assets = data?.assets ?? [];
  const kpis = data?.kpis ?? {};
  const upcomingMaint = data?.upcomingMaintenance ?? [];

  const filtered = useMemo(() => assets.filter(a => {
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    if (filterCat !== "all" && a.category !== filterCat) return false;
    return true;
  }), [assets, filterStatus, filterCat]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"/>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Immobilisations</h1>
            <p className="text-xs text-gray-400 mt-0.5">PCG 2005 · Méthode linéaire · Amortissement automatique</p>
          </div>
          <button onClick={() => { reset(); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4"/>Nouvel actif
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: "Valeur brute", value: fmt(kpis.totalGross ?? 0) + " Ar", icon: Package, cls: "text-gray-800", bg: "bg-gray-50 border-gray-200" },
            { label: "Valeur nette", value: fmt(kpis.totalVNC ?? 0) + " Ar", icon: TrendingDown, cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
            { label: "Amort. cumulés", value: fmt(kpis.totalAmort ?? 0) + " Ar", icon: BarChart3, cls: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
            { label: "Dotation / mois", value: fmt(kpis.monthlyDotation ?? 0) + " Ar", icon: TrendingDown, cls: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
            { label: "Actifs", value: String(kpis.activeCount ?? 0), icon: CheckCircle2, cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
            { label: "Amortis / Cédés", value: `${kpis.fullyDepreciated ?? 0} / ${kpis.disposedCount ?? 0}`, icon: Archive, cls: "text-gray-500", bg: "bg-gray-50 border-gray-200" },
          ].map(({ label, value, icon: Icon, cls, bg }) => (
            <div key={label} className={`rounded-xl border p-4 ${bg}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${cls}`}/>
                <span className="text-xs text-gray-500">{label}</span>
              </div>
              <p className={`text-sm font-bold ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Alerts: upcoming maintenances */}
        {upcomingMaint.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="w-4 h-4 text-amber-600"/>
              <span className="text-sm font-semibold text-amber-700">Maintenances à planifier dans les 30 jours</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {upcomingMaint.map(a => (
                <button key={a.id} onClick={() => nav(`/accounting/assets/${a.id}`)}
                  className="px-3 py-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-medium hover:bg-amber-200 transition-colors">
                  {a.assetNumber ?? a.name} — {fmtDate(a.nextMaintenanceDate)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Category breakdown */}
        {Object.keys(data?.byCategory ?? {}).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Répartition par catégorie (VNC)</h3>
            <div className="flex gap-4 flex-wrap">
              {Object.entries(data!.byCategory).map(([cat, d]: any) => {
                const catInfo = CATEGORIES[cat] ?? CATEGORIES.other;
                const Icon = catInfo.icon;
                return (
                  <div key={cat} className="flex items-center gap-2 min-w-[140px]">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${catInfo.color}`}>
                      <Icon className="w-4 h-4"/>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{catInfo.label} ({d.count})</p>
                      <p className="text-sm font-bold text-gray-800">{fmt(d.value)} Ar</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {[
              { v: "all", l: "Tous" },
              { v: "active", l: "Actifs" },
              { v: "fully_depreciated", l: "Amortis" },
              { v: "disposed", l: "Cédés" },
            ].map(({ v, l }) => (
              <button key={v} onClick={() => setFilterStatus(v as any)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterStatus === v ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
            <button onClick={() => setFilterCat("all")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterCat === "all" ? "bg-gray-700 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
              Toutes catégories
            </button>
            {Object.entries(CATEGORIES).map(([k, { label }]) => (
              <button key={k} onClick={() => setFilterCat(k)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterCat === k ? "bg-gray-700 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Asset list */}
        <div className="grid gap-3">
          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-300 bg-white rounded-xl border border-gray-200">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30"/>
              <p>Aucune immobilisation</p>
            </div>
          )}
          {filtered.map(a => {
            const netValue = a.value - a.accumulatedDepreciation;
            const pct = a.value > 0 ? (a.accumulatedDepreciation / a.value) * 100 : 0;
            const catInfo = CATEGORIES[a.category] ?? CATEGORIES.other;
            const Icon = catInfo.icon;
            const StatusIcon = a.status === "active" ? CheckCircle2 : a.status === "fully_depreciated" ? BarChart3 : Archive;
            const statusCls = a.status === "active" ? "text-emerald-700 bg-emerald-100" : a.status === "fully_depreciated" ? "text-orange-700 bg-orange-100" : "text-gray-600 bg-gray-100";
            const statusLabel = a.status === "active" ? "Actif" : a.status === "fully_depreciated" ? "Amorti" : "Cédé";

            return (
              <button key={a.id} onClick={() => nav(`/accounting/assets/${a.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-emerald-300 hover:shadow-sm transition-all group">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${catInfo.color}`}>
                    <Icon className="w-5 h-5"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {a.assetNumber && <span className="font-mono text-xs text-gray-400">{a.assetNumber}</span>}
                      <h3 className="font-semibold text-gray-900">{a.name}</h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusCls}`}>
                        <StatusIcon className="w-3 h-3"/>{statusLabel}
                      </span>
                      {a.pcgAccount && <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-xs font-mono">{a.pcgAccount}</span>}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-xs">
                      <div><p className="text-gray-400">Valeur brute</p><p className="font-mono font-semibold text-gray-800">{fmt(a.value)} Ar</p></div>
                      <div><p className="text-gray-400">Amort. cumulé</p><p className="font-mono font-semibold text-orange-600">{fmt(a.accumulatedDepreciation)} Ar</p></div>
                      <div><p className="text-gray-400">VNC</p><p className="font-mono font-bold text-emerald-700">{fmt(netValue)} Ar</p></div>
                      <div><p className="text-gray-400">Durée</p><p className="font-mono">{a.durationMonths} mois · début {fmtDate(a.startDate)}</p></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Progression amortissement</span>
                        <span>{pct.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all ${pct >= 100 ? "bg-gray-400" : pct >= 75 ? "bg-orange-400" : "bg-emerald-400"}`}
                          style={{ width: `${Math.min(100, pct)}%` }}/>
                      </div>
                    </div>
                    {(a.location || a.nextMaintenanceDate) && (
                      <div className="flex gap-3 mt-2 text-xs text-gray-400">
                        {a.location && <span>📍 {a.location}</span>}
                        {a.nextMaintenanceDate && <span className="text-amber-600">🔧 Maintenance: {fmtDate(a.nextMaintenanceDate)}</span>}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 transition-colors shrink-0 mt-1"/>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Add modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center rounded-t-2xl">
              <h2 className="font-semibold text-gray-800">Nouvel actif immobilisé</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Désignation *</label>
                  <input id="asset-name" {...register("name", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ex: Séchoir industriel"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Catégorie</label>
                  <select {...register("category")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                    {Object.entries(CATEGORIES).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type d'acquisition</label>
                  <select {...register("acquisitionType")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                    {Object.entries(ACQUISITION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Valeur d'acquisition (Ar) *</label>
                  <input type="number" step="1" {...register("value", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="12000000"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Valeur résiduelle (Ar)</label>
                  <input type="number" step="1" {...register("residualValue")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date de mise en service *</label>
                  <input id="asset-start-date" type="date" {...register("startDate", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Durée (mois) *</label>
                  <input type="number" {...register("durationMonths", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="60"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">N° de série</label>
                  <input {...register("serialNumber")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="SN-2025-001"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Localisation / Site</label>
                  <input {...register("location")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Usine Sambava"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <textarea {...register("notes")} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"/>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                <button type="submit" disabled={createAsset.isPending} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
                  {createAsset.isPending ? "Création…" : "Créer l'actif"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
