import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useCreateBankTransaction, useImportBankTransactions,
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import {
  Zap, RefreshCw, Plus, Upload, CheckCircle2, AlertCircle,
  Clock, ChevronRight, Link2, Unlink2, AlertTriangle, Search,
  ArrowUpRight, ArrowDownLeft, TrendingUp, Scale,
} from "lucide-react";
import { toast } from "sonner";

/* ─── types ─────────────────────────────────────────────────────────────────── */
interface BankTx {
  id: string; date: string; description: string; amount: number;
  currency: string; reference: string | null;
  status: "unmatched" | "suggested" | "matched";
  invoiceId: string | null; partnerId: string | null;
  journalEntryId: string | null; matchScore: number | null;
  gapAmount: number | null; invoiceDetails: any;
  matched: boolean; matchedRef: string | null;
}
interface Invoice {
  id: string; invoice_number: string; amount_ttc: number;
  status: string; due_date: string | null; partner_name: string | null;
  partner_id: string | null;
}
interface JournalEntry {
  id: string; date: string; reference: string; description: string; status: string;
}

type TxnForm = { date: string; description: string; amount: number; currency: string; reference: string };

/* ─── helpers ────────────────────────────────────────────────────────────────── */
const fmt = (n: number) => new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(Math.abs(n));
const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";

function StatusBadge({ status }: { status: string }) {
  if (status === "matched")   return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3"/>Rapproché</span>;
  if (status === "suggested") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><AlertCircle className="w-3 h-3"/>Suggestion</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600"><Clock className="w-3 h-3"/>Non rapproché</span>;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (!score) return null;
  const cls = score >= 80 ? "bg-emerald-600" : score >= 60 ? "bg-amber-500" : "bg-gray-400";
  return <span className={`${cls} text-white text-xs font-bold px-1.5 py-0.5 rounded`}>{score}%</span>;
}

function parseSimpleCsv(text: string) {
  const lines = text.trim().split("\n").filter(l => l.trim());
  const header = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/"/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/"/g, ""));
    const obj: any = {};
    header.forEach((h, i) => obj[h] = vals[i] ?? "");
    return { date: obj.date, description: obj.description, amount: Number(obj.amount), reference: obj.reference ?? "" };
  }).filter(r => r.date && !isNaN(r.amount));
}

/* ─── component ──────────────────────────────────────────────────────────────── */
export default function BankPage() {
  const qc = useQueryClient();
  const createTxn = useCreateBankTransaction();
  const importTxns = useImportBankTransactions();

  const [selectedTx, setSelectedTx] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "unmatched" | "suggested" | "matched">("all");
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [gapModal, setGapModal] = useState<{ txId: string; invoiceId: string | null; partnerId: string | null; bankAmt: number; invAmt: number } | null>(null);

  const { register, handleSubmit, reset } = useForm<TxnForm>({ defaultValues: { currency: "MGA" } });

  // ── data ────────────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["bank-reconciliation"],
    queryFn: async () => {
      const r = await fetch("/api/bank/reconciliation", { credentials: "include" });
      if (!r.ok) throw new Error("Erreur chargement");
      return r.json() as Promise<{ transactions: BankTx[]; invoices: Invoice[]; journalEntries: JournalEntry[]; summary: any }>;
    },
  });

  // ── mutations ────────────────────────────────────────────────────────────────
  const autoMatch = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/bank/auto-match", { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Erreur");
      return r.json();
    },
    onSuccess: (d) => { toast.success(d.message); refetch(); },
    onError: () => toast.error("Erreur lors du rapprochement automatique"),
  });

  const reconcile = useMutation({
    mutationFn: async ({ txId, invoiceId, partnerId, journalEntryId }: { txId: string; invoiceId?: string; partnerId?: string; journalEntryId?: string }) => {
      const r = await fetch(`/api/bank/${txId}/reconcile`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, partnerId, journalEntryId, matchScore: 100 }),
      });
      if (!r.ok) throw new Error("Erreur");
      return r.json();
    },
    onSuccess: () => { toast.success("Rapprochement confirmé"); refetch(); setSelectedTx(null); },
    onError: () => toast.error("Erreur lors du rapprochement"),
  });

  const unreconcile = useMutation({
    mutationFn: async (txId: string) => {
      const r = await fetch(`/api/bank/${txId}/unreconcile`, { method: "PUT", credentials: "include" });
      if (!r.ok) throw new Error("Erreur");
      return r.json();
    },
    onSuccess: () => { toast.success("Rapprochement annulé"); refetch(); },
    onError: () => toast.error("Erreur"),
  });

  const postGap = useMutation({
    mutationFn: async ({ txId, gapAmount, invoiceId, partnerId }: { txId: string; gapAmount: number; invoiceId: string | null; partnerId: string | null }) => {
      const r = await fetch(`/api/bank/${txId}/gap`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapAmount, invoiceId, partnerId }),
      });
      if (!r.ok) throw new Error("Erreur");
      return r.json();
    },
    onSuccess: () => { toast.success("Écart comptabilisé (658/758) et rapprochement validé"); refetch(); setGapModal(null); setSelectedTx(null); },
    onError: () => toast.error("Erreur lors de la comptabilisation de l'écart"),
  });

  const onAddTxn = async (formData: TxnForm) => {
    await createTxn.mutateAsync({ data: { date: formData.date, description: formData.description, amount: Number(formData.amount), currency: formData.currency, reference: formData.reference || undefined } });
    toast.success("Transaction ajoutée");
    setShowAddModal(false);
    reset({ currency: "MGA" });
    refetch();
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseSimpleCsv(text);
    if (rows.length === 0) { toast.error("Aucune ligne valide dans le CSV"); return; }
    await importTxns.mutateAsync({ data: { rows } });
    toast.success(`${rows.length} transactions importées`);
    refetch();
    e.target.value = "";
  };

  // ── derived state ─────────────────────────────────────────────────────────
  const txns = data?.transactions ?? [];
  const invoices = (data?.invoices ?? []) as Invoice[];
  const journalEntries = (data?.journalEntries ?? []) as JournalEntry[];
  const summary = data?.summary ?? {};

  const selectedTxData = txns.find(t => t.id === selectedTx) ?? null;

  const filteredTxns = useMemo(() => {
    let list = txns;
    if (filterStatus !== "all") list = list.filter(t => t.status === filterStatus);
    if (search) list = list.filter(t =>
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      (t.reference ?? "").toLowerCase().includes(search.toLowerCase())
    );
    return list;
  }, [txns, filterStatus, search]);

  // ERP candidates for the right panel
  const erpCandidates = useMemo(() => {
    if (!selectedTxData) {
      // Show all unmatched invoices
      return invoices.filter(inv => inv.status !== "paid");
    }
    // Compute scores for each invoice against selected tx
    const txAmt = Math.abs(selectedTxData.amount);
    return invoices
      .filter(inv => inv.status !== "paid")
      .map(inv => {
        const invAmt = Number(inv.amount_ttc);
        const diff = Math.abs(txAmt - invAmt) / (invAmt || 1);
        let score = 0;
        if (diff === 0) score += 80;
        else if (diff < 0.01) score += 55;
        else if (diff < 0.05) score += 25;
        else if (diff < 0.2) score += 10;
        const ref = (selectedTxData.reference ?? "").toLowerCase();
        const num = (inv.invoice_number ?? "").toLowerCase();
        if (ref && num && (ref.includes(num) || num.includes(ref))) score += 15;
        return { ...inv, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [selectedTxData, invoices]);

  // ── render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"/>
          <p className="text-gray-400 text-sm">Chargement du rapprochement…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4 max-w-full">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Rapprochement bancaire</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {summary.unmatched_count ?? 0} non rapprochée(s) · {summary.suggested_count ?? 0} suggestion(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
              <Upload className="w-4 h-4"/>
              {importTxns.isPending ? "Import…" : "CSV"}
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvUpload}/>
            </label>
            <button
              onClick={() => { reset({ currency: "MGA" }); setShowAddModal(true); }}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <Plus className="w-4 h-4"/>
              Ajouter
            </button>
            <button
              onClick={() => autoMatch.mutate()}
              disabled={autoMatch.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg text-sm font-semibold hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-60 transition-all shadow-sm">
              <Zap className={`w-4 h-4 ${autoMatch.isPending ? "animate-pulse" : ""}`}/>
              {autoMatch.isPending ? "Rapprochement…" : "Rapprochement auto"}
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 shrink-0">
        <div className="flex gap-6 items-center">
          {[
            { label: "Solde relevé", value: summary.total_amount ?? 0, icon: Scale, cls: "text-gray-800" },
            { label: "Rapproché", value: summary.matched_amount ?? 0, icon: CheckCircle2, cls: "text-emerald-700" },
            { label: "Écart", value: (summary.total_amount ?? 0) - (summary.matched_amount ?? 0), icon: AlertTriangle, cls: Math.abs((summary.total_amount ?? 0) - (summary.matched_amount ?? 0)) > 0 ? "text-red-600" : "text-gray-400" },
          ].map(({ label, value, icon: Icon, cls }) => (
            <div key={label} className="flex items-center gap-2 min-w-0">
              <Icon className={`w-4 h-4 ${cls} shrink-0`}/>
              <div>
                <p className="text-xs text-gray-400">{label}</p>
                <p className={`text-sm font-bold ${cls}`}>{value >= 0 ? "+" : ""}{fmt(value)} Ar</p>
              </div>
            </div>
          ))}
          <div className="h-8 w-px bg-gray-200 mx-2"/>
          {[
            { label: "Non rapprochées", count: summary.unmatched_count ?? 0, cls: "text-red-600 bg-red-50" },
            { label: "Suggestions", count: summary.suggested_count ?? 0, cls: "text-amber-600 bg-amber-50" },
            { label: "Rapprochées", count: summary.matched_count ?? 0, cls: "text-emerald-700 bg-emerald-50" },
          ].map(({ label, count, cls }) => (
            <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${cls}`}>
              <span className="text-xs font-semibold">{count}</span>
              <span className="text-xs">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Double column ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 140px)" }}>

        {/* LEFT — Relevé bancaire */}
        <div className="w-[42%] flex flex-col border-r border-gray-200 bg-white">
          {/* Sub-header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 shrink-0">
            <Scale className="w-4 h-4 text-gray-400"/>
            <span className="text-sm font-semibold text-gray-700">Relevé bancaire</span>
            <span className="text-xs text-gray-400 ml-auto">{filteredTxns.length} transactions</span>
          </div>

          {/* Filters */}
          <div className="px-4 py-2 flex gap-2 items-center border-b border-gray-50 shrink-0">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Chercher…" className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:ring-1 focus:ring-emerald-400 outline-none"/>
            </div>
            <div className="flex gap-1">
              {(["all", "unmatched", "suggested", "matched"] as const).map(f => (
                <button key={f} onClick={() => setFilterStatus(f)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${filterStatus === f ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                  {f === "all" ? "Tous" : f === "unmatched" ? "!" : f === "suggested" ? "~" : "✓"}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {filteredTxns.length === 0 ? (
              <div className="py-16 text-center text-gray-300">
                <Scale className="w-10 h-10 mx-auto mb-3 opacity-30"/>
                <p className="text-sm">Aucune transaction</p>
              </div>
            ) : filteredTxns.map(t => {
              const isSelected = selectedTx === t.id;
              const isCredit = t.amount >= 0;
              return (
                <div key={t.id}
                  onClick={() => setSelectedTx(isSelected ? null : t.id)}
                  className={`px-4 py-3 border-b border-gray-50 cursor-pointer transition-all ${isSelected ? "bg-emerald-50 border-l-4 border-l-emerald-500" : "hover:bg-gray-50 border-l-4 border-l-transparent"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isCredit ? "bg-emerald-100" : "bg-red-100"}`}>
                      {isCredit
                        ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600"/>
                        : <ArrowUpRight className="w-3.5 h-3.5 text-red-500"/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800 truncate">{t.description}</p>
                        <span className={`text-sm font-bold shrink-0 ${isCredit ? "text-emerald-700" : "text-red-600"}`}>
                          {isCredit ? "+" : "−"}{fmt(t.amount)} Ar
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">{fmtDate(t.date)}</span>
                        {t.reference && <span className="text-xs font-mono text-gray-400">{t.reference}</span>}
                        <StatusBadge status={t.status}/>
                        {t.matchScore && <ScoreBadge score={t.matchScore}/>}
                      </div>
                      {t.status === "matched" && t.matchedRef && (
                        <p className="text-xs text-emerald-600 mt-0.5 flex items-center gap-1">
                          <Link2 className="w-3 h-3"/>{t.matchedRef}
                          {t.gapAmount && t.gapAmount !== 0 && (
                            <span className="text-orange-500 ml-1">écart {t.gapAmount > 0 ? "+" : ""}{fmt(t.gapAmount)} Ar</span>
                          )}
                        </p>
                      )}
                    </div>
                    {t.status === "matched" ? (
                      <button
                        onClick={e => { e.stopPropagation(); unreconcile.mutate(t.id); }}
                        aria-label="Annuler le rapprochement"
                        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 text-xs text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors">
                        <Unlink2 className="w-3 h-3"/>
                        <span>Délier</span>
                      </button>
                    ) : (
                      <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? "text-emerald-500 rotate-90" : "text-gray-300"}`}/>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Left footer */}
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 shrink-0">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Total filtré</span>
              <span className={`font-bold ${filteredTxns.reduce((s, t) => s + t.amount, 0) >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                {filteredTxns.reduce((s, t) => s + t.amount, 0) >= 0 ? "+" : ""}
                {fmt(filteredTxns.reduce((s, t) => s + t.amount, 0))} Ar
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT — ERP panel */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {/* Sub-header */}
          <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-2 shrink-0">
            <TrendingUp className="w-4 h-4 text-gray-400"/>
            <span className="text-sm font-semibold text-gray-700">
              {selectedTxData
                ? <>Suggestions pour <span className="text-emerald-700">{selectedTxData.description.slice(0, 40)}{selectedTxData.description.length > 40 ? "…" : ""}</span></>
                : "Factures & écritures ERP disponibles"}
            </span>
            {selectedTxData && (
              <span className={`ml-auto text-sm font-bold ${selectedTxData.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {selectedTxData.amount >= 0 ? "+" : "−"}{fmt(selectedTxData.amount)} Ar
              </span>
            )}
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 p-4 space-y-3">

            {/* Selected tx suggested (pre-matched by auto-match) */}
            {selectedTxData?.status === "suggested" && selectedTxData.invoiceDetails && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-600"/>
                  <span className="text-sm font-semibold text-amber-700">Suggestion automatique — Score {selectedTxData.matchScore}%</span>
                </div>
                <InvoiceMatchCard
                  invoice={selectedTxData.invoiceDetails}
                  txAmt={Math.abs(selectedTxData.amount)}
                  onConfirm={() => reconcile.mutate({
                    txId: selectedTxData.id,
                    invoiceId: selectedTxData.invoiceId!,
                    partnerId: selectedTxData.partnerId ?? undefined,
                  })}
                  onGap={() => setGapModal({
                    txId: selectedTxData.id,
                    invoiceId: selectedTxData.invoiceId,
                    partnerId: selectedTxData.partnerId,
                    bankAmt: Math.abs(selectedTxData.amount),
                    invAmt: Number(selectedTxData.invoiceDetails.amount_ttc),
                  })}
                  highlighted
                />
              </div>
            )}

            {/* Separator */}
            {selectedTxData && (
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <div className="flex-1 border-t border-gray-200"/>
                <span>Toutes les factures disponibles</span>
                <div className="flex-1 border-t border-gray-200"/>
              </div>
            )}

            {/* Invoices list */}
            {erpCandidates.length === 0 ? (
              <div className="text-center py-12 text-gray-300">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-30"/>
                <p className="text-sm">Toutes les factures sont rapprochées</p>
              </div>
            ) : erpCandidates.map((inv: any) => (
              <InvoiceMatchCard
                key={inv.id}
                invoice={inv}
                txAmt={selectedTxData ? Math.abs(selectedTxData.amount) : undefined}
                onConfirm={selectedTxData ? () => reconcile.mutate({
                  txId: selectedTxData.id,
                  invoiceId: inv.id,
                  partnerId: inv.partner_id ?? undefined,
                }) : undefined}
                onGap={selectedTxData ? () => setGapModal({
                  txId: selectedTxData.id,
                  invoiceId: inv.id,
                  partnerId: inv.partner_id,
                  bankAmt: Math.abs(selectedTxData.amount),
                  invAmt: Number(inv.amount_ttc),
                }) : undefined}
              />
            ))}

            {/* Journal entries section */}
            {journalEntries.filter(e => e.status === "validated").length > 0 && (
              <>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-4">
                  <div className="flex-1 border-t border-gray-200"/>
                  <span>Écritures journal</span>
                  <div className="flex-1 border-t border-gray-200"/>
                </div>
                {journalEntries.filter(e => e.status === "validated").map(entry => (
                  <div key={entry.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3 hover:border-blue-200 transition-colors">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                      <TrendingUp className="w-4 h-4 text-blue-500"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{entry.reference}</p>
                      <p className="text-xs text-gray-400">{fmtDate(entry.date)} · {entry.description?.slice(0, 50)}</p>
                    </div>
                    {selectedTxData && (
                      <button
                        onClick={() => reconcile.mutate({ txId: selectedTxData.id, journalEntryId: entry.id })}
                        className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium">
                        Lier
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Hint if nothing selected */}
          {!selectedTxData && (
            <div className="px-4 py-3 border-t border-gray-200 bg-white shrink-0">
              <p className="text-xs text-gray-400 text-center">
                ← Sélectionnez une transaction à gauche pour voir les suggestions de rapprochement
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Add transaction modal ─────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-800">Nouvelle transaction bancaire</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit(onAddTxn)} className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                  <input id="txn-date" type="date" {...register("date", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Montant * (+ crédit / − débit)</label>
                  <input type="number" step="1" {...register("amount", { required: true })} placeholder="6000000" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"/>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description *</label>
                <input {...register("description", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Devise</label>
                  <select {...register("currency")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                    {["MGA", "USD", "EUR"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Référence bancaire</label>
                  <input {...register("reference")} placeholder="VIR-2026-XXX" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"/>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">Ajouter</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Gap modal ────────────────────────────────────────────────────────── */}
      {gapModal && (
        <GapModal
          bankAmt={gapModal.bankAmt}
          invAmt={gapModal.invAmt}
          onConfirm={(gapAmount) => postGap.mutate({
            txId: gapModal.txId,
            gapAmount,
            invoiceId: gapModal.invoiceId,
            partnerId: gapModal.partnerId,
          })}
          onClose={() => setGapModal(null)}
          isPending={postGap.isPending}
        />
      )}
    </div>
  );
}

/* ─── InvoiceMatchCard ──────────────────────────────────────────────────────── */
function InvoiceMatchCard({
  invoice, txAmt, onConfirm, onGap, highlighted = false,
}: {
  invoice: any;
  txAmt?: number;
  onConfirm?: () => void;
  onGap?: () => void;
  highlighted?: boolean;
}) {
  const invAmt = Number(invoice.amount_ttc);
  const gap = txAmt != null ? txAmt - invAmt : null;
  const exactMatch = gap != null && Math.abs(gap) < 1;
  const score = (invoice as any).score;

  const statusCls: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700",
    validated: "bg-blue-100 text-blue-700",
    draft: "bg-gray-100 text-gray-600",
  };

  return (
    <div className={`rounded-xl border p-4 transition-all ${highlighted ? "border-amber-300 bg-amber-50/50" : "border-gray-200 bg-white hover:border-emerald-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-bold text-gray-800">{invoice.invoice_number}</span>
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusCls[invoice.status] ?? "bg-gray-100 text-gray-600"}`}>{invoice.status}</span>
            {score != null && score > 0 && <ScoreBadge score={score}/>}
          </div>
          {invoice.partner_name && (
            <p className="text-xs text-gray-500 mb-1">{invoice.partner_name}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>TTC: <strong className="text-gray-800">{new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(invAmt)} Ar</strong></span>
            {invoice.due_date && <span>Éch: {new Date(invoice.due_date).toLocaleDateString("fr-FR")}</span>}
          </div>
          {gap != null && !exactMatch && (
            <div className={`mt-2 text-xs font-medium flex items-center gap-1 ${gap > 0 ? "text-emerald-600" : "text-orange-600"}`}>
              <AlertTriangle className="w-3 h-3"/>
              Écart: {gap > 0 ? "+" : ""}{new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(gap)} Ar
              {gap > 0 ? " (compte 758)" : " (compte 658)"}
            </div>
          )}
        </div>
        {onConfirm && (
          <div className="flex flex-col gap-1.5 shrink-0">
            {exactMatch ? (
              <button onClick={onConfirm}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5"/>Rapprocher
              </button>
            ) : (
              <>
                {gap != null && <button onClick={onConfirm}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors">
                  Lier quand même
                </button>}
                {gap != null && Math.abs(gap) > 0 && onGap && (
                  <button onClick={onGap}
                    className="px-3 py-1.5 border border-orange-300 text-orange-700 rounded-lg text-xs font-semibold hover:bg-orange-50 transition-colors">
                    Comptabiliser écart
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── GapModal ──────────────────────────────────────────────────────────────── */
function GapModal({ bankAmt, invAmt, onConfirm, onClose, isPending }: {
  bankAmt: number; invAmt: number;
  onConfirm: (gap: number) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const gap = bankAmt - invAmt;
  const isPositive = gap > 0;
  const fmt = (n: number) => new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(Math.abs(n));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-orange-500"/>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">Comptabiliser l'écart</h3>
            <p className="text-xs text-gray-400">Création d'une écriture d'écart automatique</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Montant banque</p>
              <p className="font-bold text-gray-900">{fmt(bankAmt)} Ar</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Montant facture</p>
              <p className="font-bold text-gray-900">{fmt(invAmt)} Ar</p>
            </div>
            <div className={`rounded-xl p-3 ${isPositive ? "bg-emerald-50" : "bg-orange-50"}`}>
              <p className="text-xs text-gray-400 mb-1">Écart</p>
              <p className={`font-bold ${isPositive ? "text-emerald-700" : "text-orange-700"}`}>{gap > 0 ? "+" : ""}{fmt(gap)} Ar</p>
            </div>
          </div>

          <div className={`rounded-xl p-4 border ${isPositive ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"}`}>
            <p className="text-sm font-semibold mb-2 text-gray-700">Écriture comptable générée :</p>
            <div className="text-xs space-y-1 font-mono">
              {isPositive ? (
                <>
                  <div className="flex justify-between"><span>Débit 512 Banques</span><span className="font-bold">{fmt(gap)} Ar</span></div>
                  <div className="flex justify-between"><span>Crédit 758 Produits divers</span><span className="font-bold">{fmt(gap)} Ar</span></div>
                </>
              ) : (
                <>
                  <div className="flex justify-between"><span>Débit 658 Charges diverses</span><span className="font-bold">{fmt(gap)} Ar</span></div>
                  <div className="flex justify-between"><span>Crédit 512 Banques</span><span className="font-bold">{fmt(gap)} Ar</span></div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
          <button onClick={() => onConfirm(gap)} disabled={isPending}
            className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {isPending ? "Comptabilisation…" : "Valider et rapprocher"}
          </button>
        </div>
      </div>
    </div>
  );
}
