import React, { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useGetJournal, getGetJournalQueryKey,
  useGetAccounts, getGetAccountsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BookOpen, Plus, Download, FileSpreadsheet, FileText,
  CheckCircle2, Lock, Pencil, Trash2, History, X, AlertTriangle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface JournalLine {
  id: string;
  entryId: string;
  accountId: string;
  debit: number;
  credit: number;
  label?: string;
  account?: { id: string; code: string; name: string; type: string };
}
interface JournalEntry {
  id: string;
  date: string;
  reference: string;
  description?: string;
  status: "draft" | "validated" | "locked";
  lines?: JournalLine[];
}
interface Account { id: string; code: string; name: string; type: string; }
interface AuditLog { id: string; entryId: string; action: string; changes: unknown; userEmail: string; createdAt: string; }

interface FormLine {
  accountId: string;
  debit: string;
  credit: string;
  label: string;
}

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS = {
  draft:     { label: "Brouillon",   classes: "bg-amber-100 text-amber-800 border border-amber-200" },
  validated: { label: "Validé",      classes: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
  locked:    { label: "Verrouillé",  classes: "bg-indigo-100 text-indigo-800 border border-indigo-200" },
} as const;

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status as keyof typeof STATUS] ?? { label: status, classes: "bg-gray-100 text-gray-800" };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${s.classes}`}>{s.label}</span>;
}

function fmtAmt(n: number) { return n > 0 ? n.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) : ""; }
function fmtDate(s: string) { try { return format(parseISO(s), "dd/MM/yyyy"); } catch { return s; } }

// ── Empty line factory ────────────────────────────────────────────────────────
const emptyLine = (): FormLine => ({ accountId: "", debit: "", credit: "", label: "" });

// ── Main component ────────────────────────────────────────────────────────────
export default function Accounting() {
  const qc = useQueryClient();

  // Data
  const { data: allEntries = [], isLoading: journalLoading } =
    useGetJournal({ query: { queryKey: getGetJournalQueryKey() } });
  const { data: accounts = [] } =
    useGetAccounts({ query: { queryKey: getGetAccountsQueryKey() } });

  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo,   setFilterDateTo]   = useState("");
  const [filterRef,      setFilterRef]      = useState("");
  const [filterStatus,   setFilterStatus]   = useState("all");
  const [filterAccount,  setFilterAccount]  = useState("");

  // Modal state
  const [editEntry,  setEditEntry]  = useState<JournalEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [auditEntry, setAuditEntry] = useState<JournalEntry | null>(null);
  const [auditLogs,  setAuditLogs]  = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Form state (shared create/edit)
  const [formRef,   setFormRef]   = useState("");
  const [formDate,  setFormDate]  = useState("");
  const [formDesc,  setFormDesc]  = useState("");
  const [formLines, setFormLines] = useState<FormLine[]>([emptyLine(), emptyLine()]);
  const [saving,    setSaving]    = useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────
  const entries = useMemo(() => {
    return (allEntries as JournalEntry[]).filter(e => {
      if (filterStatus !== "all" && e.status !== filterStatus) return false;
      if (filterRef && !e.reference.toLowerCase().includes(filterRef.toLowerCase())) return false;
      if (filterDateFrom && e.date < filterDateFrom) return false;
      if (filterDateTo   && e.date.slice(0, 10) > filterDateTo)  return false;
      if (filterAccount) {
        const code = filterAccount.toLowerCase();
        return e.lines?.some(l => l.account?.code.toLowerCase().includes(code));
      }
      return true;
    });
  }, [allEntries, filterStatus, filterRef, filterDateFrom, filterDateTo, filterAccount]);

  const totalDebit  = useMemo(() => entries.reduce((s, e) => s + (e.lines?.reduce((ls, l) => ls + l.debit,  0) ?? 0), 0), [entries]);
  const totalCredit = useMemo(() => entries.reduce((s, e) => s + (e.lines?.reduce((ls, l) => ls + l.credit, 0) ?? 0), 0), [entries]);

  const balanced = useMemo(() => Math.abs(totalDebit - totalCredit) < 0.01, [totalDebit, totalCredit]);

  // ── Form helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setFormRef("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormDesc("");
    setFormLines([emptyLine(), emptyLine()]);
    setShowCreate(true);
  }

  function openEdit(e: JournalEntry) {
    setFormRef(e.reference);
    setFormDate(e.date.slice(0, 10));
    setFormDesc(e.description ?? "");
    setFormLines(
      (e.lines ?? []).map(l => ({
        accountId: l.accountId,
        debit:  l.debit  > 0 ? String(l.debit)  : "",
        credit: l.credit > 0 ? String(l.credit) : "",
        label:  l.label ?? "",
      }))
    );
    setEditEntry(e);
  }

  function addLine() { setFormLines(p => [...p, emptyLine()]); }
  function removeLine(i: number) { setFormLines(p => p.filter((_, idx) => idx !== i)); }
  function updateLine(i: number, field: keyof FormLine, val: string) {
    setFormLines(p => p.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  }

  const formDebit  = formLines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const formCredit = formLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const formBalanced = Math.abs(formDebit - formCredit) < 0.01;

  function buildLinesPayload() {
    return formLines
      .filter(l => l.accountId)
      .map(l => ({
        accountId: l.accountId,
        debit:  parseFloat(l.debit)  || 0,
        credit: parseFloat(l.credit) || 0,
        label:  l.label || undefined,
      }));
  }

  // ── API calls ─────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!formBalanced) { toast.error("Débit ≠ Crédit — rééquilibrez avant d'enregistrer"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: formRef, date: formDate, description: formDesc, lines: buildLinesPayload() }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      await qc.invalidateQueries({ queryKey: getGetJournalQueryKey() });
      setShowCreate(false);
      toast.success("Écriture créée");
    } catch (e: unknown) { toast.error(String((e as Error).message)); }
    finally { setSaving(false); }
  }

  async function handleEdit() {
    if (!editEntry) return;
    if (!formBalanced) { toast.error("Débit ≠ Crédit — rééquilibrez avant d'enregistrer"); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/journal/${editEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: formRef, date: formDate, description: formDesc, lines: buildLinesPayload() }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      await qc.invalidateQueries({ queryKey: getGetJournalQueryKey() });
      setEditEntry(null);
      toast.success("Écriture modifiée");
    } catch (e: unknown) { toast.error(String((e as Error).message)); }
    finally { setSaving(false); }
  }

  async function handleDelete(e: JournalEntry) {
    if (!confirm(`Supprimer l'écriture ${e.reference} ?`)) return;
    try {
      const r = await fetch(`/api/journal/${e.id}`, { method: "DELETE" });
      if (!r.ok) { const err = await r.json(); throw new Error(err.error); }
      await qc.invalidateQueries({ queryKey: getGetJournalQueryKey() });
      toast.success("Écriture supprimée");
    } catch (err: unknown) { toast.error(String((err as Error).message)); }
  }

  async function handleValidate(e: JournalEntry) {
    try {
      const r = await fetch(`/api/journal/${e.id}/validate`, { method: "POST" });
      if (!r.ok) { const err = await r.json(); throw new Error(err.error); }
      await qc.invalidateQueries({ queryKey: getGetJournalQueryKey() });
      toast.success("Écriture validée");
    } catch (err: unknown) { toast.error(String((err as Error).message)); }
  }

  async function handleLock(e: JournalEntry) {
    if (!confirm(`Verrouiller ${e.reference} ? Cette action est irréversible.`)) return;
    try {
      const r = await fetch(`/api/journal/${e.id}/lock`, { method: "POST" });
      if (!r.ok) { const err = await r.json(); throw new Error(err.error); }
      await qc.invalidateQueries({ queryKey: getGetJournalQueryKey() });
      toast.success("Écriture verrouillée");
    } catch (err: unknown) { toast.error(String((err as Error).message)); }
  }

  async function openAudit(e: JournalEntry) {
    setAuditEntry(e);
    setAuditLoading(true);
    try {
      const r = await fetch(`/api/journal/${e.id}/audit`);
      setAuditLogs(await r.json());
    } finally { setAuditLoading(false); }
  }

  function exportExcel() {
    const params = new URLSearchParams();
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo)   params.set("dateTo", filterDateTo);
    if (filterStatus !== "all") params.set("status", filterStatus);
    window.open(`/api/journal/export/excel?${params}`, "_blank");
  }

  function exportPdf() {
    const params = new URLSearchParams();
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo)   params.set("dateTo", filterDateTo);
    if (filterStatus !== "all") params.set("status", filterStatus);
    window.open(`/api/journal/export/pdf?${params}`, "_blank");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap gap-3 justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Journal Comptable</h2>
          <p className="text-muted-foreground mt-1 text-sm">PCG 2005 — écritures, validation et export fiscal</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} className="gap-1.5">
            <FileText className="w-4 h-4 text-red-500" /> Export PDF
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="w-4 h-4" /> Nouvelle écriture
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Du</Label>
              <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Au</Label>
              <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Référence</Label>
              <Input placeholder="Rechercher…" value={filterRef} onChange={e => setFilterRef(e.target.value)} className="h-8 text-xs w-40" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Compte</Label>
              <Input placeholder="Code compte…" value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="h-8 text-xs w-32" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Statut</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="draft">Brouillon</SelectItem>
                  <SelectItem value="validated">Validé</SelectItem>
                  <SelectItem value="locked">Verrouillé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(filterDateFrom || filterDateTo || filterRef || filterAccount || filterStatus !== "all") && (
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setFilterRef(""); setFilterAccount(""); setFilterStatus("all"); }}>
                <X className="w-3 h-3" /> Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Écritures",       value: entries.length,                  color: "text-foreground" },
          { label: "Total Débit",     value: totalDebit.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) + " Ar",  color: "text-blue-700" },
          { label: "Total Crédit",    value: totalCredit.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) + " Ar", color: "text-emerald-700" },
          { label: "Équilibre",       value: balanced ? "✔ Équilibré" : "⚠ Déséquilibre", color: balanced ? "text-emerald-700" : "text-red-600" },
        ].map(k => (
          <Card key={k.label} className="py-3 px-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className={`text-lg font-bold font-mono ${k.color}`}>{k.value}</p>
          </Card>
        ))}
      </div>

      {/* Main table */}
      <Card>
        {journalLoading ? (
          <div className="p-12 text-center text-muted-foreground">Chargement du journal…</div>
        ) : entries.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">Aucune écriture</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Les écritures sont créées automatiquement lors des achats et ventes, ou manuellement ici.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-36">Référence</TableHead>
                  <TableHead className="w-28">Statut</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24">Compte</TableHead>
                  <TableHead>Intitulé</TableHead>
                  <TableHead className="text-right w-32">Débit</TableHead>
                  <TableHead className="text-right w-32">Crédit</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <React.Fragment key={entry.id}>
                    {(entry.lines ?? []).map((line, index) => (
                      <TableRow
                        key={line.id}
                        className={index === (entry.lines?.length ?? 0) - 1 ? "border-b-[2px] border-b-muted" : "border-b-0"}
                      >
                        {/* Date — only first line */}
                        <TableCell className="align-top text-xs text-muted-foreground py-2">
                          {index === 0 && fmtDate(entry.date)}
                        </TableCell>
                        {/* Ref — only first line */}
                        <TableCell className="align-top font-mono text-xs py-2">
                          {index === 0 && entry.reference}
                        </TableCell>
                        {/* Status — only first line */}
                        <TableCell className="align-top py-2">
                          {index === 0 && <StatusBadge status={entry.status} />}
                        </TableCell>
                        {/* Description — only first line */}
                        <TableCell className="align-top text-xs text-muted-foreground py-2 max-w-[180px] truncate" title={entry.description ?? ""}>
                          {index === 0 && (entry.description ?? "")}
                        </TableCell>
                        {/* Account code */}
                        <TableCell className="font-mono text-xs py-2">{line.account?.code}</TableCell>
                        {/* Account name */}
                        <TableCell className="text-xs py-2 max-w-[160px] truncate" title={line.account?.name}>
                          {line.account?.name}
                        </TableCell>
                        {/* Debit */}
                        <TableCell className="text-right font-mono text-xs py-2 text-blue-700">
                          {fmtAmt(line.debit)}
                        </TableCell>
                        {/* Credit */}
                        <TableCell className="text-right font-mono text-xs py-2 text-emerald-700">
                          {fmtAmt(line.credit)}
                        </TableCell>
                        {/* Actions — only first line */}
                        <TableCell className="text-right py-2">
                          {index === 0 && (
                            <div className="flex gap-1 justify-end flex-wrap">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                                onClick={() => openAudit(entry)}
                              >
                                <History className="w-3 h-3" /> Audit
                              </Button>
                              {entry.status !== "locked" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[10px] gap-1"
                                  onClick={() => openEdit(entry)}
                                >
                                  <Pencil className="w-3 h-3" /> Modifier
                                </Button>
                              )}
                              {entry.status === "draft" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px] gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                    onClick={() => handleValidate(entry)}
                                  >
                                    <CheckCircle2 className="w-3 h-3" /> Valider
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-[10px] gap-1 text-red-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => handleDelete(entry)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                              {entry.status === "validated" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px] gap-1 text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                                  onClick={() => handleLock(entry)}
                                >
                                  <Lock className="w-3 h-3" /> Verrouiller
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* ── Create / Edit modal ── */}
      <EntryModal
        open={showCreate || editEntry !== null}
        title={editEntry ? `Modifier — ${editEntry.reference}` : "Nouvelle écriture"}
        locked={editEntry?.status === "locked"}
        formRef={formRef} setFormRef={setFormRef}
        formDate={formDate} setFormDate={setFormDate}
        formDesc={formDesc} setFormDesc={setFormDesc}
        formLines={formLines}
        updateLine={updateLine}
        addLine={addLine}
        removeLine={removeLine}
        accounts={accounts as Account[]}
        formDebit={formDebit}
        formCredit={formCredit}
        formBalanced={formBalanced}
        saving={saving}
        onClose={() => { setShowCreate(false); setEditEntry(null); }}
        onSave={editEntry ? handleEdit : handleCreate}
      />

      {/* ── Audit trail modal ── */}
      <Dialog open={auditEntry !== null} onOpenChange={() => setAuditEntry(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-4 h-4" /> Audit — {auditEntry?.reference}
            </DialogTitle>
          </DialogHeader>
          {auditLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Chargement…</div>
          ) : auditLogs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Aucune trace d'audit</div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {auditLogs.map(log => (
                <div key={log.id} className="flex gap-3 items-start p-3 rounded-lg bg-muted/40 border">
                  <div className="mt-0.5">
                    <AuditIcon action={log.action} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold capitalize">{log.action}</p>
                    <p className="text-[11px] text-muted-foreground">{log.userEmail}</p>
                    {log.changes && Object.keys(log.changes as object).length > 0 && (
                      <pre className="text-[10px] text-muted-foreground mt-1 whitespace-pre-wrap break-all">
                        {JSON.stringify(log.changes, null, 2)}
                      </pre>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                    {format(parseISO(log.createdAt), "dd/MM HH:mm", { locale: fr })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Audit icon ────────────────────────────────────────────────────────────────
function AuditIcon({ action }: { action: string }) {
  if (action === "created")   return <Plus        className="w-4 h-4 text-emerald-600" />;
  if (action === "updated")   return <Pencil      className="w-4 h-4 text-amber-600" />;
  if (action === "validated") return <CheckCircle2 className="w-4 h-4 text-blue-600" />;
  if (action === "locked")    return <Lock        className="w-4 h-4 text-indigo-600" />;
  if (action === "deleted")   return <Trash2      className="w-4 h-4 text-red-500" />;
  return <History className="w-4 h-4 text-muted-foreground" />;
}

// ── Entry modal (create / edit) ───────────────────────────────────────────────
interface EntryModalProps {
  open: boolean;
  title: string;
  locked: boolean;
  formRef: string; setFormRef: (v: string) => void;
  formDate: string; setFormDate: (v: string) => void;
  formDesc: string; setFormDesc: (v: string) => void;
  formLines: FormLine[];
  updateLine: (i: number, f: keyof FormLine, v: string) => void;
  addLine: () => void;
  removeLine: (i: number) => void;
  accounts: Account[];
  formDebit: number;
  formCredit: number;
  formBalanced: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}

function EntryModal({
  open, title, locked,
  formRef, setFormRef, formDate, setFormDate, formDesc, setFormDesc,
  formLines, updateLine, addLine, removeLine,
  accounts, formDebit, formCredit, formBalanced,
  saving, onClose, onSave,
}: EntryModalProps) {
  const diff = Math.abs(formDebit - formCredit);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Référence *</Label>
              <Input value={formRef} onChange={e => setFormRef(e.target.value)} disabled={locked} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} disabled={locked} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} disabled={locked} className="h-8 text-sm" />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <Label className="text-xs font-semibold uppercase tracking-wide">Lignes d'écriture</Label>
              {!locked && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addLine}>
                  <Plus className="w-3 h-3" /> Ajouter
                </Button>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium w-48">Compte</th>
                    <th className="text-left px-3 py-2 font-medium">Libellé</th>
                    <th className="text-right px-3 py-2 font-medium w-28">Débit</th>
                    <th className="text-right px-3 py-2 font-medium w-28">Crédit</th>
                    {!locked && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {formLines.map((line, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1.5">
                        <Select value={line.accountId} onValueChange={v => updateLine(i, "accountId", v)} disabled={locked}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Choisir compte…" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {accounts.map(a => (
                              <SelectItem key={a.id} value={a.id}>
                                <span className="font-mono">{a.code}</span> — {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={line.label} onChange={e => updateLine(i, "label", e.target.value)} disabled={locked} className="h-7 text-xs" placeholder="Libellé…" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" min="0" value={line.debit} onChange={e => updateLine(i, "debit", e.target.value)} disabled={locked} className="h-7 text-xs text-right" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" min="0" value={line.credit} onChange={e => updateLine(i, "credit", e.target.value)} disabled={locked} className="h-7 text-xs text-right" />
                      </td>
                      {!locked && (
                        <td className="px-1 py-1.5">
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => removeLine(i)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t-2">
                  <tr>
                    <td className="px-3 py-2 font-semibold" colSpan={2}>Total</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-blue-700">
                      {formDebit.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">
                      {formCredit.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                    </td>
                    {!locked && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Balance indicator */}
            {formLines.some(l => l.accountId) && (
              <div className={`mt-2 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${formBalanced ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {formBalanced
                  ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                {formBalanced
                  ? "Écriture équilibrée — prête à enregistrer"
                  : `Déséquilibre de ${diff.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} Ar (Débit − Crédit)`}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          {!locked && (
            <Button onClick={onSave} disabled={saving || !formRef || !formDate || !formBalanced || !formLines.some(l => l.accountId)}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
