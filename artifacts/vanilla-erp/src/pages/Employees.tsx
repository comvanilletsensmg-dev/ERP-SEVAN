import { useState } from "react";
import { useGetEmployees, useCreateEmployee, useUpdateEmployee, useExportEmployeesCsv } from "@workspace/api-client-react";
import { Employee, CreateEmployeeBody } from "@workspace/api-zod";
import { useForm } from "react-hook-form";

const DEPARTMENTS = ["Production", "Séchage", "Qualité", "Logistique", "Administration", "Finance"];

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

type FormData = { name: string; position: string; department: string; salary: number; phone: string };

export default function EmployeesPage() {
  const { data: employees, isLoading, refetch } = useGetEmployees();
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [search, setSearch] = useState("");

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>();

  const openCreate = () => { setEditing(null); reset({}); setShowModal(true); };
  const openEdit = (e: Employee) => {
    setEditing(e);
    reset({ name: e.name, position: e.position, department: e.department ?? "", salary: e.salary ?? undefined, phone: e.phone ?? "" });
    setShowModal(true);
  };

  const onSubmit = async (data: FormData) => {
    const body: CreateEmployeeBody = {
      name: data.name,
      position: data.position,
      department: data.department || null,
      salary: data.salary ? Number(data.salary) : null,
      phone: data.phone || null,
    };

    if (editing) {
      await updateEmployee.mutateAsync({ id: editing.id, data: body });
    } else {
      await createEmployee.mutateAsync({ data: body });
    }
    setShowModal(false);
    refetch();
  };

  const handleCsvExport = async () => {
    const res = await fetch("/api/employees/export/csv", { credentials: "include" });
    const text = await res.text();
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "employes.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = (employees ?? []).filter(
    (e) => e.name.toLowerCase().includes(search.toLowerCase()) || e.position.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Employés</h1>
          <p className="text-gray-500 text-sm mt-1">{employees?.length ?? 0} employé(s) enregistré(s)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCsvExport} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
            Exporter CSV
          </button>
          <button onClick={openCreate} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
            + Nouvel employé
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input
          className="w-full sm:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Rechercher un employé…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Nom", "Poste", "Département", "Salaire (MGA)", "Téléphone", "Date embauche", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">Aucun employé trouvé</td></tr>
              ) : (
                filtered.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{emp.name}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.position}</td>
                    <td className="px-4 py-3 text-gray-500">{emp.department || "—"}</td>
                    <td className="px-4 py-3 text-gray-700 font-mono">
                      {emp.salary ? emp.salary.toLocaleString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{emp.phone || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(emp.createdAt).toLocaleDateString("fr-FR")}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(emp)} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium">
                        Modifier
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? "Modifier l'employé" : "Nouvel employé"} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet *</label>
              <input {...register("name", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              {errors.name && <p className="text-red-500 text-xs mt-1">Requis</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Poste *</label>
              <input {...register("position", { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              {errors.position && <p className="text-red-500 text-xs mt-1">Requis</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Département</label>
              <select {...register("department")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                <option value="">— Sélectionner —</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Salaire (MGA)</label>
              <input type="number" {...register("salary")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input {...register("phone")} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button type="submit" disabled={createEmployee.isPending || updateEmployee.isPending} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {editing ? "Enregistrer" : "Créer"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
