import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

const DEPARTMENTS = ["Production", "Séchage", "Qualité", "Logistique", "Administration", "Finance", "Autre"];
const STATUTS = ["actif", "suspendu", "sorti"] as const;
const CONTRATS = ["CDI", "CDD", "journalier"] as const;

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

type EmpForm = {
  matricule: string; name: string; sexe: string; email: string; position: string;
  department: string; salary: string; phone: string; hireDate: string;
  typeContrat: string; cnapsNumber: string; ostieNumber: string; statut: string;
};

type Emp = Record<string, any>;

async function fetchEmployees(): Promise<Emp[]> {
  const r = await fetch("/api/employees", { credentials: "include" });
  return r.json();
}

function statutBadge(s: string) {
  if (s === "actif") return <Badge className="bg-green-100 text-green-800 text-xs">Actif</Badge>;
  if (s === "suspendu") return <Badge className="bg-amber-100 text-amber-800 text-xs">Suspendu</Badge>;
  return <Badge variant="secondary" className="text-xs">Sorti</Badge>;
}

export default function EmployeesPage() {
  const qc = useQueryClient();
  const { data: employees = [], isLoading } = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Emp | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<EmpForm>({
    matricule: "", name: "", sexe: "", email: "", position: "",
    department: "", salary: "", phone: "", hireDate: "",
    typeContrat: "CDI", cnapsNumber: "", ostieNumber: "", statut: "actif",
  });
  const [error, setError] = useState("");

  const saveMut = useMutation({
    mutationFn: async (data: EmpForm) => {
      const url = editing ? `/api/employees/${editing.id}` : "/api/employees";
      const r = await fetch(url, {
        method: editing ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          salary: data.salary ? Number(data.salary) : null,
          hireDate: data.hireDate || null,
          isActive: data.statut === "actif",
        }),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); setShowModal(false); setError(""); },
    onError: (e: Error) => setError(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ matricule: "", name: "", sexe: "", email: "", position: "", department: "", salary: "", phone: "", hireDate: "", typeContrat: "CDI", cnapsNumber: "", ostieNumber: "", statut: "actif" });
    setError(""); setShowModal(true);
  };

  const openEdit = (e: Emp) => {
    setEditing(e);
    setForm({
      matricule: e.matricule ?? "", name: e.name, sexe: e.sexe ?? "", email: e.email ?? "",
      position: e.position, department: e.department ?? "", salary: e.salary?.toString() ?? "",
      phone: e.phone ?? "", hireDate: e.hireDate ? e.hireDate.slice(0, 10) : "",
      typeContrat: e.typeContrat ?? "CDI", cnapsNumber: e.cnapsNumber ?? "",
      ostieNumber: e.ostieNumber ?? "", statut: e.statut ?? "actif",
    });
    setError(""); setShowModal(true);
  };

  const handleCsvExport = async () => {
    const r = await fetch("/api/employees/export/csv", { credentials: "include" });
    const blob = new Blob([await r.text()], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "employes.csv"; a.click();
  };

  const filtered = employees.filter(
    (e) => e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.matricule ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.position ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const field = (label: string, key: keyof EmpForm, type = "text", required = false) => (
    <div key={key}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required ? " *" : ""}</label>
      <input type={type} required={required} value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Employés</h1>
          <p className="text-gray-500 text-sm mt-1">{employees.length} enregistré(s) — {employees.filter(e => e.statut === "actif").length} actifs</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleCsvExport} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">Exporter CSV</button>
          <button onClick={openCreate} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">+ Nouvel employé</button>
        </div>
      </div>

      <div className="mb-4">
        <input className="w-full sm:w-72 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Rechercher (nom, matricule, poste)…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Matricule", "Nom", "Poste", "Département", "Contrat", "Salaire (MGA)", "CNAPS / OSTIE", "Statut", ""].map((h) => (
                  <th key={h} className="text-left px-3 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">Aucun employé trouvé</td></tr>
              ) : filtered.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3 font-mono text-xs text-gray-500">{emp.matricule ?? "—"}</td>
                  <td className="px-3 py-3 font-medium text-gray-800">{emp.name}</td>
                  <td className="px-3 py-3 text-gray-600">{emp.position}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{emp.department || "—"}</td>
                  <td className="px-3 py-3">
                    <Badge variant="outline" className="text-xs">{emp.typeContrat ?? "CDI"}</Badge>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{emp.salary ? emp.salary.toLocaleString("fr-FR") : "—"}</td>
                  <td className="px-3 py-3 text-xs text-gray-500">
                    {emp.cnapsNumber ? `CNAPS: ${emp.cnapsNumber}` : ""}{emp.cnapsNumber && emp.ostieNumber ? " / " : ""}{emp.ostieNumber ? `OSTIE: ${emp.ostieNumber}` : ""}
                    {!emp.cnapsNumber && !emp.ostieNumber ? "—" : ""}
                  </td>
                  <td className="px-3 py-3">{statutBadge(emp.statut ?? "actif")}</td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => openEdit(emp)} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Modifier</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? "Modifier l'employé" : "Nouvel employé"} onClose={() => setShowModal(false)}>
          <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}

            <div className="grid grid-cols-2 gap-3">
              {field("Matricule", "matricule")}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sexe</label>
                <select value={form.sexe} onChange={(e) => setForm(f => ({ ...f, sexe: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  <option value="">—</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </div>
            </div>

            {field("Nom complet *", "name", "text", true)}
            {field("Email", "email", "email")}

            <div className="grid grid-cols-2 gap-3">
              {field("Poste *", "position", "text", true)}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Département</label>
                <select value={form.department} onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  <option value="">— Sélectionner —</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de contrat</label>
                <select value={form.typeContrat} onChange={(e) => setForm(f => ({ ...f, typeContrat: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  {CONTRATS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                <select value={form.statut} onChange={(e) => setForm(f => ({ ...f, statut: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {field("Salaire base (MGA)", "salary", "number")}
              {field("Téléphone", "phone")}
            </div>

            {field("Date d'embauche", "hireDate", "date")}

            <div className="grid grid-cols-2 gap-3">
              {field("N° CNAPS", "cnapsNumber")}
              {field("N° OSTIE", "ostieNumber")}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Annuler</button>
              <button type="submit" disabled={saveMut.isPending} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {saveMut.isPending ? "Sauvegarde…" : editing ? "Enregistrer" : "Créer"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
