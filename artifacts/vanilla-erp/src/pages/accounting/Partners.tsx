import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetPartners, useCreatePartner, useUpdatePartner } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { Link } from "wouter";
import {
  RefreshCw, Download, Plus, Building2, Users, Package,
  TrendingUp, AlertTriangle, ChevronRight, Search,
} from "lucide-react";
import { toast } from "sonner";

type PartnerForm = { name: string; type: string; email: string; phone: string; vatNumber: string; address: string; notes: string };

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n) + " Ar";
}

export default function PartnersPage() {
  const qc = useQueryClient();
  const { data: partners, refetch } = useGetPartners();
  const createPartner = useCreatePartner();
  const updatePartner = useUpdatePartner();

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PartnerForm>();

  // Aging data for encours
  const { data: agingData, refetch: refetchAging } = useQuery({
    queryKey: ["tiers-aging"],
    queryFn: async () => {
      const r = await fetch("/api/tiers/aging", { credentials: "include" });
      if (!r.ok) throw new Error("Erreur aging");
      return r.json() as Promise<any[]>;
    },
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/tiers/sync", { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Erreur de synchronisation");
      return r.json();
    },
    onSuccess: (result) => {
      toast.success(`Sync terminée — ${result.created} créés, ${result.updated} mis à jour`);
      refetch();
      refetchAging();
    },
    onError: () => toast.error("Erreur lors de la synchronisation"),
  });

  const onSubmit = async (data: PartnerForm) => {
    if (editId) {
      await updatePartner.mutateAsync({ id: editId, data });
      toast.success("Tiers mis à jour");
    } else {
      await createPartner.mutateAsync({ data });
      toast.success("Tiers créé");
    }
    setShowModal(false);
    setEditId(null);
    reset();
    refetch();
    refetchAging();
  };

  const openEdit = (p: any) => {
    reset({ name: p.name, type: p.type, email: p.email ?? "", phone: p.phone ?? "", vatNumber: p.vatNumber ?? "", address: p.address ?? "", notes: p.notes ?? "" });
    setEditId(p.id);
    setShowModal(true);
  };

  const openCreate = () => { reset({ type: "client" }); setEditId(null); setShowModal(true); };

  // Build aging map keyed by partner id
  const agingMap: Record<string, any> = {};
  for (const a of agingData ?? []) agingMap[a.id] = a;

  const base = (partners ?? []).filter(p => filterType === "all" || p.type === filterType);
  const filtered = search
    ? base.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.email ?? "").toLowerCase().includes(search.toLowerCase()))
    : base;

  const clients = (partners ?? []).filter(p => p.type === "client");
  const suppliers = (partners ?? []).filter(p => p.type === "supplier");
  const totalEncours = (agingData ?? []).reduce((s, a) => s + (a.aging?.total ?? 0), 0);
  const overdueCount = (agingData ?? []).filter(a => (a.aging?.["61+"] ?? 0) > 0).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tiers</h1>
            <p className="text-sm text-gray-500 mt-0.5">{clients.length} clients · {suppliers.length} fournisseurs</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open("/api/tiers/export/excel", "_blank")}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4"/>
              Balance Excel
            </button>
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="flex items-center gap-2 px-3 py-2 border border-blue-200 text-blue-700 bg-blue-50 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`}/>
              {syncMutation.isPending ? "Sync…" : "Synchroniser CRM + Logistique"}
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
              <Plus className="w-4 h-4"/>
              Nouveau tiers
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                <Building2 className="w-5 h-5 text-gray-600"/>
              </div>
              <span className="text-sm font-medium text-gray-600">Total tiers</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{(partners ?? []).length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600"/>
              </div>
              <span className="text-sm font-medium text-gray-600">Clients</span>
            </div>
            <p className="text-3xl font-bold text-blue-700">{clients.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                <Package className="w-5 h-5 text-orange-600"/>
              </div>
              <span className="text-sm font-medium text-gray-600">Fournisseurs</span>
            </div>
            <p className="text-3xl font-bold text-orange-600">{suppliers.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600"/>
              </div>
              <span className="text-sm font-medium text-gray-600">Encours total</span>
            </div>
            <p className="text-xl font-bold text-emerald-700">{fmt(totalEncours)}</p>
            {overdueCount > 0 && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3"/>{overdueCount} tiers en retard &gt;60j
              </p>
            )}
          </div>
        </div>

        {/* Filters + search */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {["all", "client", "supplier"].map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filterType === t ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                {t === "all" ? "Tous" : t === "client" ? "Clients" : "Fournisseurs"}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un tiers…"
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
            />
          </div>
          <span className="text-sm text-gray-400 ml-auto">{filtered.length} tiers</span>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Tiers", "Type", "Contact", "N° TVA", "Encours", "Aging 61+", "Factures", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-gray-400">
                  <Building2 className="w-10 h-10 mx-auto mb-3 opacity-20"/>
                  <p className="text-sm">Aucun tiers enregistré</p>
                </td></tr>
              ) : filtered.map(p => {
                const aging = agingMap[p.id];
                const encours = aging?.aging?.total ?? 0;
                const overdue61 = aging?.aging?.["61+"] ?? 0;
                return (
                  <tr key={p.id} className="hover:bg-emerald-50/30 transition-colors group">
                    <td className="px-4 py-3">
                      <Link href={`/accounting/tiers/${p.id}`} className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 ${p.type === "client" ? "bg-blue-500" : "bg-orange-400"}`}>
                          {p.name[0].toUpperCase()}
                        </div>
                        <span className="font-semibold text-gray-800 group-hover:text-emerald-700 transition-colors">{p.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.type === "client" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                        {p.type === "client" ? "Client" : "Fournisseur"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <div>{p.email ?? "—"}</div>
                      <div className="text-gray-400">{p.phone ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.vatNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-800">
                      {encours > 0 ? <span className={p.type === "client" ? "text-blue-700" : "text-orange-600"}>{fmt(encours)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {overdue61 > 0
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{fmt(overdue61)}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-gray-500">{aging?.totalInvoices ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(p)} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Modifier</button>
                        <Link href={`/accounting/tiers/${p.id}`}
                          className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-medium transition-colors">
                          Ouvrir <ChevronRight className="w-3 h-3"/>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title={editId ? "Modifier le tiers" : "Nouveau tiers"} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                <input {...register("name", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                {errors.name && <p className="text-red-500 text-xs mt-1">Requis</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select {...register("type", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  <option value="client">Client</option>
                  <option value="supplier">Fournisseur</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° TVA</label>
                <input {...register("vatNumber")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input {...register("email")} type="email" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                <input {...register("phone")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                <input {...register("address")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea {...register("notes")} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
              <button type="submit" className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
                {editId ? "Enregistrer" : "Créer"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
