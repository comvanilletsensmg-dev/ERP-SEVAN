import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Package, Wrench, Save, Loader2 } from "lucide-react";

const GOODS_CATEGORIES = [
  "Fournisseur vanille", "Fournisseur sachets sous-vide", "Fournisseur papier paraffiné",
  "Fournisseur cartons", "Fournisseur matériel bureau", "Fournisseur informatique",
  "Fournisseur immobilier", "Fournisseur matériel industriel", "Fournisseur consommables",
  "Fournisseur emballage",
];

const SERVICES_CATEGORIES = [
  "Fret aérien", "Transit / douane", "Papier export", "Location agrément export",
  "Coursier", "Transport", "Business developer freelance", "Commercial freelance",
  "Maintenance", "Nettoyage", "Sécurité", "Consultant", "Prestataire logistique",
];

const PAYMENT_METHODS = ["Espèces", "Mvola", "Orange Money", "Airtel Money", "Virement bancaire", "Chèque"];
const PAYMENT_TERMS = ["Comptant", "15", "30", "45", "Fin de mois", "50% avance"];

const REGIONS = [
  "SAVA", "Andapa", "Sambava", "Antalaha", "Vohemar",
  "Antananarivo", "Toamasina", "Fianarantsoa", "Mahajanga", "Toliara", "Antsiranana",
];

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none";
const selectCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white";

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const FORM_TABS = [
  { id: "general",   label: "Général" },
  { id: "contacts",  label: "Contacts" },
  { id: "fiscal",    label: "Fiscal" },
  { id: "payment",   label: "Règlement" },
  { id: "bank",      label: "Bancaire" },
  { id: "commercial", label: "Commercial" },
] as const;

type FormTab = typeof FORM_TABS[number]["id"];

// ─── Main form ────────────────────────────────────────────────────────────────
export default function SupplierForm({ id }: { id?: string }) {
  const [, navigate] = useLocation();
  const isEdit = !!id;
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<FormTab>("general");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: "", supplierType: "GOODS" as "GOODS" | "SERVICES", category: "",
    status: "active", region: "", email: "", phone: "", mobile: "",
    whatsapp: "", website: "", address: "", city: "", country: "Madagascar",
    nif: "", stat: "", rccm: "", isVatSubject: false,
    paymentMethod: "Virement bancaire", paymentTerms: "30",
    bankName: "", bankAccount: "", assignedEmployeeId: "",
  });

  // Load existing if editing
  const { data: existing } = useQuery({
    queryKey: ["supplier-detail", id],
    queryFn: () => fetch(`/api/suppliers/${id}`, { credentials: "include" }).then(r => r.json()),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing?.supplier) {
      const s = existing.supplier;
      setForm({
        name: s.name ?? "",
        supplierType: s.supplierType ?? "GOODS",
        category: s.category ?? "",
        status: s.status ?? "active",
        region: s.region ?? "",
        email: s.email ?? "",
        phone: s.phone ?? "",
        mobile: s.mobile ?? "",
        whatsapp: s.whatsapp ?? "",
        website: s.website ?? "",
        address: s.address ?? "",
        city: s.city ?? "",
        country: s.country ?? "Madagascar",
        nif: s.nif ?? "",
        stat: s.stat ?? "",
        rccm: s.rccm ?? "",
        isVatSubject: s.isVatSubject ?? false,
        paymentMethod: s.paymentMethod ?? "Virement bancaire",
        paymentTerms: s.paymentTerms ?? "30",
        bankName: s.bankName ?? "",
        bankAccount: s.bankAccount ?? "",
        assignedEmployeeId: s.assignedEmployeeId ?? "",
      });
    }
  }, [existing]);

  const { data: empData } = useQuery({
    queryKey: ["employees-list"],
    queryFn: () => fetch("/api/employees", { credentials: "include" }).then(r => r.json()),
  });
  const employees: any[] = empData?.employees ?? empData ?? [];

  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Le nom est requis";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/suppliers/${id}` : "/api/suppliers";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["suppliers-list"] });
      navigate(`/suppliers/${data.id ?? id}`);
    },
    onError: (err: any) => {
      setErrors({ form: String(err.message) });
    },
  });

  const handleSubmit = () => {
    if (!validate()) { setActiveTab("general"); return; }
    saveMutation.mutate();
  };

  const categories = form.supplierType === "GOODS" ? GOODS_CATEGORIES : SERVICES_CATEGORIES;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <button onClick={() => navigate(isEdit ? `/suppliers/${id}` : "/suppliers")}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-3">
            <ArrowLeft className="w-4 h-4"/>{isEdit ? "Retour à la fiche" : "Retour aux fournisseurs"}
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">
              {isEdit ? "Modifier le fournisseur" : "Nouveau fournisseur"}
            </h1>
            <button onClick={handleSubmit} disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
              {isEdit ? "Enregistrer" : "Créer le fournisseur"}
            </button>
          </div>
          {errors.form && <p className="text-red-500 text-sm mt-2">{errors.form}</p>}
        </div>

        {/* Form tabs */}
        <div className="max-w-4xl mx-auto px-6 overflow-x-auto">
          <div className="flex min-w-max border-b border-gray-100">
            {FORM_TABS.map(({ id: tid, label }) => (
              <button key={tid} onClick={() => setActiveTab(tid)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tid ? "border-emerald-500 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

        {/* ── GÉNÉRAL ── */}
        {activeTab === "general" && (
          <div className="space-y-5">
            {/* Type selector */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Type de fournisseur</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "GOODS", label: "Fournisseur de biens", sub: "Vanille, emballage, matériel, consommables", icon: Package, cls: "blue" },
                  { value: "SERVICES", label: "Fournisseur de services", sub: "Fret, transit, maintenance, logistique", icon: Wrench, cls: "purple" },
                ].map(({ value, label, sub, icon: Icon, cls }) => (
                  <button key={value} type="button" onClick={() => { set("supplierType", value); set("category", ""); }}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${form.supplierType === value ? `border-${cls}-500 bg-${cls}-50` : "border-gray-200 hover:border-gray-300 bg-white"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-5 h-5 ${form.supplierType === value ? `text-${cls}-600` : "text-gray-400"}`}/>
                      <span className={`font-semibold text-sm ${form.supplierType === value ? `text-${cls}-700` : "text-gray-700"}`}>{label}</span>
                    </div>
                    <p className="text-xs text-gray-400">{sub}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Informations générales</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Nom du fournisseur" required>
                  <input value={form.name} onChange={e => set("name", e.target.value)}
                    placeholder="Ex : Coopérative SAVA Vanille" className={inputCls}/>
                  {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
                </Field>
                <Field label="Statut">
                  <select value={form.status} onChange={e => set("status", e.target.value)} className={selectCls}>
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                    <option value="blocked">Bloqué</option>
                  </select>
                </Field>
                <Field label="Catégorie">
                  <select value={form.category} onChange={e => set("category", e.target.value)} className={selectCls}>
                    <option value="">— Sélectionner —</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Région principale">
                  <select value={form.region} onChange={e => set("region", e.target.value)} className={selectCls}>
                    <option value="">— Sélectionner —</option>
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ── CONTACTS ── */}
        {activeTab === "contacts" && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Contacts & Adresses</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Téléphone fixe">
                <input value={form.phone} onChange={e => set("phone", e.target.value)}
                  placeholder="034 xx xx xxx" className={inputCls}/>
              </Field>
              <Field label="Mobile">
                <input value={form.mobile} onChange={e => set("mobile", e.target.value)}
                  placeholder="032 xx xx xxx" className={inputCls}/>
              </Field>
              <Field label="WhatsApp">
                <input value={form.whatsapp} onChange={e => set("whatsapp", e.target.value)}
                  placeholder="+261 32 xx xx xxx" className={inputCls}/>
              </Field>
              <Field label="Email">
                <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
                  placeholder="contact@fournisseur.mg" className={inputCls}/>
              </Field>
              <Field label="Site web">
                <input value={form.website} onChange={e => set("website", e.target.value)}
                  placeholder="www.fournisseur.mg" className={inputCls}/>
              </Field>
              <Field label="Ville">
                <input value={form.city} onChange={e => set("city", e.target.value)}
                  placeholder="Ex : Sambava" className={inputCls}/>
              </Field>
              <div className="col-span-2">
                <Field label="Adresse complète">
                  <textarea value={form.address} onChange={e => set("address", e.target.value)}
                    rows={2} placeholder="Rue, quartier, commune…" className={inputCls + " resize-none"}/>
                </Field>
              </div>
              <Field label="Pays">
                <input value={form.country} onChange={e => set("country", e.target.value)} className={inputCls}/>
              </Field>
            </div>
          </div>
        )}

        {/* ── FISCAL ── */}
        {activeTab === "fiscal" && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Informations fiscales</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="NIF (Numéro d'Identification Fiscale)">
                <input value={form.nif} onChange={e => set("nif", e.target.value)}
                  placeholder="1234567890" className={inputCls}/>
              </Field>
              <Field label="STAT">
                <input value={form.stat} onChange={e => set("stat", e.target.value)}
                  placeholder="123456789012345" className={inputCls}/>
              </Field>
              <Field label="RCCM">
                <input value={form.rccm} onChange={e => set("rccm", e.target.value)}
                  placeholder="2025A01234" className={inputCls}/>
              </Field>
              <Field label="Assujetti TVA">
                <div className="flex items-center gap-3 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.isVatSubject}
                      onChange={e => set("isVatSubject", e.target.checked)}
                      className="w-4 h-4 accent-emerald-600 rounded"/>
                    <span className="text-sm text-gray-700">Oui, assujetti à la TVA (20%)</span>
                  </label>
                </div>
              </Field>
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
              <strong>NIF :</strong> Identifiant fiscal malagasy · <strong>STAT :</strong> Numéro statistique national · <strong>RCCM :</strong> Registre du commerce
            </div>
          </div>
        )}

        {/* ── RÈGLEMENT ── */}
        {activeTab === "payment" && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Modes de règlement</h3>
            <div className="space-y-4">
              <Field label="Mode de paiement">
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m} type="button" onClick={() => set("paymentMethod", m)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${form.paymentMethod === m ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Conditions de paiement">
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {PAYMENT_TERMS.map(t => (
                    <button key={t} type="button" onClick={() => set("paymentTerms", t)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${form.paymentTerms === t ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                      {t === "Comptant" || t === "Fin de mois" || t === "50% avance" ? t : `${t} jours`}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </div>
        )}

        {/* ── BANCAIRE ── */}
        {activeTab === "bank" && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Informations bancaires</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Banque">
                <select value={form.bankName} onChange={e => set("bankName", e.target.value)} className={selectCls}>
                  <option value="">— Sélectionner —</option>
                  {["BNI Madagascar", "BOA Madagascar", "BFV-SG", "BMOI", "MCB Madagascar", "Autre"].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </Field>
              <Field label="Numéro de compte">
                <input value={form.bankAccount} onChange={e => set("bankAccount", e.target.value)}
                  placeholder="00000-00000-00000000000-00" className={inputCls}/>
              </Field>
            </div>
          </div>
        )}

        {/* ── COMMERCIAL ── */}
        {activeTab === "commercial" && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Commercial / Responsable assigné</h3>
            <Field label="Employé responsable">
              <select value={form.assignedEmployeeId} onChange={e => set("assignedEmployeeId", e.target.value)} className={selectCls}>
                <option value="">— Aucun —</option>
                {employees.map((e: any) => (
                  <option key={e.id} value={e.id}>{e.name} — {e.position}</option>
                ))}
              </select>
            </Field>
            {form.assignedEmployeeId && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-xs text-emerald-700">
                Le responsable assigné sera notifié des relances et pourra suivre les interactions avec ce fournisseur.
              </div>
            )}
          </div>
        )}

        {/* Save footer */}
        <div className="flex gap-3 justify-end pt-2">
          <button onClick={() => navigate(isEdit ? `/suppliers/${id}` : "/suppliers")}
            className="px-5 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={handleSubmit} disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            {isEdit ? "Enregistrer les modifications" : "Créer le fournisseur"}
          </button>
        </div>
      </div>
    </div>
  );
}
