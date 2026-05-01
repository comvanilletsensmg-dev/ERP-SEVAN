import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { COUNTRY_LIST, getCountryFiscal } from "../../lib/country-fiscal";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Prospect {
  id: string;
  company: string; altName?: string; type: string; clientCode?: string;
  address?: string; postalCode?: string; city?: string; country: string; region?: string;
  contact?: string; phone?: string; mobile?: string; fax?: string;
  website?: string; email?: string; refuseMassEmail: boolean;
  proId1?: string; proId2?: string; vatRegistered: boolean; vatNumber?: string;
  tags: string; internalNotes?: string; notes?: string;
  source: string; status: string; score: number; assignedTo?: string;
  activityType?: string; estimatedVolume?: number; currentSupplier?: string;
  productsSought: string; decisionTimeline?: string; budgetRange?: string;
  preferredCurrency?: string; preferredIncoterm?: string; paymentTerms?: string;
  certifications: string;
  createdAt: string; updatedAt: string; lastInteraction?: string;
  convertedToClientId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_COLUMNS = [
  { key: "new",        label: "Nouveaux",    color: "#6366f1", bg: "#eef2ff" },
  { key: "to_contact", label: "À contacter", color: "#f59e0b", bg: "#fffbeb" },
  { key: "contacted",  label: "Contactés",   color: "#0ea5e9", bg: "#f0f9ff" },
  { key: "qualified",  label: "Qualifiés",   color: "#10b981", bg: "#ecfdf5" },
  { key: "lost",       label: "Perdus",      color: "#ef4444", bg: "#fef2f2" },
];
const NEXT_STATUS: Record<string, string> = {
  new: "to_contact", to_contact: "contacted", contacted: "qualified",
};
const SOURCE_LABELS: Record<string, string> = {
  manuel: "Manuel", kompass: "Kompass", salon_sial: "Salon SIAL",
  salon_vivaness: "Salon Vivaness", salon: "Salon", referral: "Référence",
  site_web: "Site web", web: "Site web", linkedin: "LinkedIn",
  email_entrant: "Email entrant", import_excel: "Import Excel",
};
const ACTIVITY_LABELS: Record<string, string> = {
  importateur: "Importateur", distributeur: "Distributeur", transformateur: "Transformateur",
  industriel: "Industriel", artisan: "Artisan", autre: "Autre",
};
const PRODUCTS = [
  { key: "vanille_gourmet", label: "Gousses gourmet" }, { key: "vanille_tk", label: "Gousses TK" },
  { key: "extraits", label: "Extraits" }, { key: "poudre", label: "Poudre" },
  { key: "caviar", label: "Caviar" }, { key: "oleoresine", label: "Oléorésine" },
];
const CERTS = [
  { key: "bio", label: "Bio / Organic" }, { key: "fairtrade", label: "Fairtrade" },
  { key: "fda", label: "FDA" }, { key: "haccp", label: "HACCP" },
  { key: "ifs", label: "IFS" }, { key: "brc", label: "BRC" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseTags = (s: string) => { try { return JSON.parse(s || "[]"); } catch { return []; } };
const scoreIcon = (s: number) => s >= 80 ? "🔥" : s >= 60 ? "🌡️" : "❄️";
const scoreColor = (s: number) => s >= 80 ? "text-red-600" : s >= 60 ? "text-amber-600" : "text-sky-500";

// ─── Form State ───────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  company: "", altName: "", type: "Entreprise", clientCode: "",
  address: "", postalCode: "", city: "", country: "FR", region: "",
  contact: "", phone: "", mobile: "", fax: "", website: "", email: "",
  refuseMassEmail: false, proId1: "", proId2: "", vatRegistered: false, vatNumber: "",
  tags: [] as string[], internalNotes: "",
  activityType: "", estimatedVolume: "", currentSupplier: "",
  productsSought: [] as string[], decisionTimeline: "", budgetRange: "",
  preferredCurrency: "USD", preferredIncoterm: "", paymentTerms: "",
  certifications: [] as string[], source: "manuel", status: "new",
};
type FormState = typeof EMPTY_FORM;

// ─── Input helpers ────────────────────────────────────────────────────────────
const inputCls = "w-full border border-amber-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white";
const selectCls = inputCls;
const labelCls = "block text-xs font-medium text-gray-600 mb-1";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={labelCls}>{label}</label>{children}</div>;
}

// ─── Tag Input ────────────────────────────────────────────────────────────────
function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2 min-h-[24px]">
        {value.map(t => (
          <span key={t} className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full">
            {t}<button type="button" onClick={() => onChange(value.filter(x => x !== t))} className="hover:text-red-600 ml-0.5">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="+ Ajouter un tag…" className={inputCls} />
        <button type="button" onClick={add} className="px-3 py-2 bg-amber-100 text-amber-800 rounded text-sm hover:bg-amber-200">+</button>
      </div>
    </div>
  );
}

// ─── CheckList ────────────────────────────────────────────────────────────────
function CheckList({ label, options, value, onChange }: { label: string; options: {key:string;label:string}[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter(x => x !== k) : [...value, k]);
  return (
    <div>
      <p className={labelCls}>{label}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map(o => (
          <label key={o.key} className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={value.includes(o.key)} onChange={() => toggle(o.key)} className="w-3.5 h-3.5 accent-[#1a3c2a]" />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────
function Step1({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const f = (k: keyof FormState, v: any) => setForm({ ...form, [k]: v });
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-[#1a3c2a] border-b border-amber-200 pb-2">Étape 1 — Identité entreprise</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Entreprise *">
          <input value={form.company} onChange={e => f("company", e.target.value)} required className={inputCls} placeholder="Vanilla Impex Kft." />
        </Field>
        <Field label="Nom alternatif">
          <input value={form.altName} onChange={e => f("altName", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Type *">
          <select value={form.type} onChange={e => f("type", e.target.value)} className={selectCls}>
            {["Entreprise","Particulier","Association","Administration"].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Source">
          <select value={form.source} onChange={e => f("source", e.target.value)} className={selectCls}>
            {Object.entries(SOURCE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <div className="col-span-2">
          <Field label="Adresse">
            <input value={form.address} onChange={e => f("address", e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Code postal">
          <input value={form.postalCode} onChange={e => f("postalCode", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Ville *">
          <input value={form.city} onChange={e => f("city", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Pays *">
          <select value={form.country} onChange={e => f("country", e.target.value)} className={selectCls}>
            {COUNTRY_LIST.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Région / Département">
          <input value={form.region} onChange={e => f("region", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Contact principal">
          <input value={form.contact} onChange={e => f("contact", e.target.value)} className={inputCls} placeholder="Prénom Nom" />
        </Field>
      </div>
    </div>
  );
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────
function Step2({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const f = (k: keyof FormState, v: any) => setForm({ ...form, [k]: v });
  const fiscal = getCountryFiscal(form.country);
  const countryName = COUNTRY_LIST.find(c => c.code === form.country)?.name ?? form.country;
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-[#1a3c2a] border-b border-amber-200 pb-2">Étape 2 — Contact & identifiants fiscaux</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Téléphone">
          <input value={form.phone} onChange={e => f("phone", e.target.value)} className={inputCls} placeholder="+33 1 23 45 67 89" />
        </Field>
        <Field label="Tél. portable">
          <input value={form.mobile} onChange={e => f("mobile", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Fax">
          <input value={form.fax} onChange={e => f("fax", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Site web">
          <input value={form.website} onChange={e => f("website", e.target.value)} className={inputCls} placeholder="https://" />
        </Field>
        <Field label="Email">
          <input type="email" value={form.email} onChange={e => f("email", e.target.value)} className={inputCls} />
        </Field>
        <div className="flex items-center gap-3 pt-5">
          <input type="checkbox" id="refusemail" checked={form.refuseMassEmail} onChange={e => f("refuseMassEmail", e.target.checked)} className="w-4 h-4 accent-[#1a3c2a]" />
          <label htmlFor="refusemail" className="text-sm text-gray-700">Refuser emails de masse</label>
        </div>
      </div>

      <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
        <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-3">🏢 Identifiants fiscaux — {countryName}</h4>
        <div className="grid grid-cols-2 gap-4">
          <Field label={fiscal.proId1Label}>
            <input value={form.proId1} onChange={e => f("proId1", e.target.value)} className={inputCls} />
          </Field>
          {fiscal.proId2Label && (
            <Field label={fiscal.proId2Label}>
              <input value={form.proId2} onChange={e => f("proId2", e.target.value)} className={inputCls} />
            </Field>
          )}
          {fiscal.showVat && (
            <>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="vatReg" checked={form.vatRegistered} onChange={e => f("vatRegistered", e.target.checked)} className="w-4 h-4 accent-[#1a3c2a]" />
                <label htmlFor="vatReg" className="text-sm text-gray-700">{fiscal.vatRegisteredLabel ?? "Assujetti TVA"}</label>
              </div>
              {form.vatRegistered && (
                <Field label={fiscal.vatLabel ?? "Numéro de TVA"}>
                  <input value={form.vatNumber} onChange={e => f("vatNumber", e.target.value)} className={inputCls} />
                </Field>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 3 ───────────────────────────────────────────────────────────────────
function Step3({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const f = (k: keyof FormState, v: any) => setForm({ ...form, [k]: v });
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-[#1a3c2a] border-b border-amber-200 pb-2">Étape 3 — Qualification commerciale</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type d'activité">
          <select value={form.activityType} onChange={e => f("activityType", e.target.value)} className={selectCls}>
            <option value="">— Sélectionner —</option>
            {Object.entries(ACTIVITY_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Volume estimé (t/an)">
          <input type="number" step="0.1" min="0" value={form.estimatedVolume} onChange={e => f("estimatedVolume", e.target.value)} className={inputCls} placeholder="ex: 2.5" />
        </Field>
        <Field label="Fournisseur actuel">
          <input value={form.currentSupplier} onChange={e => f("currentSupplier", e.target.value)} className={inputCls} placeholder="ex: Indonésie, Madagascar…" />
        </Field>
        <Field label="Délai de décision">
          <select value={form.decisionTimeline} onChange={e => f("decisionTimeline", e.target.value)} className={selectCls}>
            <option value="">— Non défini —</option>
            <option value="immediat">Immédiat</option>
            <option value="1_3_mois">1–3 mois</option>
            <option value="3_6_mois">3–6 mois</option>
            <option value="6_12_mois">6–12 mois</option>
            <option value="inconnu">Inconnu</option>
          </select>
        </Field>
        <Field label="Budget indicatif (USD/kg)">
          <select value={form.budgetRange} onChange={e => f("budgetRange", e.target.value)} className={selectCls}>
            <option value="">— Non défini —</option>
            <option value="moins_50">Moins de 50 USD/kg</option>
            <option value="50_100">50–100 USD/kg</option>
            <option value="100_200">100–200 USD/kg</option>
            <option value="plus_200">Plus de 200 USD/kg</option>
          </select>
        </Field>
        <Field label="Devise préférée">
          <select value={form.preferredCurrency} onChange={e => f("preferredCurrency", e.target.value)} className={selectCls}>
            {["USD","EUR","GBP","CHF","JPY","CAD","AUD"].map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Incoterm préféré">
          <select value={form.preferredIncoterm} onChange={e => f("preferredIncoterm", e.target.value)} className={selectCls}>
            <option value="">— Non défini —</option>
            {["FOB","CIF","EXW","DDP","DAP","FCA"].map(i => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Mode de paiement">
          <select value={form.paymentTerms} onChange={e => f("paymentTerms", e.target.value)} className={selectCls}>
            <option value="">— Non défini —</option>
            <option value="LC">Lettre de crédit (LC)</option>
            <option value="virement_30j">Virement 30j</option>
            <option value="virement_60j">Virement 60j</option>
            <option value="acompte">Acompte</option>
            <option value="contre_remise">Contre remise</option>
          </select>
        </Field>
      </div>
      <CheckList label="Produits recherchés" options={PRODUCTS} value={form.productsSought} onChange={v => f("productsSought", v)} />
      <CheckList label="Certifications requises" options={CERTS} value={form.certifications} onChange={v => f("certifications", v)} />
      <Field label="Tags / Catégories">
        <TagInput value={form.tags} onChange={v => f("tags", v)} />
      </Field>
      <Field label="Notes internes">
        <textarea value={form.internalNotes} onChange={e => f("internalNotes", e.target.value)} rows={3} className={inputCls} />
      </Field>
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────
function ImportModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/crm/prospects/import", { method: "POST", body: fd, credentials: "include" });
    const data = await r.json();
    setResult(data);
    if (data.imported > 0) qc.invalidateQueries({ queryKey: ["prospects"] });
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-[#f5f0e8] rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-[#1a3c2a]">📁 Importer des prospects</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {!result ? (
          <div className="space-y-4">
            <div
              onClick={() => ref.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
              className="border-2 border-dashed border-amber-300 rounded-xl p-10 text-center cursor-pointer hover:bg-amber-50 transition"
            >
              <div className="text-5xl mb-3">📄</div>
              {file ? (
                <p className="text-sm font-medium text-[#1a3c2a]">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600">Glissez-déposez votre fichier Excel ici</p>
                  <p className="text-xs text-gray-400 mt-1">ou cliquez pour parcourir</p>
                </>
              )}
              <p className="text-xs text-gray-400 mt-2">Formats : .xlsx, .xls, .csv</p>
              <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <a href="/api/crm/prospects/template" download className="block text-center border border-[#1a3c2a] text-[#1a3c2a] text-sm py-2 rounded-lg hover:bg-green-50">
              📥 Télécharger le modèle Excel
            </a>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
              <button onClick={handleImport} disabled={!file || loading}
                className="flex-1 bg-[#1a3c2a] text-white py-2 rounded-lg text-sm disabled:opacity-50 hover:bg-[#2d5a3f]">
                {loading ? "Import en cours…" : "Importer"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-4 border border-amber-200">
              <p className="font-semibold text-[#1a3c2a] mb-3">{result.message}</p>
              <div className="flex gap-6 text-sm mb-3">
                {result.imported > 0 && <span className="text-green-700">✅ {result.imported} importés</span>}
                {result.errors?.length > 0 && <span className="text-red-600">⚠️ {result.errors.length} erreurs</span>}
              </div>
              {result.errors?.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-auto bg-red-50 rounded p-2">
                  {result.errors.map((e: any, i: number) => (
                    <p key={i} className="text-xs text-red-700">Ligne {e.line} : {e.message}</p>
                  ))}
                </div>
              )}
            </div>
            <button onClick={onClose} className="w-full bg-[#1a3c2a] text-white py-2 rounded-lg text-sm hover:bg-[#2d5a3f]">Fermer</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Prospect Card (Kanban) ───────────────────────────────────────────────────
function ProspectCard({ p, onAdvance, onDelete }: {
  p: Prospect;
  onAdvance: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const next = NEXT_STATUS[p.status];
  const tags = parseTags(p.tags).slice(0, 3);
  return (
    <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 hover:shadow-md transition group">
      <div className="flex justify-between items-start mb-1.5">
        <Link href={`/crm/prospects/${p.id}`}>
          <span className="font-semibold text-[#1a3c2a] text-sm hover:underline cursor-pointer leading-tight block">{p.company}</span>
        </Link>
        <span className={`text-xs font-bold ml-2 whitespace-nowrap ${scoreColor(p.score)}`}>{scoreIcon(p.score)} {p.score}</span>
      </div>
      <p className="text-xs text-gray-500 mb-0.5">
        {COUNTRY_LIST.find(c => c.code === p.country)?.name ?? p.country}
        {p.activityType ? ` · ${ACTIVITY_LABELS[p.activityType] ?? p.activityType}` : ""}
      </p>
      {p.estimatedVolume != null && <p className="text-xs text-gray-400">{p.estimatedVolume} t/an</p>}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {tags.map((t: string) => (
            <span key={t} className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{t}</span>
          ))}
        </div>
      )}
      <div className="hidden group-hover:flex gap-1 mt-2 pt-2 border-t border-gray-100 flex-wrap">
        {p.email && <a href={`mailto:${p.email}`} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100" title="Email">📧</a>}
        {p.phone && <a href={`tel:${p.phone}`} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100" title="Appeler">📞</a>}
        {p.mobile && <a href={`https://wa.me/${p.mobile.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100" title="WhatsApp">💬</a>}
        {next && <button onClick={() => onAdvance(p.id, next)} className="text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded hover:bg-amber-100" title="Avancer">→</button>}
        <Link href={`/crm/prospects/${p.id}`}><span className="text-xs px-2 py-1 bg-gray-50 text-gray-700 rounded hover:bg-gray-100 cursor-pointer">Fiche</span></Link>
        <button onClick={() => { if (confirm("Supprimer ce prospect ?")) onDelete(p.id); }} className="ml-auto text-xs px-1.5 py-1 text-red-400 hover:bg-red-50 rounded">🗑</button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Prospects() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createError, setCreateError] = useState("");

  const { data: prospects = [], isLoading } = useQuery<Prospect[]>({
    queryKey: ["prospects"],
    queryFn: async () => {
      const r = await fetch("/api/crm/prospects", { credentials: "include" });
      if (!r.ok) throw new Error("Erreur chargement prospects");
      return r.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch("/api/crm/prospects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "Erreur"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospects"] });
      setShowForm(false); setForm({ ...EMPTY_FORM }); setStep(1); setCreateError("");
    },
    onError: (e: any) => setCreateError(e.message),
  });

  const advanceMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await fetch(`/api/crm/prospects/${id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ status }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospects"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/crm/prospects/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospects"] }),
  });

  const convertMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/crm/prospects/${id}/convert`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({}),
      });
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prospects"] }); alert("✅ Prospect converti en client !"); },
  });

  const filtered = prospects.filter(p => {
    const q = search.toLowerCase();
    const m = !q || p.company.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q) || (p.country ?? "").toLowerCase().includes(q) || (p.city ?? "").toLowerCase().includes(q);
    return m && (!statusFilter || p.status === statusFilter);
  });

  const stats = {
    total: prospects.length,
    new: prospects.filter(p => p.status === "new").length,
    qualified: prospects.filter(p => p.status === "qualified").length,
    converted: prospects.filter(p => p.status === "converted").length,
  };

  const handleSubmit = () => {
    if (!form.company.trim()) { setCreateError("Le nom de l'entreprise est requis."); return; }
    createMutation.mutate({
      ...form,
      estimatedVolume: form.estimatedVolume ? Number(form.estimatedVolume) : undefined,
    });
  };

  return (
    <div className="min-h-screen bg-[#faf6ef]">
      {/* Header */}
      <div className="bg-white border-b border-amber-100 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-[#1a3c2a]">Prospects</h1>
            <p className="text-sm text-gray-400">Pipeline de qualification — {prospects.length} prospect{prospects.length > 1 ? "s" : ""}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView(v => v === "kanban" ? "list" : "kanban")}
              className="px-3 py-2 border border-amber-200 rounded-lg text-sm text-gray-600 hover:bg-amber-50">
              {view === "kanban" ? "🗂 Liste" : "📋 Kanban"}
            </button>
            <button onClick={() => setShowImport(true)}
              className="px-3 py-2 border border-[#1a3c2a] text-[#1a3c2a] rounded-lg text-sm hover:bg-green-50">
              📁 Import Excel
            </button>
            <button onClick={() => { setShowForm(true); setStep(1); setForm({ ...EMPTY_FORM }); setCreateError(""); }}
              className="px-4 py-2 bg-[#1a3c2a] text-white rounded-lg text-sm hover:bg-[#2d5a3f]">
              + Nouveau prospect
            </button>
          </div>
        </div>

        {/* KPI bar */}
        <div className="flex gap-6 text-sm text-gray-600 mb-3">
          <span><strong className="text-[#1a3c2a]">{stats.total}</strong> total</span>
          <span><strong className="text-indigo-600">{stats.new}</strong> nouveaux</span>
          <span><strong className="text-emerald-600">{stats.qualified}</strong> qualifiés</span>
          <span><strong className="text-amber-600">{stats.converted}</strong> convertis</span>
        </div>

        {/* Search + filter */}
        <div className="flex gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email, ville, pays…"
            className="flex-1 border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none">
            <option value="">Tous les statuts</option>
            {STATUS_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            <option value="converted">Convertis</option>
          </select>
        </div>
      </div>

      <div className="px-2 py-2 text-xs text-gray-400 px-6">
        Légende : 🔥 Score ≥ 80 · 🌡️ 60–79 · ❄️ &lt; 60
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64 text-gray-400">Chargement…</div>
      ) : view === "kanban" ? (
        /* ─── Kanban ──────────────────────────────────────────────────────────── */
        <div className="px-6 pb-8 overflow-x-auto">
          <div className="flex gap-4 min-w-max pt-2">
            {STATUS_COLUMNS.map(col => {
              const cards = filtered.filter(p => p.status === col.key);
              return (
                <div key={col.key} className="w-72 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: col.color }}>{col.label}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full ml-auto">{cards.length}</span>
                  </div>
                  <div className="space-y-3 min-h-[80px]">
                    {cards.map(p => (
                      <ProspectCard key={p.id} p={p}
                        onAdvance={(id, status) => advanceMutation.mutate({ id, status })}
                        onDelete={(id) => deleteMutation.mutate(id)}
                      />
                    ))}
                    {cards.length === 0 && (
                      <div className="text-center text-xs text-gray-300 py-8 border-2 border-dashed border-gray-100 rounded-lg">Aucun prospect</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ─── List ────────────────────────────────────────────────────────────── */
        <div className="px-6 pb-8">
          <div className="bg-white rounded-xl border border-amber-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 text-xs text-gray-500 uppercase border-b border-amber-100">
                <tr>
                  <th className="px-4 py-3 text-left">Entreprise</th>
                  <th className="px-4 py-3 text-left">Pays</th>
                  <th className="px-4 py-3 text-left">Activité</th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-left">Statut</th>
                  <th className="px-4 py-3 text-center">Score</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const col = STATUS_COLUMNS.find(c => c.key === p.status);
                  return (
                    <tr key={p.id} className={`${i % 2 === 0 ? "bg-white" : "bg-amber-50/30"} hover:bg-amber-50/60 transition`}>
                      <td className="px-4 py-3">
                        <Link href={`/crm/prospects/${p.id}`}>
                          <span className="font-medium text-[#1a3c2a] hover:underline cursor-pointer">{p.company}</span>
                        </Link>
                        {p.city && <p className="text-xs text-gray-400">{p.city}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{COUNTRY_LIST.find(c => c.code === p.country)?.name ?? p.country}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{ACTIVITY_LABELS[p.activityType ?? ""] ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{SOURCE_LABELS[p.source] ?? p.source}</td>
                      <td className="px-4 py-3">
                        {col ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: col.color, backgroundColor: col.bg }}>{col.label}</span>
                        ) : p.status === "converted" ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium text-green-700 bg-green-50">Converti</span>
                        ) : <span className="text-xs text-gray-400">{p.status}</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-semibold text-sm ${scoreColor(p.score)}`}>{scoreIcon(p.score)} {p.score}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{p.email ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2 items-center">
                          {p.status === "qualified" && !p.convertedToClientId && (
                            <button onClick={() => convertMutation.mutate(p.id)} className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200">Convertir</button>
                          )}
                          <Link href={`/crm/prospects/${p.id}`}>
                            <span className="text-xs text-[#1a3c2a] hover:underline cursor-pointer">Voir →</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-300">Aucun prospect</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── 3-Step Form Modal ──────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-[#f5f0e8] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-amber-200 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-[#1a3c2a]">Nouveau prospect</h2>
                <div className="flex items-center gap-1 mt-2">
                  {[1,2,3].map((s, i) => (
                    <div key={s} className="flex items-center gap-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                        ${step > s ? "bg-[#1a3c2a] border-[#1a3c2a] text-white"
                          : step === s ? "border-[#1a3c2a] text-[#1a3c2a] bg-white"
                          : "border-amber-200 text-amber-300 bg-white"}`}>{s}</div>
                      {i < 2 && <div className={`w-10 h-0.5 ${step > s ? "bg-[#1a3c2a]" : "bg-amber-200"}`} />}
                    </div>
                  ))}
                  <span className="ml-3 text-xs text-gray-500">
                    {step === 1 ? "Identité" : step === 2 ? "Contact & Fiscal" : "Qualification"}
                  </span>
                </div>
              </div>
              <button onClick={() => { setShowForm(false); setStep(1); }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {createError && (
                <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{createError}</div>
              )}
              {step === 1 && <Step1 form={form} setForm={setForm} />}
              {step === 2 && <Step2 form={form} setForm={setForm} />}
              {step === 3 && <Step3 form={form} setForm={setForm} />}
            </div>

            {/* Footer */}
            <div className="flex justify-between px-6 py-4 border-t border-amber-200 flex-shrink-0">
              <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
                className="px-5 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 disabled:opacity-30 hover:bg-white">
                ← Précédent
              </button>
              {step < 3 ? (
                <button onClick={() => {
                  if (step === 1 && !form.company.trim()) { setCreateError("Le nom de l'entreprise est requis."); return; }
                  setCreateError(""); setStep(s => s + 1);
                }}
                  className="px-6 py-2 bg-[#1a3c2a] text-white rounded-lg text-sm hover:bg-[#2d5a3f]">
                  Continuer →
                </button>
              ) : (
                <button onClick={handleSubmit} disabled={createMutation.isPending}
                  className="px-6 py-2 bg-[#1a3c2a] text-white rounded-lg text-sm hover:bg-[#2d5a3f] disabled:opacity-50">
                  {createMutation.isPending ? "Création…" : "✓ Créer le prospect"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
