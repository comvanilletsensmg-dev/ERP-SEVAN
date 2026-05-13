import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDepreciateAsset } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import {
  ArrowLeft, Package, Building2, Car, Monitor, HelpCircle,
  CheckCircle2, BarChart3, Archive, Wrench, TrendingDown,
  MapPin, User, Link2, Tag, Calendar, Hash, Receipt,
  AlertTriangle, ChevronDown, ChevronUp, Plus, Trash2,
} from "lucide-react";
import { toast } from "sonner";

/* ─── types ───────────────────────────────────────────────────────────────────── */
interface Asset {
  id: string; name: string; assetNumber: string | null; category: string;
  value: number; residualValue: number; accumulatedDepreciation: number;
  startDate: string; durationMonths: number; currency: string;
  status: string; notes: string | null; pcgAccount: string | null;
  acquisitionType: string | null; serialNumber: string | null; location: string | null;
  purchaseId: string | null; supplierId: string | null; lotId: string | null;
  responsibleId: string | null; lastMaintenanceDate: string | null;
  nextMaintenanceDate: string | null; disposalDate: string | null; disposalValue: number | null;
  createdAt: string;
}
interface AmortRow {
  year: number; grossValue: number; openingNetValue: number;
  depreciation: number; accumulatedDepreciation: number;
  closingNetValue: number; isPast: boolean; isCurrent: boolean; isPosted: boolean;
}
interface MaintenanceRecord {
  id: string; assetId: string; date: string; description: string;
  cost: number; type: string; technician: string | null; nextMaintenanceDate: string | null;
}
interface AssetDetailData {
  asset: Asset; depreciationTable: AmortRow[]; maintenance: MaintenanceRecord[];
  journalEntries: any[]; supplier: any; employee: any; purchase: any; lot: any;
  computed: { currentNetValue: number; pctDepreciated: number; monthlyDotation: number };
}

type MaintenanceForm = { date: string; description: string; cost: number; type: string; technician: string; nextMaintenanceDate: string };

/* ─── helpers ──────────────────────────────────────────────────────────────────── */
const fmt = (n: number) => new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";

const CATEGORIES: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  equipment: { label: "Équipement",  icon: Monitor,   color: "bg-blue-100 text-blue-700" },
  vehicle:   { label: "Véhicule",    icon: Car,       color: "bg-purple-100 text-purple-700" },
  building:  { label: "Bâtiment",    icon: Building2, color: "bg-orange-100 text-orange-700" },
  furniture: { label: "Mobilier",    icon: Package,   color: "bg-teal-100 text-teal-700" },
  other:     { label: "Autre",       icon: HelpCircle, color: "bg-gray-100 text-gray-600" },
};
const MAINT_TYPES: Record<string, string> = {
  preventive: "Préventive", corrective: "Corrective", inspection: "Inspection",
};
const MAINT_TYPE_CLS: Record<string, string> = {
  preventive: "bg-blue-100 text-blue-700",
  corrective: "bg-red-100 text-red-700",
  inspection: "bg-green-100 text-green-700",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; Icon: React.ElementType }> = {
    active:             { cls: "bg-emerald-100 text-emerald-700", label: "Actif",   Icon: CheckCircle2 },
    fully_depreciated:  { cls: "bg-orange-100 text-orange-700",  label: "Amorti",  Icon: BarChart3 },
    disposed:           { cls: "bg-gray-100 text-gray-500",      label: "Cédé",    Icon: Archive },
  };
  const { cls, label, Icon } = map[status] ?? map.active;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>
      <Icon className="w-3.5 h-3.5"/>{label}
    </span>
  );
}

const TABS = ["Général", "Amortissement", "Maintenance", "Comptabilité", "Liaisons"] as const;
type Tab = typeof TABS[number];

/* ─── component ──────────────────────────────────────────────────────────────────── */
export default function AssetDetail({ id }: { id: string }) {
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const depreciateAsset = useDepreciateAsset();

  const [activeTab, setActiveTab] = useState<Tab>("Général");
  const [showMaintForm, setShowMaintForm] = useState(false);
  const [showDisposeModal, setShowDisposeModal] = useState(false);
  const [expandedYear, setExpandedYear] = useState<number | null>(null);

  const { register: rMaint, handleSubmit: hMaint, reset: resetMaint } = useForm<MaintenanceForm>({
    defaultValues: { type: "preventive", cost: 0 },
  });

  const { data, isLoading, refetch } = useQuery<AssetDetailData>({
    queryKey: ["asset-detail", id],
    queryFn: async () => {
      const r = await fetch(`/api/assets/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Actif introuvable");
      return r.json();
    },
  });

  const addMaintenance = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch(`/api/assets/${id}/maintenance`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Erreur");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Maintenance enregistrée");
      setShowMaintForm(false);
      resetMaint({ type: "preventive", cost: 0 });
      refetch();
      qc.invalidateQueries({ queryKey: ["assets-dashboard"] });
    },
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });

  const dispose = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch(`/api/assets/${id}/dispose`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Erreur");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Actif sorti de l'inventaire. Écriture de cession créée.");
      setShowDisposeModal(false);
      refetch();
    },
    onError: () => toast.error("Erreur lors de la cession"),
  });

  const handleDepreciate = async () => {
    try {
      await depreciateAsset.mutateAsync({ id });
      toast.success("Dotation mensuelle passée (681 / 281)");
      refetch();
    } catch {
      toast.error("Erreur lors de la dotation");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"/>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-500">Actif introuvable</p>
        <button onClick={() => nav("/accounting/assets")} className="mt-2 text-sm text-emerald-600 hover:underline">← Retour</button>
      </div>
    );
  }

  const { asset, depreciationTable, maintenance, journalEntries, supplier, employee, purchase, lot, computed } = data;
  const catInfo = CATEGORIES[asset.category] ?? CATEGORIES.other;
  const CatIcon = catInfo.icon;
  const pct = Math.min(100, computed.pctDepreciated);
  const totalMaintenanceCost = maintenance.reduce((s, m) => s + m.cost, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => nav("/accounting/assets")}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
              <ArrowLeft className="w-4 h-4"/>Retour
            </button>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${catInfo.color} shrink-0`}>
                <CatIcon className="w-7 h-7"/>
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  {asset.assetNumber && (
                    <span className="font-mono text-sm text-gray-400 font-bold">{asset.assetNumber}</span>
                  )}
                  <h1 className="text-xl font-bold text-gray-900">{asset.name}</h1>
                  <StatusBadge status={asset.status}/>
                  {asset.pcgAccount && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-mono">Compte {asset.pcgAccount}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                  <span>{catInfo.label}</span>
                  {asset.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/>{asset.location}</span>}
                  {asset.serialNumber && <span className="flex items-center gap-1"><Hash className="w-3 h-3"/>{asset.serialNumber}</span>}
                  <span>Mis en service le {fmtDate(asset.startDate)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {asset.status === "active" && (
                <>
                  <button onClick={handleDepreciate} disabled={depreciateAsset.isPending}
                    className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60">
                    <TrendingDown className="w-4 h-4"/>
                    {depreciateAsset.isPending ? "…" : "Passer dotation"}
                  </button>
                  <button onClick={() => setShowDisposeModal(true)}
                    className="flex items-center gap-2 px-3 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors">
                    <Archive className="w-4 h-4"/>Céder l'actif
                  </button>
                </>
              )}
            </div>
          </div>

          {/* VNC bar */}
          <div className="mt-4 grid grid-cols-3 gap-4">
            {[
              { label: "Valeur brute", value: fmt(asset.value) + " Ar", cls: "text-gray-800" },
              { label: "Amort. cumulé", value: fmt(asset.accumulatedDepreciation) + " Ar", cls: "text-orange-600" },
              { label: "VNC actuelle", value: fmt(computed.currentNetValue) + " Ar", cls: "text-emerald-700 font-bold" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className={`text-sm font-semibold ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Progression amortissement</span>
              <span>{pct.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${pct >= 100 ? "bg-gray-400" : pct >= 75 ? "bg-orange-400" : "bg-emerald-400"}`}
                style={{ width: `${pct}%` }}/>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-0 border-b border-gray-200">
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-emerald-500 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {tab}
                {tab === "Maintenance" && maintenance.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{maintenance.length}</span>
                )}
                {tab === "Comptabilité" && journalEntries.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{journalEntries.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* ── Tab: Général ────────────────────────────────────────────────────── */}
        {activeTab === "Général" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Informations générales */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Tag className="w-4 h-4 text-gray-400"/>Informations générales
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: "N° Immobilisation", value: asset.assetNumber ?? "—" },
                  { label: "Compte PCG", value: asset.pcgAccount ? `${asset.pcgAccount}` : "—" },
                  { label: "Catégorie", value: catInfo.label },
                  { label: "Type acquisition", value: asset.acquisitionType === "purchase" ? "Achat" : asset.acquisitionType === "donation" ? "Donation" : "Apport en nature" },
                  { label: "N° de série", value: asset.serialNumber ?? "—" },
                  { label: "Devise", value: asset.currency },
                  { label: "Date mise en service", value: fmtDate(asset.startDate) },
                  { label: "Durée amortissement", value: `${asset.durationMonths} mois (${(asset.durationMonths / 12).toFixed(1)} ans)` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="font-medium text-gray-800">{value}</p>
                  </div>
                ))}
              </div>
              {asset.notes && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">Notes</p>
                  <p className="text-sm text-gray-600">{asset.notes}</p>
                </div>
              )}
            </div>

            {/* Valeurs financières */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-gray-400"/>Valeurs financières
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: "Valeur d'acquisition", value: fmt(asset.value) + " Ar", cls: "text-gray-900" },
                  { label: "Valeur résiduelle", value: fmt(asset.residualValue) + " Ar", cls: "text-gray-900" },
                  { label: "Amort. cumulés", value: fmt(asset.accumulatedDepreciation) + " Ar", cls: "text-orange-600" },
                  { label: "VNC actuelle", value: fmt(computed.currentNetValue) + " Ar", cls: "text-emerald-700 font-bold" },
                  { label: "Dotation mensuelle", value: fmt(computed.monthlyDotation) + " Ar", cls: "text-blue-600" },
                  { label: "Dotation annuelle", value: fmt(computed.monthlyDotation * 12) + " Ar", cls: "text-blue-600" },
                ].map(({ label, value, cls }) => (
                  <div key={label}>
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className={`font-semibold ${cls}`}>{value}</p>
                  </div>
                ))}
              </div>
              {asset.status === "disposed" && (
                <div className="pt-2 border-t border-gray-100 space-y-1">
                  <p className="text-xs font-medium text-red-600">Actif cédé</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><p className="text-xs text-gray-400">Date cession</p><p className="font-medium">{fmtDate(asset.disposalDate)}</p></div>
                    <div><p className="text-xs text-gray-400">Valeur cession</p><p className="font-medium">{fmt(asset.disposalValue ?? 0)} Ar</p></div>
                  </div>
                </div>
              )}
            </div>

            {/* Localisation + Responsable */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400"/>Localisation & Responsable
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Site / Localisation</p>
                  <p className="font-medium text-gray-800">{asset.location ?? "—"}</p>
                </div>
                {employee ? (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-emerald-600"/>
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{(employee as any).name}</p>
                      <p className="text-xs text-gray-400">{(employee as any).position}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-400 italic text-xs">Aucun responsable assigné</p>
                )}
              </div>
            </div>

            {/* Maintenance summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-gray-400"/>Suivi maintenance
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Interventions</p>
                  <p className="font-bold text-gray-900">{maintenance.length}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Coût total maintenance</p>
                  <p className="font-bold text-red-600">{fmt(totalMaintenanceCost)} Ar</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Dernière maintenance</p>
                  <p className="font-medium">{fmtDate(asset.lastMaintenanceDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Prochaine maintenance</p>
                  <p className={`font-medium ${asset.nextMaintenanceDate ? "text-amber-600" : "text-gray-400"}`}>
                    {fmtDate(asset.nextMaintenanceDate)}
                  </p>
                </div>
              </div>
              {asset.nextMaintenanceDate && new Date(asset.nextMaintenanceDate) <= new Date(Date.now() + 30 * 86400000) && (
                <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0"/>
                  <p className="text-xs text-amber-700">Maintenance à planifier dans 30 jours</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Amortissement ──────────────────────────────────────────────── */}
        {activeTab === "Amortissement" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">Tableau d'amortissement linéaire — PCG 2005</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Taux : {((1 / (asset.durationMonths / 12)) * 100).toFixed(2)}% · Dotation annuelle : {fmt(computed.monthlyDotation * 12)} Ar
                </p>
              </div>
              {asset.status === "active" && (
                <button onClick={handleDepreciate} disabled={depreciateAsset.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                  <TrendingDown className="w-4 h-4"/>
                  {depreciateAsset.isPending ? "Dotation…" : "Passer dotation mensuelle"}
                </button>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["Exercice", "Valeur brute", "VNC début", "Dotation exercice", "Amort. cumulés", "VNC fin", "Statut"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {depreciationTable.map(row => (
                    <tr key={row.year}
                      className={`transition-colors ${row.isCurrent ? "bg-emerald-50" : row.isPast ? "bg-gray-50/50" : "hover:bg-gray-50"}`}>
                      <td className="px-4 py-3 font-bold text-gray-800">
                        {row.year}
                        {row.isCurrent && <span className="ml-2 text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">En cours</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{fmt(row.grossValue)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{fmt(row.openingNetValue)}</td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-blue-700">{fmt(row.depreciation)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-orange-600">{fmt(row.accumulatedDepreciation)}</td>
                      <td className="px-4 py-3 font-mono text-sm font-bold text-emerald-700">{fmt(row.closingNetValue)}</td>
                      <td className="px-4 py-3">
                        {row.isPosted
                          ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="w-3 h-3"/>Passé</span>
                          : row.isPast
                            ? <span className="flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="w-3 h-3"/>À rattraper</span>
                            : <span className="text-xs text-gray-400">Prévu</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td className="px-4 py-3 font-bold text-xs text-gray-600 uppercase">Total</td>
                    <td className="px-4 py-3 font-mono font-bold text-gray-800">{fmt(asset.value)}</td>
                    <td/>
                    <td className="px-4 py-3 font-mono font-bold text-blue-700">
                      {fmt(depreciationTable.reduce((s, r) => s + r.depreciation, 0))}
                    </td>
                    <td/>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-700">{fmt(asset.residualValue)}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
              <strong>Méthode PCG 2005 linéaire :</strong> Débit 681 Dotations aux amortissements / Crédit 281 Amortissements des immobilisations.
              La dotation est passée mensuellement via le bouton "Passer dotation mensuelle" et génère une écriture journal validée.
            </div>
          </div>
        )}

        {/* ── Tab: Maintenance ────────────────────────────────────────────────── */}
        {activeTab === "Maintenance" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">Historique des maintenances</h3>
                <p className="text-xs text-gray-400">{maintenance.length} intervention(s) · Coût total : {fmt(totalMaintenanceCost)} Ar</p>
              </div>
              <button onClick={() => setShowMaintForm(v => !v)}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors">
                <Plus className="w-4 h-4"/>{showMaintForm ? "Fermer" : "Ajouter"}
              </button>
            </div>

            {/* Add maintenance form */}
            {showMaintForm && (
              <div className="bg-white rounded-xl border border-emerald-200 p-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-4">Nouvelle intervention</h4>
                <form onSubmit={hMaint(d => addMaintenance.mutate(d))} className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                    <input id="maint-date" type="date" {...rMaint("date", { required: true })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                    <select {...rMaint("type")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                      {Object.entries(MAINT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description *</label>
                    <input {...rMaint("description", { required: true })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="Remplacement courroie, nettoyage filtre…"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Coût (Ar)</label>
                    <input type="number" step="1" {...rMaint("cost")}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Technicien</label>
                    <input {...rMaint("technician")}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Nom ou société"/>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Prochaine maintenance prévue</label>
                    <input id="next-maint-date" type="date" {...rMaint("nextMaintenanceDate")}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"/>
                  </div>
                  <div className="col-span-2 flex gap-3">
                    <button type="button" onClick={() => setShowMaintForm(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                    <button type="submit" disabled={addMaintenance.isPending}
                      className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
                      {addMaintenance.isPending ? "Enregistrement…" : "Enregistrer"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Maintenance timeline */}
            {maintenance.length === 0 ? (
              <div className="text-center py-16 text-gray-300 bg-white rounded-xl border border-gray-200">
                <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30"/>
                <p>Aucune maintenance enregistrée</p>
              </div>
            ) : (
              <div className="space-y-2">
                {maintenance.map(m => (
                  <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 px-2 py-0.5 rounded text-xs font-semibold ${MAINT_TYPE_CLS[m.type] ?? "bg-gray-100 text-gray-600"}`}>
                          {MAINT_TYPES[m.type] ?? m.type}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">{m.description}</p>
                          <div className="flex gap-3 mt-0.5 text-xs text-gray-400">
                            <span>{fmtDate(m.date)}</span>
                            {m.technician && <span>· {m.technician}</span>}
                            {m.nextMaintenanceDate && <span className="text-amber-600">· Suivante : {fmtDate(m.nextMaintenanceDate)}</span>}
                          </div>
                        </div>
                      </div>
                      {m.cost > 0 && (
                        <span className="text-sm font-bold text-red-600 shrink-0">{fmt(m.cost)} Ar</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Comptabilité ───────────────────────────────────────────────── */}
        {activeTab === "Comptabilité" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-800">Écritures comptables liées</h3>
              <p className="text-xs text-gray-400 mt-0.5">Dotations 681/281 passées automatiquement</p>
            </div>
            {journalEntries.length === 0 ? (
              <div className="text-center py-16 text-gray-300 bg-white rounded-xl border border-gray-200">
                <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30"/>
                <p>Aucune écriture enregistrée</p>
                <p className="text-xs mt-1">Passez des dotations depuis l'onglet Amortissement</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {["Date", "Référence", "Description", "Débit", "Crédit", "Statut"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {journalEntries.map((e: any) => (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(e.date)}</td>
                        <td className="px-4 py-3 font-mono text-xs font-bold text-gray-700">{e.reference}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={e.description}>{e.description}</td>
                        <td className="px-4 py-3 font-mono text-xs text-blue-700">{fmt(Number(e.debit))}</td>
                        <td className="px-4 py-3 font-mono text-xs text-orange-600">{fmt(Number(e.credit))}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${e.status === "validated" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                            {e.status === "validated" ? "Validé" : "Brouillon"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* PCG info */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 grid grid-cols-2 gap-4">
              <div>
                <p className="font-semibold mb-1">Compte d'actif</p>
                <p className="font-mono text-sm">{asset.pcgAccount ?? "218"}</p>
                <p className="text-gray-400 mt-0.5">Immobilisation corporelle</p>
              </div>
              <div>
                <p className="font-semibold mb-1">Écritures d'amortissement</p>
                <p className="font-mono">Débit <strong>681</strong> Dotations aux amortissements</p>
                <p className="font-mono">Crédit <strong>281</strong> Amortissements des immobilisations</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Liaisons ───────────────────────────────────────────────────── */}
        {activeTab === "Liaisons" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-800">Liaisons ERP</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Achat logistique */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-blue-600"/>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Achat logistique</p>
                    <p className="text-xs text-gray-400">Origine de l'acquisition</p>
                  </div>
                </div>
                {purchase ? (
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div><p className="text-xs text-gray-400">Montant</p><p className="font-bold text-gray-900">{fmt(Number(purchase.total_amount))} Ar</p></div>
                      <div><p className="text-xs text-gray-400">Mode paiement</p><p className="font-medium">{purchase.payment_method}</p></div>
                      <div><p className="text-xs text-gray-400">Date</p><p className="font-medium">{fmtDate(purchase.created_at)}</p></div>
                    </div>
                    {supplier && <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm">
                      <Link2 className="w-3.5 h-3.5 text-gray-400"/><span>{(supplier as any).name}</span>
                    </div>}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Aucun achat lié. Créez un actif depuis la logistique pour lier automatiquement.</p>
                )}
              </div>

              {/* Lot de vanille */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <Package className="w-4 h-4 text-green-600"/>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Lot de vanille</p>
                    <p className="text-xs text-gray-400">Affectation production</p>
                  </div>
                </div>
                {lot ? (
                  <div className="space-y-2 text-sm">
                    <div><p className="text-xs text-gray-400">Référence lot</p><p className="font-bold text-gray-900">{(lot as any).reference}</p></div>
                    <div><p className="text-xs text-gray-400">Statut</p>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">{(lot as any).status}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Aucun lot assigné.</p>
                )}
              </div>

              {/* Fournisseur */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-orange-600"/>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Fournisseur</p>
                    <p className="text-xs text-gray-400">Prestataire / constructeur</p>
                  </div>
                </div>
                {supplier ? (
                  <div className="text-sm">
                    <p className="font-bold text-gray-900">{(supplier as any).name}</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Aucun fournisseur lié.</p>
                )}
              </div>

              {/* Responsable RH */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                    <User className="w-4 h-4 text-violet-600"/>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Responsable actif</p>
                    <p className="text-xs text-gray-400">Employé gestionnaire</p>
                  </div>
                </div>
                {employee ? (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-violet-100 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-violet-600"/>
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{(employee as any).name}</p>
                      <p className="text-xs text-gray-400">{(employee as any).position}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Aucun responsable assigné.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dispose modal */}
      {showDisposeModal && (
        <DisposeModal
          assetName={asset.name}
          netBookValue={computed.currentNetValue}
          onConfirm={(v) => dispose.mutate(v)}
          onClose={() => setShowDisposeModal(false)}
          isPending={dispose.isPending}
        />
      )}
    </div>
  );
}

/* ─── DisposeModal ─────────────────────────────────────────────────────────────── */
function DisposeModal({ assetName, netBookValue, onConfirm, onClose, isPending }: {
  assetName: string; netBookValue: number;
  onConfirm: (v: any) => void; onClose: () => void; isPending: boolean;
}) {
  const { register, handleSubmit } = useForm({ defaultValues: { disposalDate: "", disposalValue: 0, notes: "" } });
  const fmt2 = (n: number) => new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <Archive className="w-5 h-5 text-red-500"/>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">Céder / Sortir de l'inventaire</h3>
            <p className="text-xs text-gray-400">{assetName}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit(onConfirm)} className="px-6 py-4 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
            VNC actuelle : <strong>{fmt2(netBookValue)} Ar</strong>. Une écriture de cession sera créée automatiquement (compte 675/775).
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date de cession *</label>
            <input id="disposal-date" type="date" {...register("disposalDate", { required: true })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Prix de cession (Ar)</label>
            <input type="number" step="1" {...register("disposalValue")}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none" placeholder="0 si mise au rebut"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Motif</label>
            <input {...register("notes")}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none" placeholder="Vente, rebut, obsolescence…"/>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
            <button type="submit" disabled={isPending}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
              {isPending ? "Cession…" : "Confirmer la cession"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
