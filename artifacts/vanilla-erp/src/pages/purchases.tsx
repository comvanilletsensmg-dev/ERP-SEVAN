import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  ShoppingCart, Plus, Search, Download, Trash2, RefreshCw,
  Package, Leaf, Monitor, Building2, Wrench, FileText,
  TrendingUp, AlertTriangle, CheckCircle2, Clock, Truck,
  BookOpen, ChevronRight, X, Eye, PlayCircle,
  BarChart3, List, Filter, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Purchase {
  id: string; type: string; category: string | null; description: string | null;
  reference: string | null; currency: string; amount_ht: number | null;
  vat_rate: number | null; vat_amount: number | null; amount_ttc: number | null;
  quantity: number | null; unit: string | null; unit_price: number | null;
  weight: number; price_per_kg: number; total_amount: number; humidity: number;
  warehouse: string | null; payment_method: string; status: string;
  purchase_date: string | null; notes: string | null;
  lot_id: string | null; fixed_asset_id: string | null; journal_entry_id: string | null;
  created_at: string;
  supplier_id: string; supplier_name: string; supplier_code: string | null; supplier_region: string | null;
  lot_code: string | null; lot_status: string | null;
  asset_name: string | null; asset_number: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const TYPES = [
  { key: "VANILLE",       label: "Vanille",         icon: Leaf,      color: "bg-emerald-100 text-emerald-700 border-emerald-200",  dot: "bg-emerald-500" },
  { key: "CONSOMMABLE",   label: "Consommable",      icon: Package,   color: "bg-blue-100 text-blue-700 border-blue-200",           dot: "bg-blue-500" },
  { key: "BUREAU",        label: "Bureau",           icon: FileText,  color: "bg-amber-100 text-amber-700 border-amber-200",        dot: "bg-amber-500" },
  { key: "INFORMATIQUE",  label: "Informatique",     icon: Monitor,   color: "bg-violet-100 text-violet-700 border-violet-200",     dot: "bg-violet-500" },
  { key: "IMMOBILISATION",label: "Immobilisation",   icon: Building2, color: "bg-rose-100 text-rose-700 border-rose-200",           dot: "bg-rose-500" },
  { key: "SERVICE",       label: "Service",          icon: Wrench,    color: "bg-slate-100 text-slate-700 border-slate-200",        dot: "bg-slate-500" },
];

const STATUSES = [
  { key: "brouillon",    label: "Brouillon",   color: "bg-gray-100 text-gray-600 border-gray-200",    dot: "bg-gray-400",    icon: FileText },
  { key: "valide",       label: "Validé",      color: "bg-blue-100 text-blue-700 border-blue-200",    dot: "bg-blue-500",    icon: CheckCircle2 },
  { key: "receptionne",  label: "Réceptionné", color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", icon: Truck },
  { key: "comptabilise", label: "Comptabilisé",color: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500", icon: BookOpen },
];

const PAYMENT_OPTIONS = [
  { value: "cash",          label: "Espèces" },
  { value: "mobile_money",  label: "Mvola / Orange / Airtel" },
  { value: "bank_transfer", label: "Virement bancaire" },
  { value: "cheque",        label: "Chèque" },
];

const TYPE_PIE_COLORS = ["#059669","#3B82F6","#F59E0B","#7C3AED","#E11D48","#64748B"];

const fmt    = (n: number) => new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n ?? 0);
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";
const fmtDt   = (d: string | null) => d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

function typeCfg(key: string) { return TYPES.find(t => t.key === key) ?? TYPES[0]!; }
function statusCfg(key: string) { return STATUSES.find(s => s.key === key) ?? STATUSES[1]!; }

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  let data: any;
  try { data = await r.json(); } catch { throw new Error("Erreur serveur"); }
  if (!r.ok) throw new Error(data?.error ?? r.statusText);
  return data;
}

// ─── TypeBadge ────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const cfg = typeCfg(type);
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = statusCfg(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
      {cfg.label}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, iconBg = "bg-gray-100", iconColor = "text-gray-600", color = "text-gray-900" }: any) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Suppliers hook ───────────────────────────────────────────────────────────
function useSuppliers() {
  return useQuery<any[]>({
    queryKey: ["suppliers"],
    queryFn: () => api("/suppliers").then((d: any) => d?.suppliers ?? d ?? []),
  });
}

// ─── Catalog Products hook ────────────────────────────────────────────────────
function useVanillaCatalog() {
  return useQuery<any[]>({
    queryKey: ["vanilla-catalog"],
    queryFn: () => api("/products").then((p: any[]) =>
      p.filter(x => ["gousses","poudre","extrait de vanille","pate de vanille","pâte de vanille","pates de vanille","pâtes de vanille"].includes((x.category ?? "").toLowerCase()))
    ),
  });
}

// ─── Reception Modal ──────────────────────────────────────────────────────────
function ReceptionModal({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const qc = useQueryClient();
  const [qty, setQty]     = useState("");
  const [notes, setNotes] = useState("");

  const expectedQty = purchase.quantity ?? purchase.weight ?? 0;
  const qtyNum      = parseFloat(qty) || 0;
  const overQty     = expectedQty > 0 && qtyNum > expectedQty * 1.1;
  const underQty    = expectedQty > 0 && qtyNum > 0 && qtyNum < expectedQty * 0.5;

  const mut = useMutation({
    mutationFn: () => api(`/purchases/${purchase.id}/reception`, { method: "POST", body: JSON.stringify({ quantity: qtyNum, notes }) }),
    onSuccess: () => { toast.success("Réception enregistrée"); qc.invalidateQueries({ queryKey: ["purchases"] }); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center"><Truck className="w-5 h-5 text-emerald-600"/></div>
          <div>
            <h2 className="font-bold text-gray-900">Enregistrer réception</h2>
            <p className="text-xs text-gray-500">{purchase.reference ?? purchase.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">Quantité reçue *</label>
              {expectedQty > 0 && (
                <span className="text-xs text-gray-400">Attendu : {fmt(expectedQty)} {purchase.unit ?? "kg"}</span>
              )}
            </div>
            <input type="number" step="0.01" min="0" value={qty} onChange={e => setQty(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                overQty ? "border-amber-400 bg-amber-50" : underQty ? "border-blue-300" : "border-gray-300 focus:border-emerald-400"
              }`}
              placeholder={`Ex: ${purchase.quantity ?? purchase.weight ?? 1}`}/>
            {overQty && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3"/> Quantité supérieure à 110% de la commande — vérifiez avant de valider
              </p>
            )}
            {underQty && (
              <p className="text-xs text-blue-500 mt-1">Réception partielle — l'achat restera en statut "Validé"</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 resize-none"
              placeholder="État marchandise, observations…"/>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annuler</button>
          <button onClick={() => mut.mutate()} disabled={!qty || qtyNum <= 0 || mut.isPending}
            className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
            {mut.isPending ? "Enregistrement…" : "Valider réception"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────
function DeleteModal({ purchase, onClose, onConfirm, isPending }: { purchase: Purchase; onClose: () => void; onConfirm: (r: string) => void; isPending: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center"><Trash2 className="w-5 h-5 text-red-600"/></div>
          <div>
            <h2 className="font-bold text-gray-900">Supprimer {purchase.reference ?? "cet achat"} ?</h2>
            <p className="text-xs text-gray-500">Action irréversible · {purchase.supplier_name}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
        </div>
        {purchase.status === "comptabilise" && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0"/>
            Cet achat est comptabilisé — suppression impossible.
          </div>
        )}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Raison <span className="text-red-500">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 resize-none"
            placeholder="Ex: Achat en double, erreur de saisie…"/>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Annuler</button>
          <button onClick={() => onConfirm(reason)} disabled={!reason.trim() || isPending || purchase.status === "comptabilise"}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60">
            {isPending ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Purchase Form ─────────────────────────────────────────────────────────────
function PurchaseForm({ suppliers, onClose, onSuccess }: { suppliers: any[]; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep]   = useState<"type" | "form">("type");
  const [type, setType]   = useState("VANILLE");
  const catalogQ = useVanillaCatalog();
  const catalogProducts = catalogQ.data ?? [];

  // Map category name to product type
  const VANILLA_TYPES = [
    { key: "GOUSSE",       label: "Gousse",         cat: "gousses" },
    { key: "POUDRE",       label: "Poudre",          cat: "poudre" },
    { key: "EXTRAIT",      label: "Extrait",         cat: "extrait de vanille" },
    { key: "PATE_VANILLE", label: "Pâte de vanille", cat: "pâte de vanille" },
  ];

  const [form, setForm]   = useState<any>({
    supplierId: "", supplierName: "",
    supplierEmail: "", supplierPhone: "", supplierCity: "",
    supplierRegion: "", supplierNif: "", supplierStat: "",
    supplierRccm: "", supplierAddress: "",
    supplierPaymentMethod: "Virement bancaire", supplierPaymentTerms: "30",
    supplierIsVatSubject: false,
    description: "", category: "", currency: "MGA",
    purchaseDate: new Date().toISOString().slice(0, 10),
    amountHt: "", vatRate: "0", vatAmount: "", amountTtc: "",
    quantity: "", unit: "unité", unitPrice: "",
    weight: "", pricePerKg: "", humidity: "32",
    paymentMethod: "cash", warehouse: "", notes: "",
    assetCategory: "informatique", assetDuration: "48",
    serialNumber: "", location: "",
    // Vanilla quality & traceability
    productId: "", productType: "GOUSSE",
    lengthCm: "", quality: "premium", grade: "A",
    origin: "SAVA", preparation: "non fendue",
    qualityNotes: "", vanillinRate: "", moldStatus: "ok",
  });
  const [useNewSupplier, setUseNewSupplier] = useState(false);
  const [showSupplierDetails, setShowSupplierDetails] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Catalog products filtered by current productType
  const filteredCatalog = catalogProducts.filter(p => {
    const typeToCategory: Record<string, string[]> = {
      GOUSSE:       ["gousses"],
      POUDRE:       ["poudre"],
      EXTRAIT:      ["extrait de vanille"],
      PATE_VANILLE: ["pâte de vanille", "pate de vanille", "pates de vanille", "pâtes de vanille"],
    };
    const cats = typeToCategory[form.productType] ?? [];
    return cats.includes((p.category ?? "").toLowerCase());
  });

  // Resolve lot preview region: selected supplier's DB region > new supplier region > origin > fallback
  const selectedSupplier = !useNewSupplier && form.supplierId
    ? suppliers.find((s: any) => s.id === form.supplierId)
    : null;

  // Preview lot code (real-time, client-side approximation — server is authoritative)
  const lotPreview = (() => {
    const d = form.purchaseDate ? new Date(form.purchaseDate) : new Date();
    const year = d.getFullYear();
    const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const rawRegion = form.origin || selectedSupplier?.region || form.supplierRegion || "VAN";
    const region = rawRegion.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "VAN";
    const typeMap: Record<string, string> = { GOUSSE:"GOUSSE", POUDRE:"POUDRE", EXTRAIT:"EXTRAIT", PATE_VANILLE:"PATE" };
    const t = typeMap[form.productType] ?? "VAN";
    const parts = [`VAN-${year}-${mmdd}`, region, t];
    if (form.lengthCm && parseFloat(form.lengthCm) > 0) parts.push(`${Math.round(parseFloat(form.lengthCm))}CM`);
    if (form.humidity && parseFloat(form.humidity) > 0)  parts.push(`H${Math.round(parseFloat(form.humidity))}`);
    return parts.join("-");
  })();

  // AI risk preview (client-side — mirrors server computeVanillaRisk exactly)
  const riskPreview = (() => {
    const h = parseFloat(form.humidity) || 0;
    const vr = parseFloat(form.vanillinRate) || undefined;
    let score = 0;
    const risks: string[] = [];
    if (h > 42)      { risks.push(`Humidité critique (${h}%)`); score += 50; }
    else if (h > 38) { risks.push(`Humidité élevée (${h}%)`);   score += 25; }
    else if (h > 0 && h < 18) { risks.push(`Humidité trop faible (${h}%)`); score += 15; }
    if (form.moldStatus === "failed") { risks.push("Moisissures détectées"); score += 50; }
    else if (form.moldStatus === "risk") { risks.push("Risque moisissures"); score += 25; }
    if (form.quality === "faible" || form.quality === "industrial")  { risks.push("Qualité insuffisante"); score += 20; }
    if (vr !== undefined) {
      if (vr < 1.5)  { risks.push(`Vanilline très faible (${vr}%)`); score += 25; }
      else if (vr < 2) { risks.push(`Vanilline faible (${vr}%)`); score += 10; }
    }
    const level = score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
    return { score: Math.min(100, score), level, risks };
  })();

  const set = (k: string, v: string) => {
    const next = { ...form, [k]: v };
    // Auto-calc for vanille
    if (type === "VANILLE" && (k === "weight" || k === "pricePerKg")) {
      const w = parseFloat(k === "weight" ? v : form.weight);
      const p = parseFloat(k === "pricePerKg" ? v : form.pricePerKg);
      if (!isNaN(w) && !isNaN(p)) next.amountTtc = String(Math.round(w * p));
    }
    // Auto-fill pricePerKg from selected catalog product
    if (k === "productId" && v && type === "VANILLE") {
      const prod = catalogProducts.find(p => p.id === v);
      if (prod?.purchase_price_kg) next.pricePerKg = String(prod.purchase_price_kg);
    }
    // Auto-fill productId when productType changes (reset product selection)
    if (k === "productType") next.productId = "";
    // Auto-calc HT ↔ TTC
    if (k === "amountHt" || k === "vatRate") {
      const ht = parseFloat(k === "amountHt" ? v : form.amountHt) || 0;
      const vr = parseFloat(k === "vatRate" ? v : form.vatRate) || 0;
      if (ht > 0 && vr > 0) {
        const va = Math.round(ht * vr / 100);
        next.vatAmount = String(va); next.amountTtc = String(ht + va);
      }
    }
    if (k === "amountTtc" && form.vatRate) {
      const ttc = parseFloat(v) || 0;
      const vr  = parseFloat(form.vatRate) || 0;
      if (ttc > 0 && vr > 0) {
        const ht = Math.round(ttc / (1 + vr / 100));
        next.amountHt = String(ht); next.vatAmount = String(ttc - ht);
      }
    }
    // Auto-calc from qty × unitPrice
    if (k === "quantity" || k === "unitPrice") {
      const q = parseFloat(k === "quantity" ? v : form.quantity) || 0;
      const p = parseFloat(k === "unitPrice" ? v : form.unitPrice) || 0;
      if (q > 0 && p > 0) {
        const ht = Math.round(q * p);
        next.amountHt = String(ht);
        const vr = parseFloat(form.vatRate) || 0;
        if (vr > 0) { const va = Math.round(ht * vr / 100); next.vatAmount = String(va); next.amountTtc = String(ht + va); }
        else next.amountTtc = String(ht);
      }
    }
    setForm(next);
  };

  const createMut = useMutation({
    mutationFn: (body: any) => api("/purchases", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d: any) => {
      toast.success(`Achat ${d.reference} créé`);
      onSuccess(); onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!useNewSupplier && !form.supplierId) e.supplierId = "Fournisseur requis";
    if (useNewSupplier && !form.supplierName.trim()) e.supplierName = "Nom fournisseur requis";
    if (type === "VANILLE") {
      if (!form.weight || parseFloat(form.weight) <= 0) e.weight = "Poids requis";
      if (!form.pricePerKg || parseFloat(form.pricePerKg) <= 0) e.pricePerKg = "Prix/kg requis";
    } else {
      if (!form.amountTtc && !form.amountHt) e.amountHt = "Montant requis";
      if (!form.description.trim()) e.description = "Description requise";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const body: any = {
      type, category: form.category || undefined, description: form.description || undefined,
      currency: form.currency, purchaseDate: form.purchaseDate, notes: form.notes || undefined,
      warehouse: form.warehouse || undefined, paymentMethod: form.paymentMethod,
      vatRate: parseFloat(form.vatRate) || 0,
    };
    if (useNewSupplier) {
      body.supplierName = form.supplierName.trim();
      if (type === "VANILLE") {
        // For vanilla, use explicit region if entered, otherwise derive from origin field
        body.supplierRegion = form.supplierRegion?.trim() || form.origin || "";
      } else {
        if (form.supplierEmail)         body.supplierEmail         = form.supplierEmail;
        if (form.supplierPhone)         body.supplierPhone         = form.supplierPhone;
        if (form.supplierCity)          body.supplierCity          = form.supplierCity;
        if (form.supplierRegion)        body.supplierRegion        = form.supplierRegion;
        if (form.supplierNif)           body.supplierNif           = form.supplierNif;
        if (form.supplierStat)          body.supplierStat          = form.supplierStat;
        if (form.supplierRccm)          body.supplierRccm          = form.supplierRccm;
        if (form.supplierAddress)       body.supplierAddress       = form.supplierAddress;
        if (form.supplierPaymentMethod) body.supplierPaymentMethod = form.supplierPaymentMethod;
        if (form.supplierPaymentTerms)  body.supplierPaymentTerms  = form.supplierPaymentTerms;
        body.supplierIsVatSubject = form.supplierIsVatSubject;
      }
    } else {
      body.supplierId = form.supplierId;
    }

    if (type === "VANILLE") {
      body.weight    = parseFloat(form.weight);
      body.pricePerKg= parseFloat(form.pricePerKg);
      body.humidity  = parseFloat(form.humidity) || 0;
      body.amountTtc = parseFloat(form.amountTtc) || body.weight * body.pricePerKg;
      // Vanilla quality & traceability
      if (form.productId)    body.productId    = form.productId;
      if (form.productType)  body.productType  = form.productType;
      if (form.lengthCm && parseFloat(form.lengthCm) > 0) body.lengthCm = parseFloat(form.lengthCm);
      if (form.quality)      body.quality      = form.quality;
      if (form.grade)        body.grade        = form.grade;
      if (form.origin)       body.origin       = form.origin;
      if (form.preparation)  body.preparation  = form.preparation;
      if (form.qualityNotes) body.qualityNotes = form.qualityNotes;
      if (form.vanillinRate && parseFloat(form.vanillinRate) > 0) body.vanillinRate = parseFloat(form.vanillinRate);
      body.moldStatus = form.moldStatus || "ok";
    } else {
      if (form.quantity) body.quantity = parseFloat(form.quantity);
      if (form.unit)     body.unit     = form.unit;
      if (form.unitPrice) body.unitPrice = parseFloat(form.unitPrice);
      if (form.amountHt)  body.amountHt  = parseFloat(form.amountHt);
      if (form.vatAmount) body.vatAmount = parseFloat(form.vatAmount);
      if (form.amountTtc) body.amountTtc = parseFloat(form.amountTtc);
    }
    if (type === "IMMOBILISATION") {
      body.assetCategory = form.assetCategory;
      body.assetDuration = parseInt(form.assetDuration) || 48;
      body.serialNumber  = form.serialNumber || undefined;
      body.location      = form.location || undefined;
    }
    createMut.mutate(body);
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400";

  // Supplier filter: GOODS suppliers for VANILLE, non-GOODS for others
  // /api/suppliers returns camelCase (Drizzle ORM): supplierType, not supplier_type
  const filteredSuppliers = type === "VANILLE"
    ? suppliers.filter(s => s.supplierType === "GOODS" || !s.supplierType)
    : suppliers.filter(s => s.supplierType !== "GOODS");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-white"/>
            <h2 className="text-white font-bold">Nouvel achat</h2>
            {step === "form" && <ChevronRight className="w-4 h-4 text-white/50"/>}
            {step === "form" && <span className="text-white/80 text-sm">{typeCfg(type).label}</span>}
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-5 h-5"/></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {/* Step 1: Type selector */}
          {step === "type" && (
            <div>
              <p className="text-sm text-gray-600 mb-4 font-medium">Sélectionnez le type d'achat :</p>
              <div className="grid grid-cols-2 gap-3">
                {TYPES.map(t => {
                  const Icon = t.icon;
                  return (
                    <button key={t.key} onClick={() => { setType(t.key); setStep("form"); }}
                      className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-left group">
                      <div className={`w-9 h-9 rounded-lg ${t.color.includes("emerald") ? "bg-emerald-100" : t.color.includes("blue") ? "bg-blue-100" : t.color.includes("amber") ? "bg-amber-100" : t.color.includes("violet") ? "bg-violet-100" : t.color.includes("rose") ? "bg-rose-100" : "bg-slate-100"} flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${t.color.split(" ")[1]}`}/>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{t.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t.key === "VANILLE" ? "Matière première" :
                           t.key === "CONSOMMABLE" ? "Stockage auto" :
                           t.key === "BUREAU" ? "Fournitures" :
                           t.key === "INFORMATIQUE" ? "Matériel IT" :
                           t.key === "IMMOBILISATION" ? "Fiche immo" : "Prestation"}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 ml-auto"/>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Form */}
          {step === "form" && (
            <div className="space-y-4">
              <button onClick={() => setStep("type")} className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                ← Changer de type
              </button>

              {/* Supplier */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">Fournisseur *</label>
                  <button onClick={() => setUseNewSupplier(!useNewSupplier)}
                    className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                    <Zap className="w-3 h-3"/>
                    {useNewSupplier ? "Sélectionner existant" : "Créer automatiquement"}
                  </button>
                </div>
                {!useNewSupplier ? (
                  <select value={form.supplierId} onChange={e => set("supplierId", e.target.value)} className={inputCls}>
                    <option value="">— Sélectionner —</option>
                    {filteredSuppliers.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.supplierCode ? `(${s.supplierCode})` : ""}
                        {s.region ? ` · ${s.region}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input value={form.supplierName} onChange={e => set("supplierName", e.target.value)}
                      className={inputCls} placeholder="Nom du nouveau fournisseur *"/>
                    {/* Region field for VANILLE new supplier (critical for lot code) */}
                    {type === "VANILLE" && (
                      <input value={form.supplierRegion} onChange={e => set("supplierRegion", e.target.value)}
                        className={`${inputCls} text-xs`}
                        placeholder="Région du fournisseur (ex: SAVA, DIANA…) — utilisée dans le code lot"/>
                    )}
                    {/* Extra supplier details — non-VANILLE only */}
                    {type !== "VANILLE" && (
                      <div>
                        <button type="button" onClick={() => setShowSupplierDetails(!showSupplierDetails)}
                          className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-1">
                          {showSupplierDetails ? "▲ Masquer les détails" : "▼ Ajouter les détails du fournisseur"}
                        </button>
                        {showSupplierDetails && (
                          <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Informations fournisseur</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
                                <input type="email" value={form.supplierEmail} onChange={e => set("supplierEmail", e.target.value)}
                                  className={inputCls + " text-xs"} placeholder="contact@fournisseur.mg"/>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Téléphone</label>
                                <input value={form.supplierPhone} onChange={e => set("supplierPhone", e.target.value)}
                                  className={inputCls + " text-xs"} placeholder="+261 34 000 0000"/>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Ville</label>
                                <input value={form.supplierCity} onChange={e => set("supplierCity", e.target.value)}
                                  className={inputCls + " text-xs"} placeholder="Antananarivo"/>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Région</label>
                                <input value={form.supplierRegion} onChange={e => set("supplierRegion", e.target.value)}
                                  className={inputCls + " text-xs"} placeholder="Analamanga"/>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 block mb-1">Adresse</label>
                              <input value={form.supplierAddress} onChange={e => set("supplierAddress", e.target.value)}
                                className={inputCls + " text-xs"} placeholder="Lot XX, Rue Ravoninahitriniarivo…"/>
                            </div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">Identifiants fiscaux</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">NIF</label>
                                <input value={form.supplierNif} onChange={e => set("supplierNif", e.target.value)}
                                  className={inputCls + " text-xs"} placeholder="NIF-XXXXX"/>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">STAT</label>
                                <input value={form.supplierStat} onChange={e => set("supplierStat", e.target.value)}
                                  className={inputCls + " text-xs"} placeholder="STAT-XXXXX"/>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">RCCM</label>
                                <input value={form.supplierRccm} onChange={e => set("supplierRccm", e.target.value)}
                                  className={inputCls + " text-xs"} placeholder="RCCM-XX"/>
                              </div>
                            </div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">Conditions paiement</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Mode de règlement</label>
                                <select value={form.supplierPaymentMethod} onChange={e => set("supplierPaymentMethod", e.target.value)} className={inputCls + " text-xs"}>
                                  <option value="Virement bancaire">Virement bancaire</option>
                                  <option value="Espèces">Espèces</option>
                                  <option value="Chèque">Chèque</option>
                                  <option value="Mobile Money">Mobile Money</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Délai paiement (jours)</label>
                                <select value={form.supplierPaymentTerms} onChange={e => set("supplierPaymentTerms", e.target.value)} className={inputCls + " text-xs"}>
                                  <option value="0">Immédiat</option>
                                  <option value="15">15 jours</option>
                                  <option value="30">30 jours</option>
                                  <option value="45">45 jours</option>
                                  <option value="60">60 jours</option>
                                  <option value="90">90 jours</option>
                                </select>
                              </div>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                              <input type="checkbox" checked={form.supplierIsVatSubject}
                                onChange={e => setForm((f: any) => ({ ...f, supplierIsVatSubject: e.target.checked }))}
                                className="w-4 h-4 rounded text-emerald-600 border-gray-300"/>
                              Fournisseur assujetti à la TVA
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {(errors.supplierId || errors.supplierName) && <p className="text-red-500 text-xs mt-0.5">{errors.supplierId || errors.supplierName}</p>}
              </div>

              {/* Description */}
              {type !== "VANILLE" && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Description *</label>
                  <input value={form.description} onChange={e => set("description", e.target.value)}
                    className={inputCls} placeholder={
                      type === "CONSOMMABLE" ? "Ex: Sel fin, Cordons, Étiquettes…" :
                      type === "BUREAU" ? "Ex: Ramettes A4, Stylos, Enveloppes…" :
                      type === "INFORMATIQUE" ? "Ex: Laptop Dell, Imprimante HP…" :
                      type === "IMMOBILISATION" ? "Ex: Voiture Toyota, Entrepôt Nord…" :
                      "Ex: Transport, Consultant, Nettoyage…"}/>
                  {errors.description && <p className="text-red-500 text-xs mt-0.5">{errors.description}</p>}
                </div>
              )}

              {/* Category */}
              {(type === "CONSOMMABLE" || type === "BUREAU" || type === "INFORMATIQUE") && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Catégorie</label>
                  <input value={form.category} onChange={e => set("category", e.target.value)}
                    className={inputCls} placeholder="Ex: emballage, bureau, réseau…"/>
                </div>
              )}

              {/* Immobilisation-specific */}
              {type === "IMMOBILISATION" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Catégorie</label>
                    <select value={form.assetCategory} onChange={e => set("assetCategory", e.target.value)} className={inputCls}>
                      <option value="informatique">Informatique (2183)</option>
                      <option value="mobilier">Mobilier (2184)</option>
                      <option value="transport">Transport (2154)</option>
                      <option value="installation">Installation (2135)</option>
                      <option value="equipment">Équipement (2183)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Durée amort. (mois)</label>
                    <input type="number" value={form.assetDuration} onChange={e => set("assetDuration", e.target.value)} className={inputCls}/>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">N° série</label>
                    <input value={form.serialNumber} onChange={e => set("serialNumber", e.target.value)} className={inputCls} placeholder="SN-XXXXX"/>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Localisation</label>
                    <input value={form.location} onChange={e => set("location", e.target.value)} className={inputCls} placeholder="Bureau 1, Entrepôt…"/>
                  </div>
                </div>
              )}

              {/* ══════ VANILLE ERP FORM ══════ */}
              {type === "VANILLE" && (
                <div className="space-y-4">
                  {/* ── Section A : Produit & Achat ── */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-3">
                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="w-5 h-5 bg-emerald-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">A</span>
                      Informations achat
                    </p>

                    {/* Type produit */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">Type de vanille *</label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {VANILLA_TYPES.map(vt => (
                          <button key={vt.key} type="button"
                            onClick={() => set("productType", vt.key)}
                            className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                              form.productType === vt.key
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : "bg-white text-gray-600 border-gray-300 hover:border-emerald-400"
                            }`}>
                            {vt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Produit catalogue */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">Produit catalogue</label>
                      <select value={form.productId} onChange={e => set("productId", e.target.value)}
                        className={`${inputCls} text-xs`}>
                        <option value="">— Sélectionner un produit —</option>
                        {filteredCatalog.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.reference} — {p.name}
                            {p.size ? ` (${p.size})` : ""}
                            {p.purchase_price_kg ? ` · ${new Intl.NumberFormat("fr-MG").format(p.purchase_price_kg)} Ar/kg` : ""}
                          </option>
                        ))}
                        {filteredCatalog.length === 0 && <option disabled>Aucun produit pour ce type</option>}
                      </select>
                    </div>

                    {/* Poids + Prix/kg */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">Poids (kg) *</label>
                        <input type="number" step="0.1" value={form.weight}
                          onChange={e => set("weight", e.target.value)}
                          className={`${inputCls} text-xs`} placeholder="150"/>
                        {errors.weight && <p className="text-red-500 text-[10px] mt-0.5">{errors.weight}</p>}
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">Prix / kg (Ar) *</label>
                        <input type="number" step="500" value={form.pricePerKg}
                          onChange={e => set("pricePerKg", e.target.value)}
                          className={`${inputCls} text-xs`} placeholder="40 000"/>
                        {errors.pricePerKg && <p className="text-red-500 text-[10px] mt-0.5">{errors.pricePerKg}</p>}
                      </div>
                    </div>

                    {/* Total */}
                    {form.amountTtc && parseFloat(form.amountTtc) > 0 && (
                      <div className="bg-white border border-emerald-300 rounded-lg px-3 py-2 flex items-center justify-between">
                        <span className="text-xs text-gray-600">Total TTC</span>
                        <span className="text-sm font-bold text-emerald-700">
                          {new Intl.NumberFormat("fr-MG").format(parseFloat(form.amountTtc))} Ar
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ── Section B : Qualité vanille ── */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">B</span>
                      Contrôle qualité vanille
                    </p>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">Longueur (cm)</label>
                        <input type="number" step="0.5" value={form.lengthCm}
                          onChange={e => set("lengthCm", e.target.value)}
                          className={`${inputCls} text-xs`} placeholder="18"/>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">Humidité %</label>
                        <input type="number" step="0.5" value={form.humidity}
                          onChange={e => set("humidity", e.target.value)}
                          className={`${inputCls} text-xs ${parseFloat(form.humidity) > 38 ? "border-red-400 bg-red-50" : parseFloat(form.humidity) > 35 ? "border-amber-400" : ""}`}/>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">Taux vanilline %</label>
                        <input type="number" step="0.1" value={form.vanillinRate}
                          onChange={e => set("vanillinRate", e.target.value)}
                          className={`${inputCls} text-xs`} placeholder="2.5"/>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">Qualité</label>
                        <select value={form.quality} onChange={e => set("quality", e.target.value)} className={`${inputCls} text-xs`}>
                          <option value="premium">Premium</option>
                          <option value="standard">Standard</option>
                          <option value="faible">Faible</option>
                          <option value="industrial">Industriel</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">Grade</label>
                        <select value={form.grade} onChange={e => set("grade", e.target.value)} className={`${inputCls} text-xs`}>
                          <option value="A">Grade A</option>
                          <option value="B">Grade B</option>
                          <option value="C">Grade C</option>
                          <option value="TK">TK (Tout Komori)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">Origine (région)</label>
                        <select value={form.origin} onChange={e => set("origin", e.target.value)} className={`${inputCls} text-xs`}>
                          <option value="SAVA">SAVA (Sambava-Andapa-Vohemar-Antalaha)</option>
                          <option value="DIANA">DIANA (Diego)</option>
                          <option value="SOFIA">SOFIA (Mandritsara)</option>
                          <option value="ANALANJIROFO">Analanjirofo (Fenerive)</option>
                          <option value="MASOALA">Masoala</option>
                          <option value="AUTRE">Autre</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">Préparation</label>
                        <select value={form.preparation} onChange={e => set("preparation", e.target.value)} className={`${inputCls} text-xs`}>
                          <option value="non fendue">Non fendue</option>
                          <option value="fendue">Fendue</option>
                          <option value="preparee">Préparée (QCP)</option>
                          <option value="coupee">Coupée (Cuts)</option>
                          <option value="brute">Brute</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">Contrôle moisissures</label>
                      <div className="flex gap-2">
                        {[
                          { key: "ok",     label: "OK",            cls: "bg-emerald-600 text-white border-emerald-600" },
                          { key: "risk",   label: "Risque",        cls: "bg-amber-500 text-white border-amber-500" },
                          { key: "failed", label: "Moisissures",   cls: "bg-red-600 text-white border-red-600" },
                        ].map(m => (
                          <button key={m.key} type="button"
                            onClick={() => set("moldStatus", m.key)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                              form.moldStatus === m.key ? m.cls : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
                            }`}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">Notes qualité</label>
                      <textarea value={form.qualityNotes} onChange={e => set("qualityNotes", e.target.value)}
                        rows={2} className={`${inputCls} text-xs resize-none`}
                        placeholder="Observations particulières sur la qualité, l'arôme, l'aspect…"/>
                    </div>

                    {/* AI Risk preview */}
                    {riskPreview.score > 0 && (
                      <div className={`rounded-lg p-2.5 text-xs border ${
                        riskPreview.level === "HIGH"   ? "bg-red-50 border-red-200 text-red-700" :
                        riskPreview.level === "MEDIUM" ? "bg-amber-50 border-amber-200 text-amber-700" :
                        "bg-emerald-50 border-emerald-200 text-emerald-700"
                      }`}>
                        <p className="font-bold mb-1 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5"/>
                          IA — Risque {riskPreview.level} (score {riskPreview.score}/100)
                        </p>
                        {riskPreview.risks.map((r, i) => <p key={i} className="ml-5">• {r}</p>)}
                      </div>
                    )}
                    {riskPreview.score === 0 && form.humidity && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-700 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5"/>
                        IA — Aucun risque détecté
                      </div>
                    )}
                  </div>

                  {/* ── Section C : Lot automatique ── */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">C</span>
                      Lot généré automatiquement
                    </p>
                    <div className="bg-white border border-blue-200 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-500 mb-0.5">Numéro de lot (aperçu)</p>
                      <p className="font-mono text-sm font-bold text-blue-800 tracking-wide">{lotPreview}</p>
                    </div>
                    <p className="text-[10px] text-gray-500">
                      Format : VAN-ANNÉE-MMJJ-RÉGION-TYPE-LONGUEURcm-HUMIDITÉ — Le code final est confirmé côté serveur.
                    </p>
                  </div>
                </div>
              )}

              {/* Qty + Unit (for non-vanilla non-service) */}
              {type !== "VANILLE" && type !== "SERVICE" && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Quantité</label>
                    <input type="number" step="0.01" value={form.quantity} onChange={e => set("quantity", e.target.value)} className={inputCls} placeholder="1"/>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Unité</label>
                    <select value={form.unit} onChange={e => set("unit", e.target.value)} className={inputCls}>
                      {["unité","kg","litre","mètre","boîte","carton","lot"].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">P.U. (Ar)</label>
                    <input type="number" value={form.unitPrice} onChange={e => set("unitPrice", e.target.value)} className={inputCls} placeholder="0"/>
                  </div>
                </div>
              )}

              {/* Amounts HT / TVA / TTC (for non-vanilla) */}
              {type !== "VANILLE" && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Montants</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Montant HT (Ar) *</label>
                      <input type="number" value={form.amountHt} onChange={e => set("amountHt", e.target.value)}
                        className={inputCls} placeholder="0"/>
                      {errors.amountHt && <p className="text-red-500 text-xs mt-0.5">{errors.amountHt}</p>}
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">TVA %</label>
                      <select value={form.vatRate} onChange={e => set("vatRate", e.target.value)} className={inputCls}>
                        <option value="0">0% (Exonéré)</option>
                        <option value="8.5">8.5%</option>
                        <option value="20">20%</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Total TTC (Ar)</label>
                      <input type="number" value={form.amountTtc} onChange={e => set("amountTtc", e.target.value)}
                        className={`${inputCls} font-semibold`} placeholder="0"/>
                    </div>
                  </div>
                  {form.vatAmount && parseFloat(form.vatAmount) > 0 && (
                    <p className="text-xs text-blue-600">TVA = {fmt(parseFloat(form.vatAmount))} Ar · Compte 44566 débité</p>
                  )}
                </div>
              )}

              {/* Date + payment + warehouse */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Date achat</label>
                  <input type="date" value={form.purchaseDate} onChange={e => set("purchaseDate", e.target.value)} className={inputCls}/>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Mode paiement</label>
                  <select value={form.paymentMethod} onChange={e => set("paymentMethod", e.target.value)} className={inputCls}>
                    {PAYMENT_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Entrepôt / lieu</label>
                  <input value={form.warehouse} onChange={e => set("warehouse", e.target.value)} className={inputCls} placeholder="Entrepôt 1, Bureau, Site A…"/>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Devise</label>
                  <select value={form.currency} onChange={e => set("currency", e.target.value)} className={inputCls}>
                    <option value="MGA">MGA (Ariary)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="USD">USD (Dollar)</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2}
                  className={`${inputCls} resize-none`} placeholder="Commentaires, conditions, références…"/>
              </div>

              {/* Accounting preview */}
              {(type !== "VANILLE" ? (parseFloat(form.amountHt) > 0 || parseFloat(form.amountTtc) > 0) : parseFloat(form.amountTtc) > 0) && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
                  <p className="font-semibold mb-1.5 flex items-center gap-1"><BookOpen className="w-3.5 h-3.5"/> Écritures comptables générées</p>
                  <div className="space-y-0.5 font-mono">
                    {type === "VANILLE" && <p>D 31 — Stocks matières (vanille) · {fmt(parseFloat(form.amountTtc))} Ar</p>}
                    {type === "CONSOMMABLE" && <p>D 602 — Consommables · {fmt(parseFloat(form.amountHt) || parseFloat(form.amountTtc))} Ar</p>}
                    {type === "BUREAU" && <p>D 6064 — Fournitures bureau · {fmt(parseFloat(form.amountHt) || parseFloat(form.amountTtc))} Ar</p>}
                    {type === "INFORMATIQUE" && <p>D 615 — Entretien matériel · {fmt(parseFloat(form.amountHt) || parseFloat(form.amountTtc))} Ar</p>}
                    {type === "IMMOBILISATION" && <p>D 218x — Immobilisation · {fmt(parseFloat(form.amountHt) || parseFloat(form.amountTtc))} Ar</p>}
                    {type === "SERVICE" && <p>D 614 — Services ext. · {fmt(parseFloat(form.amountHt) || parseFloat(form.amountTtc))} Ar</p>}
                    {parseFloat(form.vatAmount) > 0 && <p>D 44566 — TVA déductible · {fmt(parseFloat(form.vatAmount))} Ar</p>}
                    <p>C 401 — Fournisseurs · {fmt(parseFloat(form.amountTtc) || parseFloat(form.amountHt))} Ar</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100">Annuler</button>
          {step === "form" && (
            <button onClick={handleSubmit} disabled={createMut.isPending}
              className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2">
              {createMut.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin"/>}
              {createMut.isPending ? "Enregistrement…" : "Créer l'achat"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Tab ─────────────────────────────────────────────────────────────
function DashboardTab() {
  const { data, isLoading } = useQuery({ queryKey: ["purchases-analytics"], queryFn: () => api("/purchases/analytics") });
  if (isLoading) return <div className="flex items-center justify-center py-16 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2"/>Chargement…</div>;

  const kpis = data?.kpis ?? {};
  const byType: any[] = data?.byType ?? [];
  const monthly: any[] = data?.monthly ?? [];
  const topSuppliers: any[] = data?.topSuppliers ?? [];
  const byStatus: any[] = data?.byStatus ?? [];

  const pieData = byType.map((t: any, i: number) => ({
    name: typeCfg(t.type).label, value: Number(t.nb), fill: TYPE_PIE_COLORS[i % TYPE_PIE_COLORS.length],
  }));

  const statusMap: Record<string, any> = {};
  byStatus.forEach((s: any) => { statusMap[s.status] = s; });

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={ShoppingCart} label="Total achats"      value={fmt(kpis.total)} sub={`${kpis.nb} commandes`} iconBg="bg-emerald-100" iconColor="text-emerald-600" color="text-emerald-700"/>
        <KpiCard icon={TrendingUp}   label="Prix moy. / kg"    value={`${fmt(kpis.avgPrice)} Ar`} sub={`${fmt(kpis.kgTotal)} kg vanille`} iconBg="bg-blue-100" iconColor="text-blue-600"/>
        <KpiCard icon={Building2}    label="Fournisseurs actifs" value={kpis.nbSuppliers} sub="ce mois" iconBg="bg-violet-100" iconColor="text-violet-600"/>
        <KpiCard icon={CheckCircle2} label="Comptabilisés"     value={statusMap["comptabilise"]?.nb ?? 0} sub={`/${kpis.nb} total`} iconBg="bg-purple-100" iconColor="text-purple-600"/>
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-4 gap-3">
        {STATUSES.map(s => {
          const d = statusMap[s.key];
          return (
            <div key={s.key} className={`border rounded-xl p-3 ${s.color.replace("text-", "border-").split(" ")[0]} bg-white`}>
              <p className={`text-xs font-medium ${s.color.split(" ")[1]}`}>{s.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{d?.nb ?? 0}</p>
              <p className="text-xs text-gray-400">{fmt(Number(d?.total ?? 0))} Ar</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Monthly chart */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm">Dépenses mensuelles (Ar)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="label" tick={{ fontSize: 10 }}/>
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`}/>
              <Tooltip formatter={(v: any) => [`${fmt(v)} Ar`]}/>
              <Bar dataKey="total" fill="#059669" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Type pie */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm">Répartition par type</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.fill}/>)}
                </Pie>
                <Tooltip/>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-300 text-sm">Aucune donnée</div>
          )}
        </div>
      </div>

      {/* Top suppliers */}
      {topSuppliers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b"><h3 className="font-semibold text-gray-800 text-sm">Top 5 fournisseurs</h3></div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Fournisseur</th>
                <th className="text-right px-4 py-2">Commandes</th>
                <th className="text-right px-4 py-2">Total (Ar)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {topSuppliers.map((s: any, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{s.name}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{s.nb}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmt(Number(s.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── List Tab ─────────────────────────────────────────────────────────────────
function ListTab({ onNew }: { onNew: () => void }) {
  const qc   = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";

  const [search, setSearch]       = useState("");
  const [filterType, setFilterType]     = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);
  const [receptionTarget, setReceptionTarget] = useState<Purchase | null>(null);

  const { data: purchases = [], isLoading, refetch } = useQuery<Purchase[]>({
    queryKey: ["purchases"], queryFn: () => api("/purchases"),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/purchases/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: () => { toast.success("Statut mis à jour"); qc.invalidateQueries({ queryKey: ["purchases"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/purchases/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
    onSuccess: (d: any) => {
      toast.success(`Achat ${d.reference ?? ""} supprimé`);
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchases-analytics"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const periodFilter = (p: Purchase) => {
    if (filterPeriod === "all") return true;
    const d = new Date(p.created_at);
    const now = new Date();
    if (filterPeriod === "week")  { const w = new Date(now); w.setDate(w.getDate() - 7);  return d >= w; }
    if (filterPeriod === "month") { const m = new Date(now); m.setMonth(m.getMonth() - 1); return d >= m; }
    if (filterPeriod === "year")  { return d.getFullYear() === now.getFullYear(); }
    return true;
  };

  const filtered = useMemo(() => purchases.filter(p => {
    const q = search.toLowerCase();
    const matchQ = !q || (p.supplier_name ?? "").toLowerCase().includes(q) ||
      (p.reference ?? "").toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q);
    const matchT = filterType === "all" || p.type === filterType;
    const matchS = filterStatus === "all" || p.status === filterStatus;
    return matchQ && matchT && matchS && periodFilter(p);
  }), [purchases, search, filterType, filterStatus, filterPeriod]);

  function exportCSV() {
    const headers = ["Réf","Date","Type","Fournisseur","Description","Montant TTC","Statut","Lot","Immobilisation"];
    const rows = filtered.map(p => [
      p.reference ?? "", fmtDate(p.purchase_date ?? p.created_at), p.type, p.supplier_name,
      p.description ?? (p.type === "VANILLE" ? `${p.weight}kg · ${p.price_per_kg}Ar/kg` : ""),
      p.total_amount, p.status,
      p.lot_code ?? "", p.asset_number ?? ""
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff"+csv], {type:"text/csv"}));
    a.download = "achats-erp.csv"; a.click();
  }

  // Next status in workflow
  function nextStatus(s: string): string | null {
    const flow: Record<string, string> = { brouillon: "valide", valide: "receptionne", receptionne: "comptabilise" };
    return flow[s] ?? null;
  }

  return (
    <>
      {deleteTarget && <DeleteModal purchase={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={r => deleteMut.mutate({ id: deleteTarget.id, reason: r })} isPending={deleteMut.isPending}/>}
      {receptionTarget && <ReceptionModal purchase={receptionTarget} onClose={() => setReceptionTarget(null)}/>}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
            placeholder="Rechercher réf, fournisseur, description…"/>
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="all">Tous types</option>
          {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="all">Tous statuts</option>
          {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="all">Toute période</option>
          <option value="week">Cette semaine</option>
          <option value="month">Ce mois</option>
          <option value="year">Cette année</option>
        </select>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => refetch()} className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"><RefreshCw className="w-4 h-4"/></button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4"/> Export
          </button>
          <button onClick={onNew} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
            <Plus className="w-4 h-4"/> Nouvel achat
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2"/>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30"/>
            <p className="text-sm">Aucun achat trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs">Référence</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs">Type</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs">Fournisseur</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs">Description</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs">Montant TTC</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-600 text-xs">Statut</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs">Liens</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => {
                  const ns = nextStatus(p.status);
                  const nsCfg = ns ? statusCfg(ns) : null;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs font-semibold text-gray-700">{p.reference ?? "—"}</div>
                        <div className="text-xs text-gray-400">{fmtDt(p.created_at)}</div>
                      </td>
                      <td className="py-3 px-4"><TypeBadge type={p.type}/></td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-800 text-xs">{p.supplier_name}</div>
                        {p.supplier_code && <div className="text-xs text-gray-400">{p.supplier_code}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs text-gray-700 max-w-36 truncate">
                          {p.description ?? (p.type === "VANILLE" ? `${fmt(p.weight)} kg · ${fmt(p.price_per_kg)} Ar/kg` : "—")}
                        </div>
                        {p.category && <div className="text-xs text-gray-400">{p.category}</div>}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="font-bold text-gray-900">{fmt(p.total_amount)} Ar</div>
                        {p.vat_amount && p.vat_amount > 0 && <div className="text-xs text-gray-400">TVA: {fmt(p.vat_amount)}</div>}
                      </td>
                      <td className="py-3 px-4 text-center"><StatusBadge status={p.status}/></td>
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          {p.lot_code && (
                            <div className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-mono inline-block">{p.lot_code}</div>
                          )}
                          {p.asset_number && (
                            <div className="text-xs bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-mono inline-block">{p.asset_number}</div>
                          )}
                          {p.journal_entry_id && (
                            <div className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded inline-block">✓ Comptabilisé</div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          {/* Advance workflow */}
                          {ns && nsCfg && (
                            <button onClick={() => {
                              if (ns === "receptionne") setReceptionTarget(p);
                              else statusMut.mutate({ id: p.id, status: ns });
                            }}
                              title={`Passer en "${nsCfg.label}"`}
                              className={`p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors hover:${nsCfg.color.split(" ")[1]}`}>
                              <PlayCircle className="w-4 h-4"/>
                            </button>
                          )}
                          {/* Delete (admin only) */}
                          {isAdmin && (
                            <button onClick={() => setDeleteTarget(p)} title="Supprimer"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                              <Trash2 className="w-4 h-4"/>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-400 flex items-center justify-between">
              <span>{filtered.length} achat{filtered.length !== 1 ? "s" : ""} · Total: {fmt(filtered.reduce((s, p) => s + (p.total_amount ?? 0), 0))} Ar</span>
              <Filter className="w-3.5 h-3.5 text-gray-300"/>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function PurchasesPage() {
  const qc = useQueryClient();
  const [tab, setTab]       = useState<"dashboard"|"list">("dashboard");
  const [showForm, setShowForm] = useState(false);
  const { data: suppliers = [] } = useSuppliers();

  const tabs = [
    { id: "dashboard" as const, label: "Tableau de bord", icon: BarChart3 },
    { id: "list"      as const, label: "Liste des achats", icon: List },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {showForm && (
        <PurchaseForm
          suppliers={suppliers}
          onClose={() => setShowForm(false)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ["purchases"] }); qc.invalidateQueries({ queryKey: ["purchases-analytics"] }); }}
        />
      )}

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="w-7 h-7 text-emerald-600"/> Module Achats
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Approvisionnement · Stock · Immobilisations · Comptabilité</p>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 shadow-sm">
            <Plus className="w-4 h-4"/> Nouvel achat
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? "bg-emerald-600 text-white shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"}`}>
              <t.icon className="w-4 h-4"/>{t.label}
            </button>
          ))}
        </div>

        {tab === "dashboard" ? <DashboardTab/> : <ListTab onNew={() => setShowForm(true)}/>}
      </div>
    </div>
  );
}
