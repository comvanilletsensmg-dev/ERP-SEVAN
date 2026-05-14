import { useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Package, Plus, AlertTriangle, TrendingDown, Cpu, Wrench, ClipboardList,
  RefreshCw, Search, Filter, ArrowUp, ArrowDown, RotateCcw, CheckCircle2,
  XCircle, Truck, Archive, ChevronRight, User, Calendar, Building2,
  Settings, ShieldCheck, BarChart3, Activity, Eye, Pencil, Trash2,
  ArrowLeftRight, X, Info, Clock, HardDrive, Coffee, Hammer,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface StockItem {
  id: string; reference: string; name: string; category: string;
  description?: string; unit: string; quantity: number; minQuantity: number;
  location?: string; unitPrice: number; currency: string; supplierId?: string;
  serialNumber?: string; isImmobilization: boolean; warrantyExpiry?: string;
  status: string; notes?: string; createdAt: string;
}
interface StockMovement {
  id: string; type: string; quantity: number; reason?: string;
  referenceDoc?: string; performedBy?: string; date: string;
  itemId: string; itemName: string; itemRef: string; unit: string;
}
interface Assignment {
  id: string; itemId: string; itemName: string; itemRef: string; itemCategory: string;
  employeeId: string; employeeName: string; department?: string;
  assignedAt: string; returnedAt?: string; state: string; notes?: string; assignedBy?: string;
}
interface InternalRequest {
  id: string; itemId?: string; itemName: string; quantity: number;
  requesterId: string; requesterName: string; department?: string;
  reason?: string; urgency: string; status: string;
  validatedBy?: string; validatedAt?: string; deliveredAt?: string;
  rejectionReason?: string; createdAt: string;
}
interface Maintenance {
  id: string; itemId: string; itemName: string; itemRef: string; itemCategory: string;
  type: string; description?: string; scheduledAt?: string; doneAt?: string;
  provider?: string; cost?: number; currency?: string; warrantyExpiry?: string;
  state: string; notes?: string; nextDueAt?: string; createdAt: string;
}
interface Dashboard {
  kpis: {
    totalItems: number; totalValue: number; criticalCount: number;
    immobilizationCount: number; activeAssignments: number;
    pendingRequests: number; overdueMaintenanceCount: number;
  };
  byCategory: Record<string, number>;
  criticalItems: StockItem[];
  recentMovements: StockMovement[];
  overdueMaintenance: Maintenance[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: "OPERATION",       label: "Opérations",      color: "bg-orange-100 text-orange-700", icon: Activity },
  { value: "BUREAU",          label: "Bureau",           color: "bg-blue-100 text-blue-700",    icon: ClipboardList },
  { value: "INFORMATIQUE",    label: "Informatique",     color: "bg-violet-100 text-violet-700", icon: Cpu },
  { value: "CUISINE",         label: "Cuisine",          color: "bg-green-100 text-green-700",  icon: Coffee },
  { value: "IMMOBILISATION",  label: "Immobilisation",   color: "bg-amber-100 text-amber-700",  icon: Building2 },
  { value: "MOBILIER",        label: "Mobilier",         color: "bg-pink-100 text-pink-700",    icon: Archive },
  { value: "ENTRETIEN",       label: "Entretien",        color: "bg-gray-100 text-gray-700",    icon: Hammer },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

const URGENCY_COLORS: Record<string, string> = {
  low:    "bg-gray-100 text-gray-600",
  normal: "bg-blue-100 text-blue-600",
  high:   "bg-amber-100 text-amber-700",
  urgent: "bg-red-100 text-red-700",
};
const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700",
  approved:  "bg-blue-100 text-blue-700",
  rejected:  "bg-red-100 text-red-700",
  delivered: "bg-emerald-100 text-emerald-700",
};
const MOVEMENT_COLORS: Record<string, string> = {
  IN:         "text-emerald-600",
  OUT:        "text-red-500",
  ADJUSTMENT: "text-blue-500",
  LOSS:       "text-orange-500",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const api = async (path: string, opts?: RequestInit) => {
  const r = await fetch(`/api${path}`, { credentials: "include", ...opts });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(e.error ?? "Erreur réseau");
  }
  return r.json();
};
const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";
const fmtDatetime = (d?: string | null) => d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function CategoryBadge({ category }: { category: string }) {
  const cat = CAT_MAP[category];
  if (!cat) return <span className="text-xs text-gray-500">{category}</span>;
  const Icon = cat.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cat.color}`}>
      <Icon className="w-3 h-3" />{cat.label}
    </span>
  );
}

function StockBar({ qty, min }: { qty: number; min: number }) {
  const isLow = qty <= min && min > 0;
  const max = Math.max(min * 3, qty * 1.2, 10);
  const pct = Math.min(100, min > 0 ? (qty / max) * 100 : 100);
  return (
    <div className="w-24 bg-gray-100 rounded-full h-1.5">
      <div className={`h-1.5 rounded-full ${isLow ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl w-full mx-4 max-h-[90vh] overflow-y-auto ${wide ? "max-w-2xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Item form
function ItemForm({ item, onClose, onSaved }: { item?: StockItem; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: item ? {
      ...item, warrantyExpiry: item.warrantyExpiry ? item.warrantyExpiry.slice(0, 10) : "",
    } : { category: "BUREAU", unit: "unité", quantity: 0, minQuantity: 0, unitPrice: 0, currency: "MGA", isImmobilization: false, status: "active" },
  });

  const onSubmit = async (data: any) => {
    const body = {
      ...data,
      quantity: parseFloat(data.quantity ?? 0),
      minQuantity: parseFloat(data.minQuantity ?? 0),
      unitPrice: parseFloat(data.unitPrice ?? 0),
      isImmobilization: !!data.isImmobilization,
      warrantyExpiry: data.warrantyExpiry || undefined,
    };
    await api(item ? `/stock/items/${item.id}` : "/stock/items", {
      method: item ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    toast.success(item ? "Article mis à jour" : "Article créé");
    onSaved();
    onClose();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Référence *</label>
          <input {...register("reference", { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="REF-001" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Désignation *</label>
          <input {...register("name", { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Nom de l'article" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Catégorie</label>
          <select {...register("category")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Unité</label>
          <input {...register("unit")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="unité / kg / carton…" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Quantité</label>
          <input type="number" step="any" {...register("quantity")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Seuil min.</label>
          <input type="number" step="any" {...register("minQuantity")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Prix unitaire</label>
          <input type="number" step="any" {...register("unitPrice")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Emplacement</label>
          <input {...register("location")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Entrepôt A, bureau 3…" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">N° série</label>
          <input {...register("serialNumber")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Fin garantie</label>
          <input type="date" {...register("warrantyExpiry")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Statut</label>
          <select {...register("status")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="isImmo" {...register("isImmobilization")} className="rounded" />
        <label htmlFor="isImmo" className="text-xs font-semibold text-gray-700">Créer comme immobilisation</label>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
        <textarea {...register("notes")} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">Annuler</button>
        <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {isSubmitting ? "Enregistrement…" : item ? "Mettre à jour" : "Créer"}
        </button>
      </div>
    </form>
  );
}

// Movement form
function MovementForm({ items, onClose, onSaved }: { items: StockItem[]; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { itemId: "", type: "IN", quantity: "1", reason: "", referenceDoc: "" },
  });
  const onSubmit = async (data: any) => {
    await api("/stock/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, quantity: parseFloat(data.quantity) }),
    });
    toast.success("Mouvement enregistré");
    onSaved();
    onClose();
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Article *</label>
        <select {...register("itemId", { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <option value="">— Sélectionner —</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.reference} — {i.name} (stock: {i.quantity} {i.unit})</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Type *</label>
          <select {...register("type")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="IN">Entrée (IN)</option>
            <option value="OUT">Sortie (OUT)</option>
            <option value="ADJUSTMENT">Ajustement</option>
            <option value="LOSS">Perte / Casse</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Quantité *</label>
          <input type="number" step="any" min="0.01" {...register("quantity", { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Motif</label>
        <input {...register("reason")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Achat, retour, inventaire…" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Réf. document</label>
        <input {...register("referenceDoc")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="BC-2026-001, FA-123…" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">Annuler</button>
        <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
          {isSubmitting ? "Enregistrement…" : "Valider"}
        </button>
      </div>
    </form>
  );
}

// Assignment form
function AssignmentForm({ items, onClose, onSaved }: { items: StockItem[]; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { itemId: "", employeeId: "emp-" + Date.now(), employeeName: "", department: "", state: "good", notes: "" },
  });
  const onSubmit = async (data: any) => {
    await api("/stock/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    toast.success("Attribution enregistrée");
    onSaved();
    onClose();
  };
  const eligibleItems = items.filter(i => ["INFORMATIQUE", "MOBILIER", "BUREAU"].includes(i.category) && i.quantity >= 1);
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Matériel *</label>
        <select {...register("itemId", { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <option value="">— Sélectionner —</option>
          {eligibleItems.map(i => <option key={i.id} value={i.id}>{i.reference} — {i.name} (dispo: {i.quantity})</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Nom employé *</label>
          <input {...register("employeeName", { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Département</label>
          <input {...register("department")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="DSI, RH, Logistique…" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">État à l'attribution</label>
        <select {...register("state")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <option value="good">Bon état</option>
          <option value="damaged">Endommagé</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
        <textarea {...register("notes")} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">Annuler</button>
        <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
          {isSubmitting ? "Attribution…" : "Attribuer"}
        </button>
      </div>
    </form>
  );
}

// Request form
function RequestForm({ items, onClose, onSaved }: { items: StockItem[]; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { itemId: "", itemName: "", quantity: "1", requesterName: "", department: "", reason: "", urgency: "normal" },
  });
  const onSubmit = async (data: any) => {
    await api("/stock/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, quantity: parseFloat(data.quantity || "1"), itemId: data.itemId || undefined }),
    });
    toast.success("Demande soumise");
    onSaved();
    onClose();
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Article demandé *</label>
        <input {...register("itemName", { required: true })} list="items-list" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Nom de l'article…" />
        <datalist id="items-list">
          {items.map(i => <option key={i.id} value={i.name} />)}
        </datalist>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Quantité</label>
          <input type="number" step="any" min="0.01" {...register("quantity")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Urgence</label>
          <select {...register("urgency")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="low">Faible</option>
            <option value="normal">Normale</option>
            <option value="high">Haute</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Demandeur *</label>
          <input {...register("requesterName", { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Service</label>
          <input {...register("department")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Motif / Justification</label>
        <textarea {...register("reason")} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">Annuler</button>
        <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 disabled:opacity-50">
          {isSubmitting ? "Envoi…" : "Soumettre la demande"}
        </button>
      </div>
    </form>
  );
}

// Maintenance form
function MaintenanceForm({ items, record, onClose, onSaved }: { items: StockItem[]; record?: Maintenance; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: record ? {
      ...record,
      scheduledAt: record.scheduledAt?.slice(0, 10) ?? "",
      doneAt: record.doneAt?.slice(0, 10) ?? "",
      warrantyExpiry: record.warrantyExpiry?.slice(0, 10) ?? "",
      nextDueAt: record.nextDueAt?.slice(0, 10) ?? "",
    } : { itemId: "", type: "preventive", state: "planned", cost: 0, currency: "MGA" },
  });
  const onSubmit = async (data: any) => {
    const body = { ...data, cost: parseFloat(data.cost ?? 0) };
    await api(record ? `/stock/maintenance/${record.id}` : "/stock/maintenance", {
      method: record ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    toast.success(record ? "Maintenance mise à jour" : "Maintenance planifiée");
    onSaved();
    onClose();
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {!record && (
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Équipement *</label>
          <select {...register("itemId", { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">— Sélectionner —</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.reference} — {i.name}</option>)}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
          <select {...register("type")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="preventive">Préventive</option>
            <option value="corrective">Corrective</option>
            <option value="calibration">Calibration</option>
            <option value="warranty_claim">Garantie</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Statut</label>
          <select {...register("state")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="planned">Planifiée</option>
            <option value="in_progress">En cours</option>
            <option value="done">Terminée</option>
            <option value="cancelled">Annulée</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
        <input {...register("description")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Date planifiée</label>
          <input type="date" {...register("scheduledAt")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Date réalisée</label>
          <input type="date" {...register("doneAt")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Prestataire</label>
          <input {...register("provider")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Coût (MGA)</label>
          <input type="number" step="any" {...register("cost")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Fin garantie</label>
          <input type="date" {...register("warrantyExpiry")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Prochaine échéance</label>
          <input type="date" {...register("nextDueAt")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
        <textarea {...register("notes")} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">Annuler</button>
        <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50">
          {isSubmitting ? "Enregistrement…" : record ? "Mettre à jour" : "Planifier"}
        </button>
      </div>
    </form>
  );
}

// ─── Tab: Dashboard ───────────────────────────────────────────────────────────
function DashboardTab({ dashboard }: { dashboard: Dashboard }) {
  const { kpis, byCategory, criticalItems, recentMovements, overdueMaintenance } = dashboard;
  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Articles en stock",     value: fmt(kpis.totalItems),           icon: Package,      color: "text-blue-600",    bg: "bg-blue-50" },
          { label: "Valeur totale (MGA)",   value: fmt(kpis.totalValue),           icon: BarChart3,    color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Articles critiques",    value: fmt(kpis.criticalCount),        icon: AlertTriangle,color: "text-red-600",     bg: "bg-red-50" },
          { label: "Immobilisations",       value: fmt(kpis.immobilizationCount),  icon: Building2,    color: "text-amber-600",   bg: "bg-amber-50" },
          { label: "Attributions actives",  value: fmt(kpis.activeAssignments),    icon: User,         color: "text-violet-600",  bg: "bg-violet-50" },
          { label: "Demandes en attente",   value: fmt(kpis.pendingRequests),      icon: ClipboardList,color: "text-indigo-600",  bg: "bg-indigo-50" },
          { label: "Maintenances en retard",value: fmt(kpis.overdueMaintenanceCount), icon: Wrench,   color: "text-orange-600",  bg: "bg-orange-50" },
          { label: "Catégories actives",    value: fmt(Object.keys(byCategory).length), icon: Filter, color: "text-gray-600",   bg: "bg-gray-50" },
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className={`w-9 h-9 rounded-xl ${k.bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${k.color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* By category */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Répartition par catégorie</h3>
          <div className="space-y-2">
            {CATEGORIES.map(cat => {
              const count = byCategory[cat.value] ?? 0;
              const total = Object.values(byCategory).reduce((a, b) => a + b, 0) || 1;
              const pct = Math.round((count / total) * 100);
              const Icon = cat.icon;
              return (
                <div key={cat.value} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-lg ${cat.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-3 h-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 font-medium">{cat.label}</span>
                      <span className="text-gray-400">{count} article{count > 1 ? "s" : ""}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full">
                      <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="text-xs font-bold text-gray-500 w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Critical stock */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Stock critique
          </h3>
          {criticalItems.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-300" />
              <p className="text-sm">Tous les stocks sont au-dessus du seuil</p>
            </div>
          ) : (
            <div className="space-y-2">
              {criticalItems.map(item => (
                <div key={item.id} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.reference} · {item.location ?? "—"}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-sm font-bold text-red-600">{item.quantity} {item.unit}</p>
                    <p className="text-xs text-gray-400">min {item.minQuantity}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent movements */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-blue-500" /> Derniers mouvements
        </h3>
        {recentMovements.length === 0 ? (
          <p className="text-center py-6 text-xs text-gray-400">Aucun mouvement enregistré</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-4">Article</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Quantité</th>
                  <th className="pb-2 pr-4">Motif</th>
                  <th className="pb-2">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentMovements.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50/50">
                    <td className="py-2 pr-4">
                      <p className="font-semibold text-xs text-gray-800">{m.itemName}</p>
                      <p className="text-xs text-gray-400">{m.itemRef}</p>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-bold ${MOVEMENT_COLORS[m.type] ?? "text-gray-600"}`}>{m.type}</span>
                    </td>
                    <td className="py-2 pr-4 text-xs font-semibold text-gray-700">
                      {m.type === "IN" ? "+" : m.type === "OUT" || m.type === "LOSS" ? "−" : "="}{m.quantity} {m.unit}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-500">{m.reason ?? "—"}</td>
                    <td className="py-2 text-xs text-gray-400">{fmtDate(m.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Stock Items ─────────────────────────────────────────────────────────
function StockTab({ items, onRefresh }: { items: StockItem[]; onRefresh: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [showItemForm, setShowItemForm] = useState(false);
  const [showMoveForm, setShowMoveForm] = useState(false);
  const [editItem, setEditItem] = useState<StockItem | undefined>();

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Archiver "${name}" ?`)) return;
    await api(`/stock/items/${id}`, { method: "DELETE" });
    toast.success("Article archivé");
    onRefresh();
  };

  const filtered = items
    .filter(i => !catFilter || i.category === catFilter)
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.reference.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm"
            placeholder="Rechercher…" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
          <option value="">Toutes les catégories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <button onClick={() => setShowMoveForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700">
          <ArrowLeftRight className="w-4 h-4" /> Mouvement
        </button>
        <button onClick={() => { setEditItem(undefined); setShowItemForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Nouvel article
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-400 border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3">Référence</th>
                <th className="px-4 py-3">Désignation</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Seuil</th>
                <th className="px-4 py-3">Emplacement</th>
                <th className="px-4 py-3">Val. stock</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-xs">Aucun article{search || catFilter ? " correspondant" : ""}</td></tr>
              )}
              {filtered.map(item => {
                const isLow = item.quantity <= item.minQuantity && item.minQuantity > 0;
                return (
                  <tr key={item.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-gray-700">{item.reference}</span>
                      {item.isImmobilization && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-semibold">IMMO</span>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-xs text-gray-800">{item.name}</p>
                      {item.serialNumber && <p className="text-xs text-gray-400">S/N: {item.serialNumber}</p>}
                    </td>
                    <td className="px-4 py-3"><CategoryBadge category={item.category} /></td>
                    <td className="px-4 py-3">
                      <div>
                        <span className={`text-sm font-bold ${isLow ? "text-red-600" : "text-gray-800"}`}>{item.quantity} {item.unit}</span>
                        {isLow && <AlertTriangle className="inline-block w-3 h-3 ml-1 text-red-500" />}
                        <StockBar qty={item.quantity} min={item.minQuantity} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{item.minQuantity} {item.unit}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{item.location ?? "—"}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-700">
                      {fmt(item.quantity * item.unitPrice)} {item.currency}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditItem(item); setShowItemForm(true); }}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(item.id, item.name)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showItemForm && (
        <Modal title={editItem ? "Modifier l'article" : "Nouvel article"} onClose={() => setShowItemForm(false)} wide>
          <ItemForm item={editItem} onClose={() => setShowItemForm(false)} onSaved={onRefresh} />
        </Modal>
      )}
      {showMoveForm && (
        <Modal title="Enregistrer un mouvement" onClose={() => setShowMoveForm(false)}>
          <MovementForm items={items} onClose={() => setShowMoveForm(false)} onSaved={onRefresh} />
        </Modal>
      )}
    </div>
  );
}

// ─── Tab: Assignments ─────────────────────────────────────────────────────────
function AssignmentsTab({ items, onRefresh }: { items: StockItem[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);

  const { data: assignments = [], refetch } = useQuery<Assignment[]>({
    queryKey: ["stock-assignments", activeOnly],
    queryFn: () => api(`/stock/assignments?active=${activeOnly}`),
  });

  const handleReturn = async (id: string, name: string) => {
    const state = prompt(`Retour de "${name}". État à la restitution ? (good / damaged / lost)`, "good");
    if (state === null) return;
    await api(`/stock/assignments/${id}/return`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    toast.success("Retour enregistré");
    refetch();
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} className="rounded" />
          Attributions actives seulement
        </label>
        <button onClick={() => setShowForm(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700">
          <Plus className="w-4 h-4" /> Attribuer un matériel
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-400 border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3">Matériel</th>
                <th className="px-4 py-3">Employé</th>
                <th className="px-4 py-3">Département</th>
                <th className="px-4 py-3">Attribution</th>
                <th className="px-4 py-3">Retour</th>
                <th className="px-4 py-3">État</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {assignments.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-xs">Aucune attribution</td></tr>
              )}
              {assignments.map(a => (
                <tr key={a.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-xs text-gray-800">{a.itemName}</p>
                    <CategoryBadge category={a.itemCategory} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-800">{a.employeeName}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{a.department ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(a.assignedAt)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{a.returnedAt ? fmtDate(a.returnedAt) : <span className="text-emerald-600 font-semibold">En cours</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${a.state === "good" ? "bg-emerald-100 text-emerald-700" : a.state === "lost" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {a.state === "good" ? "Bon état" : a.state === "lost" ? "Perdu" : "Endommagé"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!a.returnedAt && (
                      <button onClick={() => handleReturn(a.id, a.itemName)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200">
                        <RotateCcw className="w-3 h-3" /> Retour
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <Modal title="Attribuer un matériel" onClose={() => setShowForm(false)}>
          <AssignmentForm items={items} onClose={() => setShowForm(false)} onSaved={() => { refetch(); onRefresh(); }} />
        </Modal>
      )}
    </div>
  );
}

// ─── Tab: Requests ────────────────────────────────────────────────────────────
function RequestsTab({ items, onRefresh }: { items: StockItem[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const { data: requests = [], refetch } = useQuery<InternalRequest[]>({
    queryKey: ["stock-requests", statusFilter],
    queryFn: () => api(`/stock/requests${statusFilter ? `?status=${statusFilter}` : ""}`),
  });

  const action = async (id: string, endpoint: string, body?: any) => {
    await api(`/stock/requests/${id}/${endpoint}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    refetch();
    onRefresh();
  };

  const URGENCY_LABELS: Record<string, string> = { low: "Faible", normal: "Normale", high: "Haute", urgent: "Urgente" };
  const STATUS_LABELS: Record<string, string> = { pending: "En attente", approved: "Approuvée", rejected: "Rejetée", delivered: "Livrée" };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
          <option value="">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="approved">Approuvées</option>
          <option value="delivered">Livrées</option>
          <option value="rejected">Rejetées</option>
        </select>
        <button onClick={() => setShowForm(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600">
          <Plus className="w-4 h-4" /> Nouvelle demande
        </button>
      </div>

      <div className="space-y-3">
        {requests.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
            <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucune demande interne</p>
          </div>
        )}
        {requests.map(r => (
          <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${URGENCY_COLORS[r.urgency] ?? "bg-gray-100 text-gray-600"}`}>
                    {URGENCY_LABELS[r.urgency] ?? r.urgency}
                  </span>
                </div>
                <p className="font-bold text-sm text-gray-900">{r.itemName} <span className="text-gray-400 font-normal">× {r.quantity}</span></p>
                <p className="text-xs text-gray-500 mt-0.5">
                  <User className="inline-block w-3 h-3 mr-0.5" />{r.requesterName}
                  {r.department && ` · ${r.department}`}
                </p>
                {r.reason && <p className="text-xs text-gray-400 mt-1 italic">"{r.reason}"</p>}
                {r.rejectionReason && <p className="text-xs text-red-500 mt-1">Rejet : {r.rejectionReason}</p>}
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-xs text-gray-400">{fmtDate(r.createdAt)}</p>
                {r.status === "pending" && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={async () => {
                      const reason = prompt("Raison du rejet ?");
                      if (reason === null) return;
                      await action(r.id, "reject", { rejectionReason: reason });
                      toast.success("Demande rejetée");
                    }} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 text-xs font-semibold rounded-lg hover:bg-red-100">
                      <XCircle className="w-3 h-3" /> Rejeter
                    </button>
                    <button onClick={async () => { await action(r.id, "approve"); toast.success("Demande approuvée"); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-semibold rounded-lg hover:bg-emerald-100">
                      <CheckCircle2 className="w-3 h-3" /> Approuver
                    </button>
                  </div>
                )}
                {r.status === "approved" && (
                  <button onClick={async () => { await action(r.id, "deliver"); toast.success("Livraison enregistrée — stock déduit"); }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 text-xs font-semibold rounded-lg hover:bg-blue-100 mt-2">
                    <Truck className="w-3 h-3" /> Livrer
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal title="Nouvelle demande interne" onClose={() => setShowForm(false)}>
          <RequestForm items={items} onClose={() => setShowForm(false)} onSaved={() => { refetch(); onRefresh(); }} />
        </Modal>
      )}
    </div>
  );
}

// ─── Tab: Maintenance ─────────────────────────────────────────────────────────
function MaintenanceTab({ items, onRefresh }: { items: StockItem[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<Maintenance | undefined>();

  const { data: records = [], refetch } = useQuery<Maintenance[]>({
    queryKey: ["stock-maintenance"],
    queryFn: () => api("/stock/maintenance"),
  });

  const STATE_COLORS: Record<string, string> = {
    planned:     "bg-blue-100 text-blue-700",
    in_progress: "bg-amber-100 text-amber-700",
    done:        "bg-emerald-100 text-emerald-700",
    cancelled:   "bg-gray-100 text-gray-500",
  };
  const STATE_LABELS: Record<string, string> = {
    planned: "Planifiée", in_progress: "En cours", done: "Terminée", cancelled: "Annulée",
  };
  const TYPE_LABELS: Record<string, string> = {
    preventive: "Préventive", corrective: "Corrective", calibration: "Calibration", warranty_claim: "Garantie",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button onClick={() => { setEditRecord(undefined); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-700">
          <Plus className="w-4 h-4" /> Planifier maintenance
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-400 border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3">Équipement</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Planifiée</th>
                <th className="px-4 py-3">Réalisée</th>
                <th className="px-4 py-3">Prestataire</th>
                <th className="px-4 py-3">Coût</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400 text-xs">Aucune maintenance enregistrée</td></tr>
              )}
              {records.map(m => {
                const isOverdue = m.state === "planned" && m.scheduledAt && new Date(m.scheduledAt) < new Date();
                return (
                  <tr key={m.id} className={`hover:bg-gray-50/50 ${isOverdue ? "bg-red-50/30" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-xs text-gray-800">{m.itemName}</p>
                      <p className="text-xs text-gray-400">{m.itemRef}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{TYPE_LABELS[m.type] ?? m.type}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-32 truncate">{m.description ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {fmtDate(m.scheduledAt)}
                      {isOverdue && <span className="ml-1 text-red-500 font-bold">!</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(m.doneAt)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{m.provider ?? "—"}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-700">
                      {m.cost ? fmt(m.cost) + " " + (m.currency ?? "MGA") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATE_COLORS[m.state] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATE_LABELS[m.state] ?? m.state}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setEditRecord(m); setShowForm(true); }}
                        className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-600"><Pencil className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <Modal title={editRecord ? "Modifier la maintenance" : "Planifier une maintenance"} onClose={() => setShowForm(false)} wide>
          <MaintenanceForm items={items} record={editRecord} onClose={() => setShowForm(false)} onSaved={() => { refetch(); onRefresh(); }} />
        </Modal>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type Tab = "dashboard" | "stock" | "assignments" | "requests" | "maintenance";

export default function EquipmentStock() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const { data: dashboard, isLoading: loadingDash, refetch: refetchDash } = useQuery<Dashboard>({
    queryKey: ["stock-dashboard"],
    queryFn: () => api("/stock/dashboard"),
    refetchInterval: 60_000,
  });

  const { data: items = [], refetch: refetchItems } = useQuery<StockItem[]>({
    queryKey: ["stock-items"],
    queryFn: () => api("/stock/items"),
  });

  const { data: alerts } = useQuery({
    queryKey: ["stock-alerts"],
    queryFn: () => api("/stock/alerts"),
    refetchInterval: 120_000,
  });

  const alertCount = (alerts?.lowStock?.length ?? 0) + (alerts?.outOfStock?.length ?? 0) + (alerts?.overdueMaintenance?.length ?? 0);

  const onRefresh = useCallback(() => {
    refetchDash();
    refetchItems();
  }, [refetchDash, refetchItems]);

  const TABS: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "dashboard",    label: "Dashboard",      icon: BarChart3 },
    { id: "stock",        label: "Stock",           icon: Package,      badge: alertCount > 0 ? alertCount : undefined },
    { id: "assignments",  label: "Attributions",    icon: User },
    { id: "requests",     label: "Demandes",        icon: ClipboardList },
    { id: "maintenance",  label: "Maintenance",     icon: Wrench },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Consommables & Équipements</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestion des articles internes, matériels, immobilisations et demandes</p>
        </div>
        <button onClick={onRefresh} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {/* Alert banner */}
      {alertCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-700 font-semibold">
            {alertCount} alerte{alertCount > 1 ? "s" : ""} actives —
            {(alerts?.outOfStock?.length ?? 0) > 0 && ` ${alerts.outOfStock.length} rupture(s) de stock`}
            {(alerts?.lowStock?.length ?? 0) > 0 && ` ${alerts.lowStock.length} stock(s) critique(s)`}
            {(alerts?.overdueMaintenance?.length ?? 0) > 0 && ` ${alerts.overdueMaintenance.length} maintenance(s) en retard`}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors relative ${
                activeTab === tab.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}>
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.badge != null && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {loadingDash && activeTab === "dashboard" ? (
        <div className="flex items-center gap-3 text-gray-400 py-12 justify-center">
          <RefreshCw className="w-5 h-5 animate-spin" /> Chargement…
        </div>
      ) : (
        <>
          {activeTab === "dashboard" && dashboard && <DashboardTab dashboard={dashboard} />}
          {activeTab === "stock"       && <StockTab items={items} onRefresh={onRefresh} />}
          {activeTab === "assignments" && <AssignmentsTab items={items} onRefresh={onRefresh} />}
          {activeTab === "requests"    && <RequestsTab items={items} onRefresh={onRefresh} />}
          {activeTab === "maintenance" && <MaintenanceTab items={items} onRefresh={onRefresh} />}
        </>
      )}
    </div>
  );
}
