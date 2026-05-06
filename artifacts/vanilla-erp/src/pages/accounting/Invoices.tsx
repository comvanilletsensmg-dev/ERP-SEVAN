/**
 * Factures — Invoice management with Madagascar multi-payment module
 * Payments: Liquide, Mvola, Orange Money, BNI, BOA, BFV, Accès Banque
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetPartners } from "@workspace/api-client-react";
import { toast } from "sonner";
import {
  Plus, FileText, CheckCircle2, CreditCard, Search,
  Upload, X, Loader2, RefreshCw, TrendingUp,
  Banknote, Smartphone, Building2, Receipt, AlertCircle, Eye,
  Trash2, Package, ChevronDown, Calendar, Sparkles, ArrowRight,
  Hash, User, Globe, FileCheck, Printer,
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

const METHOD_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; ring: string }> = {
  emerald: { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-400" },
  red:     { bg: "bg-red-50",     border: "border-red-300",     text: "text-red-800",     badge: "bg-red-100 text-red-700",         ring: "ring-red-400" },
  orange:  { bg: "bg-orange-50",  border: "border-orange-300",  text: "text-orange-800",  badge: "bg-orange-100 text-orange-700",   ring: "ring-orange-400" },
  blue:    { bg: "bg-blue-50",    border: "border-blue-300",    text: "text-blue-800",    badge: "bg-blue-100 text-blue-700",       ring: "ring-blue-400" },
  indigo:  { bg: "bg-indigo-50",  border: "border-indigo-300",  text: "text-indigo-800",  badge: "bg-indigo-100 text-indigo-700",   ring: "ring-indigo-400" },
  rose:    { bg: "bg-rose-50",    border: "border-rose-300",    text: "text-rose-800",    badge: "bg-rose-100 text-rose-700",       ring: "ring-rose-400" },
  teal:    { bg: "bg-teal-50",    border: "border-teal-300",    text: "text-teal-800",    badge: "bg-teal-100 text-teal-700",       ring: "ring-teal-400" },
};

// ── Invoice line item ──────────────────────────────────────────────────────────
type LineItem = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

function newLine(): LineItem {
  return { id: crypto.randomUUID(), description: "", unit: "unité", quantity: 1, unitPrice: 0 };
}

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

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
const fmtD = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const fmtT = (d: string) => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const endOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Brouillon",  cls: "bg-gray-100 text-gray-600" },
  validated: { label: "Validée",    cls: "bg-blue-100 text-blue-700" },
  partial:   { label: "Partielle",  cls: "bg-amber-100 text-amber-700" },
  paid:      { label: "Payée",      cls: "bg-emerald-100 text-emerald-700" },
};

function methodMeta(id: string) {
  return PAYMENT_METHODS.find(m => m.id === id) ?? PAYMENT_METHODS[0];
}

// ── Payment method card ───────────────────────────────────────────────────────
function MethodCard({ m, selected, onSelect }: { m: typeof PAYMENT_METHODS[number]; selected: boolean; onSelect: () => void }) {
  const c = METHOD_COLORS[m.color];
  return (
    <button type="button" onClick={onSelect}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
        selected ? `${c.bg} ${c.border} ring-2 ${c.ring} shadow-sm` : "bg-gray-50 border-gray-200 hover:border-gray-300 hover:bg-gray-100"
      }`}>
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
        <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-gray-300"}`}
          style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="text-xs text-gray-400 text-right">{pct.toFixed(1)}% du total TTC ({fmt(amountTTC)} Ar)</p>
    </div>
  );
}

// ── Generic modal ─────────────────────────────────────────────────────────────
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

// ── Invoice preview (right panel) ─────────────────────────────────────────────
function InvoicePreview({
  invoiceNumber, type, partnerName, dateEmission, dueDate,
  lines, tvaRate, currency, notes, conditions,
}: {
  invoiceNumber: string; type: string; partnerName: string; dateEmission: string;
  dueDate: string; lines: LineItem[]; tvaRate: number; currency: string;
  notes: string; conditions: string;
}) {
  const validLines = lines.filter(l => l.description.trim());
  const totalHT = validLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const tvaMontant = totalHT * tvaRate / 100;
  const totalTTC = totalHT + tvaMontant;
  const cur = currency || "MGA";
  const fmtC = (n: number) => `${fmt(n)} ${cur}`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden text-[11px] font-sans">
      {/* Header band */}
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-5 py-4 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-emerald-200 mb-0.5">Vanilla Madagascar</p>
            <p className="font-bold text-sm">ERP Export Vanille</p>
            <p className="text-[10px] text-emerald-200 mt-1">Antananarivo, Madagascar</p>
          </div>
          <div className="text-right">
            <p className={`text-lg font-black uppercase tracking-wide ${type === "sale" ? "text-white" : "text-orange-200"}`}>
              {type === "sale" ? "FACTURE" : "BON D'ACHAT"}
            </p>
            <p className="font-mono text-emerald-100 font-semibold mt-0.5">
              {invoiceNumber || <span className="italic text-emerald-300">N° auto</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Info row */}
      <div className="grid grid-cols-2 gap-0 border-b border-gray-100">
        <div className="px-5 py-3 border-r border-gray-100">
          <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
            {type === "sale" ? "Facturé à" : "Fournisseur"}
          </p>
          <p className="font-bold text-gray-800 text-xs">{partnerName || <span className="italic text-gray-400">— Tiers —</span>}</p>
          <p className="text-gray-400 mt-0.5">Madagascar</p>
        </div>
        <div className="px-5 py-3">
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-400">Date émission</span>
              <span className="font-medium text-gray-700">{dateEmission ? new Date(dateEmission).toLocaleDateString("fr-FR") : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Échéance</span>
              <span className={`font-medium ${dueDate && new Date(dueDate) < new Date() ? "text-red-600" : "text-gray-700"}`}>
                {dueDate ? new Date(dueDate).toLocaleDateString("fr-FR") : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Devise</span>
              <span className="font-semibold text-emerald-700">{cur}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lines table */}
      <div className="px-4 py-3">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-1.5 text-[9px] uppercase tracking-wider text-gray-400 font-semibold w-1/2">Désignation</th>
              <th className="text-center py-1.5 text-[9px] uppercase tracking-wider text-gray-400 font-semibold">Qté</th>
              <th className="text-center py-1.5 text-[9px] uppercase tracking-wider text-gray-400 font-semibold">Unit.</th>
              <th className="text-right py-1.5 text-[9px] uppercase tracking-wider text-gray-400 font-semibold">P.U.</th>
              <th className="text-right py-1.5 text-[9px] uppercase tracking-wider text-gray-400 font-semibold">HT</th>
            </tr>
          </thead>
          <tbody>
            {validLines.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-center text-gray-300 italic">Aucune ligne</td></tr>
            ) : validLines.map((l, i) => (
              <tr key={l.id} className={`border-b border-gray-50 ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                <td className="py-1.5 text-gray-700 font-medium truncate max-w-0 w-1/2">{l.description}</td>
                <td className="py-1.5 text-center text-gray-600 font-mono">{l.quantity}</td>
                <td className="py-1.5 text-center text-gray-400">{l.unit}</td>
                <td className="py-1.5 text-right text-gray-600 font-mono">{fmt(l.unitPrice)}</td>
                <td className="py-1.5 text-right text-gray-800 font-semibold font-mono">{fmt(l.quantity * l.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="px-4 pb-3">
        <div className="ml-auto w-48 space-y-1 border-t border-gray-200 pt-2">
          <div className="flex justify-between text-gray-500">
            <span>Total HT</span>
            <span className="font-mono font-medium text-gray-700">{fmtC(totalHT)}</span>
          </div>
          {tvaRate > 0 && (
            <div className="flex justify-between text-gray-500">
              <span>TVA {tvaRate}%</span>
              <span className="font-mono text-gray-600">{fmtC(tvaMontant)}</span>
            </div>
          )}
          <div className="flex justify-between text-emerald-800 font-bold text-xs border-t border-emerald-200 pt-1.5 mt-1">
            <span>TOTAL TTC</span>
            <span className="font-mono">{fmtC(totalTTC)}</span>
          </div>
        </div>
      </div>

      {/* Notes / conditions */}
      {(notes || conditions) && (
        <div className="border-t border-gray-100 px-4 py-2.5 bg-gray-50/50 space-y-1">
          {conditions && <p className="text-gray-500"><span className="font-semibold text-gray-600">Conditions :</span> {conditions}</p>}
          {notes && <p className="text-gray-500 italic">{notes}</p>}
        </div>
      )}

      {/* Footer */}
      <div className="bg-emerald-700 px-5 py-2 flex items-center justify-between">
        <p className="text-[9px] text-emerald-200">Vanilla Madagascar ERP · Antananarivo</p>
        <p className="text-[9px] text-emerald-300 font-mono">
          {totalTTC > 0 ? `Total TTC : ${fmtC(totalTTC)}` : ""}
        </p>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const qc = useQueryClient();
  const { data: partners } = useGetPartners();
  const proofFileRef = useRef<HTMLInputElement>(null);

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal]   = useState(false);
  const [showDetailModal, setShowDetailModal]   = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice]   = useState<Invoice | null>(null);
  const [filterType,   setFilterType]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  // ── Payment form state ────────────────────────────────────────────────────────
  const [selMethod, setSelMethod]         = useState<MethodId>("cash");
  const [payAmount, setPayAmount]         = useState("");
  const [payRef,    setPayRef]            = useState("");
  const [payNotes,  setPayNotes]          = useState("");
  const [proofFile, setProofFile]         = useState<File | null>(null);
  const [proofUrl,  setProofUrl]          = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);

  // ── Create invoice form state ─────────────────────────────────────────────────
  const [cfType,        setCfType]        = useState<"sale" | "purchase">("sale");
  const [cfNumber,      setCfNumber]      = useState("");
  const [cfPartner,     setCfPartner]     = useState("");
  const [cfPartnerQ,    setCfPartnerQ]    = useState("");
  const [cfCurrency,    setCfCurrency]    = useState("MGA");
  const [cfTvaRate,     setCfTvaRate]     = useState(20);
  const [cfDate,        setCfDate]        = useState(today());
  const [cfDueDate,     setCfDueDate]     = useState(addDays(30));
  const [cfLines,       setCfLines]       = useState<LineItem[]>([newLine()]);
  const [cfNotes,       setCfNotes]       = useState("");
  const [cfConditions,  setCfConditions]  = useState("Paiement à 30 jours");
  const [cfErrors,      setCfErrors]      = useState<Record<string, string>>({});
  const [cfShowPartnerDrop, setCfShowPartnerDrop] = useState(false);

  // ── Computed totals ───────────────────────────────────────────────────────────
  const cfTotalHT     = cfLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const cfTvaMontant  = cfTotalHT * cfTvaRate / 100;
  const cfTotalTTC    = cfTotalHT + cfTvaMontant;

  // ── Queries ───────────────────────────────────────────────────────────────────
  const { data: invoices = [], isLoading, refetch } = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: () => fetch("/api/invoices", { credentials: "include" }).then(r => r.json()),
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["invoice-payment-stats"],
    queryFn: () => fetch("/api/invoices/payments/stats", { credentials: "include" }).then(r => r.json()),
  });

  const { data: paymentsData } = useQuery<PaymentsData>({
    queryKey: ["invoice-payments", selectedInvoice?.id],
    queryFn: () => fetch(`/api/invoices/${selectedInvoice!.id}/payments`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedInvoice?.id,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const createInvoice = useMutation({
    mutationFn: (body: object) => fetch("/api/invoices", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async r => { const d = await r.json(); if (!r.ok) throw d; return d; }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setShowCreateModal(false);
      toast.success("Facture créée avec succès");
    },
    onError: (e: { error?: string }) => setCfErrors({ submit: e.error ?? "Erreur lors de la création" }),
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
      if (data.newStatus === "paid") toast.success("Facture entièrement payée !");
      else toast.success(`Paiement enregistré — reste ${fmt(data.remaining)} Ar`);
      if (selectedInvoice) setSelectedInvoice(prev => prev ? { ...prev, status: data.newStatus } : prev);
    },
    onError: (e: { error?: string }) => toast.error(e.error ?? "Erreur lors du paiement"),
  });

  // ── Create form helpers ───────────────────────────────────────────────────────
  const openCreateModal = useCallback(() => {
    const year = new Date().getFullYear();
    const count = (invoices?.length ?? 0) + 1;
    setCfType("sale");
    setCfNumber(`FAC-${year}-${String(count).padStart(3, "0")}`);
    setCfPartner(""); setCfPartnerQ(""); setCfCurrency("MGA"); setCfTvaRate(20);
    setCfDate(today()); setCfDueDate(addDays(30));
    setCfLines([newLine()]); setCfNotes(""); setCfConditions("Paiement à 30 jours");
    setCfErrors({}); setCfShowPartnerDrop(false);
    setShowCreateModal(true);
  }, [invoices]);

  useEffect(() => {
    if (!cfType) return;
    const year = new Date().getFullYear();
    const count = (invoices?.length ?? 0) + 1;
    const prefix = cfType === "sale" ? "FAC" : "ACH";
    setCfNumber(prev => {
      if (prev.startsWith("FAC-") || prev.startsWith("ACH-")) {
        return `${prefix}-${year}-${String(count).padStart(3, "0")}`;
      }
      return prev;
    });
  }, [cfType, invoices]);

  const cfPartnerObj = (partners ?? []).find(p => p.id === cfPartner);
  const cfFilteredPartners = (partners ?? []).filter(p =>
    !cfPartnerQ || p.name.toLowerCase().includes(cfPartnerQ.toLowerCase())
  );

  const updateLine = (id: string, field: keyof LineItem, value: string | number) => {
    setCfLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };
  const addLine = () => setCfLines(prev => [...prev, newLine()]);
  const removeLine = (id: string) => setCfLines(prev => prev.filter(l => l.id !== id));

  const handleCreateSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!cfNumber.trim()) errs.number = "N° de facture requis";
    if (!cfPartner) errs.partner = "Sélectionner un tiers";
    const validLines = cfLines.filter(l => l.description.trim() && l.unitPrice > 0);
    if (validLines.length === 0) errs.lines = "Au moins une ligne avec description et montant";
    if (Object.keys(errs).length > 0) { setCfErrors(errs); return; }
    setCfErrors({});

    const amountHT = validLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const notes = [cfNotes, cfConditions ? `Conditions : ${cfConditions}` : ""].filter(Boolean).join("\n") || undefined;

    createInvoice.mutate({
      invoiceNumber: cfNumber.trim(),
      partnerId: cfPartner,
      type: cfType,
      currency: cfCurrency,
      amountHT,
      tvaRate: cfTvaRate,
      dueDate: cfDueDate || undefined,
      notes,
    });
  };

  // ── Payment helpers ───────────────────────────────────────────────────────────
  const resetPaymentForm = () => {
    setSelMethod("cash"); setPayAmount(""); setPayRef("");
    setPayNotes(""); setProofFile(null); setProofUrl("");
  };

  const handleProofUpload = async (file: File) => {
    setUploadingProof(true);
    try {
      const fd = new FormData();
      fd.append("proof", file);
      const r = await fetch("/api/invoices/payments/proof", { method: "POST", credentials: "include", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erreur upload");
      setProofUrl(d.proofUrl); setProofFile(file);
      toast.success("Preuve uploadée");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur upload");
    } finally { setUploadingProof(false); }
  };

  const handleSubmitPayment = () => {
    const m = methodMeta(selMethod);
    const needsRef = m.type === "mobile_money" || m.type === "bank";
    if (!payAmount || Number(payAmount) <= 0) { toast.error("Montant invalide"); return; }
    if (needsRef && !payRef.trim()) { toast.error("Référence requise pour " + m.name); return; }
    addPayment.mutate({ amount: Number(payAmount), method: selMethod, provider: m.provider, reference: payRef || undefined, proofUrl: proofUrl || undefined, notes: payNotes || undefined });
  };

  // ── Filters ───────────────────────────────────────────────────────────────────
  const filtered = invoices.filter(i => {
    if (filterType !== "all" && i.type !== filterType) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!i.invoiceNumber.toLowerCase().includes(q) && !(i.partner?.name ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const openDetail = (inv: Invoice) => { setSelectedInvoice(inv); setShowDetailModal(true); };
  const currentMethod = methodMeta(selMethod);
  const needsRef = currentMethod.type === "mobile_money" || currentMethod.type === "bank";
  const remaining = paymentsData?.remaining ?? selectedInvoice?.amountTTC ?? 0;

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const statCards = [
    { label: "Total encaissé", value: stats?.totals.total ?? 0, icon: TrendingUp, cls: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Espèces",        value: stats?.totals.cash ?? 0,         icon: Banknote,   cls: "text-green-600",  bg: "bg-green-50" },
    { label: "Mobile Money",   value: stats?.totals.mobile_money ?? 0, icon: Smartphone, cls: "text-orange-600", bg: "bg-orange-50" },
    { label: "Banque",         value: stats?.totals.bank ?? 0,         icon: Building2,  cls: "text-blue-600",   bg: "bg-blue-50" },
  ];
  const totalInvoiced = invoices.reduce((s, i) => s + i.amountTTC, 0);
  const totalPaidAll  = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amountTTC, 0);
  const totalPartial  = invoices.filter(i => i.status === "partial").length;
  const overdue       = invoices.filter(i => i.dueDate && new Date(i.dueDate) < new Date() && i.status !== "paid").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-600" />Factures
          </h1>
          <p className="text-sm text-gray-500 mt-1">Madagascar · Mvola · Orange Money · BNI · BOA · BFV · Accès Banque</p>
        </div>
        <button onClick={openCreateModal}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm font-semibold shadow-sm">
          <Plus className="w-4 h-4" />Nouvelle facture
        </button>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────────── */}
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

      {/* ── Summary bar ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex flex-wrap gap-4 items-center shadow-sm text-sm">
        <span className="text-gray-600">Total facturé : <span className="font-bold text-gray-900">{fmt(totalInvoiced)} Ar</span></span>
        <span className="text-gray-600">Payées : <span className="font-bold text-emerald-700">{fmt(totalPaidAll)} Ar</span></span>
        {totalPartial > 0 && <span className="text-amber-700 font-semibold">{totalPartial} en paiement partiel</span>}
        {overdue > 0 && <span className="flex items-center gap-1 text-red-600 font-semibold"><AlertCircle className="w-3.5 h-3.5" />{overdue} en retard</span>}
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
            className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-44" />
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
        <button onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["invoice-payment-stats"] }); }}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Invoice table ─────────────────────────────────────────────────────── */}
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
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${st.cls}`}>{st.label}</span></td>
                    <td className="px-4 py-3 text-xs">
                      {inv.dueDate ? <span className={isOverdue ? "text-red-600 font-semibold" : "text-gray-500"}>{fmtD(inv.dueDate)}</span> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5 items-center">
                        <button onClick={() => openDetail(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Détail">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {inv.status === "draft" && (
                          <button onClick={() => validateInvoice.mutate(inv.id)} disabled={validateInvoice.isPending}
                            className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors">
                            Valider
                          </button>
                        )}
                        {(inv.status === "validated" || inv.status === "partial") && (
                          <button onClick={() => { setSelectedInvoice(inv); resetPaymentForm(); setShowPaymentModal(true); }}
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-200 transition-colors">
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

      {/* ═══════════════════════════════════════════════════════════════════════
           CREATE INVOICE — ULTRA-PROFESSIONAL FULL-SCREEN FORM
          ═══════════════════════════════════════════════════════════════════════ */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3">
          <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden">

            {/* Top bar */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <FileText className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Nouvelle facture professionnelle</h2>
                  <p className="text-xs text-gray-500">Remplissez les informations · L'aperçu se met à jour en temps réel</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {cfErrors.submit && (
                  <span className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">{cfErrors.submit}</span>
                )}
                <button onClick={() => setShowCreateModal(false)}
                  className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body: form left + preview right */}
            <div className="flex flex-1 overflow-hidden gap-0">

              {/* ── LEFT: Form ─────────────────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 border-r border-gray-200 bg-white">

                {/* SECTION 1: Compact header info */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">1</div>
                    <h3 className="text-sm font-bold text-gray-800">Informations générales</h3>
                  </div>

                  {/* Row A: Type | N° | Devise */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setCfType("sale")}
                          className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border text-xs font-semibold transition-colors ${cfType === "sale" ? "bg-emerald-600 text-white border-emerald-600" : "bg-gray-50 text-gray-600 border-gray-300 hover:border-gray-400"}`}>
                          <ArrowRight className="w-3 h-3" />Vente
                        </button>
                        <button type="button" onClick={() => setCfType("purchase")}
                          className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border text-xs font-semibold transition-colors ${cfType === "purchase" ? "bg-orange-500 text-white border-orange-500" : "bg-gray-50 text-gray-600 border-gray-300 hover:border-gray-400"}`}>
                          <Package className="w-3 h-3" />Achat
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                        <Hash className="w-3 h-3" />N° Facture *
                      </label>
                      <input value={cfNumber} onChange={e => setCfNumber(e.target.value)}
                        className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none ${cfErrors.number ? "border-red-300 bg-red-50" : "border-gray-300"}`}
                        placeholder="FAC-2026-001" />
                      {cfErrors.number && <p className="text-red-500 text-xs mt-0.5">{cfErrors.number}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Devise</label>
                      <div className="flex gap-1">
                        {["MGA","USD","EUR"].map(c => (
                          <button key={c} type="button" onClick={() => setCfCurrency(c)}
                            className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-colors ${cfCurrency === c ? "bg-emerald-600 text-white border-emerald-600" : "bg-gray-50 text-gray-600 border-gray-300 hover:border-gray-400"}`}>{c}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Row B: Partner (full width) */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                      <User className="w-3 h-3" />{cfType === "sale" ? "Client" : "Fournisseur"} *
                    </label>
                    {cfPartnerObj ? (
                      <div className="flex items-center gap-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <div className="w-7 h-7 bg-emerald-200 rounded-full flex items-center justify-center text-emerald-800 font-bold text-xs shrink-0">
                          {cfPartnerObj.name[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-emerald-900 text-sm truncate">{cfPartnerObj.name}</p>
                          <p className="text-xs text-emerald-600">{cfPartnerObj.type === "client" ? "Client" : "Fournisseur"}</p>
                        </div>
                        <button type="button" onClick={() => { setCfPartner(""); setCfPartnerQ(""); }}
                          className="p-1 rounded-lg text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          data-testid="partner-search-input"
                          value={cfPartnerQ}
                          onChange={e => { setCfPartnerQ(e.target.value); setCfShowPartnerDrop(true); }}
                          onFocus={() => setCfShowPartnerDrop(true)}
                          onBlur={() => setTimeout(() => setCfShowPartnerDrop(false), 400)}
                          placeholder="Rechercher un tiers…"
                          autoComplete="off"
                          className={`w-full border rounded-lg pl-9 pr-9 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none ${cfErrors.partner ? "border-red-300 bg-red-50" : "border-gray-300"}`}
                        />
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        {cfShowPartnerDrop && cfFilteredPartners.length > 0 && (
                          <div data-testid="partner-dropdown" className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                            {cfFilteredPartners.map(p => (
                              <button key={p.id} type="button"
                                data-testid={`partner-option-${p.id}`}
                                onMouseDown={e => {
                                  e.preventDefault();
                                  setCfPartner(p.id);
                                  setCfPartnerQ("");
                                  setCfShowPartnerDrop(false);
                                  setCfErrors(prev => ({ ...prev, partner: "" }));
                                }}
                                onClick={() => {
                                  setCfPartner(p.id);
                                  setCfPartnerQ("");
                                  setCfShowPartnerDrop(false);
                                  setCfErrors(prev => ({ ...prev, partner: "" }));
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-emerald-50 text-left transition-colors">
                                <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-bold text-xs shrink-0">
                                  {p.name[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{p.name}</p>
                                  <p className="text-xs text-gray-400">{p.type === "client" ? "Client" : "Fournisseur"}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {cfErrors.partner && <p className="text-red-500 text-xs mt-0.5">{cfErrors.partner}</p>}
                      </div>
                    )}
                  </div>

                  {/* Row C: Dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Date d'émission</label>
                      <input type="date" value={cfDate} onChange={e => setCfDate(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Échéance</label>
                      <div className="flex gap-1 mb-1.5">
                        {[["30","30j"],["60","60j"],["90","90j"]].map(([d,l]) => (
                          <button key={d} type="button" onClick={() => setCfDueDate(addDays(Number(d)))}
                            className="flex-1 text-xs py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors font-medium">{l}</button>
                        ))}
                        <button type="button" onClick={() => setCfDueDate(endOfMonth())}
                          className="flex-1 text-xs py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors font-medium">Fin mois</button>
                      </div>
                      <input type="date" value={cfDueDate} onChange={e => setCfDueDate(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                {/* SECTION 2: Line items */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">2</div>
                      <h3 className="text-sm font-bold text-gray-800">Lignes de facturation</h3>
                    </div>
                    <button type="button" onClick={addLine}
                      className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors border border-emerald-200">
                      <Plus className="w-3.5 h-3.5" />Ajouter une ligne
                    </button>
                  </div>

                  {cfErrors.lines && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{cfErrors.lines}</div>
                  )}

                  {/* Lines table */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full table-fixed text-sm">
                      <colgroup>
                        <col style={{ width: "auto" }} />
                        <col style={{ width: "64px" }} />
                        <col style={{ width: "80px" }} />
                        <col style={{ width: "120px" }} />
                        <col style={{ width: "100px" }} />
                        <col style={{ width: "36px" }} />
                      </colgroup>
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Désignation *</th>
                          <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qté</th>
                          <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unité</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prix unit. (Ar)</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total HT</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {cfLines.map((line, i) => {
                          const lineHT = line.quantity * line.unitPrice;
                          return (
                            <tr key={line.id} className="bg-white hover:bg-gray-50/50">
                              <td className="px-2 py-1.5">
                                <input
                                  aria-label={`Désignation article ${i + 1}`}
                                  value={line.description}
                                  onChange={e => updateLine(line.id, "description", e.target.value)}
                                  placeholder={`Article ${i + 1} — ex: Vanille Bourbon Grade A`}
                                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <input
                                  aria-label={`Quantité article ${i + 1}`}
                                  type="number" min="0.01" step="0.01"
                                  value={line.quantity}
                                  onChange={e => updateLine(line.id, "quantity", Number(e.target.value))}
                                  className="w-full border border-gray-300 rounded-lg px-1 py-1.5 text-sm font-mono text-center focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <select
                                  aria-label={`Unité article ${i + 1}`}
                                  value={line.unit} onChange={e => updateLine(line.id, "unit", e.target.value)}
                                  className="w-full border border-gray-300 rounded-lg px-1 py-1.5 text-xs text-gray-700 focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                                  {["unité","kg","g","t","litre","m","m²","heure","jour","lot","colis","palette","conteneur"].map(u => (
                                    <option key={u}>{u}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  aria-label={`Prix unitaire article ${i + 1}`}
                                  type="number" min="0" step="1"
                                  value={line.unitPrice === 0 ? "" : line.unitPrice}
                                  onChange={e => updateLine(line.id, "unitPrice", e.target.value === "" ? 0 : Number(e.target.value))}
                                  placeholder="Prix unitaire"
                                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono text-right focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                <span className={`text-sm font-bold font-mono ${lineHT > 0 ? "text-emerald-700" : "text-gray-300"}`}>
                                  {lineHT > 0 ? fmt(lineHT) : "—"}
                                </span>
                              </td>
                              <td className="pr-2 py-1.5 text-center">
                                <button type="button" onClick={() => removeLine(line.id)} disabled={cfLines.length === 1}
                                  aria-label="Supprimer cette ligne"
                                  className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-20">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                {/* SECTION 3: TVA + Totals */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">3</div>
                    <h3 className="text-sm font-bold text-gray-800">Fiscalité & totaux</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-2">Taux TVA</label>
                      <div className="flex gap-2">
                        {[[20,"20% — Standard"],[0,"0% — Export / Exonéré"]].map(([v,l]) => (
                          <button key={v} type="button" onClick={() => setCfTvaRate(v as number)}
                            className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-colors ${
                              cfTvaRate === v ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-300 hover:border-gray-400"
                            }`}>{l as string}</button>
                        ))}
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4 font-mono text-sm space-y-1.5">
                      <div className="flex justify-between text-gray-600">
                        <span>Total HT</span>
                        <span className="font-semibold text-gray-800">{fmt(cfTotalHT)} {cfCurrency}</span>
                      </div>
                      {cfTvaRate > 0 && (
                        <div className="flex justify-between text-gray-500">
                          <span>TVA {cfTvaRate}%</span>
                          <span>{fmt(cfTvaMontant)} {cfCurrency}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-black text-emerald-800 text-base border-t border-emerald-200 pt-1.5">
                        <span>Total TTC</span>
                        <span>{fmt(cfTotalTTC)} {cfCurrency}</span>
                      </div>
                    </div>
                  </div>

                  {/* Smart payment suggestion */}
                  {cfTotalTTC > 0 && (
                    <div className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs ${
                      cfTotalTTC >= 1000000 ? "bg-blue-50 border-blue-200 text-blue-700" :
                      cfTotalTTC >= 100000  ? "bg-orange-50 border-orange-200 text-orange-700" :
                                              "bg-emerald-50 border-emerald-200 text-emerald-700"
                    }`}>
                      <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold mb-0.5">
                          {cfTotalTTC >= 1000000 ? "Recommandation : virement bancaire (BNI, BOA, BFV)" :
                           cfTotalTTC >= 100000  ? "Recommandation : Mobile Money (Mvola, Orange Money)" :
                                                   "Recommandation : Liquide ou Mobile Money"}
                        </p>
                        <p className="opacity-75">
                          {cfTotalTTC >= 1000000 ? "Montant élevé — le virement est plus sûr et traçable" :
                           cfTotalTTC >= 100000  ? "Montant intermédiaire — Mvola recommandé" :
                                                   "Petit montant — paiement rapide en espèces"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100" />

                {/* SECTION 4: Notes & conditions */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">4</div>
                    <h3 className="text-sm font-bold text-gray-800">Notes & conditions</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Conditions de paiement</label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {["Paiement à 30 jours","Paiement à 60 jours","Paiement immédiat","50% acompte","Paiement à la livraison"].map(c => (
                          <button key={c} type="button" onClick={() => setCfConditions(c)}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                              cfConditions === c ? "bg-gray-700 text-white border-gray-700" : "bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-400"
                            }`}>{c}</button>
                        ))}
                      </div>
                      <input value={cfConditions} onChange={e => setCfConditions(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="Conditions personnalisées…" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes internes</label>
                      <textarea value={cfNotes} onChange={e => setCfNotes(e.target.value)} rows={4}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                        placeholder="Informations supplémentaires, instructions de livraison, références…" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── RIGHT: Live preview ─────────────────────────────────────────── */}
              <div className="w-80 xl:w-96 overflow-y-auto p-5 bg-gray-50 shrink-0">
                <div className="flex items-center gap-2 mb-4">
                  <FileCheck className="w-4 h-4 text-gray-500" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Aperçu en direct</p>
                </div>
                <InvoicePreview
                  invoiceNumber={cfNumber}
                  type={cfType}
                  partnerName={cfPartnerObj?.name ?? ""}
                  dateEmission={cfDate}
                  dueDate={cfDueDate}
                  lines={cfLines}
                  tvaRate={cfTvaRate}
                  currency={cfCurrency}
                  notes={cfNotes}
                  conditions={cfConditions}
                />

                {/* Info blocs */}
                <div className="mt-4 space-y-2">
                  <div className="bg-white border border-gray-200 rounded-xl p-3 text-xs text-gray-600">
                    <p className="font-semibold text-gray-700 mb-1">Après création</p>
                    <ul className="space-y-0.5 text-gray-500">
                      <li>• Statut : Brouillon</li>
                      <li>• Valider → écriture PCG générée</li>
                      <li>• Paiements partiels disponibles</li>
                      <li>• 7 méthodes Madagascar acceptées</li>
                    </ul>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs">
                    <p className="font-semibold text-emerald-800 mb-1">Total à facturer</p>
                    <p className="font-mono text-xl font-black text-emerald-700">{fmt(cfTotalTTC)} <span className="text-sm">{cfCurrency}</span></p>
                    {cfTvaRate > 0 && <p className="text-emerald-600 mt-0.5">dont TVA : {fmt(cfTvaMontant)} {cfCurrency}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom action bar */}
            <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span>{cfLines.filter(l => l.description.trim()).length} ligne(s)</span>
                <span>·</span>
                <span className="font-semibold text-gray-800">{fmt(cfTotalTTC)} {cfCurrency} TTC</span>
                {cfTvaRate === 0 && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">Export / Exonéré TVA</span>}
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors text-gray-700">
                  Annuler
                </button>
                <button type="button" onClick={handleCreateSubmit} disabled={createInvoice.isPending}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-sm">
                  {createInvoice.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Création…</>
                    : <><FileCheck className="w-4 h-4" />Créer la facture</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── INVOICE DETAIL MODAL ──────────────────────────────────────────────── */}
      {showDetailModal && selectedInvoice && (
        <Modal title={`Facture ${selectedInvoice.invoiceNumber}`} onClose={() => setShowDetailModal(false)} wide>
          <div className="space-y-5">
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
            {paymentsData && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <PaymentBar pct={paymentsData.pct} remaining={paymentsData.remaining} totalPaid={paymentsData.totalPaid} amountTTC={selectedInvoice.amountTTC} />
              </div>
            )}
            {(selectedInvoice.status === "validated" || selectedInvoice.status === "partial") && (
              <button onClick={() => { resetPaymentForm(); setPayAmount(String(Math.round(paymentsData?.remaining ?? selectedInvoice.amountTTC))); setShowPaymentModal(true); setShowDetailModal(false); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors">
                <CreditCard className="w-4 h-4" />Enregistrer un paiement
              </button>
            )}
            <div>
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-indigo-500" />Historique des paiements
                {paymentsData && <span className="text-xs font-normal text-gray-500">({paymentsData.payments.length})</span>}
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
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{fmtD(p.createdAt)} à {fmtT(p.createdAt)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-mono font-bold text-sm ${c.text}`}>{fmt(p.amount)} Ar</p>
                          {p.proofUrl && <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">Voir preuve</a>}
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

      {/* ── PAYMENT MODAL ──────────────────────────────────────────────────────── */}
      {showPaymentModal && selectedInvoice && (
        <Modal title={`Paiement — ${selectedInvoice.invoiceNumber}`} onClose={() => setShowPaymentModal(false)} wide>
          <div className="space-y-5">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-700">Reste à payer</p>
                <p className="text-xl font-bold font-mono text-amber-900">{fmt(remaining)} Ar</p>
              </div>
              <p className="text-xs text-amber-600 text-right">Total TTC<br /><span className="font-bold font-mono">{fmt(selectedInvoice.amountTTC)} Ar</span></p>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800 mb-3">Moyen de paiement</p>
              <div className="grid grid-cols-4 gap-2">
                {PAYMENT_METHODS.map(m => (
                  <MethodCard key={m.id} m={m} selected={selMethod === m.id} onSelect={() => setSelMethod(m.id)} />
                ))}
              </div>
              {currentMethod.type === "mobile_money" && (
                <p className="text-xs text-orange-600 mt-2 flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" />Référence de transaction requise</p>
              )}
              {currentMethod.type === "bank" && (
                <p className="text-xs text-blue-600 mt-2 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />Recommandé pour les montants &gt; 1 000 000 Ar</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Montant payé (Ar) *</label>
                <input type="number" min="1" step="1" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder={`Max: ${fmt(remaining)}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Référence {needsRef ? <span className="text-red-500">*</span> : <span className="text-gray-400">(optionnel)</span>}
                </label>
                <input value={payRef} onChange={e => setPayRef(e.target.value)}
                  placeholder={currentMethod.type === "mobile_money" ? "TXN-XXXX" : currentMethod.type === "bank" ? "VIR-XXXX" : "Optionnel"}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
              <input value={payNotes} onChange={e => setPayNotes(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="Acompte, solde…" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Preuve de paiement (optionnel)</label>
              {proofUrl ? (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs text-emerald-800 truncate flex-1">{proofFile?.name ?? "Fichier uploadé"}</span>
                  <button onClick={() => { setProofUrl(""); setProofFile(null); }} className="text-xs text-red-500 hover:text-red-700">Retirer</button>
                </div>
              ) : (
                <label className={`flex flex-col items-center gap-2 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors ${uploadingProof ? "border-gray-200 bg-gray-50" : "border-gray-300 hover:border-emerald-400 hover:bg-emerald-50"}`}>
                  {uploadingProof
                    ? <><Loader2 className="w-5 h-5 animate-spin text-gray-400" /><span className="text-xs text-gray-500">Upload…</span></>
                    : <><Upload className="w-5 h-5 text-gray-400" /><span className="text-xs text-gray-500">Reçu Mvola, virement banque — JPG, PNG, PDF max 10 Mo</span></>
                  }
                  <input ref={proofFileRef} type="file" accept="image/*,.pdf" className="sr-only" disabled={uploadingProof}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleProofUpload(f); }} />
                </label>
              )}
            </div>
            <div className="flex gap-3 pt-1 border-t border-gray-100">
              <button type="button" onClick={() => setShowPaymentModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button onClick={handleSubmitPayment} disabled={addPayment.isPending || !payAmount || Number(payAmount) <= 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50">
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
