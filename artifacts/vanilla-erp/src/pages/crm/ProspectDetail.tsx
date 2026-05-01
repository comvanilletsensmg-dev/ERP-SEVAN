import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { COUNTRY_LIST, getCountryFiscal } from "../../lib/country-fiscal";

interface Prospect {
  id: string;
  company: string; altName?: string; type: string; clientCode?: string;
  address?: string; postalCode?: string; city?: string; country: string; region?: string;
  contact?: string; phone?: string; mobile?: string; fax?: string;
  website?: string; email?: string; refuseMassEmail: boolean;
  proId1?: string; proId2?: string; vatRegistered: boolean; vatNumber?: string;
  tags: string; internalNotes?: string; notes?: string;
  source: string; status: string; score: number; assignedTo?: string; createdBy?: string;
  activityType?: string; estimatedVolume?: number; currentSupplier?: string;
  productsSought: string; decisionTimeline?: string; budgetRange?: string;
  preferredCurrency?: string; preferredIncoterm?: string; paymentTerms?: string;
  certifications: string;
  createdAt: string; updatedAt: string; lastInteraction?: string;
  convertedToClientId?: string;
}

const parseTags = (s: string) => { try { return JSON.parse(s || "[]"); } catch { return []; } };

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
const DECISION_LABELS: Record<string, string> = {
  immediat: "Immédiat", "1_3_mois": "1–3 mois", "3_6_mois": "3–6 mois",
  "6_12_mois": "6–12 mois", inconnu: "Inconnu",
};
const BUDGET_LABELS: Record<string, string> = {
  moins_50: "< 50 USD/kg", "50_100": "50–100 USD/kg",
  "100_200": "100–200 USD/kg", plus_200: "> 200 USD/kg",
};
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new:        { label: "Nouveau",       color: "#6366f1", bg: "#eef2ff" },
  to_contact: { label: "À contacter",   color: "#f59e0b", bg: "#fffbeb" },
  contacted:  { label: "Contacté",      color: "#0ea5e9", bg: "#f0f9ff" },
  qualified:  { label: "Qualifié",      color: "#10b981", bg: "#ecfdf5" },
  converted:  { label: "Converti",      color: "#059669", bg: "#d1fae5" },
  lost:       { label: "Perdu",         color: "#ef4444", bg: "#fef2f2" },
};
const NEXT_STATUS: Record<string, string> = {
  new: "to_contact", to_contact: "contacted", contacted: "qualified",
};

function scoreIcon(s: number) { return s >= 80 ? "🔥" : s >= 60 ? "🌡️" : "❄️"; }
function scoreColor(s: number) { return s >= 80 ? "text-red-600" : s >= 60 ? "text-amber-600" : "text-sky-500"; }

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm py-1 border-b border-amber-50 last:border-0">
      <span className="text-gray-400 w-44 flex-shrink-0 text-xs pt-0.5">{label}</span>
      <span className="text-gray-800 break-all">{value}</span>
    </div>
  );
}

export default function ProspectDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [rescoring, setRescoring] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const { data: p, isLoading, error } = useQuery<Prospect>({
    queryKey: ["prospect", id],
    queryFn: async () => {
      const r = await fetch(`/api/crm/prospects/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Prospect introuvable");
      return r.json();
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async (status: string) => {
      const r = await fetch(`/api/crm/prospects/${id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ status }),
      });
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prospect", id] }); qc.invalidateQueries({ queryKey: ["prospects"] }); },
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/crm/prospects/${id}/convert`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({}),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospect", id] });
      qc.invalidateQueries({ queryKey: ["prospects"] });
      setSuccessMsg("✅ Prospect converti en client avec succès !");
    },
  });

  const rescore = async () => {
    setRescoring(true);
    await fetch(`/api/crm/prospects/${id}/score`, { method: "POST", credentials: "include" });
    qc.invalidateQueries({ queryKey: ["prospect", id] });
    setRescoring(false);
  };

  if (isLoading) return (
    <div className="flex justify-center items-center h-64 bg-[#faf6ef]">
      <div className="text-gray-400">Chargement…</div>
    </div>
  );

  if (error || !p) return (
    <div className="p-8 bg-[#faf6ef]">
      <Link href="/crm/prospects"><span className="text-[#1a3c2a] hover:underline cursor-pointer">← Retour aux prospects</span></Link>
      <p className="mt-4 text-red-600">Prospect introuvable.</p>
    </div>
  );

  const fiscal = getCountryFiscal(p.country);
  const countryName = COUNTRY_LIST.find(c => c.code === p.country)?.name ?? p.country;
  const tags = parseTags(p.tags);
  const products = parseTags(p.productsSought);
  const certs = parseTags(p.certifications);
  const statusConf = STATUS_CONFIG[p.status] ?? { label: p.status, color: "#6b7280", bg: "#f3f4f6" };
  const nextStatus = NEXT_STATUS[p.status];

  return (
    <div className="min-h-screen bg-[#faf6ef]">
      {/* Header bar */}
      <div className="bg-white border-b border-amber-100 px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <Link href="/crm/prospects"><span className="hover:text-[#1a3c2a] cursor-pointer">← Prospects</span></Link>
          <span>/</span>
          <span className="text-gray-800 font-medium">{p.company}</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[#1a3c2a]">{p.company}</h1>
            {p.altName && <p className="text-sm text-gray-400">{p.altName}</p>}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`font-bold text-lg ${scoreColor(p.score)}`}>{scoreIcon(p.score)} {p.score}/100</span>
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ color: statusConf.color, backgroundColor: statusConf.bg }}>{statusConf.label}</span>
              <span className="text-sm text-gray-500">{countryName}</span>
              {p.activityType && <span className="text-sm text-gray-500">· {ACTIVITY_LABELS[p.activityType] ?? p.activityType}</span>}
              {p.estimatedVolume != null && <span className="text-sm text-gray-500">· {p.estimatedVolume} t/an</span>}
              <span className="text-xs text-gray-400">Source : {SOURCE_LABELS[p.source] ?? p.source}</span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={rescore} disabled={rescoring} className="px-3 py-2 border border-amber-300 text-amber-700 rounded-lg text-sm hover:bg-amber-50 disabled:opacity-50">
              {rescoring ? "…" : "⟳ Recalculer"}
            </button>
            {nextStatus && (
              <button onClick={() => advanceMutation.mutate(nextStatus)} disabled={advanceMutation.isPending}
                className="px-3 py-2 border border-[#1a3c2a] text-[#1a3c2a] rounded-lg text-sm hover:bg-green-50">
                → {STATUS_CONFIG[nextStatus]?.label ?? nextStatus}
              </button>
            )}
            {p.status === "qualified" && !p.convertedToClientId && (
              <button onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">
                ✓ Convertir en client
              </button>
            )}
            {p.email && <a href={`mailto:${p.email}`} className="px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100">📧 Email</a>}
            {p.phone && <a href={`tel:${p.phone}`} className="px-3 py-2 bg-green-50 text-green-700 rounded-lg text-sm hover:bg-green-100">📞 Appeler</a>}
            {p.mobile && <a href={`https://wa.me/${p.mobile.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" className="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm hover:bg-emerald-100">💬 WhatsApp</a>}
          </div>
        </div>
        {successMsg && <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">{successMsg}</div>}
      </div>

      {/* Body */}
      <div className="px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Contact + Address */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-amber-100 p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">📍 Contact & Adresse</h3>
            <InfoRow label="Entreprise" value={p.company} />
            <InfoRow label="Contact principal" value={p.contact} />
            <InfoRow label="Adresse" value={p.address} />
            <InfoRow label="Code postal" value={p.postalCode} />
            <InfoRow label="Ville" value={p.city} />
            <InfoRow label="Région" value={p.region} />
            <InfoRow label="Pays" value={countryName} />
            <div className="mt-3 pt-3 border-t border-amber-50 space-y-1">
              {p.phone && <a href={`tel:${p.phone}`} className="flex items-center gap-2 text-sm text-[#1a3c2a] hover:underline">📞 {p.phone}</a>}
              {p.mobile && <a href={`tel:${p.mobile}`} className="flex items-center gap-2 text-sm text-[#1a3c2a] hover:underline">📱 {p.mobile}</a>}
              {p.fax && <p className="text-sm text-gray-500">📠 {p.fax}</p>}
              {p.email && <a href={`mailto:${p.email}`} className="flex items-center gap-2 text-sm text-[#1a3c2a] hover:underline">✉️ {p.email}</a>}
              {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-[#1a3c2a] hover:underline">🌐 {p.website}</a>}
              {p.refuseMassEmail && <p className="text-xs text-red-500 mt-1">⚠ Refuse les emails de masse</p>}
            </div>
          </div>

          {/* Fiscal IDs */}
          <div className="bg-white rounded-xl border border-amber-100 p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">🏢 Identifiants fiscaux</h3>
            {p.proId1 ? (
              <InfoRow label={fiscal.proId1Label} value={p.proId1} />
            ) : <p className="text-xs text-gray-300 italic">{fiscal.proId1Label} : non renseigné</p>}
            {p.proId2 && <InfoRow label={fiscal.proId2Label} value={p.proId2} />}
            {fiscal.showVat && (
              <>
                <InfoRow label={fiscal.vatRegisteredLabel ?? "Assujetti TVA"} value={p.vatRegistered ? "Oui" : "Non"} />
                {p.vatRegistered && p.vatNumber && <InfoRow label={fiscal.vatLabel ?? "Numéro de TVA"} value={p.vatNumber} />}
              </>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-100 p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">🏷️ Tags</h3>
              <div className="flex flex-wrap gap-2">
                {tags.map((t: string) => (
                  <span key={t} className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center: Commercial qualification */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-amber-100 p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">🌿 Qualification commerciale</h3>
            <InfoRow label="Type d'activité" value={ACTIVITY_LABELS[p.activityType ?? ""] ?? p.activityType} />
            <InfoRow label="Volume estimé" value={p.estimatedVolume != null ? `${p.estimatedVolume} t/an` : undefined} />
            <InfoRow label="Fournisseur actuel" value={p.currentSupplier} />
            <InfoRow label="Délai de décision" value={DECISION_LABELS[p.decisionTimeline ?? ""] ?? p.decisionTimeline} />
            <InfoRow label="Budget indicatif" value={BUDGET_LABELS[p.budgetRange ?? ""] ?? p.budgetRange} />
          </div>

          <div className="bg-white rounded-xl border border-amber-100 p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">💰 Préférences achat</h3>
            <InfoRow label="Devise" value={p.preferredCurrency} />
            <InfoRow label="Incoterm" value={p.preferredIncoterm} />
            <InfoRow label="Paiement" value={p.paymentTerms} />
          </div>

          {products.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-100 p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">🌱 Produits recherchés</h3>
              <div className="flex flex-wrap gap-2">
                {products.map((t: string) => (
                  <span key={t} className="text-xs bg-green-50 text-green-800 px-2.5 py-1 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          )}

          {certs.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-100 p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">🏅 Certifications requises</h3>
              <div className="flex flex-wrap gap-2">
                {certs.map((t: string) => (
                  <span key={t} className="text-xs bg-blue-50 text-blue-800 px-2.5 py-1 rounded-full">{t.toUpperCase()}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Notes + Score breakdown */}
        <div className="space-y-4">
          {/* Score visual */}
          <div className="bg-white rounded-xl border border-amber-100 p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">📊 Score de qualification</h3>
            <div className="flex items-center justify-center mb-4">
              <div className={`text-5xl font-black ${scoreColor(p.score)}`}>{p.score}</div>
              <span className="text-2xl ml-2">{scoreIcon(p.score)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div className="h-3 rounded-full transition-all"
                style={{ width: `${p.score}%`, backgroundColor: p.score >= 80 ? "#dc2626" : p.score >= 60 ? "#d97706" : "#0ea5e9" }} />
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">
              {p.score >= 80 ? "Prospect très chaud — priorité absolue" : p.score >= 60 ? "Prospect chaud — à contacter rapidement" : "Prospect froid — à qualifier davantage"}
            </p>
          </div>

          {/* Notes */}
          {(p.internalNotes || p.notes) && (
            <div className="bg-white rounded-xl border border-amber-100 p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">📝 Notes internes</h3>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{p.internalNotes ?? p.notes}</p>
            </div>
          )}

          {/* Tracking */}
          <div className="bg-white rounded-xl border border-amber-100 p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">📅 Suivi</h3>
            <InfoRow label="Statut" value={statusConf.label} />
            <InfoRow label="Source" value={SOURCE_LABELS[p.source] ?? p.source} />
            <InfoRow label="Créé le" value={new Date(p.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })} />
            <InfoRow label="Mis à jour" value={new Date(p.updatedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })} />
            {p.lastInteraction && <InfoRow label="Dernière interaction" value={new Date(p.lastInteraction).toLocaleDateString("fr-FR")} />}
            {p.convertedToClientId && (
              <div className="mt-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded">
                ✅ Converti en client
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
