import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const POSTES_SUGGESTIONS = [
  "Directeur Général",
  "Directeur Adjoint",
  "Business Developer",
  "Commercial",
  "Responsable Logistique",
  "Responsable Opération",
  "Responsable DSI",
  "Responsable RH",
  "Responsable Marketing",
  "Responsable Plateforme B2B",
  "Agent Logistique",
  "Agent opération",
  "Agent DSI",
  "RH",
  "Comptable",
  "Femme de ménage",
];

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
  hireDate: string; dateNaissance: string; typeContrat: string; statut: string;
};

const EMPTY_FORM: EmpForm = {
  nom: "", prenom: "", sexe: "", email: "", position: "",
  departmentId: "", salary: "", phone: "", hireDate: "", dateNaissance: "",
  typeContrat: "CDI", statut: "actif",
};

/** Splits "Prénom NOM" into { prenom, nom } — NOM is all-uppercase */
function splitFullName(fullName: string): { prenom: string; nom: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { prenom: "", nom: parts[0] };
  // Find first all-caps segment (surname convention in Madagascar)
  const surnameIdx = parts.findIndex((p) => p.length > 1 && p === p.toUpperCase() && /^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ]+$/.test(p));
  if (surnameIdx > 0) {
    return {
      prenom: parts.slice(0, surnameIdx).join(" "),
      nom: parts.slice(surnameIdx).join(" "),
    };
  }
  // Fallback: last part is surname
  return { prenom: parts.slice(0, -1).join(" "), nom: parts[parts.length - 1] };
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white";

export default function EmployeesPage() {
  const qc = useQueryClient();
  const { data: employees = [], isLoading } = useQuery<Emp[]>({
    queryKey: ["employees"],
    queryFn: () => apiFetch("/api/employees"),
  });
  const { data: departments = [] } = useQuery<Dept[]>({
    queryKey: ["departments"],
    queryFn: () => apiFetch("/api/departments"),
  });

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Emp | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("all");
  const [form, setForm] = useState<EmpForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [inlineStatus, setInlineStatus] = useState<{ id: string; value: string } | null>(null);

  const set = (key: keyof EmpForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const saveMut = useMutation({
    mutationFn: async (data: EmpForm) => {
      if (!data.nom.trim()) throw new Error("Le nom est obligatoire");
      if (!data.position.trim()) throw new Error("Le poste est obligatoire");
      const url = editing ? `/api/employees/${editing.id}` : "/api/employees";
      return apiFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: data.nom.trim(),
          prenom: data.prenom.trim(),
          position: data.position.trim(),
          departmentId: data.departmentId || null,
          sexe: data.sexe || null,
          email: data.email.trim() || null,
          phone: data.phone.trim() || null,
          salary: data.salary ? Number(data.salary) : null,
          hireDate: data.hireDate || null,
          dateNaissance: data.dateNaissance || null,
          typeContrat: data.typeContrat || "CDI",
          statut: data.statut,
          isActive: data.statut === "actif",
        }),
      });
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      setShowModal(false);
      setError("");
      if (!editing) {
        if (result.accountCreated && result.generatedPassword) {
          toast.success(`Employé créé — Matricule : ${result.matricule}`, { duration: 6000 });
          toast.info(`Compte créé — Mot de passe temporaire : ${result.generatedPassword}`, { duration: 14000 });
        } else {
          toast.success(`Employé créé — Matricule : ${result.matricule}`);
        }
      } else if (result.matriculeRegenerated) {
        toast.success(
          `Fiche mise à jour — Nouveau matricule : ${result.matricule} (changement de département)`,
          { duration: 8000 }
        );
      } else {
        toast.success("Fiche employé mise à jour");
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

  const openEdit = (emp: Emp) => {
    setEditing(emp);
    // Smart name split when nom/prenom not yet stored separately
    let nom = emp.nom ?? "";
    let prenom = emp.prenom ?? "";
    if (!nom && emp.name) {
      const split = splitFullName(emp.name);
      nom = split.nom;
      prenom = split.prenom;
    }
    setForm({
      nom,
      prenom,
      sexe: emp.sexe ?? "",
      email: emp.email ?? "",
      position: emp.position ?? "",
      departmentId: emp.departmentId ?? "",
      salary: emp.salary != null ? String(emp.salary) : "",
      phone: emp.phone ?? "",
      hireDate: emp.hireDate ? emp.hireDate.slice(0, 10) : "",
      dateNaissance: emp.dateNaissance ? emp.dateNaissance.slice(0, 10) : "",
      typeContrat: emp.typeContrat ?? "CDI",
      statut: emp.statut ?? "actif",
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
      (e.prenom ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.matricule ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.position ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.department ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatut = filterStatut === "all" || e.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  const active = employees.filter((e) => e.statut === "actif").length;
  const suspended = employees.filter((e) => e.statut === "suspendu").length;
  const exited = employees.filter((e) => e.statut === "sorti").length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Datalist for position autocomplete */}
      <datalist id="postes-list">
        {POSTES_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
      </datalist>

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
        <input
          className="w-full sm:w-80 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Rechercher (nom, matricule, poste, département)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
                  {["Matricule", "Employé", "Poste", "Département", "Contrat", "Salaire", "Statut", "Compte", "Actions"].map((h) => (
                    <th key={h} className="text-left px-3 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">Aucun employé trouvé</td></tr>
                ) : filtered.map((emp) => {
                  const decoded = decodeMatricule(emp.matricule ?? "");
                  const deptName = emp.departmentId
                    ? (deptById(emp.departmentId)?.name ?? emp.department)
                    : emp.department;
                  const isChangingStatus = inlineStatus?.id === emp.id;
                  // Display name
                  const displayName = emp.prenom
                    ? `${emp.prenom} ${emp.nom ?? ""}`.trim()
                    : emp.name ?? "—";

                  return (
                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-3">
                        <div className="font-mono text-xs text-gray-700 font-medium">{emp.matricule ?? "—"}</div>
                        {decoded && (
                          <div className="text-xs text-gray-400 mt-0.5">{decoded.year} · {decoded.deptCode} · #{decoded.seq}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-800">{displayName}</div>
                        {emp.email && <div className="text-xs text-gray-400 truncate max-w-[180px]">{emp.email}</div>}
                        {emp.phone && !emp.email && <div className="text-xs text-gray-400">{emp.phone}</div>}
                      </td>
                      <td className="px-3 py-3 text-gray-600 text-xs max-w-[140px]">{emp.position ?? "—"}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">
                        {deptName
                          ? <span className="bg-blue-50 text-blue-700 rounded px-2 py-0.5 whitespace-nowrap">{deptName}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className="text-xs">{emp.typeContrat ?? "CDI"}</Badge>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-right">
                        {emp.salary != null ? emp.salary.toLocaleString("fr-FR") + " Ar" : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3">{statutBadge(emp.statut ?? "actif")}</td>
                      <td className="px-3 py-3 text-center">
                        {emp.hasAccount
                          ? <span className="text-xs bg-emerald-50 text-emerald-700 rounded px-2 py-0.5 font-medium">Oui</span>
                          : <span className="text-xs text-gray-300">Non</span>}
                      </td>
                      <td className="px-3 py-3 min-w-[160px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => openEdit(emp)}
                            className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 border border-emerald-200 transition-colors"
                          >
                            ✏ Modifier
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
                              className="text-gray-500 hover:text-gray-700 text-xs px-2 py-1.5 rounded-lg hover:bg-gray-100 border border-gray-200 transition-colors"
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
        <Modal
          title={editing ? `Modifier — ${editing.prenom ?? ""} ${editing.nom ?? editing.name ?? ""}`.trim() : "Nouvel employé"}
          onClose={() => { setShowModal(false); setError(""); }}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }}
            className="space-y-4"
          >
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
            )}

            {/* Matricule display (edit only) */}
            {editing && (
              <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-3">
                <span className="text-xs text-gray-500">Matricule :</span>
                <span className="font-mono text-sm font-semibold text-gray-800">{editing.matricule ?? "Non attribué"}</span>
                {decodeMatricule(editing.matricule ?? "") && (() => {
                  const d = decodeMatricule(editing.matricule)!;
                  return <span className="text-xs text-gray-400">({d.year} · Dept {d.deptCode} · #{d.seq})</span>;
                })()}
              </div>
            )}

            {!editing && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
                Le matricule sera généré automatiquement selon le département sélectionné.
              </div>
            )}

            {/* Section : Identité */}
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Identité</p>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Prénom" required>
                  <input
                    type="text"
                    value={form.prenom}
                    onChange={set("prenom")}
                    placeholder="ex : Fandresena"
                    className={inputCls}
                  />
                </FieldRow>
                <FieldRow label="Nom" required>
                  <input
                    type="text"
                    value={form.nom}
                    onChange={set("nom")}
                    placeholder="ex : RAFANOMEZANTSOA"
                    className={inputCls}
                  />
                </FieldRow>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <FieldRow label="Sexe">
                  <select value={form.sexe} onChange={set("sexe")} className={inputCls}>
                    <option value="">— Non renseigné —</option>
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </select>
                </FieldRow>
                <FieldRow label="Date de naissance">
                  <input type="date" value={form.dateNaissance} onChange={set("dateNaissance")} className={inputCls} />
                </FieldRow>
              </div>
            </div>

            {/* Section : Contact */}
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Contact</p>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Email">
                  <input type="email" value={form.email} onChange={set("email")} placeholder="prenom.nom@flavoriest.com" className={inputCls} />
                </FieldRow>
                <FieldRow label="Téléphone">
                  <input type="text" value={form.phone} onChange={set("phone")} placeholder="034 XX XXX XX" className={inputCls} />
                </FieldRow>
              </div>
            </div>

            {/* Section : Poste */}
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Poste & Département</p>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Poste" required>
                  <input
                    type="text"
                    list="postes-list"
                    value={form.position}
                    onChange={set("position")}
                    placeholder="Saisir ou choisir…"
                    className={inputCls}
                  />
                </FieldRow>
                <FieldRow label="Département">
                  <select value={form.departmentId} onChange={set("departmentId")} className={inputCls}>
                    <option value="">— Non attribué —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </FieldRow>
              </div>

              {POSTE_HAS_ACCOUNT.has(form.position) && form.email && !editing && (
                <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-xs text-emerald-700">
                  ✓ Un compte utilisateur sera créé automatiquement pour ce poste.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mt-3">
                <FieldRow label="Type de contrat">
                  <select value={form.typeContrat} onChange={set("typeContrat")} className={inputCls}>
                    {CONTRATS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="Statut">
                  <select value={form.statut} onChange={set("statut")} className={inputCls}>
                    {STATUTS.map((s) => (
                      <option key={s} value={s}>
                        {s === "actif" ? "● Actif" : s === "suspendu" ? "● Suspendu" : "● Sorti"}
                      </option>
                    ))}
                  </select>
                </FieldRow>
              </div>
            </div>

            {/* Section : RH / Paie */}
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Rémunération & Affiliation</p>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Salaire de base (MGA)">
                  <input
                    type="number"
                    value={form.salary}
                    onChange={set("salary")}
                    placeholder="ex : 850 000"
                    min={0}
                    step={1000}
                    className={inputCls}
                  />
                </FieldRow>
                <FieldRow label="Date d'embauche">
                  <input type="date" value={form.hireDate} onChange={set("hireDate")} className={inputCls} />
                </FieldRow>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2 border-t">
              <button
                type="button"
                onClick={() => { setShowModal(false); setError(""); }}
                className="flex-1 px-4 py-2.5 border rounded-lg text-sm hover:bg-gray-50 font-medium"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saveMut.isPending}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {saveMut.isPending ? "Enregistrement…" : editing ? "Enregistrer les modifications" : "Créer l'employé"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
