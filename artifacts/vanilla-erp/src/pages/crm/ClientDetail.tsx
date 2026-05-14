import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { COUNTRY_LIST } from "../../lib/country-fiscal";
import { getFormLabels } from "../../config/countryTax";

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
  totalOrders: number; totalRevenue: number; averageOrderValue: number; lastOrderDate?: string;
  isActive: boolean; assignedTo?: string;
  createdAt: string; updatedAt: string;
  contacts?: ClientContact[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const RISK_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  low:     { label: "Faible",  color: "#15803d", bg: "#dcfce7", dot: "🟢" },
  medium:  { label: "Moyen",   color: "#b45309", bg: "#fef3c7", dot: "🟡" },
  high:    { label: "Élevé",   color: "#b91c1c", bg: "#fee2e2", dot: "🔴" },
  blocked: { label: "Bloqué",  color: "#7c3aed", bg: "#ede9fe", dot: "⛔" },
};

const SOURCE_LABELS: Record<string, string> = {
  converted_prospect: "Converti depuis un prospect",
  kompass: "Kompass", salon: "Salon", referral: "Parrainage",
  web: "Site web", import_excel: "Import Excel", other: "Autre",
};

const ACTIVITY_LABELS: Record<string, string> = {
  importateur: "Importateur", distributeur: "Distributeur",
  transformateur: "Transformateur", industriel: "Industriel", artisan: "Artisan", autre: "Autre",
};

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse((raw as string) || "[]"); return Array.isArray(p) ? p : []; } catch { return []; }
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-800 font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, credentials: "include" });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? `Erreur ${r.status}`); }
  return r.json();
}

// ─── Contact Card ─────────────────────────────────────────────────────────────
function ContactCard({ contact, clientId, onUpdate }: { contact: ClientContact; clientId: string; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: contact.firstName, lastName: contact.lastName, role: contact.role ?? "", email: contact.email ?? "", phone: contact.phone ?? "", mobile: contact.mobile ?? "" });
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => apiFetch(`/api/crm/clients/${clientId}/contacts/${contact.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, isPrimary: contact.isPrimary }),
    }),
    onSuccess: () => { setEditing(false); qc.invalidateQueries({ queryKey: ["crm-client", clientId] }); },
  });

  const deleteMut = useMutation({
    mutationFn: () => apiFetch(`/api/crm/clients/${clientId}/contacts/${contact.id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-client", clientId] }),
  });

  const inputCls = "w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3c2a]/30";

  if (!editing) {
    return (
      <div className="bg-white rounded-lg border border-gray-100 p-3 group">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-gray-800 text-sm">{contact.firstName} {contact.lastName}
              {contact.isPrimary && <span className="ml-1 text-xs text-amber-600">⭐</span>}
            </p>
            {contact.role && <p className="text-xs text-gray-500">{contact.role}</p>}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditing(true)} className="text-xs px-2 py-0.5 border border-gray-200 rounded hover:bg-gray-50">✏</button>
            {!contact.isPrimary && (
              <button onClick={() => deleteMut.mutate()} className="text-xs px-2 py-0.5 border border-red-200 text-red-500 rounded hover:bg-red-50">✕</button>
            )}
          </div>
        </div>
        <div className="mt-2 space-y-0.5">
          {contact.email && <p className="text-xs text-blue-600">✉ {contact.email}</p>}
          {contact.phone && <p className="text-xs text-gray-500">📞 {contact.phone}</p>}
          {contact.mobile && <p className="text-xs text-gray-500">📱 {contact.mobile}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className={inputCls} placeholder="Prénom" />
        <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className={inputCls} placeholder="Nom" />
      </div>
      <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={inputCls} placeholder="Rôle" />
      <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} placeholder="Email" />
      <div className="grid grid-cols-2 gap-2">
        <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} placeholder="Téléphone" />
        <input value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} className={inputCls} placeholder="Mobile" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="flex-1 bg-[#1a3c2a] text-white py-1 rounded text-xs disabled:opacity-50">Sauvegarder</button>
        <button onClick={() => setEditing(false)} className="flex-1 border border-gray-300 text-gray-600 py-1 rounded text-xs">Annuler</button>
      </div>
    </div>
  );
}

// ─── Add Contact Form ─────────────────────────────────────────────────────────
function AddContactForm({ clientId }: { clientId: string }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", role: "", email: "", phone: "", mobile: "" });
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => apiFetch(`/api/crm/clients/${clientId}/contacts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    }),
    onSuccess: () => { setShow(false); setForm({ firstName: "", lastName: "", role: "", email: "", phone: "", mobile: "" }); qc.invalidateQueries({ queryKey: ["crm-client", clientId] }); },
  });

  const inputCls = "w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3c2a]/30";

  if (!show) return (
    <button onClick={() => setShow(true)} className="w-full border-2 border-dashed border-gray-200 rounded-lg py-2 text-xs text-gray-400 hover:border-[#1a3c2a]/40 hover:text-[#1a3c2a] transition-colors">
      + Ajouter un contact
    </button>
  );

  return (
    <div className="bg-blue-50 rounded-lg border border-blue-100 p-3 space-y-2">
      <p className="text-xs font-medium text-blue-800">Nouveau contact</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className={inputCls} placeholder="Prénom *" />
        <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className={inputCls} placeholder="Nom *" />
      </div>
      <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={inputCls} placeholder="Rôle (ex: Acheteur)" />
      <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} placeholder="Email" />
      <div className="grid grid-cols-2 gap-2">
        <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} placeholder="Téléphone" />
        <input value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} className={inputCls} placeholder="Mobile" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => mutation.mutate()} disabled={!form.firstName || !form.lastName || mutation.isPending}
          className="flex-1 bg-[#1a3c2a] text-white py-1 rounded text-xs disabled:opacity-50">
          {mutation.isPending ? "..." : "Ajouter"}
        </button>
        <button onClick={() => setShow(false)} className="flex-1 border border-gray-300 text-gray-600 py-1 rounded text-xs">Annuler</button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ClientDetail({ id }: { id: string }) {
  const [tab, setTab] = useState<"contacts" | "fiscal" | "stats" | "notes">("contacts");

  const { data: client, isLoading, error } = useQuery<CrmClient>({
    queryKey: ["crm-client", id],
    queryFn: () => apiFetch(`/api/crm/clients/${id}`),
  });

  if (isLoading) return <div className="min-h-screen bg-[#faf6ef] flex items-center justify-center text-gray-400">Chargement...</div>;
  if (error || !client) return (
    <div className="min-h-screen bg-[#faf6ef] p-8">
      <Link href="/crm/clients"><span className="text-[#1a3c2a] hover:underline cursor-pointer">← Retour aux clients</span></Link>
      <p className="mt-4 text-red-600">Client introuvable.</p>
    </div>
  );

  const fiscal = getFormLabels(client.country);
  const countryName = COUNTRY_LIST.find(c => c.code === client.country)?.name ?? client.country;
  const tags = parseTags(client.tags);
  const risk = RISK_CONFIG[client.riskLevel] ?? RISK_CONFIG.medium;
  const contacts = (client.contacts ?? []).filter(c => c.isActive).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  return (
    <div className="min-h-screen bg-[#faf6ef]">
      {/* Header */}
      <div className="bg-white border-b border-amber-100 px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <Link href="/crm/clients"><span className="hover:text-[#1a3c2a] cursor-pointer">← Clients</span></Link>
          <span>/</span>
          <span className="text-gray-800 font-medium">{client.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#1a3c2a] uppercase">{client.name}</h1>
              {client.isActive
                ? <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">✓ Actif</span>
                : <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-full">Inactif</span>
              }
            </div>
            {client.altName && <p className="text-sm text-gray-400 mt-0.5">{client.altName}</p>}
            <div className="flex items-center gap-3 mt-2 flex-wrap text-sm">
              {client.clientCode && <span className="font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded text-xs">{client.clientCode}</span>}
              <span style={{ color: risk.color, backgroundColor: risk.bg }} className="text-xs px-2 py-0.5 rounded-full font-medium">{risk.dot} Risque {risk.label}</span>
              <span className="text-gray-500">🌍 {countryName}{client.city ? ` · ${client.city}` : ""}</span>
              {client.activityType && <span className="text-gray-500">{ACTIVITY_LABELS[client.activityType] ?? client.activityType}</span>}
              {client.creditLimit && <span className="text-gray-500">💳 Crédit : {client.creditLimit.toLocaleString("fr-FR")} {client.currency}</span>}
            </div>
            {tags.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {tags.map(t => <span key={t} className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">{t}</span>)}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 items-end">
            <div className="flex gap-2">
              {client.email && (
                <a href={`mailto:${client.email}`} className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">📧 Email</a>
              )}
              {client.phone && (
                <a href={`tel:${client.phone}`} className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">📞 Appeler</a>
              )}
              {client.phone && (
                <a href={`https://wa.me/${client.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                  className="px-3 py-1.5 border border-green-200 text-green-700 rounded-lg text-sm hover:bg-green-50">💬 WhatsApp</a>
              )}
              <Link href={`/crm/clients/${id}/edit`}>
                <button className="px-3 py-1.5 bg-[#1a3c2a] text-white rounded-lg text-sm hover:bg-[#2d5a3f]">✏ Modifier</button>
              </Link>
            </div>
            {client.convertedFromId && (
              <Link href={`/crm/prospects/${client.convertedFromId}`}>
                <span className="text-xs text-blue-600 hover:underline cursor-pointer">↗ Voir le prospect d'origine</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-white border-b border-amber-100 px-6 py-3 flex gap-6 flex-wrap">
        {[
          { label: "CA total", value: client.totalRevenue > 0 ? `${client.totalRevenue.toLocaleString("fr-FR")} ${client.currency}` : "—", icon: "💰" },
          { label: "Commandes", value: client.totalOrders > 0 ? client.totalOrders.toString() : "—", icon: "📦" },
          { label: "Panier moyen", value: client.averageOrderValue > 0 ? `${client.averageOrderValue.toLocaleString("fr-FR")} ${client.currency}` : "—", icon: "📊" },
          { label: "Dernière commande", value: client.lastOrderDate ? new Date(client.lastOrderDate).toLocaleDateString("fr-FR") : "—", icon: "📅" },
          { label: "Délai paiement", value: `${client.paymentTerms} jours`, icon: "🕐" },
          { label: "Incoterm", value: client.preferredIncoterm ?? "—", icon: "🚢" },
        ].map(s => (
          <div key={s.label} className="text-center min-w-[100px]">
            <p className="text-xs text-gray-400">{s.icon} {s.label}</p>
            <p className="font-bold text-[#1a3c2a] text-sm">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Content tabs */}
      <div className="p-6">
        <div className="flex gap-1 mb-6">
          {(["contacts", "fiscal", "stats", "notes"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-[#1a3c2a] text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
              {t === "contacts" ? "👤 Contacts" : t === "fiscal" ? "🏢 Fiscal" : t === "stats" ? "📊 Informations" : "📝 Notes"}
            </button>
          ))}
        </div>

        {/* CONTACTS TAB */}
        {tab === "contacts" && (
          <div className="grid grid-cols-1 gap-3 max-w-lg">
            {contacts.map(c => <ContactCard key={c.id} contact={c} clientId={id} onUpdate={() => {}} />)}
            <AddContactForm clientId={id} />
          </div>
        )}

        {/* FISCAL TAB */}
        {tab === "fiscal" && (
          <div className="grid grid-cols-2 gap-6 max-w-2xl">
            <div className="bg-white rounded-xl border border-amber-100 p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">🏢 Identifiants fiscaux — {countryName}</h3>
              {client.proId1
                ? <InfoRow label={fiscal.proId1} value={client.proId1} />
                : <p className="text-xs text-gray-300 italic">{fiscal.proId1} : non renseigné</p>
              }
              {client.proId2 && fiscal.proId2 && <InfoRow label={fiscal.proId2} value={client.proId2} />}
              {fiscal.showVat && <>
                <InfoRow label="Assujetti TVA" value={client.vatRegistered ? "Oui" : "Non"} />
                {client.vatRegistered && client.vatNumber && <InfoRow label={fiscal.vatLabel ?? "Numéro de TVA"} value={client.vatNumber} />}
              </>}
            </div>
            <div className="bg-white rounded-xl border border-amber-100 p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">📋 Coordonnées</h3>
              <InfoRow label="Adresse" value={[client.address, client.postalCode, client.city].filter(Boolean).join(", ")} />
              <InfoRow label="Pays / Région" value={[countryName, client.region].filter(Boolean).join(", ")} />
              <InfoRow label="Email" value={client.email} />
              <InfoRow label="Téléphone" value={client.phone} />
              <InfoRow label="Mobile" value={client.mobile} />
              <InfoRow label="Fax" value={client.fax} />
              <InfoRow label="Site web" value={client.website} />
              <InfoRow label="Source" value={SOURCE_LABELS[client.source] ?? client.source} />
              <InfoRow label="Assigné à" value={client.assignedTo} />
            </div>
          </div>
        )}

        {/* STATS TAB */}
        {tab === "stats" && (
          <div className="grid grid-cols-2 gap-6 max-w-2xl">
            <div className="bg-white rounded-xl border border-amber-100 p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">💼 Données commerciales</h3>
              <InfoRow label="Type d'activité" value={ACTIVITY_LABELS[client.activityType ?? ""] ?? client.activityType} />
              <InfoRow label="Niveau de risque" value={`${risk.dot} ${risk.label}`} />
              <InfoRow label="Limite de crédit" value={client.creditLimit ? `${client.creditLimit.toLocaleString("fr-FR")} ${client.currency}` : undefined} />
              <InfoRow label="Délai de paiement" value={`${client.paymentTerms} jours`} />
              <InfoRow label="Devise" value={client.currency} />
              <InfoRow label="Incoterm préféré" value={client.preferredIncoterm} />
              <InfoRow label="Type" value={client.type} />
              <InfoRow label="Client depuis" value={new Date(client.createdAt).toLocaleDateString("fr-FR")} />
            </div>
            <div className="bg-white rounded-xl border border-amber-100 p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">📦 Historique</h3>
              <div className="space-y-4">
                <div className="text-center py-4">
                  <p className="text-3xl font-bold text-[#1a3c2a]">{client.totalRevenue > 0 ? `${client.totalRevenue.toLocaleString("fr-FR")}` : "0"}</p>
                  <p className="text-xs text-gray-400">{client.currency} — CA total</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-amber-50 rounded-lg p-2">
                    <p className="text-lg font-bold text-amber-800">{client.totalOrders}</p>
                    <p className="text-xs text-gray-500">Commandes</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2">
                    <p className="text-lg font-bold text-green-800">{client.averageOrderValue > 0 ? client.averageOrderValue.toLocaleString("fr-FR") : "—"}</p>
                    <p className="text-xs text-gray-500">Panier moyen</p>
                  </div>
                </div>
                {client.lastOrderDate && <InfoRow label="Dernière commande" value={new Date(client.lastOrderDate).toLocaleDateString("fr-FR")} />}
              </div>
            </div>
          </div>
        )}

        {/* NOTES TAB */}
        {tab === "notes" && (
          <div className="max-w-lg">
            <div className="bg-white rounded-xl border border-amber-100 p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">📝 Notes internes</h3>
              {client.internalNotes
                ? <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{client.internalNotes}</p>
                : <p className="text-sm text-gray-300 italic">Aucune note interne</p>
              }
            </div>
            {tags.length > 0 && (
              <div className="bg-white rounded-xl border border-amber-100 p-4 mt-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">🏷 Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.map(t => <span key={t} className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">{t}</span>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
