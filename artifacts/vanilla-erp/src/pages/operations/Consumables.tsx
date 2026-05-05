import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Package, Plus, AlertTriangle, CheckCircle2, Pencil, Trash2,
  X, TrendingUp, RotateCcw,
} from "lucide-react";

interface Consumable {
  id: string; name: string; unit: string; stock: number; minStock: number; createdAt: string;
}

const api = async (path: string, opts?: RequestInit) => {
  const r = await fetch(`/api${path}`, { credentials: "include", ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error ?? "Erreur"); }
  return r.json();
};

function StockBar({ stock, minStock }: { stock: number; minStock: number }) {
  const isLow = stock <= minStock;
  const max = Math.max(minStock * 3, stock * 1.2, 10);
  const pct = Math.min(100, (stock / max) * 100);
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 mt-1.5">
      <div className={`h-2 rounded-full transition-all ${isLow ? "bg-red-500" : "bg-green-500"}`}
        style={{ width: `${pct}%` }} />
    </div>
  );
}

type CreateForm = { name: string; unit: string; stock: string; minStock: string };
type AddStockForm = { amount: string };

function CreateModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<CreateForm>({
    defaultValues: { name: "", unit: "unité", stock: "0", minStock: "0" },
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const onSubmit = async (d: CreateForm) => {
    try {
      await api("/operations/consumables", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: d.name, unit: d.unit, stock: Number(d.stock), minStock: Number(d.minStock) }),
      });
      toast.success("Consommable ajouté");
      onSave();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Nouveau consommable</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input {...register("name", { required: true })} placeholder="Ex: Sachets sous vide"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unité</label>
              <select {...register("unit")}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                {["unité", "kg", "m", "rouleau", "boîte", "litre"].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock initial</label>
              <input {...register("stock")} type="number" min="0" step="0.1"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Seuil d'alerte</label>
            <input {...register("minStock")} type="number" min="0" step="0.1"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {isSubmitting ? "…" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddStockModal({ consumable, onClose, onSave }: { consumable: Consumable; onClose: () => void; onSave: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting }, setValue } = useForm<AddStockForm>({ defaultValues: { amount: "" } });

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const onSubmit = async (d: AddStockForm) => {
    const amount = Number(d.amount);
    if (!amount || isNaN(amount)) { toast.error("Quantité invalide"); return; }
    try {
      await api(`/operations/consumables/${consumable.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addStock: amount }),
      });
      toast.success(`+${amount} ${consumable.unit} ajouté`);
      onSave();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const PRESETS = [10, 50, 100, 200, 500];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">Ajouter stock</h2>
            <p className="text-xs text-gray-500">{consumable.name} · Stock actuel : <strong>{consumable.stock} {consumable.unit}</strong></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Quantité à ajouter</label>
            <div className="flex gap-2 flex-wrap mb-3">
              {PRESETS.map(p => (
                <button key={p} type="button" onClick={() => setValue("amount", String(p))}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-primary hover:text-primary transition-colors">
                  +{p}
                </button>
              ))}
            </div>
            <input {...register("amount", { required: true })} type="number" min="0.1" step="0.1"
              placeholder={`Quantité en ${consumable.unit}`}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {isSubmitting ? "…" : "Confirmer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CorrectStockModal({ consumable, onClose, onSave }: { consumable: Consumable; onClose: () => void; onSave: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ stock: string }>({
    defaultValues: { stock: String(consumable.stock) },
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const onSubmit = async (d: { stock: string }) => {
    try {
      await api(`/operations/consumables/${consumable.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock: Number(d.stock) }),
      });
      toast.success("Stock corrigé");
      onSave();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Corriger stock</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {consumable.name} — Nouveau stock réel ({consumable.unit})
            </label>
            <input {...register("stock", { required: true })} type="number" min="0" step="0.1"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 disabled:opacity-50">
              {isSubmitting ? "…" : "Corriger"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ConsumablesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate]   = useState(false);
  const [addStockItem, setAddStock]   = useState<Consumable | null>(null);
  const [correctItem, setCorrect]     = useState<Consumable | null>(null);

  const { data: consumables = [], isLoading } = useQuery<Consumable[]>({
    queryKey: ["consumables"],
    queryFn: () => api("/operations/consumables"),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["consumables"] });

  const del = async (c: Consumable) => {
    if (!confirm(`Supprimer "${c.name}" ?`)) return;
    try {
      await api(`/operations/consumables/${c.id}`, { method: "DELETE" });
      toast.success("Supprimé");
      refresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const lowCount = consumables.filter(c => (c.stock ?? 0) <= (c.minStock ?? 0)).length;

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion Consommables</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {consumables.length} article(s) · {lowCount > 0 && <span className="text-red-600 font-medium">{lowCount} en stock faible</span>}
            {lowCount === 0 && "Stocks OK"}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 shadow-sm">
          <Plus className="w-4 h-4" />Nouveau
        </button>
      </div>

      {/* Alert banner */}
      {lowCount > 0 && (
        <div className="mb-5 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-semibold">{lowCount} consommable(s) en dessous du seuil d'alerte</p>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Chargement…</div>
      ) : consumables.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Aucun consommable</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {consumables.map(c => {
            const isLow = (c.stock ?? 0) <= (c.minStock ?? 0);
            return (
              <div key={c.id} className={`bg-white rounded-2xl border shadow-sm p-5 ${isLow ? "border-red-200" : "border-gray-100"}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {isLow
                        ? <AlertTriangle className="w-4 h-4 text-red-500" />
                        : <CheckCircle2 className="w-4 h-4 text-green-500" />}
                      <h3 className="font-semibold text-gray-900">{c.name}</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">Seuil : {c.minStock} {c.unit}</p>
                  </div>
                  <button onClick={() => del(c)}
                    className="text-gray-300 hover:text-red-500 p-1 rounded transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="mb-3">
                  <p className={`text-3xl font-bold ${isLow ? "text-red-600" : "text-gray-900"}`}>
                    {(c.stock ?? 0).toFixed(c.unit === "kg" || c.unit === "m" ? 1 : 0)}
                    <span className="text-base font-normal text-gray-400 ml-1">{c.unit}</span>
                  </p>
                  {isLow && <p className="text-xs text-red-500 font-medium mt-0.5">⚠ Stock insuffisant</p>}
                </div>

                <StockBar stock={c.stock ?? 0} minStock={c.minStock ?? 0} />

                <div className="mt-4 flex gap-2">
                  <button onClick={() => setAddStock(c)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary/10 text-primary rounded-lg text-xs font-semibold hover:bg-primary/20 transition-colors">
                    <TrendingUp className="w-3.5 h-3.5" />Ajouter stock
                  </button>
                  <button onClick={() => setCorrect(c)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" />Corriger
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate  && <CreateModal    onClose={() => setShowCreate(false)} onSave={() => { setShowCreate(false); refresh(); }} />}
      {addStockItem && <AddStockModal  consumable={addStockItem} onClose={() => setAddStock(null)}  onSave={() => { setAddStock(null);  refresh(); }} />}
      {correctItem  && <CorrectStockModal consumable={correctItem} onClose={() => setCorrect(null)}   onSave={() => { setCorrect(null);  refresh(); }} />}
    </div>
  );
}
