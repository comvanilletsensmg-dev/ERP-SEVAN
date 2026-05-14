import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { COUNTRY_LIST } from "../../lib/country-fiscal";
import { useTaxValidation } from "../../hooks/useTaxValidation";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClientContact {
  id: string; firstName: string; lastName: string; role?: string;
  email?: string; phone?: string; mobile?: string; isPrimary: boolean; isActive: boolean;
}

interface CrmClient {
  id: string; name: string; altName?: string; type: string; clientCode?: string;
  address?: string; postalCode?: string; city?: string; country: string; region?: string;
  phone?: string; mobile?: string; fax?: string; website?: string; email?: string;
  refuseMassEmail: boolean;
  proId1?: string; proId2?: string; vatRegistered: boolean; vatNumber?: string;
  source: string; convertedFromId?: string;
  tags: string; internalNotes?: string; activityType?: string;
  riskLevel: string; creditLimit?: number; paymentTerms: number;
  currency: string; preferredIncoterm?: string;
  totalOrders: number; totalRevenue: number; averageOrderValue: number;
  isActive: boolean; assignedTo?: string;
  createdAt: string; updatedAt: string;
  contacts?: ClientContact[];
}

interface FormContact { firstName: string; lastName: string; role: string; email: string; phone: string; mobile: string; isPrimary: boolean; }

interface FormState {
  name: string; altName: string; type: string;
  address: string; postalCode: string; city: string; country: string; region: string;
  phone: string; mobile: string; fax: string; website: string; email: string; refuseMassEmail: boolean;
  proId1: string; proId2: string; vatRegistered: boolean; vatNumber: string;
  source: string; activityType: string;
  tags: string[]; internalNotes: string;
  riskLevel: string; creditLimit: string; paymentTerms: string;
  currency: string; preferredIncoterm: string;
  assignedTo: string;
  contacts: FormContact[];
}

const BLANK: FormState = {
  name: "", altName: "", type: "Entreprise",
  address: "", postalCode: "", city: "", country: "FR", region: "",
  phone: "", mobile: "", fax: "", website: "", email: "", refuseMassEmail: false,
  proId1: "", proId2: "", vatRegistered: false, vatNumber: "",
  source: "other", activityType: "",
  tags: [], internalNotes: "",
  riskLevel: "medium", creditLimit: "", paymentTerms: "30",
  currency: "USD", preferredIncoterm: "",
  assignedTo: "",
  contacts: [{ firstName: "", lastName: "", role: "", email: "", phone: "", mobile: "", isPrimary: true }],
};

// ─── Styles & helpers ─────────────────────────────────────────────────────────
const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3c2a]/30";
const selectCls = inputCls + " cursor-pointer";

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  low:     { label: "Faible",  color: "#15803d", bg: "#dcfce7", dot: "🟢" },
  medium:  { label: "Moyen",   color: "#b45309", bg: "#fef3c7", dot: "🟡" },
  high:    { label: "Élevé",   color: "#b91c1c", bg: "#fee2e2", dot: "🔴" },
  blocked: { label: "Bloqué",  color: "#7c3aed", bg: "#ede9fe", dot: "⛔" },
};

const SOURCE_LABELS: Record<string, string> = {
  converted_prospect: "Converti Prospect", kompass: "Kompass", salon: "Salon",
  referral: "Parrainage", web: "Site web", import_excel: "Import Excel", other: "Autre",
};

const ACTIVITY_LABELS: Record<string, string> = {
  importateur: "Importateur", distributeur: "Distributeur", transformateur: "Transformateur",
  industriel: "Industriel", artisan: "Artisan", autre: "Autre",
};

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse((raw as string) || "[]"); return Array.isArray(p) ? p : []; } catch { return []; }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function FiscalInput({ label, value, placeholder, help, error, onChange, onBlur }: {
  label: string; value: string; placeholder?: string | null; help?: string | null;
  error?: string | null; onChange: (v: string) => void; onBlur?: () => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur}
        placeholder={placeholder ?? ""} className={`${inputCls} ${error ? "border-red-400 focus:ring-red-300" : ""}`} />
      {error && <p className="text-xs text-red-600">⚠ {error}</p>}
      {!error && help && <p className="text-xs text-gray-400">{help}</p>}
    </div>
  );
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, credentials: "include" });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? `Erreur ${r.status}`); }
  return r.json();
}

// ─── Wizard Steps ─────────────────────────────────────────────────────────────
function Step1({ form, upd }: { form: FormState; upd: (k: keyof FormState, v: any) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-[#1a3c2a] border-b border-amber-200 pb-2">Étape 1 — Identité entreprise</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Entreprise *">
          <input value={form.name} onChange={e => upd("name", e.target.value)} className={inputCls} placeholder="Vanilla Impex Kft." />
        </Field>
        <Field label="Nom alternatif">
          <input value={form.altName} onChange={e => upd("altName", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Type *">
          <select value={form.type} onChange={e => upd("type", e.target.value)} className={selectCls}>
            {["Entreprise", "Particulier", "Association", "Administration"].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Adresse">
          <input value={form.address} onChange={e => upd("address", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Code postal">
          <input value={form.postalCode} onChange={e => upd("postalCode", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Ville *">
          <input value={form.city} onChange={e => upd("city", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Pays *">
          <select value={form.country} onChange={e => upd("country", e.target.value)} className={selectCls}>
            {COUNTRY_LIST.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Région / Département">
          <input value={form.region} onChange={e => upd("region", e.target.value)} className={inputCls} />
        </Field>
      </div>
    </div>
  );
}

function Step2({ form, upd }: { form: FormState; upd: (k: keyof FormState, v: any) => void }) {
  const countryName = COUNTRY_LIST.find(c => c.code === form.country)?.name ?? form.country;
  const { labels, errors, showVat, validateField, formatField } = useTaxValidation(form.country);

  const handleBlur = (field: "proId1" | "proId2" | "vat") => {
    validateField(field, field === "vat" ? form.vatNumber : form[field]);
    const formatted = formatField(field, field === "vat" ? form.vatNumber : form[field]);
    if (field === "vat") upd("vatNumber", formatted);
    else upd(field, formatted);
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-[#1a3c2a] border-b border-amber-200 pb-2">Étape 2 — Contact & identifiants fiscaux</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Téléphone"><input value={form.phone} onChange={e => upd("phone", e.target.value)} className={inputCls} placeholder="+33 1 23 45 67 89" /></Field>
        <Field label="Tél. portable"><input value={form.mobile} onChange={e => upd("mobile", e.target.value)} className={inputCls} /></Field>
        <Field label="Fax"><input value={form.fax} onChange={e => upd("fax", e.target.value)} className={inputCls} /></Field>
        <Field label="Site web"><input value={form.website} onChange={e => upd("website", e.target.value)} className={inputCls} placeholder="https://" /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={e => upd("email", e.target.value)} className={inputCls} /></Field>
        <div className="flex items-center gap-3 pt-5">
          <input type="checkbox" id="refuse_email_c" checked={form.refuseMassEmail} onChange={e => upd("refuseMassEmail", e.target.checked)} className="w-4 h-4 accent-[#1a3c2a]" />
          <label htmlFor="refuse_email_c" className="text-sm text-gray-700">Refuser emails de masse</label>
        </div>
      </div>

      <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
        <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-3">🏢 Identifiants fiscaux — {countryName}</h4>
        <div className="grid grid-cols-2 gap-4">
          <FiscalInput label={labels.proId1} value={form.proId1} placeholder={labels.proId1Placeholder}
            help={labels.proId1Help} error={errors.proId1}
            onChange={v => upd("proId1", v)} onBlur={() => handleBlur("proId1")} />
          {labels.proId2 && (
            <FiscalInput label={labels.proId2} value={form.proId2} placeholder={labels.proId2Placeholder}
              help={labels.proId2Help} error={errors.proId2}
              onChange={v => upd("proId2", v)} onBlur={() => handleBlur("proId2")} />
          )}
          {showVat && (
            <>
              <div className="flex items-center gap-3 col-span-1">
                <input type="checkbox" id="vatReg_c" checked={form.vatRegistered} onChange={e => upd("vatRegistered", e.target.checked)} className="w-4 h-4 accent-[#1a3c2a]" />
                <label htmlFor="vatReg_c" className="text-sm text-gray-700">Assujetti TVA</label>
              </div>
              {form.vatRegistered && (
                <FiscalInput label={labels.vatLabel ?? "Numéro de TVA"} value={form.vatNumber}
                  placeholder={labels.vatPlaceholder} help={labels.vatHelp} error={errors.vat}
                  onChange={v => upd("vatNumber", v)} onBlur={() => handleBlur("vat")} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Step3({ form, upd }: { form: FormState; upd: (k: keyof FormState, v: any) => void }) {
  const addContact = () => upd("contacts", [...form.contacts, { firstName: "", lastName: "", role: "", email: "", phone: "", mobile: "", isPrimary: false }]);
  const updContact = (i: number, field: keyof FormContact, val: any) => {
    const contacts = [...form.contacts];
    contacts[i] = { ...contacts[i], [field]: val };
    upd("contacts", contacts);
  };
  const removeContact = (i: number) => upd("contacts", form.contacts.filter((_, idx) => idx !== i));

  const TAG_OPTIONS = ["Vanille", "Importateur", "Distributeur", "B2B", "B2C", "Biologico", "UE", "Hors UE"];

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-[#1a3c2a] border-b border-amber-200 pb-2">Étape 3 — Commercial & contacts</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type d'activité">
          <select value={form.activityType} onChange={e => upd("activityType", e.target.value)} className={selectCls}>
            <option value="">— Sélectionner —</option>
            {Object.entries(ACTIVITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Source">
          <select value={form.source} onChange={e => upd("source", e.target.value)} className={selectCls}>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Niveau de risque">
          <select value={form.riskLevel} onChange={e => upd("riskLevel", e.target.value)} className={selectCls}>
            {Object.entries(RISK_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.dot} {v.label}</option>)}
          </select>
        </Field>
        <Field label="Limite de crédit (devise)">
          <input type="number" min="0" value={form.creditLimit} onChange={e => upd("creditLimit", e.target.value)} className={inputCls} placeholder="50000" />
        </Field>
        <Field label="Délai de paiement (jours)">
          <input type="number" min="0" value={form.paymentTerms} onChange={e => upd("paymentTerms", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Devise">
          <select value={form.currency} onChange={e => upd("currency", e.target.value)} className={selectCls}>
            {["USD", "EUR", "GBP", "CHF", "JPY", "CAD", "AUD"].map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Incoterm préféré">
          <select value={form.preferredIncoterm} onChange={e => upd("preferredIncoterm", e.target.value)} className={selectCls}>
            <option value="">— Non défini —</option>
            {["FOB", "CIF", "EXW", "DDP", "DAP", "FCA"].map(i => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Assigné à (commercial)">
          <input value={form.assignedTo} onChange={e => upd("assignedTo", e.target.value)} className={inputCls} placeholder="jean.martin@..." />
        </Field>
      </div>

      {/* Tags */}
      <div>
        <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">Tags</p>
        <div className="flex flex-wrap gap-2">
          {TAG_OPTIONS.map(t => (
            <button key={t} type="button" onClick={() => {
              const has = form.tags.includes(t);
              upd("tags", has ? form.tags.filter(x => x !== t) : [...form.tags, t]);
            }} className={`px-3 py-1 rounded-full text-xs border transition-colors ${form.tags.includes(t) ? "bg-[#1a3c2a] text-white border-[#1a3c2a]" : "bg-white text-gray-600 border-gray-300 hover:border-[#1a3c2a]"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Contacts */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wide">👤 Contacts client</h4>
          <button type="button" onClick={addContact} className="text-xs text-blue-700 hover:text-blue-900 font-medium">+ Ajouter</button>
        </div>
        <div className="space-y-4">
          {form.contacts.map((c, i) => (
            <div key={i} className="bg-white rounded-lg p-3 border border-blue-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">{c.isPrimary ? "⭐ Contact principal" : `Contact ${i + 1}`}</span>
                {!c.isPrimary && <button type="button" onClick={() => removeContact(i)} className="text-red-400 hover:text-red-600 text-xs">✕ Retirer</button>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input value={c.firstName} onChange={e => updContact(i, "firstName", e.target.value)} className={inputCls} placeholder="Prénom *" />
                <input value={c.lastName} onChange={e => updContact(i, "lastName", e.target.value)} className={inputCls} placeholder="Nom *" />
                <select value={c.role} onChange={e => updContact(i, "role", e.target.value)} className={selectCls}>
                  <option value="">— Rôle —</option>
                  {["Directeur commercial", "Acheteur", "PDG", "Comptable", "Logistique", "Autre"].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input type="email" value={c.email} onChange={e => updContact(i, "email", e.target.value)} className={inputCls} placeholder="Email" />
                <input value={c.phone} onChange={e => updContact(i, "phone", e.target.value)} className={inputCls} placeholder="Téléphone" />
                <input value={c.mobile} onChange={e => updContact(i, "mobile", e.target.value)} className={inputCls} placeholder="Mobile" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Field label="Notes internes">
        <textarea rows={3} value={form.internalNotes} onChange={e => upd("internalNotes", e.target.value)}
          className={inputCls} placeholder="Notes commerciales, contexte, historique..." />
      </Field>
    </div>
  );
}

// ─── Wizard Modal ─────────────────────────────────────────────────────────────
function ClientModal({ initial, onClose }: { initial?: CrmClient | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(() => {
    if (!initial) return BLANK;
    return {
      name: initial.name, altName: initial.altName ?? "", type: initial.type,
      address: initial.address ?? "", postalCode: initial.postalCode ?? "",
      city: initial.city ?? "", country: initial.country, region: initial.region ?? "",
      phone: initial.phone ?? "", mobile: initial.mobile ?? "",
      fax: initial.fax ?? "", website: initial.website ?? "",
      email: initial.email ?? "", refuseMassEmail: initial.refuseMassEmail,
      proId1: initial.proId1 ?? "", proId2: initial.proId2 ?? "",
      vatRegistered: initial.vatRegistered, vatNumber: initial.vatNumber ?? "",
      source: initial.source, activityType: initial.activityType ?? "",
      tags: parseTags(initial.tags), internalNotes: initial.internalNotes ?? "",
      riskLevel: initial.riskLevel, creditLimit: initial.creditLimit?.toString() ?? "",
      paymentTerms: initial.paymentTerms?.toString() ?? "30",
      currency: initial.currency, preferredIncoterm: initial.preferredIncoterm ?? "",
      assignedTo: initial.assignedTo ?? "",
      contacts: initial.contacts?.filter(c => c.isActive).map(c => ({
        firstName: c.firstName, lastName: c.lastName, role: c.role ?? "",
        email: c.email ?? "", phone: c.phone ?? "", mobile: c.mobile ?? "", isPrimary: c.isPrimary,
      })) ?? [{ firstName: "", lastName: "", role: "", email: "", phone: "", mobile: "", isPrimary: true }],
    };
  });
  const [error, setError] = useState("");

  const upd = (k: keyof FormState, v: any) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async (data: FormState) => {
      const body = {
        ...data,
        creditLimit: data.creditLimit ? Number(data.creditLimit) : null,
        paymentTerms: Number(data.paymentTerms),
        primaryContact: data.contacts[0]?.firstName ? data.contacts[0] : undefined,
      };
      if (initial?.id) {
        return apiFetch(`/api/crm/clients/${initial.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      return apiFetch("/api/crm/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-clients"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const canNext = step === 1 ? !!form.name && !!form.country && !!form.city : true;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-[#f5f0e8] rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#f5f0e8] px-6 pt-6 pb-3 border-b border-amber-200 z-10">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-[#1a3c2a]">{initial ? "Modifier le client" : "Nouveau client"}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-4">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= s ? "bg-[#1a3c2a] text-white" : "bg-gray-200 text-gray-500"}`}>{s}</div>
                {s < 3 && <div className={`h-0.5 w-12 transition-colors ${step > s ? "bg-[#1a3c2a]" : "bg-gray-200"}`} />}
              </div>
            ))}
            <span className="ml-3 text-sm text-gray-500">{step === 1 ? "Identité" : step === 2 ? "Contact & Fiscal" : "Commercial & Contacts"}</span>
          </div>
        </div>

        <div className="p-6">
          {step === 1 && <Step1 form={form} upd={upd} />}
          {step === 2 && <Step2 form={form} upd={upd} />}
          {step === 3 && <Step3 form={form} upd={upd} />}

          {error && <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">⚠ {error}</div>}

          <div className="flex gap-3 mt-6">
            {step > 1 && <button onClick={() => setStep(s => s - 1)} className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50">← Précédent</button>}
            {step < 3 && (
              <button onClick={() => setStep(s => s + 1)} disabled={!canNext}
                className="flex-1 bg-[#1a3c2a] text-white py-2.5 rounded-lg text-sm disabled:opacity-50 hover:bg-[#2d5a3f]">
                Continuer →
              </button>
            )}
            {step === 3 && (
              <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}
                className="flex-1 bg-[#1a3c2a] text-white py-2.5 rounded-lg text-sm disabled:opacity-50 hover:bg-[#2d5a3f]">
                {mutation.isPending ? "Enregistrement..." : initial ? "Enregistrer" : "Créer le client"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CrmClients() {
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState<CrmClient | null>(null);
  const [search, setSearch] = useState("");
  const [filterRisk, setFilterRisk] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterActive, setFilterActive] = useState<"" | "true" | "false">("");

  const { data: clients = [], isLoading, error } = useQuery<CrmClient[]>({
    queryKey: ["crm-clients"],
    queryFn: () => apiFetch("/api/crm/clients"),
  });

  const filtered = clients.filter(c => {
    const s = search.toLowerCase();
    const matchSearch = !s || c.name.toLowerCase().includes(s) || (c.clientCode ?? "").toLowerCase().includes(s) || (c.city ?? "").toLowerCase().includes(s) || (c.email ?? "").toLowerCase().includes(s);
    const matchRisk = !filterRisk || c.riskLevel === filterRisk;
    const matchCountry = !filterCountry || c.country === filterCountry;
    const matchActive = filterActive === "" ? true : filterActive === "true" ? c.isActive : !c.isActive;
    return matchSearch && matchRisk && matchCountry && matchActive;
  });

  const countries = [...new Set(clients.map(c => c.country))].sort();
  const totalRevenue = filtered.reduce((s, c) => s + (c.totalRevenue ?? 0), 0);
  const activeCount = filtered.filter(c => c.isActive).length;

  return (
    <div className="min-h-screen bg-[#faf6ef]">
      {/* Header */}
      <div className="bg-white border-b border-amber-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1a3c2a]">Clients CRM</h1>
            <p className="text-sm text-gray-500 mt-0.5">{clients.length} clients · {activeCount} actifs</p>
          </div>
          <button onClick={() => { setEditClient(null); setShowModal(true); }}
            className="bg-[#1a3c2a] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2d5a3f] transition-colors flex items-center gap-2">
            + Nouveau client
          </button>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 mt-4 flex-wrap">
          {[
            { label: "Total clients", value: clients.length.toString() },
            { label: "CA cumulé", value: `${totalRevenue.toLocaleString("fr-FR")} USD` },
            { label: "Risque élevé", value: clients.filter(c => c.riskLevel === "high" || c.riskLevel === "blocked").length.toString(), warn: true },
            { label: "Convertis", value: clients.filter(c => c.source === "converted_prospect").length.toString() },
          ].map(s => (
            <div key={s.label} className={`bg-white rounded-lg border px-4 py-2 text-center min-w-[110px] ${s.warn ? "border-red-100" : "border-amber-100"}`}>
              <p className={`text-lg font-bold ${s.warn ? "text-red-600" : "text-[#1a3c2a]"}`}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 bg-white border-b border-amber-100 flex gap-3 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#1a3c2a]/30"
          placeholder="🔍 Nom, code, ville, email..." />
        <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
          <option value="">Tous les risques</option>
          {Object.entries(RISK_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.dot} {v.label}</option>)}
        </select>
        <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
          <option value="">Tous pays</option>
          {countries.map(c => <option key={c} value={c}>{COUNTRY_LIST.find(l => l.code === c)?.name ?? c}</option>)}
        </select>
        <select value={filterActive} onChange={e => setFilterActive(e.target.value as any)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
          <option value="">Actifs + Inactifs</option>
          <option value="true">Actifs uniquement</option>
          <option value="false">Inactifs uniquement</option>
        </select>
        {(search || filterRisk || filterCountry || filterActive) && (
          <button onClick={() => { setSearch(""); setFilterRisk(""); setFilterCountry(""); setFilterActive(""); }}
            className="text-xs text-gray-400 hover:text-gray-600">✕ Réinitialiser</button>
        )}
        <span className="ml-auto text-xs text-gray-400">{filtered.length} résultat(s)</span>
      </div>

      {/* Table */}
      <div className="p-6">
        {isLoading && <div className="text-center py-20 text-gray-400">Chargement...</div>}
        {error && <div className="text-center py-20 text-red-500">Erreur : {(error as Error).message}</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">🏢</p>
            <p className="text-gray-500 font-medium">Aucun client trouvé</p>
            <p className="text-sm text-gray-400 mt-1">Créez votre premier client ou convertissez un prospect qualifié</p>
          </div>
        )}
        {filtered.length > 0 && (
          <div className="bg-white rounded-xl border border-amber-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 border-b border-amber-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Pays</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Risque</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">CA total</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Commandes</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(c => {
                  const risk = RISK_CONFIG[c.riskLevel] ?? RISK_CONFIG.medium;
                  const countryName = COUNTRY_LIST.find(l => l.code === c.country)?.name ?? c.country;
                  const tags = parseTags(c.tags);
                  return (
                    <tr key={c.id} className="hover:bg-amber-50/50 transition-colors group">
                      <td className="px-4 py-3">
                        <Link href={`/crm/clients/${c.id}`}>
                          <div className="cursor-pointer">
                            <p className="font-semibold text-[#1a3c2a] hover:underline">{c.name}</p>
                            {c.altName && <p className="text-xs text-gray-400">{c.altName}</p>}
                            {tags.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {tags.slice(0, 3).map(t => <span key={t} className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">{t}</span>)}
                              </div>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.clientCode ?? "—"}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm">{countryName}</p>
                        {c.city && <p className="text-xs text-gray-400">{c.city}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ color: risk.color, backgroundColor: risk.bg }}>
                          {risk.dot} {risk.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {c.totalRevenue > 0 ? `${c.totalRevenue.toLocaleString("fr-FR")} ${c.currency}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{c.totalOrders > 0 ? c.totalOrders : "—"}</td>
                      <td className="px-4 py-3">
                        {c.isActive
                          ? <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">✓ Actif</span>
                          : <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-full">Inactif</span>
                        }
                        {c.source === "converted_prospect" && (
                          <span className="ml-1 text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">Converti</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/crm/clients/${c.id}`}>
                            <button className="text-xs px-2 py-1 bg-[#1a3c2a] text-white rounded hover:bg-[#2d5a3f]">Fiche</button>
                          </Link>
                          <button onClick={() => { setEditClient(c); setShowModal(true); }}
                            className="text-xs px-2 py-1 border border-gray-300 text-gray-600 rounded hover:bg-gray-50">Modifier</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && <ClientModal initial={editClient} onClose={() => { setShowModal(false); setEditClient(null); }} />}
    </div>
  );
}
