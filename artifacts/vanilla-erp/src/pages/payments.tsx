import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, TrendingUp, TrendingDown, AlertTriangle, Clock,
  Plus, Loader2, X, CheckCircle2, Search, Building2, Smartphone,
  Banknote, Receipt, ArrowUpRight, ArrowDownLeft, ChevronDown, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt     = (n: number) => new Intl.NumberFormat("fr-MG").format(Math.round(n ?? 0));
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";
const fmtDt   = (d: string) => d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";
const isOverdue = (due: string) => due && new Date(due) < new Date();

// ─── Payment methods ──────────────────────────────────────────────────────────
const METHODS: Record<string, { label: string; cat: string; bg: string; text: string; icon: any }> = {
  bni:          { label: "BNI Madagascar",   cat: "bank",   bg: "bg-blue-100",   text: "text-blue-800",   icon: Building2 },
  boa:          { label: "BOA Madagascar",   cat: "bank",   bg: "bg-sky-100",    text: "text-sky-800",    icon: Building2 },
  bfv:          { label: "BFV-SG",           cat: "bank",   bg: "bg-indigo-100", text: "text-indigo-800", icon: Building2 },
  mcb:          { label: "MCB Madagascar",   cat: "bank",   bg: "bg-violet-100", text: "text-violet-800", icon: Building2 },
  mvola:        { label: "Mvola",            cat: "mobile", bg: "bg-red-100",    text: "text-red-800",    icon: Smartphone },
  orange_money: { label: "Orange Money",     cat: "mobile", bg: "bg-orange-100", text: "text-orange-800", icon: Smartphone },
  airtel_money: { label: "Airtel Money",     cat: "mobile", bg: "bg-rose-100",   text: "text-rose-800",   icon: Smartphone },
  bank:         { label: "Virement bancaire",cat: "bank",   bg: "bg-blue-100",   text: "text-blue-700",   icon: Building2 },
  mobile_money: { label: "Mobile Money",     cat: "mobile", bg: "bg-purple-100", text: "text-purple-700", icon: Smartphone },
  cash:         { label: "Espèces",          cat: "cash",   bg: "bg-green-100",  text: "text-green-800",  icon: Banknote },
};

function MethodBadge({ method }: { method: string }) {
  const m = METHODS[method] ?? { label: method, bg: "bg-gray-100", text: "text-gray-700", icon: CreditCard };
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${m.bg} ${m.text}`}>
      <Icon className="w-3 h-3"/>{m.label}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const s: Record<string, { label: string; bg: string; text: string }> = {
    draft:     { label: "Brouillon", bg: "bg-gray-100",   text: "text-gray-500" },
    validated: { label: "Envoyée",   bg: "bg-blue-100",   text: "text-blue-700" },
    paid:      { label: "Payée",     bg: "bg-emerald-100",text: "text-emerald-700" },
    cancelled: { label: "Annulée",   bg: "bg-red-100",    text: "text-red-700" },
  };
  const m = s[status] ?? { label: status, bg: "bg-gray-100", text: "text-gray-600" };
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${m.bg} ${m.text}`}>{m.label}</span>;
}

function KpiCard({ label, value, sub, icon: Icon, color = "text-gray-900", bg = "bg-white", trend }: any) {
  return (
    <div className={`${bg} border border-gray-200 rounded-xl p-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-500">{label}</p>
        <Icon className={`w-4 h-4 opacity-60 ${color}`}/>
      </div>
      <p className={`text-lg font-bold ${color} leading-tight`}>{value}</p>
      {sub  && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      {trend && <p className={`text-xs font-semibold mt-0.5 ${trend.up ? "text-emerald-600" : "text-red-500"}`}>{trend.label}</p>}
    </div>
  );
}

// ─── Client payment modal ─────────────────────────────────────────────────────
function ClientPaymentModal({ open, onClose, onSuccess }: any) {
  const [saleId, setSaleId]   = useState("");
  const [amount, setAmount]   = useState("");
  const [method, setMethod]   = useState("bni");
  const [reference, setRef]   = useState("");

  const { data: salesData } = useQuery({
    queryKey: ["sales-list-pay"],
    queryFn: () => fetch("/api/sales", { credentials: "include" }).then(r => r.json()),
    enabled: open,
  });
  const sales: any[] = Array.isArray(salesData) ? salesData : (salesData?.sales ?? []);

  const mut = useMutation({
    mutationFn: () => fetch("/api/payments", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saleId, amount: Number(amount), method }),
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); }),
    onSuccess: () => { toast.success("Encaissement enregistré — écriture D512/C411 créée"); onSuccess(); reset(); },
    onError: (e: any) => toast.error(e.message),
  });

  const reset = () => { setSaleId(""); setAmount(""); setMethod("bni"); setRef(""); };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-gray-900">Encaissement client</h2>
            <p className="text-xs text-gray-400 mt-0.5">Écriture automatique : Débit 512 / Crédit 411</p>
          </div>
          <button onClick={() => { onClose(); reset(); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X className="w-4 h-4"/></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Vente concernée</label>
            <select value={saleId} onChange={e => setSaleId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Sélectionner une vente —</option>
              {sales.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {fmtDate(s.createdAt)} · {s.client?.name ?? s.clientId?.slice(0,8) ?? "Client"} · {fmt(s.totalAmount)} {s.currency}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Montant encaissé (Ar)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Mode de paiement</label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
              <optgroup label="Banques">
                <option value="bni">BNI Madagascar</option>
                <option value="boa">BOA Madagascar</option>
                <option value="bfv">BFV-SG</option>
                <option value="mcb">MCB Madagascar</option>
                <option value="bank">Virement bancaire</option>
              </optgroup>
              <optgroup label="Mobile Money">
                <option value="mvola">Mvola (Telma)</option>
                <option value="orange_money">Orange Money</option>
                <option value="airtel_money">Airtel Money</option>
              </optgroup>
              <option value="cash">Espèces</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={() => { onClose(); reset(); }} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={() => mut.mutate()} disabled={!saleId || !amount || mut.isPending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <ArrowUpRight className="w-4 h-4"/>}
            Enregistrer l'encaissement
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Supplier payment modal ────────────────────────────────────────────────────
function SupplierPaymentModal({ open, onClose, onSuccess }: any) {
  const [supplierId, setSupplierId] = useState("");
  const [purchaseId, setPurchaseId] = useState("");
  const [amount, setAmount]         = useState("");
  const [method, setMethod]         = useState("bni");
  const [reference, setReference]   = useState("");
  const [note, setNote]             = useState("");

  const { data: suppData } = useQuery({
    queryKey: ["suppliers-list-pay"],
    queryFn: () => fetch("/api/suppliers", { credentials: "include" }).then(async r => { const d = await r.json(); return Array.isArray(d) ? d : (d.suppliers ?? []); }),
    enabled: open,
  });
  const suppliers: any[] = suppData ?? [];

  const { data: purchData } = useQuery({
    queryKey: ["purchases-by-supplier", supplierId],
    queryFn: () => fetch("/api/purchases", { credentials: "include" }).then(async r => { const d = await r.json(); return Array.isArray(d) ? d : (d.purchases ?? []); }),
    enabled: open && !!supplierId,
    select: (d: any[]) => d.filter(p => p.supplier_id === supplierId || p.supplierId === supplierId),
  });
  const purchases: any[] = purchData ?? [];

  const mut = useMutation({
    mutationFn: () => fetch("/api/payments/purchase", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId, purchaseId: purchaseId || undefined, amount: Number(amount), method, reference: reference || undefined, note: note || undefined }),
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); }),
    onSuccess: () => { toast.success("Paiement fournisseur enregistré — écriture D401/C512 créée"); onSuccess(); reset(); },
    onError: (e: any) => toast.error(e.message),
  });

  const reset = () => { setSupplierId(""); setPurchaseId(""); setAmount(""); setMethod("bni"); setReference(""); setNote(""); };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-gray-900">Paiement fournisseur</h2>
            <p className="text-xs text-gray-400 mt-0.5">Écriture automatique : Débit 401 / Crédit 512</p>
          </div>
          <button onClick={() => { onClose(); reset(); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X className="w-4 h-4"/></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Fournisseur *</label>
            <select value={supplierId} onChange={e => { setSupplierId(e.target.value); setPurchaseId(""); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">— Sélectionner un fournisseur —</option>
              {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name} {s.supplier_code ? `(${s.supplier_code})` : ""}</option>)}
            </select>
          </div>
          {supplierId && purchases.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Achat lié (optionnel)</label>
              <select value={purchaseId} onChange={e => { setPurchaseId(e.target.value); const p = purchases.find((x: any) => x.id === e.target.value); if (p) setAmount(String(p.total_amount ?? p.totalAmount ?? "")); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">— Aucun achat sélectionné —</option>
                {purchases.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {fmtDate(p.created_at ?? p.createdAt)} · {fmt(p.total_amount ?? p.totalAmount)} Ar · {p.weight ?? p.weight_kg} kg
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Montant payé (Ar) *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"/>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Mode de paiement *</label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
              <optgroup label="Banques Madagascar">
                <option value="bni">BNI Madagascar</option>
                <option value="boa">BOA Madagascar</option>
                <option value="bfv">BFV-SG</option>
                <option value="mcb">MCB Madagascar</option>
              </optgroup>
              <optgroup label="Mobile Money Madagascar">
                <option value="mvola">Mvola (Telma)</option>
                <option value="orange_money">Orange Money</option>
                <option value="airtel_money">Airtel Money</option>
              </optgroup>
              <option value="cash">Espèces</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Référence transaction</label>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="N° virement, réf. Mvola…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"/>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Note</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Motif du paiement…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 resize-none"/>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={() => { onClose(); reset(); }} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={() => mut.mutate()} disabled={!supplierId || !amount || mut.isPending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-60">
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <ArrowDownLeft className="w-4 h-4"/>}
            Payer le fournisseur
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirmation modal ────────────────────────────────────────────────
function DeleteModal({ open, label, amount, onConfirm, onClose, isPending }: {
  open: boolean; label: string; amount: number;
  onConfirm: () => void; onClose: () => void; isPending: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-red-600"/>
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Supprimer ce paiement ?</h2>
            <p className="text-xs text-gray-400 mt-0.5">Cette action est irréversible</p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-5">
          <p className="text-sm text-red-800">{label}</p>
          <p className="text-base font-bold text-red-700 mt-0.5">{fmt(amount)} Ar</p>
          <p className="text-xs text-red-500 mt-1">L'écriture comptable associée sera également supprimée.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={onConfirm} disabled={isPending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4"/>}
            Supprimer définitivement
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Payments() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canDelete = user?.role === "SUPER_ADMIN" || user?.role === "ACCOUNTANT";

  const [tab, setTab]                     = useState<"clients" | "suppliers" | "invoices">("clients");
  const [showClientModal, setClientModal] = useState(false);
  const [showSupplierModal, setSupplierModal] = useState(false);
  const [search, setSearch]               = useState("");
  const [deleteTarget, setDeleteTarget]   = useState<{ id: string; type: "client" | "supplier"; label: string; amount: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payments-dashboard"],
    queryFn: () => fetch("/api/payments", { credentials: "include" }).then(r => r.json()),
  });

  const onSuccess = () => qc.invalidateQueries({ queryKey: ["payments-dashboard"] });

  const deleteMut = useMutation({
    mutationFn: (target: { id: string; type: "client" | "supplier" }) => {
      const url = target.type === "client"
        ? `/api/payments/${target.id}`
        : `/api/payments/purchase/${target.id}`;
      return fetch(url, { method: "DELETE", credentials: "include" }).then(async r => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Échec de la suppression");
        return r.json();
      });
    },
    onSuccess: () => {
      toast.success("Paiement supprimé et écriture comptable annulée");
      qc.invalidateQueries({ queryKey: ["payments-dashboard"] });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const clientPayments:   any[] = data?.clientPayments   ?? [];
  const supplierPayments: any[] = data?.supplierPayments  ?? [];
  const invoicePayments:  any[] = data?.invoicePayments   ?? [];
  const pendingInvoices:  any[] = data?.pendingInvoices   ?? [];
  const kpis: any               = data?.kpis              ?? {};

  const filteredClients = useMemo(() => {
    const q = search.toLowerCase();
    return clientPayments.filter((p: any) =>
      !q || (p.client_name ?? "").toLowerCase().includes(q) || (p.method ?? "").includes(q)
    );
  }, [clientPayments, search]);

  const filteredSuppliers = useMemo(() => {
    const q = search.toLowerCase();
    return supplierPayments.filter((p: any) =>
      !q || (p.description ?? "").toLowerCase().includes(q) || (p.reference ?? "").toLowerCase().includes(q)
    );
  }, [supplierPayments, search]);

  const overdueInvoices  = pendingInvoices.filter((i: any) => isOverdue(i.due_date) && i.status !== "paid");

  const tabs = [
    { key: "clients",   label: `Encaissements (${clientPayments.length})`,   icon: ArrowUpRight,   color: "text-blue-600" },
    { key: "suppliers", label: `Fournisseurs (${supplierPayments.length})`,   icon: ArrowDownLeft,  color: "text-amber-600" },
    { key: "invoices",  label: `Factures (${pendingInvoices.length})`,        icon: Receipt,        color: "text-purple-600" },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <ClientPaymentModal   open={showClientModal}   onClose={() => setClientModal(false)}   onSuccess={onSuccess}/>
      <SupplierPaymentModal open={showSupplierModal} onClose={() => setSupplierModal(false)} onSuccess={onSuccess}/>
      <DeleteModal
        open={!!deleteTarget}
        label={deleteTarget?.label ?? ""}
        amount={deleteTarget?.amount ?? 0}
        isPending={deleteMut.isPending}
        onConfirm={() => deleteTarget && deleteMut.mutate({ id: deleteTarget.id, type: deleteTarget.type })}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Paiements</h1>
            <p className="text-xs text-gray-400 mt-0.5">Encaissements clients · Paiements fournisseurs · Comptabilité automatique</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSupplierModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 border border-amber-300 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100">
              <ArrowDownLeft className="w-4 h-4"/>Payer fournisseur
            </button>
            <button onClick={() => setClientModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Plus className="w-4 h-4"/>Encaissement client
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total encaissé"          value={fmt(kpis.totalEncaisse ?? 0) + " Ar"}      icon={ArrowUpRight}   bg="bg-blue-50"    color="text-blue-700"   sub="paiements clients"/>
          <KpiCard label="Paiements factures"       value={fmt(kpis.invoicePaymentsTotal ?? 0) + " Ar"} icon={Receipt}       bg="bg-indigo-50"  color="text-indigo-700" sub="via factures"/>
          <KpiCard label="Payé fournisseurs"        value={fmt(kpis.totalPayeFournisseurs ?? 0) + " Ar"} icon={ArrowDownLeft} bg="bg-amber-50"   color="text-amber-700"  sub="sorties banque/caisse"/>
          <KpiCard label="Cashflow net"             value={fmt(kpis.cashflowNet ?? 0) + " Ar"}        icon={kpis.cashflowNet >= 0 ? TrendingUp : TrendingDown}
            bg={kpis.cashflowNet >= 0 ? "bg-emerald-50" : "bg-red-50"}
            color={kpis.cashflowNet >= 0 ? "text-emerald-700" : "text-red-700"}/>
          <KpiCard label="Factures en attente"      value={kpis.facturesAttente ?? 0}                  icon={Clock}          color="text-gray-600"   sub="envoyées, non payées"/>
          <KpiCard label="Factures en retard"       value={overdueInvoices.length}                      icon={AlertTriangle}
            bg={overdueInvoices.length > 0 ? "bg-red-50" : "bg-white"}
            color={overdueInvoices.length > 0 ? "text-red-600" : "text-gray-400"}/>
        </div>

        {/* Overdue alert */}
        {overdueInvoices.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm text-red-800">
            <AlertTriangle className="w-4 h-4 shrink-0"/>
            <span><strong>{overdueInvoices.length} facture(s) en retard</strong> — échéance dépassée. Relancez vos clients dès que possible.</span>
          </div>
        )}

        {/* Tab bar + search */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-2 pt-2">
            <div className="flex gap-0">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key as any)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    tab === t.key ? "border-blue-500 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}>
                  <t.icon className={`w-3.5 h-3.5 ${tab === t.key ? t.color : ""}`}/>{t.label}
                </button>
              ))}
            </div>
            <div className="relative pr-3 pb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
                className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 w-48"/>
            </div>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="py-16 text-center">
              <Loader2 className="w-7 h-7 animate-spin mx-auto mb-2 text-gray-300"/>
              <p className="text-sm text-gray-300">Chargement…</p>
            </div>
          )}

          {/* ── Tab: Encaissements clients ─────────────────────────────────── */}
          {!isLoading && tab === "clients" && (
            <div>
              {filteredClients.length === 0 ? (
                <div className="py-14 text-center">
                  <ArrowUpRight className="w-10 h-10 mx-auto opacity-15 mb-2"/>
                  <p className="text-gray-300 text-sm">Aucun encaissement enregistré</p>
                  <button onClick={() => setClientModal(true)} className="mt-3 text-blue-600 text-xs hover:underline">+ Enregistrer un encaissement</button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["Date","Client","Mode","Référence vente","Montant"].map((h, i) => (
                        <th key={i} className={`text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${i === 4 ? "text-right" : ""}`}>{h}</th>
                      ))}
                      {canDelete && <th className="px-4 py-3"/>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredClients.map((p: any) => (
                      <tr key={p.id} className="hover:bg-gray-50 group">
                        <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(p.created_at)}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{p.client_name ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3"><MethodBadge method={p.method}/></td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{String(p.sale_id ?? "").slice(0, 8).toUpperCase()}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-700">{fmt(p.amount)} Ar</td>
                        {canDelete && (
                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() => setDeleteTarget({ id: p.id, type: "client", label: `Encaissement — ${p.client_name ?? "Client"}`, amount: Number(p.amount) })}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Supprimer ce paiement">
                              <Trash2 className="w-3.5 h-3.5"/>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-blue-50 border-t-2 border-blue-100">
                    <tr>
                      <td colSpan={canDelete ? 5 : 4} className="px-4 py-2.5 text-xs font-bold text-blue-600 uppercase tracking-wider">Total encaissé</td>
                      <td className="px-4 py-2.5 text-right font-bold text-blue-700">
                        {fmt(filteredClients.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0))} Ar
                      </td>
                      {canDelete && <td/>}
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {/* ── Tab: Paiements fournisseurs ────────────────────────────────── */}
          {!isLoading && tab === "suppliers" && (
            <div>
              {filteredSuppliers.length === 0 ? (
                <div className="py-14 text-center">
                  <ArrowDownLeft className="w-10 h-10 mx-auto opacity-15 mb-2"/>
                  <p className="text-gray-300 text-sm">Aucun paiement fournisseur enregistré</p>
                  <button onClick={() => setSupplierModal(true)} className="mt-3 text-amber-600 text-xs hover:underline">+ Payer un fournisseur</button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["Date","Description","Référence","Statut","Montant"].map((h, i) => (
                        <th key={i} className={`text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${i === 4 ? "text-right" : ""}`}>{h}</th>
                      ))}
                      {canDelete && <th className="px-4 py-3"/>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredSuppliers.map((p: any) => (
                      <tr key={p.id} className="hover:bg-gray-50 group">
                        <td className="px-4 py-3 text-xs text-gray-500">{fmtDt(p.created_at)}</td>
                        <td className="px-4 py-3 text-xs text-gray-700 max-w-xs truncate">{p.description}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.reference}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">
                            <CheckCircle2 className="w-3 h-3 inline mr-0.5"/>Validé
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-amber-700">{fmt(p.amount)} Ar</td>
                        {canDelete && (
                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() => setDeleteTarget({ id: p.id, type: "supplier", label: p.description ?? "Paiement fournisseur", amount: Number(p.amount) })}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Supprimer ce paiement">
                              <Trash2 className="w-3.5 h-3.5"/>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-amber-50 border-t-2 border-amber-100">
                    <tr>
                      <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-amber-600 uppercase tracking-wider">Total payé fournisseurs</td>
                      <td className="px-4 py-2.5 text-right font-bold text-amber-700">
                        {fmt(filteredSuppliers.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0))} Ar
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {/* ── Tab: Factures & échéances ─────────────────────────────────── */}
          {!isLoading && tab === "invoices" && (
            <div>
              {pendingInvoices.length === 0 ? (
                <div className="py-14 text-center">
                  <Receipt className="w-10 h-10 mx-auto opacity-15 mb-2"/>
                  <p className="text-gray-300 text-sm">Aucune facture active</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["Facture","Partenaire","Type","Statut","Échéance","Montant TTC","Payé","Reste"].map((h, i) => (
                        <th key={i} className={`text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${i >= 6 ? "text-right" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pendingInvoices.map((inv: any) => {
                      const over = isOverdue(inv.due_date) && inv.status !== "paid";
                      return (
                        <tr key={inv.id} className={`hover:bg-gray-50 ${over ? "bg-red-50/30" : ""}`}>
                          <td className="px-4 py-3 font-mono text-xs font-bold text-gray-700">{inv.invoice_number}</td>
                          <td className="px-4 py-3 text-xs font-medium text-gray-800">{inv.partner_name}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${inv.type === "sale" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                              {inv.type === "sale" ? "Vente" : "Achat"}
                            </span>
                          </td>
                          <td className="px-4 py-3"><InvoiceStatusBadge status={inv.status}/></td>
                          <td className="px-4 py-3">
                            <span className={`text-xs ${over ? "font-bold text-red-600" : "text-gray-500"}`}>
                              {over && <AlertTriangle className="w-3 h-3 inline mr-0.5"/>}
                              {fmtDate(inv.due_date)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800">{fmt(inv.amount_ttc)} Ar</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{fmt(inv.paid_amount ?? 0)} Ar</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-bold text-xs ${Number(inv.remaining) > 0 ? (over ? "text-red-600" : "text-amber-600") : "text-emerald-600"}`}>
                              {Number(inv.remaining) <= 0 ? "✓ Soldée" : fmt(inv.remaining) + " Ar"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* Invoice payments history */}
              {invoicePayments.length > 0 && (
                <div className="border-t border-gray-100">
                  <div className="px-5 py-3 bg-purple-50">
                    <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Paiements sur factures ({invoicePayments.length})</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {["Date","Facture","Partenaire","Mode","Référence","Montant"].map((h, i) => (
                          <th key={i} className={`text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider ${i === 5 ? "text-right" : ""}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {invoicePayments.map((ip: any) => (
                        <tr key={ip.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDt(ip.created_at)}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-purple-700">{ip.invoice_number}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-700">{ip.partner_name}</td>
                          <td className="px-4 py-2.5"><MethodBadge method={ip.method}/></td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">{ip.reference ?? "—"}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-purple-700">{fmt(ip.amount)} Ar</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cashflow summary */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Encaissements clients",    value: fmt(kpis.totalEncaisse ?? 0),          color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-100",    icon: ArrowUpRight },
            { label: "Paiements fournisseurs",    value: fmt(kpis.totalPayeFournisseurs ?? 0),  color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-100",   icon: ArrowDownLeft },
            { label: "Cashflow net",              value: fmt(kpis.cashflowNet ?? 0),            color: kpis.cashflowNet >= 0 ? "text-emerald-700" : "text-red-700",  bg: kpis.cashflowNet >= 0 ? "bg-emerald-50" : "bg-red-50", border: kpis.cashflowNet >= 0 ? "border-emerald-100" : "border-red-100", icon: kpis.cashflowNet >= 0 ? TrendingUp : TrendingDown },
          ].map(({ label, value, color, bg, border, icon: Icon }) => (
            <div key={label} className={`${bg} border ${border} rounded-xl p-4 flex items-center gap-3`}>
              <div className={`w-10 h-10 rounded-full ${bg} border ${border} flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`}/>
              </div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-base font-bold ${color}`}>{value} Ar</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
