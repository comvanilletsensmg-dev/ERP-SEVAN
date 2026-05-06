/**
 * Factures — Invoice management with Madagascar multi-payment module
 * Payments: Liquide, Mvola, Orange Money, BNI, BOA, BFV, Accès Banque
 */
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetPartners } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Plus, FileText, CheckCircle2, CreditCard, Search, Filter,
  Upload, X, ChevronRight, Loader2, RefreshCw, TrendingUp,
  Banknote, Smartphone, Building2, Receipt, AlertCircle, Eye,
} from "lucide-react";

// ── Payment methods ────────────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { id: "cash",         name: "Liquide",              type: "cash",         color: "emerald", emoji: "💵", provider: "Cash" },
  { id: "mvola",        name: "Mvola",                type: "mobile_money", color: "red",     emoji: "📱", provider: "Mvola" },
  { id: "orange_money", name: "Orange Money",         type: "mobile_money", color: "orange",  emoji: "📱", provider: "Orange Money" },
  { id: "bni",          name: "BNI Madagascar",       type: "bank",         color: "blue",    emoji: "🏦", provider: "BNI Madagascar" },
  { id: "boa",          name: "BOA Madagascar",       type: "bank",         color: "indigo",  emoji: "🏦", provider: "BOA Madagascar" },
  { id: "bfv",          name: "BFV Société Générale", type: "bank",         color: "rose",    emoji: "🏦", provider: "BFV Société Générale" },
  { id: "acces",        name: "Accès Banque",         type: "bank",         color: "teal",    emoji: "🏦", provider: "Accès Banque" },
] as const;

type MethodId = typeof PAYMENT_METHODS[number]["id"];
type MethodType = "cash" | "mobile_money" | "bank";

const METHOD_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; ring: string }> = {
  emerald: { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-400" },
  red:     { bg: "bg-red-50",     border: "border-red-300",     text: "text-red-800",     badge: "bg-red-100 text-red-700",         ring: "ring-red-400" },
  orange:  { bg: "bg-orange-50",  border: "border-orange-300",  text: "text-orange-800",  badge: "bg-orange-100 text-orange-700",   ring: "ring-orange-400" },
  blue:    { bg: "bg-blue-50",    border: "border-blue-300",    text: "text-blue-800",    badge: "bg-blue-100 text-blue-700",       ring: "ring-blue-400" },
  indigo:  { bg: "bg-indigo-50",  border: "border-indigo-300",  text: "text-indigo-800",  badge: "bg-indigo-100 text-indigo-700",   ring: "ring-indigo-400" },
  rose:    { bg: "bg-rose-50",    border: "border-rose-300",    text: "text-rose-800",    badge: "bg-rose-100 text-rose-700",       ring: "ring-rose-400" },
  teal:    { bg: "bg-teal-50",    border: "border-teal-300",    text: "text-teal-800",    badge: "bg-teal-100 text-teal-700",       ring: "ring-teal-400" },
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface Invoice {
  id: string; invoiceNumber: string; partnerId: string; type: string;
  currency: string; amountHT: number; tvaRate: number; tvaMontant: number;
  amountTTC: number; status: string; dueDate: string | null;
  fileUrl: string | null; notes: string | null; createdAt: string;
  partner?: { id: string; name: string; type: string } | null;
}

interface InvPayment {
  id: string; invoiceId: string; amount: number; method: string;
  provider: string | null; reference: string | null; proofUrl: string | null;
  notes: string | null; createdAt: string;
}

interface PaymentsData { payments: InvPayment[]; totalPaid: number; remaining: number; pct: number; invoice: Invoice }
interface Stats { totals: { cash: number; mobile_money: number; bank: number; total: number }; byMethod: Record<string, number> }

type InvoiceForm = {
  invoiceNumber: string; partnerId: string; type: string; currency: string;
  amountHT: number; tvaRate: number; dueDate: string; notes: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
const fmtD = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const fmtT = (d: string) => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Brouillon",  cls: "bg-gray-100 text-gray-600" },
  validated: { label: "Validée",    cls: "bg-blue-100 text-blue-700" },
  partial:   { label: "Partielle",  cls: "bg-amber-100 text-amber-700" },
  paid:      { label: "Payée",      cls: "bg-emerald-100 text-emerald-700" },
};

function methodMeta(id: string) {
  return PAYMENT_METHODS.find(m => m.id === id) ?? PAYMENT_METHODS[0];
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[90vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── Payment method card ───────────────────────────────────────────────────────
function MethodCard({ m, selected, onSelect }: { m: typeof PAYMENT_METHODS[number]; selected: boolean; onSelect: () => void }) {
  const c = METHOD_COLORS[m.color];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
        selected
          ? `${c.bg} ${c.border} ring-2 ${c.ring} shadow-sm`
          : "bg-gray-50 border-gray-200 hover:border-gray-300 hover:bg-gray-100"
      }`}
    >
      <span className="text-2xl leading-none">{m.emoji}</span>
      <span className={`text-xs font-semibold leading-tight ${selected ? c.text : "text-gray-700"}`}>{m.name}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${selected ? c.badge : "bg-gray-200 text-gray-500"}`}>
        {m.type === "cash" ? "Espèces" : m.type === "mobile_money" ? "Mobile" : "Banque"}
      </span>
    </button>
  );
}

// ── Payment progress bar ──────────────────────────────────────────────────────
function PaymentBar({ pct, remaining, totalPaid, amountTTC }: { pct: number; remaining: number; totalPaid: number; amountTTC: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-medium text-gray-600">
        <span>Payé : <span className="text-emerald-700 font-bold">{fmt(totalPaid)} Ar</span></span>
        <span>Reste : <span className={`font-bold ${remaining > 0 ? "text-amber-700" : "text-emerald-700"}`}>{fmt(remaining)} Ar</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-gray-300"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 text-right">{pct.toFixed(1)}% du total TTC ({fmt(amountTTC)} Ar)</p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const qc = useQueryClient();
  const { data: partners } = useGetPartners();
  const proofFileRef = useRef<HTMLInputElement>(null);

  // UI state
  const [showCreateModal, setShowCreateModal]   = useState(false);
  const [showDetailModal, setShowDetailModal]   = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice]   = useState<Invoice | null>(null);
  const [filterType,   setFilterType]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  // Payment form state
  const [selMethod, setSelMethod] = useState<MethodId>("cash");
  const [payAmount, setPayAmount] = useState("");
  const [payRef,    setPayRef]    = useState("");
  const [payNotes,  setPayNotes]  = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUrl,  setProofUrl]  = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [createError, setCreateError] = useState("");

  // Invoice form
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<InvoiceForm>({
    defaultValues: { type: "sale", currency: "MGA", tvaRate: 20 },
  });
  const watchHT   = watch("amountHT");
  const watchRate = watch("tvaRate");
  const tvaPreview = (Number(watchHT) || 0) * (Number(watchRate) || 0) / 100;
  const ttcPreview = (Number(watchHT) || 0) + tvaPreview;

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: invoices = [], isLoading, refetch } = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: () => fetch("/api/invoices", { credentials: "include" }).then(r => r.json()),
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["invoice-payment-stats"],
    queryFn: () => fetch("/api/invoices/payments/stats", { credentials: "include" }).then(r => r.json()),
  });

  const { data: paymentsData, refetch: refetchPayments } = useQuery<PaymentsData>({
    queryKey: ["invoice-payments", selectedInvoice?.id],
    queryFn: () => fetch(`/api/invoices/${selectedInvoice!.id}/payments`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedInvoice?.id,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createInvoice = useMutation({
    mutationFn: (body: object) => fetch("/api/invoices", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async r => { const d = await r.json(); if (!r.ok) throw d; return d; }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); setShowCreateModal(false); reset({ type: "sale", currency: "MGA", tvaRate: 20 }); toast.success("Facture créée"); },
    onError: (e: { error?: string }) => setCreateError(e.error ?? "Erreur"),
  });

  const validateInvoice = useMutation({
    mutationFn: (id: string) => fetch(`/api/invoices/${id}/validate`, { method: "PUT", credentials: "include" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); toast.success("Facture validée"); },
  });

  const addPayment = useMutation({
    mutationFn: (body: object) => fetch(`/api/invoices/${selectedInvoice!.id}/payments`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async r => { const d = await r.json(); if (!r.ok) throw d; return d; }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice-payments", selectedInvoice?.id] });
      qc.invalidateQueries({ queryKey: ["invoice-payment-stats"] });
      setShowPaymentModal(false);
      resetPaymentForm();
      const status = data.newStatus;
      if (status === "paid") toast.success("Facture entièrement payée !");
      else toast.success(`Paiement enregistré — reste ${fmt(data.remaining)} Ar`);
      // Update selected invoice status locally
      if (selectedInvoice) setSelectedInvoice(prev => prev ? { ...prev, status } : prev);
    },
    onError: (e: { error?: string }) => toast.error(e.error ?? "Erreur lors du paiement"),
  });

  const resetPaymentForm = () => {
    setSelMethod("cash");
    setPayAmount("");
    setPayRef("");
    setPayNotes("");
    setProofFile(null);
    setProofUrl("");
  };

  // ── Proof upload ──────────────────────────────────────────────────────────────
  const handleProofUpload = async (file: File) => {
    setUploadingProof(true);
    try {
      const fd = new FormData();
      fd.append("proof", file);
      const r = await fetch("/api/invoices/payments/proof", { method: "POST", credentials: "include", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erreur upload");
      setProofUrl(d.proofUrl);
      setProofFile(file);
      toast.success("Preuve uploadée");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur upload");
    } finally {
      setUploadingProof(false);
    }
  };

  // ── Submit payment ────────────────────────────────────────────────────────────
  const handleSubmitPayment = () => {
    const m = methodMeta(selMethod);
    const needsRef = m.type === "mobile_money" || m.type === "bank";
    if (!payAmount || Number(payAmount) <= 0) { toast.error("Montant invalide"); return; }
    if (needsRef && !payRef.trim()) { toast.error("Référence requise pour " + m.name); return; }
    addPayment.mutate({
      amount: Number(payAmount),
      method: selMethod,
      provider: m.provider,
      reference: payRef || undefined,
      proofUrl: proofUrl || undefined,
      notes: payNotes || undefined,
    });
  };

  // ── Filter & search ───────────────────────────────────────────────────────────
  const filtered = invoices.filter(i => {
    if (filterType !== "all" && i.type !== filterType) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!i.invoiceNumber.toLowerCase().includes(q) && !(i.partner?.name ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const openDetail = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setShowDetailModal(true);
  };

  const openPayment = (inv: Invoice) => {
    setSelectedInvoice(inv);
    resetPaymentForm();
    // Pre-fill remaining amount
    if (paymentsData && paymentsData.invoice.id === inv.id) {
      setPayAmount(String(Math.round(paymentsData.remaining)));
    }
    setShowPaymentModal(true);
  };

  const currentMethod = methodMeta(selMethod);
  const needsRef = currentMethod.type === "mobile_money" || currentMethod.type === "bank";
  const remaining = paymentsData?.remaining ?? selectedInvoice?.amountTTC ?? 0;

  // ── Stats KPIs ────────────────────────────────────────────────────────────────
  const statCards = [
    { label: "Total encaissé", value: stats?.totals.total ?? 0, icon: TrendingUp, cls: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Espèces", value: stats?.totals.cash ?? 0, icon: Banknote, cls: "text-green-600", bg: "bg-green-50" },
    { label: "Mobile Money", value: stats?.totals.mobile_money ?? 0, icon: Smartphone, cls: "text-orange-600", bg: "bg-orange-50" },
    { label: "Banque", value: stats?.totals.bank ?? 0, icon: Building2, cls: "text-blue-600", bg: "bg-blue-50" },
  ];

  const totalInvoiced = invoices.reduce((s, i) => s + i.amountTTC, 0);
  const totalPaidAll  = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amountTTC, 0);
  const totalPartial  = invoices.filter(i => i.status === "partial").length;
  const overdue       = invoices.filter(i => i.dueDate && new Date(i.dueDate) < new Date() && i.status !== "paid").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-600" />Factures
          </h1>
          <p className="text-sm text-gray-500 mt-1">Madagascar · Mvola · Orange Money · BNI · BOA · BFV · Accès Banque</p>
        </div>
        <button
          onClick={() => { setCreateError(""); reset({ type: "sale", currency: "MGA", tvaRate: 20 }); setShowCreateModal(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm font-semibold shadow-sm"
        >
          <Plus className="w-4 h-4" />Nouvelle facture
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-white shadow-sm`}>
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.cls}`} />
              <span className="text-xs font-medium text-gray-600">{s.label}</span>
            </div>
            <p className={`text-lg font-bold font-mono ${s.cls}`}>{fmt(s.value)}<span className="text-xs font-normal ml-1">Ar</span></p>
          </div>
        ))}
      </div>

      {/* Invoice summary bar */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex flex-wrap gap-4 items-center shadow-sm">
        <div className="text-sm text-gray-600">Total facturé : <span className="font-bold text-gray-900">{fmt(totalInvoiced)} Ar</span></div>
        <div className="text-sm text-gray-600">Payées : <span className="font-bold text-emerald-700">{fmt(totalPaidAll)} Ar</span></div>
        {totalPartial > 0 && <div className="text-sm text-amber-700 font-semibold">{totalPartial} facture(s) en paiement partiel</div>}
        {overdue > 0 && (
          <div className="flex items-center gap-1 text-sm text-red-600 font-semibold">
            <AlertCircle className="w-3.5 h-3.5" />{overdue} facture(s) en retard
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none w-44"
          />
        </div>
        <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1 bg-white">
          {[["all","Toutes"],["sale","Ventes"],["purchase","Achats"]].map(([v,l]) => (
            <button key={v} onClick={() => setFilterType(v)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterType === v ? "bg-emerald-100 text-emerald-700" : "text-gray-600 hover:bg-gray-100"}`}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1 bg-white">
          {[["all","Tout statut"],["draft","Brouillon"],["validated","Validée"],["partial","Partielle"],["paid","Payée"]].map(([v,l]) => (
            <button key={v} onClick={() => setFilterStatus(v)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterStatus === v ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}>{l}</button>
          ))}
        </div>
        <button onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["invoice-payment-stats"] }); }} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Invoice table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["N° Facture","Tiers","Type","Montant HT","TVA","Total TTC","Statut","Échéance","Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-14 text-gray-400">Aucune facture</td></tr>
              ) : filtered.map(inv => {
                const st = STATUS_MAP[inv.status] ?? STATUS_MAP.draft;
                const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid";
                return (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => openDetail(inv)}>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-gray-700">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{inv.partner?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${inv.type === "sale" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                        {inv.type === "sale" ? "Vente" : "Achat"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{fmt(inv.amountHT)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{fmt(inv.tvaMontant)} <span className="text-gray-400">({inv.tvaRate}%)</span></td>
                    <td className="px-4 py-3 font-mono text-sm font-bold text-gray-900">{fmt(inv.amountTTC)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {inv.dueDate ? (
                        <span className={isOverdue ? "text-red-600 font-semibold" : "text-gray-500"}>
                          {fmtD(inv.dueDate)}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5 items-center">
                        <button onClick={() => openDetail(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Voir détails">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {inv.status === "draft" && (
                          <button
                            onClick={() => validateInvoice.mutate(inv.id)}
                            disabled={validateInvoice.isPending}
                            className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors"
                          >
                            Valider
                          </button>
                        )}
                        {(inv.status === "validated" || inv.status === "partial") && (
                          <button
                            onClick={() => { setSelectedInvoice(inv); resetPaymentForm(); setShowPaymentModal(true); }}
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-200 transition-colors"
                          >
                            <CreditCard className="w-3 h-3" />Payer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── CREATE INVOICE MODAL ─────────────────────────────────────────────── */}
      {showCreateModal && (
        <Modal title="Nouvelle facture" onClose={() => setShowCreateModal(false)}>
          <form onSubmit={handleSubmit(data => createInvoice.mutate({ ...data, amountHT: Number(data.amountHT), tvaRate: Number(data.tvaRate) }))} className="space-y-4">
            {createError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{createError}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">N° Facture *</label>
                <input {...register("invoiceNumber", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="FAC-2026-001" />
                {errors.invoiceNumber && <p className="text-red-500 text-xs mt-0.5">Requis</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Type *</label>
                <select {...register("type")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="sale">Vente</option>
                  <option value="purchase">Achat</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tiers *</label>
                <select {...register("partnerId", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="">— Sélectionner —</option>
                  {(partners ?? []).map(p => <option key={p.id} value={p.id}>{p.name} ({p.type === "client" ? "Client" : "Fournisseur"})</option>)}
                </select>
                {errors.partnerId && <p className="text-red-500 text-xs mt-0.5">Requis</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Montant HT *</label>
                <input type="number" step="1" {...register("amountHT", { required: true, min: 1 })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Taux TVA</label>
                <select {...register("tvaRate")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value={20}>20% (standard)</option>
                  <option value={0}>0% (export / exonéré)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Devise</label>
                <select {...register("currency")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  {["MGA","USD","EUR"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Échéance</label>
                <input type="date" {...register("dueDate")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            </div>
            {ttcPreview > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 font-mono text-sm space-y-1">
                <div className="flex justify-between text-gray-600"><span>TVA ({watchRate}%)</span><span>{fmt(tvaPreview)} Ar</span></div>
                <div className="flex justify-between font-bold text-emerald-800 text-base border-t border-emerald-200 pt-1"><span>Total TTC</span><span>{fmt(ttcPreview)} Ar</span></div>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
              <textarea {...register("notes")} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Annuler</button>
              <button type="submit" disabled={createInvoice.isPending} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {createInvoice.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Créer
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── INVOICE DETAIL MODAL ─────────────────────────────────────────────── */}
      {showDetailModal && selectedInvoice && (
        <Modal title={`Facture ${selectedInvoice.invoiceNumber}`} onClose={() => setShowDetailModal(false)} wide>
          <div className="space-y-5">
            {/* Invoice header */}
            <div className="grid grid-cols-3 gap-4">
              <div><p className="text-xs text-gray-500 font-medium">Tiers</p><p className="font-semibold text-gray-900">{selectedInvoice.partner?.name ?? "—"}</p></div>
              <div><p className="text-xs text-gray-500 font-medium">Type</p>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${selectedInvoice.type === "sale" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                  {selectedInvoice.type === "sale" ? "Vente" : "Achat"}
                </span>
              </div>
              <div><p className="text-xs text-gray-500 font-medium">Statut</p>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-0.5 ${(STATUS_MAP[selectedInvoice.status] ?? STATUS_MAP.draft).cls}`}>
                  {(STATUS_MAP[selectedInvoice.status] ?? STATUS_MAP.draft).label}
                </span>
              </div>
              <div><p className="text-xs text-gray-500 font-medium">Montant HT</p><p className="font-mono font-semibold">{fmt(selectedInvoice.amountHT)} Ar</p></div>
              <div><p className="text-xs text-gray-500 font-medium">TVA {selectedInvoice.tvaRate}%</p><p className="font-mono">{fmt(selectedInvoice.tvaMontant)} Ar</p></div>
              <div><p className="text-xs text-gray-500 font-medium">Total TTC</p><p className="font-mono font-bold text-gray-900 text-base">{fmt(selectedInvoice.amountTTC)} Ar</p></div>
            </div>

            {/* Payment progress */}
            {paymentsData && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <PaymentBar
                  pct={paymentsData.pct}
                  remaining={paymentsData.remaining}
                  totalPaid={paymentsData.totalPaid}
                  amountTTC={selectedInvoice.amountTTC}
                />
              </div>
            )}

            {/* Add payment button */}
            {(selectedInvoice.status === "validated" || selectedInvoice.status === "partial") && (
              <button
                onClick={() => { resetPaymentForm(); setPayAmount(String(Math.round(paymentsData?.remaining ?? selectedInvoice.amountTTC))); setShowPaymentModal(true); setShowDetailModal(false); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors"
              >
                <CreditCard className="w-4 h-4" />Enregistrer un paiement
              </button>
            )}

            {/* Payment history */}
            <div>
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-indigo-500" />Historique des paiements
                {paymentsData && <span className="text-xs font-normal text-gray-500">({paymentsData.payments.length} paiement(s))</span>}
              </h3>
              {!paymentsData || paymentsData.payments.length === 0 ? (
                <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Aucun paiement enregistré</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {paymentsData.payments.map(p => {
                    const m = methodMeta(p.method);
                    const c = METHOD_COLORS[m.color];
                    return (
                      <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border ${c.bg} ${c.border}`}>
                        <span className="text-xl">{m.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold ${c.text}`}>{m.name}</span>
                            {p.reference && <span className="text-xs text-gray-500 font-mono">Réf: {p.reference}</span>}
                            {p.notes && <span className="text-xs text-gray-400 italic truncate max-w-32">{p.notes}</span>}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{fmtD(p.createdAt)} à {fmtT(p.createdAt)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-mono font-bold text-sm ${c.text}`}>{fmt(p.amount)} Ar</p>
                          {p.proofUrl && (
                            <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">Voir preuve</a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── PAYMENT MODAL ────────────────────────────────────────────────────── */}
      {showPaymentModal && selectedInvoice && (
        <Modal title={`Enregistrer un paiement — ${selectedInvoice.invoiceNumber}`} onClose={() => setShowPaymentModal(false)} wide>
          <div className="space-y-5">
            {/* Remaining info */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-700">Reste à payer</p>
                <p className="text-xl font-bold font-mono text-amber-900">{fmt(remaining)} Ar</p>
              </div>
              <p className="text-xs text-amber-600 text-right">Total TTC<br /><span className="font-bold font-mono">{fmt(selectedInvoice.amountTTC)} Ar</span></p>
            </div>

            {/* Method grid */}
            <div>
              <p className="text-sm font-bold text-gray-800 mb-3">Moyen de paiement</p>
              <div className="grid grid-cols-4 gap-2">
                {PAYMENT_METHODS.map(m => (
                  <MethodCard
                    key={m.id}
                    m={m}
                    selected={selMethod === m.id}
                    onSelect={() => setSelMethod(m.id)}
                  />
                ))}
              </div>
              {/* Selected method suggestion */}
              {currentMethod.type === "mobile_money" && (
                <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5" />Référence de transaction requise pour le suivi
                </p>
              )}
              {currentMethod.type === "bank" && (
                <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />Recommandé pour les montants &gt; 1 000 000 Ar
                </p>
              )}
            </div>

            {/* Amount + Reference */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Montant payé (Ar) *</label>
                <input
                  type="number" min="1" step="1"
                  value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder={`Max: ${fmt(remaining)}`}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Référence {needsRef ? <span className="text-red-500">*</span> : <span className="text-gray-400">(optionnel)</span>}
                </label>
                <input
                  value={payRef} onChange={e => setPayRef(e.target.value)}
                  placeholder={currentMethod.type === "mobile_money" ? "Ex: TXN-2024-XXXXXX" : currentMethod.type === "bank" ? "Ex: VIR-XXXXXXXX" : "Optionnel"}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Notes (optionnel)</label>
              <input
                value={payNotes} onChange={e => setPayNotes(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="Ex: Acompte, solde…"
              />
            </div>

            {/* Proof upload */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Preuve de paiement (optionnel)</label>
              {proofUrl ? (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs text-emerald-800 truncate flex-1">{proofFile?.name ?? "Fichier uploadé"}</span>
                  <button onClick={() => { setProofUrl(""); setProofFile(null); }} className="text-xs text-red-500 hover:text-red-700 shrink-0">Retirer</button>
                </div>
              ) : (
                <label className={`flex flex-col items-center gap-2 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors ${uploadingProof ? "border-gray-200 bg-gray-50" : "border-gray-300 hover:border-emerald-400 hover:bg-emerald-50"}`}>
                  {uploadingProof
                    ? <><Loader2 className="w-5 h-5 animate-spin text-gray-400" /><span className="text-xs text-gray-500">Upload en cours…</span></>
                    : <><Upload className="w-5 h-5 text-gray-400" /><span className="text-xs text-gray-500">Cliquer pour uploader reçu Mvola, reçu banque…<br />JPG, PNG, PDF — max 10 Mo</span></>
                  }
                  <input
                    ref={proofFileRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="sr-only"
                    disabled={uploadingProof}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleProofUpload(f); }}
                  />
                </label>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmitPayment}
                disabled={addPayment.isPending || !payAmount || Number(payAmount) <= 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {addPayment.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Enregistrement…</>
                  : <><CreditCard className="w-4 h-4" />Enregistrer {payAmount ? `${fmt(Number(payAmount))} Ar` : ""}</>
                }
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
