import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Edit2, AlertCircle, ShieldAlert, History as HistoryIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// ─── Types ──────────────────────────────────────────────────────────────────
type Lot = {
  id: string; code: string; status: string;
  humidity: number; weightInitial: number; weightCurrent: number;
  riskScore: number; riskLevel: string;
  isBlocked: boolean; blockedReason: string | null;
  region: string | null; warehouse: string | null; grade: string | null;
  createdAt: string; lastRiskCheck: string | null;
};

type HistoryRow = {
  id: string; lotId: string; status: string;
  humidity: number; weight: number; note: string | null;
  createdBy: string | null; createdAt: string;
};

const STATUSES = [
  "RAW","CURING","SORTING","READY","AVAILABLE","SHIPPED",
  "PHENOLED","MOLDY","DOWNGRADED",
] as const;

const updateStatusSchema = z.object({
  status: z.enum(STATUSES),
  humidity: z.coerce.number().min(0).max(100),
  weight: z.coerce.number().positive(),
  note: z.string().optional(),
});
type UpdateStatusForm = z.infer<typeof updateStatusSchema>;

// ─── Status palette ─────────────────────────────────────────────────────────
function normalizeStatus(s: string): string {
  const u = s.toUpperCase();
  if (u === "DRYING") return "SORTING";
  if (u === "SOLD") return "SHIPPED";
  return u;
}

function StatusBadge({ status }: { status: string }) {
  const norm = normalizeStatus(status);
  const map: Record<string, string> = {
    RAW:        "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    CURING:     "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    SORTING:    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    READY:      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    AVAILABLE:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    SHIPPED:    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    PHENOLED:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    MOLDY:      "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
    DOWNGRADED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  };
  return <Badge variant="secondary" className={map[norm] ?? ""}>{norm}</Badge>;
}

function RiskBadge({ level, score }: { level: string; score: number }) {
  const map: Record<string, string> = {
    LOW:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    HIGH:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };
  return <Badge variant="secondary" className={map[level] ?? ""}>{level} ({Math.round(score)})</Badge>;
}

// ─── API helpers ────────────────────────────────────────────────────────────
async function fetchLots(): Promise<Lot[]> {
  const r = await fetch("/api/lots", { credentials: "include" });
  if (!r.ok) throw new Error("Failed to fetch lots");
  return r.json();
}
async function fetchHistory(lotId: string): Promise<HistoryRow[]> {
  const r = await fetch(`/api/lots/${lotId}/history`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to fetch history");
  return r.json();
}
async function updateStatus(payload: { lotId: string } & UpdateStatusForm) {
  const r = await fetch("/api/lots/update-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? "Échec de la mise à jour");
  return body;
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function LotsStatusPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const role = user?.role ?? "";
  const canEdit = role === "SUPER_ADMIN" || role === "LOGISTICS_MANAGER";

  const [editLot, setEditLot] = useState<Lot | null>(null);
  const [historyLot, setHistoryLot] = useState<Lot | null>(null);
  const [filter, setFilter] = useState<string>("ALL");

  const { data: lots, isLoading } = useQuery({ queryKey: ["lots"], queryFn: fetchLots });
  const { data: history } = useQuery({
    queryKey: ["lot-history", historyLot?.id],
    queryFn: () => fetchHistory(historyLot!.id),
    enabled: !!historyLot,
  });

  const form = useForm<UpdateStatusForm>({ resolver: zodResolver(updateStatusSchema) });

  const mutation = useMutation({
    mutationFn: updateStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lots"] });
      queryClient.invalidateQueries({ queryKey: ["lots-risk"] });
      queryClient.invalidateQueries({ queryKey: ["logistics-dashboard"] });
      setEditLot(null);
      form.reset();
    },
  });

  const filteredLots = useMemo(() => {
    if (!lots) return [];
    if (filter === "ALL") return lots;
    if (filter === "BLOCKED") return lots.filter(l => l.isBlocked);
    if (filter === "HIGH_RISK") return lots.filter(l => l.riskLevel === "HIGH");
    return lots.filter(l => normalizeStatus(l.status) === filter);
  }, [lots, filter]);

  const stats = useMemo(() => {
    if (!lots) return { total: 0, ready: 0, blocked: 0, high: 0 };
    return {
      total: lots.length,
      ready: lots.filter(l => ["READY","AVAILABLE"].includes(normalizeStatus(l.status))).length,
      blocked: lots.filter(l => l.isBlocked).length,
      high: lots.filter(l => l.riskLevel === "HIGH").length,
    };
  }, [lots]);

  const openEdit = (lot: Lot) => {
    setEditLot(lot);
    form.reset({
      status: normalizeStatus(lot.status) as any,
      humidity: lot.humidity,
      weight: lot.weightCurrent,
      note: "",
    });
  };

  const onSubmit = (values: UpdateStatusForm) => {
    if (!editLot) return;
    mutation.mutate({ lotId: editLot.id, ...values });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Statuts des lots vanille</h1>
        <p className="text-muted-foreground mt-1">
          Workflow qualité, alertes risque et historique d'audit
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Total lots</p>
          <p className="text-3xl font-bold mt-2" data-testid="stat-total">{stats.total}</p>
        </Card>
        <Card className="p-4 border-green-200 dark:border-green-900/40">
          <p className="text-xs text-muted-foreground uppercase">Prêts à la vente</p>
          <p className="text-3xl font-bold mt-2 text-green-700 dark:text-green-400" data-testid="stat-ready">{stats.ready}</p>
        </Card>
        <Card className="p-4 border-red-200 dark:border-red-900/40">
          <p className="text-xs text-muted-foreground uppercase">Bloqués</p>
          <p className="text-3xl font-bold mt-2 text-red-700 dark:text-red-400" data-testid="stat-blocked">{stats.blocked}</p>
        </Card>
        <Card className="p-4 border-amber-200 dark:border-amber-900/40">
          <p className="text-xs text-muted-foreground uppercase">Risque élevé</p>
          <p className="text-3xl font-bold mt-2 text-amber-700 dark:text-amber-400" data-testid="stat-high">{stats.high}</p>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Label>Filtrer:</Label>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]" data-testid="select-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous</SelectItem>
            <SelectItem value="BLOCKED">Bloqués uniquement</SelectItem>
            <SelectItem value="HIGH_RISK">Risque élevé</SelectItem>
            {STATUSES.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {filteredLots.length} lot{filteredLots.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Humidité</TableHead>
              <TableHead className="text-right">Poids (kg)</TableHead>
              <TableHead>Risque</TableHead>
              <TableHead>Blocage</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Chargement…</TableCell></TableRow>
            )}
            {!isLoading && filteredLots.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Aucun lot</TableCell></TableRow>
            )}
            {filteredLots.map(lot => (
              <TableRow key={lot.id} data-testid={`row-lot-${lot.code}`}>
                <TableCell className="font-mono text-sm">{lot.code}</TableCell>
                <TableCell><StatusBadge status={lot.status} /></TableCell>
                <TableCell className="text-right">
                  <span className={lot.humidity > 35 ? "text-red-600 font-semibold" : ""}>
                    {lot.humidity.toFixed(1)}%
                  </span>
                </TableCell>
                <TableCell className="text-right">{lot.weightCurrent.toFixed(2)}</TableCell>
                <TableCell><RiskBadge level={lot.riskLevel} score={lot.riskScore} /></TableCell>
                <TableCell>
                  {lot.isBlocked ? (
                    <Badge variant="destructive" className="gap-1">
                      <ShieldAlert className="w-3 h-3" />
                      Bloqué
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-green-700 dark:text-green-400">OK</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => setHistoryLot(lot)}
                    data-testid={`button-history-${lot.code}`}
                    title="Historique"
                  >
                    <HistoryIcon className="w-4 h-4" />
                  </Button>
                  {canEdit && (
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => openEdit(lot)}
                      data-testid={`button-edit-${lot.code}`}
                      title="Mettre à jour le statut"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editLot} onOpenChange={(o) => { if (!o) { setEditLot(null); form.reset(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mettre à jour le lot {editLot?.code}</DialogTitle>
            <DialogDescription>
              Statut actuel : <strong>{editLot && normalizeStatus(editLot.status)}</strong> — la
              transition sera validée et un historique d'audit sera créé.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Nouveau statut</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(v) => form.setValue("status", v as any, { shouldValidate: true })}
              >
                <SelectTrigger data-testid="input-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Humidité (%)</Label>
              <Input type="number" step="0.1" {...form.register("humidity")} data-testid="input-humidity" />
            </div>
            <div>
              <Label>Poids actuel (kg)</Label>
              <Input type="number" step="0.01" {...form.register("weight")} data-testid="input-weight" />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea {...form.register("note")} placeholder="Optionnel" data-testid="input-note" />
            </div>
            {mutation.isError && (
              <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-3 rounded">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{(mutation.error as Error).message}</span>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setEditLot(null); form.reset(); }}>
                Annuler
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-submit">
                {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyLot} onOpenChange={(o) => { if (!o) setHistoryLot(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historique du lot {historyLot?.code}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Humidité</TableHead>
                  <TableHead className="text-right">Poids</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!history || history.length === 0) && (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Aucun historique</TableCell></TableRow>
                )}
                {history?.map(h => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(h.createdAt), "yyyy-MM-dd HH:mm")}
                    </TableCell>
                    <TableCell><StatusBadge status={h.status} /></TableCell>
                    <TableCell className="text-right">{h.humidity.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{h.weight.toFixed(2)} kg</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{h.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
