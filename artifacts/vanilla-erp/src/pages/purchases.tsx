import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import {
  ShoppingCart, TrendingUp, Weight, Users, AlertTriangle,
  Plus, Search, Download, Filter, ChevronDown, Loader2,
  Droplets, Star, Package, CreditCard, X,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt   = (n: number) => new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n ?? 0);
const fmtKg = (n: number) => `${n?.toFixed(1)} kg`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR");
const fmtDt   = (d: string) => new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Espèces", mobile_money: "Mobile Money", bank_transfer: "Virement bancaire",
  Espèces: "Espèces", Mvola: "Mvola", "Orange Money": "Orange Money",
  "Airtel Money": "Airtel Money", Virement: "Virement", Chèque: "Chèque",
};

const PAYMENT_OPTIONS = [
  { value: "cash",          label: "Espèces" },
  { value: "mobile_money",  label: "Mvola / Orange / Airtel" },
  { value: "bank_transfer", label: "Virement bancaire" },
];

function qualityInfo(humidity: number) {
  if (humidity < 35) return { label: "Excellent", color: "text-emerald-700", bg: "bg-emerald-100", dot: "bg-emerald-500" };
  if (humidity < 40) return { label: "Bon",       color: "text-blue-700",    bg: "bg-blue-100",    dot: "bg-blue-500" };
  if (humidity < 45) return { label: "Correct",   color: "text-amber-700",   bg: "bg-amber-100",   dot: "bg-amber-500" };
  return                    { label: "Risqué",    color: "text-red-600",     bg: "bg-red-100",     dot: "bg-red-500" };
}

function HumidityBadge({ humidity }: { humidity: number }) {
  const qi = qualityInfo(humidity);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${qi.bg} ${qi.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${qi.dot}`}/>
      {humidity}%
    </span>
  );
}

function downloadCSV(rows: any[]) {
  const cols = ["Date","Fournisseur","Poids (kg)","Prix/kg (Ar)","Humidité %","Lot","Paiement","Total (Ar)"];
  const csv = ["\ufeff" + cols.join(";"), ...rows.map(r => [
    fmtDate(r.created_at), r.supplier_name ?? r.supplier?.name ?? "—",
    r.weight, r.price_per_kg, r.humidity, r.lot_code ?? "—",
    PAYMENT_LABELS[r.payment_method] ?? r.payment_method, r.total_amount,
  ].join(";"))].join("\n");
  Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })),
    download: "achats.csv",
  }).click();
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color = "text-gray-900", bg = "bg-white" }: any) {
  return (
    <div className={`${bg} border border-gray-200 rounded-xl p-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-500">{label}</p>
        <Icon className={`w-4 h-4 opacity-60 ${color}`}/>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Form modal ───────────────────────────────────────────────────────────────
function PurchaseForm({ suppliers, onClose, onSuccess }: { suppliers: any[]; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    supplierId: "", weight: "", pricePerKg: "", totalAmount: "",
    humidity: "38", paymentMethod: "cash",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => {
    const next = { ...form, [k]: v };
    // Auto-calculate total
    if (k === "weight" || k === "pricePerKg") {
      const w = k === "weight" ? parseFloat(v) : parseFloat(form.weight);
      const p = k === "pricePerKg" ? parseFloat(v) : parseFloat(form.pricePerKg);
      if (!isNaN(w) && !isNaN(p)) next.totalAmount = String(Math.round(w * p));
    }
    setForm(next);
  };

  const createMutation = useMutation({
    mutationFn: (body: any) => fetch("/api/purchases", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: (data: any) => {
      toast.success(`Achat enregistré — Lot ${data?.lot?.code ?? ""} créé`);
      onSuccess();
      onClose();
    },
    onError: (err: any) => toast.error(String(err.message)),
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.supplierId)              e.supplierId  = "Fournisseur requis";
    if (!form.weight || parseFloat(form.weight) <= 0)         e.weight    = "Poids requis";
    if (!form.pricePerKg || parseFloat(form.pricePerKg) <= 0) e.pricePerKg = "Prix requis";
    if (!form.humidity || parseFloat(form.humidity) < 0)      e.humidity  = "Humidité requise";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    createMutation.mutate({
      supplierId:    form.supplierId,
      weight:        parseFloat(form.weight),
      pricePerKg:    parseFloat(form.pricePerKg),
      totalAmount:   parseFloat(form.totalAmount) || Math.round(parseFloat(form.weight) * parseFloat(form.pricePerKg)),
      paymentMethod: form.paymentMethod,
      humidity:      parseFloat(form.humidity),
    });
  };

  const humidity = parseFloat(form.humidity) || 0;
  const qi = qualityInfo(humidity);
  const supplier = suppliers.find(s => s.id === form.supplierId);

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none";
  const errCls   = "text-red-400 text-xs mt-0.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-white"/>
            <h2 className="text-white font-bold">Nouvel achat matière première</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
          {/* Supplier */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Fournisseur *</label>
            <select value={form.supplierId} onChange={e => set("supplierId", e.target.value)} className={inputCls}>
              <option value="">— Sélectionner —</option>
              {suppliers.filter(s => s.supplierType === "GOODS" || !s.supplierType).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} {s.supplierCode ? `(${s.supplierCode})` : ""} — {s.region || s.city || ""}</option>
              ))}
            </select>
            {errors.supplierId && <p className={errCls}>{errors.supplierId}</p>}
          </div>

          {/* Weight + humidity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Poids (kg) *</label>
              <input type="number" step="0.1" min="0" value={form.weight}
                onChange={e => set("weight", e.target.value)} className={inputCls} placeholder="Ex : 150"/>
              {errors.weight && <p className={errCls}>{errors.weight}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 flex items-center justify-between">
                <span>Humidité % *</span>
                <span className={`text-xs font-bold ${qi.color}`}>{qi.label}</span>
              </label>
              <input type="number" step="0.5" min="0" max="100" value={form.humidity}
                onChange={e => set("humidity", e.target.value)} className={inputCls}/>
              {errors.humidity && <p className={errCls}>{errors.humidity}</p>}
              {/* Humidity indicator bar */}
              <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${humidity < 35 ? "bg-emerald-500" : humidity < 40 ? "bg-blue-500" : humidity < 45 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(100, (humidity / 60) * 100)}%` }}/>
              </div>
            </div>
          </div>

          {/* Price per kg + total */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Prix / kg (Ar) *</label>
              <input type="number" step="500" min="0" value={form.pricePerKg}
                onChange={e => set("pricePerKg", e.target.value)} className={inputCls} placeholder="Ex : 40000"/>
              {errors.pricePerKg && <p className={errCls}>{errors.pricePerKg}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Total (Ar)</label>
              <input type="number" value={form.totalAmount} onChange={e => set("totalAmount", e.target.value)}
                className={inputCls + " bg-gray-50 font-semibold"} placeholder="Auto-calculé"/>
              <p className="text-xs text-gray-400 mt-0.5">Auto-calculé · modifiable</p>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Mode de paiement</label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => set("paymentMethod", opt.value)}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${form.paymentMethod === opt.value ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary card */}
          {form.weight && form.pricePerKg && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-emerald-700 mb-2">Résumé de l'achat</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-gray-500">Poids</p>
                  <p className="font-bold text-gray-800">{parseFloat(form.weight) || 0} kg</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Prix / kg</p>
                  <p className="font-bold text-gray-800">{fmt(parseFloat(form.pricePerKg))} Ar</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="font-bold text-emerald-700 text-base">{fmt(parseFloat(form.totalAmount))} Ar</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Un lot <span className="font-mono font-bold">VAN-{new Date().getFullYear()}-XXXX</span> sera créé automatiquement
                {supplier && <> · Fournisseur : <strong>{supplier.name}</strong></>}
              </p>
            </div>
          )}

          {/* Quality warning */}
          {humidity > 45 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5"/>
              <p className="text-xs text-red-700">
                <strong>Alerte qualité :</strong> Humidité {humidity}% dépasse le seuil acceptable de 45%. Risque de moisissure — vérifier avant validation.
              </p>
            </div>
          )}

          {/* Accounting note */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
            <strong>Écritures automatiques PCG 2005 :</strong> D<strong>601</strong> (Achats) · D<strong>44566</strong> (TVA déductible) · C<strong>401</strong> (Fournisseur)
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              Annuler
            </button>
            <button onClick={handleSubmit} disabled={createMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>}
              {createMutation.isPending ? "Enregistrement…" : "Enregistrer l'achat"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Purchases() {
  const qc = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [showAlerts, setShowAlerts] = useState(true);

  // Queries
  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["purchases-list"],
    queryFn: () => fetch("/api/purchases", { credentials: "include" }).then(r => r.json()),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: () => fetch("/api/suppliers", { credentials: "include" }).then(r => r.json()),
  });
  const suppliers: any[] = Array.isArray(suppliersData) ? suppliersData : (suppliersData as any)?.suppliers ?? [];

  const { data: analytics } = useQuery({
    queryKey: ["purchases-analytics"],
    queryFn: () => fetch("/api/purchases/analytics", { credentials: "include" }).then(r => r.json()),
  });

  const kpis = analytics?.kpis ?? {};
  const monthly: any[] = analytics?.monthly ?? [];
  const topSuppliers: any[] = analytics?.topSuppliers ?? [];
  const qualityAlerts: any[] = analytics?.alerts?.quality ?? [];
  const priceAlerts: any[] = analytics?.alerts?.price ?? [];
  const totalAlerts = qualityAlerts.length + priceAlerts.length;

  // Filters
  const purchasesList: any[] = Array.isArray(purchases) ? purchases : [];
  const supplierNames = useMemo(() => [...new Set(purchasesList.map(p => p.supplier_name || p.supplier?.name).filter(Boolean))].sort(), [purchasesList]);

  const filtered = useMemo(() => purchasesList.filter(p => {
    const q = search.toLowerCase();
    const sName = (p.supplier_name || p.supplier?.name || "").toLowerCase();
    const lotCode = (p.lot_code || "").toLowerCase();
    const matchSearch = !q || sName.includes(q) || lotCode.includes(q);
    const matchSupplier = filterSupplier === "all" || sName.includes(filterSupplier.toLowerCase());
    const matchPayment = filterPayment === "all" || p.payment_method === filterPayment;
    return matchSearch && matchSupplier && matchPayment;
  }), [purchasesList, search, filterSupplier, filterPayment]);

  const barColors = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444"];

  return (
    <div className="min-h-screen bg-gray-50">
      {isFormOpen && (
        <PurchaseForm
          suppliers={suppliers}
          onClose={() => setIsFormOpen(false)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ["purchases-list"] }); qc.invalidateQueries({ queryKey: ["purchases-analytics"] }); }}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Achats</h1>
              <p className="text-xs text-gray-400 mt-0.5">Matières premières vanille · liaisons stock, lots et comptabilité automatiques</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => downloadCSV(filtered)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <Download className="w-3.5 h-3.5"/>Export CSV
              </button>
              <button onClick={() => setIsFormOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
                <Plus className="w-4 h-4"/>Nouvel achat
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <KpiCard label="Total achats" value={fmt(kpis.total) + " Ar"} icon={TrendingUp} bg="bg-emerald-50" color="text-emerald-700"/>
          <KpiCard label="Kg achetés" value={kpis.kgTotal ? kpis.kgTotal.toFixed(1) + " kg" : "—"} icon={Weight} color="text-blue-700" bg="bg-blue-50"/>
          <KpiCard label="Prix moyen / kg" value={kpis.avgPrice ? fmt(kpis.avgPrice) + " Ar" : "—"} sub={`Min: ${fmt(kpis.prixMin)} · Max: ${fmt(kpis.prixMax)}`} icon={ShoppingCart}/>
          <KpiCard label="Humidité moy." value={kpis.avgHumidity ? kpis.avgHumidity.toFixed(1) + "%" : "—"} icon={Droplets} color={kpis.avgHumidity > 44 ? "text-red-600" : "text-gray-800"}/>
          <KpiCard label="Achats enregistrés" value={kpis.nb ?? 0} icon={Package} color="text-gray-700"/>
          <KpiCard label="Fournisseurs actifs" value={kpis.nbSuppliers ?? 0} icon={Users} color="text-purple-700" bg="bg-purple-50"/>
        </div>

        {/* Alerts */}
        {showAlerts && totalAlerts > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500"/>
                <span className="text-sm font-semibold text-amber-800">{totalAlerts} alerte(s) détectée(s)</span>
              </div>
              <button onClick={() => setShowAlerts(false)} className="text-amber-400 hover:text-amber-600">
                <X className="w-4 h-4"/>
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {qualityAlerts.map((a: any) => (
                <div key={a.id} className="bg-white border border-red-200 rounded-lg p-3 flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-red-500 shrink-0"/>
                  <div className="text-xs">
                    <span className="font-semibold text-gray-800">{a.supplier_name ?? "?"}</span>
                    <span className="text-red-600 ml-1">Humidité {Number(a.humidity).toFixed(1)}%</span>
                    <span className="text-gray-400 ml-1">· {fmtDate(a.created_at)}</span>
                  </div>
                </div>
              ))}
              {priceAlerts.map((a: any) => (
                <div key={a.id} className="bg-white border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-500 shrink-0"/>
                  <div className="text-xs">
                    <span className="font-semibold text-gray-800">{a.supplier_name ?? "?"}</span>
                    <span className="text-amber-700 ml-1">{fmt(Number(a.price_per_kg))} Ar/kg</span>
                    <span className="text-gray-400 ml-1">· +{Math.round((Number(a.price_per_kg) / Number(a.avg_price) - 1) * 100)}% vs moy.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analytics row */}
        {monthly.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Price evolution chart */}
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Évolution du prix moyen / kg</h3>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={monthly} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
                  <defs>
                    <linearGradient id="prixGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#d1d5db"/>
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} stroke="#d1d5db"/>
                  <Tooltip formatter={(v: number) => [`${fmt(v)} Ar/kg`, "Prix moyen"]} labelStyle={{ fontSize: 11 }}/>
                  <Area type="monotone" dataKey="avg_price" stroke="#10b981" fill="url(#prixGrad)" strokeWidth={2}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Top suppliers */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Top fournisseurs</h3>
              <div className="space-y-3">
                {topSuppliers.map((s: any, i: number) => {
                  const maxTotal = Number(topSuppliers[0]?.total ?? 1);
                  const pct = Math.round((Number(s.total) / maxTotal) * 100);
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-gray-700 truncate max-w-28">{s.name}</span>
                        <span className="text-gray-500 font-mono">{fmtKg(Number(s.kg))}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColors[i] }}/>
                      </div>
                      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                        <span>{s.nb} achat(s)</span>
                        <span>{fmt(Number(s.total))} Ar</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher fournisseur, lot…"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"/>
            </div>
            <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="all">Tous les fournisseurs</option>
              {supplierNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="all">Tous les paiements</option>
              {PAYMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="text-xs text-gray-400 ml-auto">{filtered.length} achat(s)</span>
          </div>
        </div>

        {/* Purchases table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Date","Fournisseur","Poids","Prix / kg","Humidité","Lot","Paiement","Total (Ar)"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={8} className="py-12 text-center text-gray-300">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2"/>Chargement…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center">
                  <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-20"/>
                  <p className="text-gray-300">Aucun achat enregistré</p>
                  <button onClick={() => setIsFormOpen(true)}
                    className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                    Enregistrer un achat
                  </button>
                </td></tr>
              ) : filtered.map((p: any) => {
                const supplierName = p.supplier_name || p.supplier?.name || "—";
                const pm = PAYMENT_LABELS[p.payment_method] ?? p.payment_method;
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(p.created_at || p.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{supplierName}</div>
                      {p.supplier_code && <div className="text-xs text-gray-400 font-mono">{p.supplier_code}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{p.weight} kg</td>
                    <td className="px-4 py-3 font-mono text-xs">{fmt(p.price_per_kg || p.pricePerKg)} Ar</td>
                    <td className="px-4 py-3"><HumidityBadge humidity={p.humidity}/></td>
                    <td className="px-4 py-3">
                      {(p.lot_code || p.lotId)
                        ? <span className="font-mono text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{p.lot_code ?? "lié"}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{pm}</td>
                    <td className="px-4 py-3 font-mono font-bold text-gray-900">{fmt(p.total_amount || p.totalAmount)} Ar</td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-gray-700 uppercase">Total ({filtered.length})</td>
                  <td className="px-4 py-2.5 font-mono font-bold text-xs text-gray-700">
                    {filtered.reduce((s: number, p: any) => s + Number(p.weight), 0).toFixed(1)} kg
                  </td>
                  <td colSpan={4}/>
                  <td className="px-4 py-2.5 font-mono font-bold text-gray-900">
                    {fmt(filtered.reduce((s: number, p: any) => s + Number(p.total_amount || p.totalAmount), 0))} Ar
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Accounting reminder */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700">
          <p><strong>Comptabilité PCG 2005 :</strong> Chaque achat génère automatiquement des écritures :</p>
          <p className="mt-1">→ Débit <strong>601</strong> (Achats matières HT) · Débit <strong>44566</strong> (TVA déductible 20%) · Crédit <strong>401</strong> (Fournisseurs)</p>
          <p className="mt-1">→ Un lot <strong>VAN-YYYY-XXXX</strong> et un mouvement de stock <strong>IN</strong> sont créés en cascade</p>
        </div>
      </div>
    </div>
  );
}
