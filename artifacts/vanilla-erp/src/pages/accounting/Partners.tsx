import { useState } from "react";
import { useGetPartners, useCreatePartner, useUpdatePartner } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";

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

export default function PartnersPage() {
  const { data: partners, refetch } = useGetPartners();
  const createPartner = useCreatePartner();
  const updatePartner = useUpdatePartner();
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("all");

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PartnerForm>();

  const onSubmit = async (data: PartnerForm) => {
    if (editId) {
      await updatePartner.mutateAsync({ id: editId, data });
    } else {
      await createPartner.mutateAsync({ data });
    }
    setShowModal(false);
    setEditId(null);
    reset();
    refetch();
  };

  const openEdit = (p: any) => {
    reset({ name: p.name, type: p.type, email: p.email ?? "", phone: p.phone ?? "", vatNumber: p.vatNumber ?? "", address: p.address ?? "", notes: p.notes ?? "" });
    setEditId(p.id);
    setShowModal(true);
  };

  const openCreate = () => { reset({ type: "client" }); setEditId(null); setShowModal(true); };

  const filtered = (partners ?? []).filter(p => filterType === "all" || p.type === filterType);
  const clients = (partners ?? []).filter(p => p.type === "client");
  const suppliers = (partners ?? []).filter(p => p.type === "supplier");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tiers comptables</h1>
          <p className="text-gray-500 text-sm mt-1">{clients.length} clients · {suppliers.length} fournisseurs</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">+ Nouveau tiers</button>
      </div>

      <div className="flex gap-2 mb-4">
        {["all", "client", "supplier"].map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterType === t ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {t === "all" ? "Tous" : t === "client" ? "Clients" : "Fournisseurs"}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Nom", "Type", "Email", "Téléphone", "N° TVA", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Aucun tiers enregistré</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.type === "client" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                    {p.type === "client" ? "Client" : "Fournisseur"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{p.email ?? "—"}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{p.phone ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.vatNumber ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(p)} className="text-xs text-emerald-600 hover:underline">Modifier</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
