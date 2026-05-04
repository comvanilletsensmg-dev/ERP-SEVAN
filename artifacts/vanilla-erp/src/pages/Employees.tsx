import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const POSTES = [
  "Directeur Général",
  "Directeur Adjoint",
  "Business Developer",
  "Commercial",
  "Responsable Logistique",
  "Agent Logistique",
  "RH",
  "Responsable RH",
  "Comptable",
  "Agent opération",
  "Agent DSI",
  "Femme de ménage",
] as const;

const STATUTS = ["actif", "suspendu", "sorti"] as const;
const CONTRATS = ["CDI", "CDD", "journalier"] as const;

const POSTE_HAS_ACCOUNT = new Set([
  "Directeur Général", "Directeur Adjoint", "Business Developer",
  "Commercial", "Responsable Logistique", "Agent Logistique",
  "RH", "Responsable RH", "Comptable",
]);

type Dept = { id: string; name: string; code: string };
type Emp = Record<string, any>;

type EmpForm = {
  nom: string; prenom: string; sexe: string; email: string;
  position: string; departmentId: string; salary: string; phone: string;
  hireDate: string; typeContrat: string; cnapsNumber: string; ostieNumber: string;
  statut: string;
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function statutBadge(s: string) {
  if (s === "actif") return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs font-medium">● Actif</Badge>;
  if (s === "suspendu") return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs font-medium">● Suspendu</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs font-medium">● Sorti</Badge>;
}

function decodeMatricule(m: string) {
  if (!m || m.length < 11) return null;
  return { year: m.slice(0, 4), deptCode: m.slice(4, 7), seq: m.slice(7) };
}

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? r.statusText); }
  return r.json();
}

const EMPTY_FORM: EmpForm = {
  nom: "", prenom: "", sexe: "", email: "", position: "",
  departmentId: "", salary: "", phone: "", hireDate: "",
  typeContrat: "CDI", cnapsNumber: "", ostieNumber: "", statut: "actif",
};

export default function EmployeesPage() {
  const qc = useQueryClient();
  const { data: employees = [], isLoading } = useQuery<Emp[]>({ queryKey: ["employees"], queryFn: () => apiFetch("/api/employees") });
  const { data: departments = [] } = useQuery<Dept[]>({ queryKey: ["departments"], queryFn: () => apiFetch("/api/departments") });

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Emp | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("all");
  const [form, setForm] = useState<EmpForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [inlineStatus, setInlineStatus] = useState<{ id: string; value: string } | null>(null);

  const saveMut = useMutation({
    mutationFn: async (data: EmpForm) => {
      const url = editing ? `/api/employees/${editing.id}` : "/api/employees";
      return apiFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          salary: data.salary ? Number(data.salary) : null,
          hireDate: data.hireDate || null,
          isActive: data.statut === "actif",
        }),
      });
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      setShowModal(false);
      setError("");
      if (!editing && result.accountCreated && result.generatedPassword) {
        toast.success(`Compte créé — Mot de passe : ${result.generatedPassword}`, { duration: 10000 });
      } else if (!editing && result.matricule) {
        toast.success(`Employé créé — Matricule : ${result.matricule}`);
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: string }) =>
      apiFetch(`/api/employees/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      setInlineStatus(null);
      toast.success("Statut mis à jour");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowModal(true);
  };

  const openEdit = (e: Emp) => {
    setEditing(e);
    setForm({
      nom: e.nom ?? e.name ?? "",
      prenom: e.prenom ?? "",
      sexe: e.sexe ?? "",
      email: e.email ?? "",
      position: e.position,
      departmentId: e.departmentId ?? "",
      salary: e.salary?.toString() ?? "",
      phone: e.phone ?? "",
      hireDate: e.hireDate ? e.hireDate.slice(0, 10) : "",
      typeContrat: e.typeContrat ?? "CDI",
      cnapsNumber: e.cnapsNumber ?? "",
      ostieNumber: e.ostieNumber ?? "",
      statut: e.statut ?? "actif",
    });
    setError("");
    setShowModal(true);
  };

  const handleCsvExport = async () => {
    const r = await fetch("/api/employees/export/csv", { credentials: "include" });
    const blob = new Blob([await r.text()], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "employes.csv";
    a.click();
  };

  const deptById = (id: string) => departments.find((d) => d.id === id);

  const filtered = employees.filter((e) => {
    const matchSearch =
      (e.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.nom ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.matricule ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.position ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.department ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatut = filterStatut === "all" || e.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  const sel = (label: string, key: keyof EmpForm, opts: { value: string; label: string }[], required = false) => (
    <div key={key}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required ? " *" : ""}</label>
      <select value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white">
        <option value="">— Sélectionner —</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const field = (label: string, key: keyof EmpForm, type = "text", required = false) => (
    <div key={key}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required ? " *" : ""}</label>
      <input type={type} required={required} value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
    </div>
  );

  const active = employees.filter((e) => e.statut === "actif").length;
  const suspended = employees.filter((e) => e.statut === "suspendu").length;
  const exited = employees.filter((e) => e.statut === "sorti").length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Employés</h1>
          <div className="flex gap-3 mt-1">
            <span className="text-xs text-gray-500">{employees.length} total</span>
            <span className="text-xs text-green-600 font-medium">● {active} actifs</span>
            {suspended > 0 && <span className="text-xs text-amber-600 font-medium">● {suspended} suspendus</span>}
            {exited > 0 && <span className="text-xs text-red-600 font-medium">● {exited} sortis</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleCsvExport} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">Exporter CSV</button>
          <button onClick={openCreate} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">+ Nouvel employé</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input className="w-full sm:w-72 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Rechercher (nom, matricule, poste, département)…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
          <option value="all">Tous statuts</option>
          <option value="actif">Actif</option>
          <option value="suspendu">Suspendu</option>
          <option value="sorti">Sorti</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {["Matricule", "Nom / Prénom", "Poste", "Département", "Contrat", "Salaire (MGA)", "Statut", "Compte", "Actions"].map((h) => (
                    <th key={h} className="text-left px-3 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">Aucun employé trouvé</td></tr>
                ) : filtered.map((emp) => {
                  const decoded = decodeMatricule(emp.matricule ?? "");
                  const deptName = emp.departmentId ? (deptById(emp.departmentId)?.name ?? emp.department) : emp.department;
                  const isChangingStatus = inlineStatus?.id === emp.id;

                  return (
                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-3">
                        <div className="font-mono text-xs text-gray-700 font-medium">{emp.matricule ?? "—"}</div>
                        {decoded && (
                          <div className="text-xs text-gray-400 mt-0.5">{decoded.year} · Dept {decoded.deptCode} · #{decoded.seq}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-800">
                          {emp.prenom ? `${emp.prenom} ${emp.nom ?? ""}` : emp.name}
                        </div>
                        {emp.email && <div className="text-xs text-gray-400">{emp.email}</div>}
                      </td>
                      <td className="px-3 py-3 text-gray-600 text-xs">{emp.position}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">
                        {deptName ? (
                          <span className="bg-blue-50 text-blue-700 rounded px-2 py-0.5">{deptName}</span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className="text-xs">{emp.typeContrat ?? "CDI"}</Badge>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{emp.salary ? emp.salary.toLocaleString("fr-FR") : "—"}</td>
                      <td className="px-3 py-3">{statutBadge(emp.statut ?? "actif")}</td>
                      <td className="px-3 py-3 text-center">
                        {emp.hasAccount ? (
                          <span className="text-xs bg-emerald-50 text-emerald-700 rounded px-2 py-0.5 font-medium">Oui</span>
                        ) : (
                          <span className="text-xs text-gray-400">Non</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(emp)} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium px-2 py-1 rounded hover:bg-emerald-50">
                            Modifier
                          </button>
                          {isChangingStatus ? (
                            <div className="flex items-center gap-1">
                              <select
                                className="text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                                defaultValue={emp.statut}
                                onChange={(e) => setInlineStatus({ id: emp.id, value: e.target.value })}
                              >
                                {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <button
                                onClick={() => inlineStatus && statusMut.mutate({ id: emp.id, statut: inlineStatus.value })}
                                disabled={statusMut.isPending}
                                className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700 disabled:opacity-50"
                              >✓</button>
                              <button onClick={() => setInlineStatus(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setInlineStatus({ id: emp.id, value: emp.statut })}
                              className="text-gray-500 hover:text-gray-700 text-xs px-2 py-1 rounded hover:bg-gray-100 border border-gray-200"
                            >
                              Statut ▾
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <Modal title={editing ? `Modifier — ${editing.prenom ?? editing.name}` : "Nouvel employé"} onClose={() => setShowModal(false)}>
          <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}

            {editing && (
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                <span className="font-mono font-medium text-gray-700">{editing.matricule ?? "—"}</span>
                {decodeMatricule(editing.matricule ?? "") && (
                  <span className="text-gray-400">
                    · {decodeMatricule(editing.matricule)!.year} · Dept {decodeMatricule(editing.matricule)!.deptCode} · #{decodeMatricule(editing.matricule)!.seq}
                  </span>
                )}
              </div>
            )}

            {!editing && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
                Le matricule sera généré automatiquement selon le département sélectionné.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {field("Prénom *", "prenom", "text", true)}
              {field("Nom *", "nom", "text", true)}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {sel("Sexe", "sexe", [{ value: "M", label: "Masculin" }, { value: "F", label: "Féminin" }])}
              {field("Email", "email", "email")}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {sel("Poste *", "position", POSTES.map((p) => ({ value: p, label: p })), true)}
              {sel("Département *", "departmentId", departments.map((d) => ({ value: d.id, label: `${d.name} (${d.code})` })), true)}
            </div>

            {POSTE_HAS_ACCOUNT.has(form.position as any) && form.email && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-xs text-emerald-700">
                Un compte utilisateur sera créé pour ce poste.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {sel("Type de contrat", "typeContrat", CONTRATS.map((c) => ({ value: c, label: c })))}
              {sel("Statut", "statut", STATUTS.map((s) => ({ value: s, label: s })))}
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
