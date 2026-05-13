import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft, Package, Wrench, Edit2, Phone, Mail, Globe,
  MapPin, Building2, ShoppingCart,
  Plus, User, Landmark, MessageSquare, Trash2, Star,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

const fmt = (n: number | null | undefined) => new Intl.NumberFormat("fr-MG", { maximumFractionDigits: 0 }).format(n ?? 0);
const fmtDate = (d: string | Date | null | undefined) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";
const fmtDt = (d: string | Date | null | undefined) => d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Moyen" : "À risque";
  const r = 36; const circ = 2 * Math.PI * r;
  const filled = circ * (score / 100);
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10"/>
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 50 50)" style={{ transition: "stroke-dasharray 0.5s" }}/>
        <text x="50" y="55" textAnchor="middle" fontSize="18" fontWeight="bold" fill={color}>{score}</text>
      </svg>
      <span className="text-sm font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

const NOTE_TYPES: Record<string, string> = {
  general: "Général", quality: "Qualité", incident: "Incident",
  payment: "Paiement", commercial: "Commercial",
};

const TABS = [
  { id: "general",    label: "Général",       icon: Building2 },
  { id: "contacts",   label: "Coordonnées",   icon: Phone },
  { id: "accounting", label: "Comptabilité",  icon: Landmark },
  { id: "purchases",  label: "Achats",        icon: ShoppingCart },
  { id: "quality",    label: "Qualité",       icon: Star },
  { id: "notes",      label: "Notes",         icon: MessageSquare },
] as const;

type TabId = typeof TABS[number]["id"];

export default function SupplierDetail({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const canDelete = user?.role === "SUPER_ADMIN" || user?.role === "LOGISTICS_MANAGER";
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("general");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/suppliers/${id}`, { method: "DELETE", credentials: "include" });
      let data: any;
      try { data = await r.json(); } catch { throw new Error("Erreur serveur inattendue"); }
      if (!r.ok) throw new Error(data?.error ?? "Erreur lors de la suppression");
      return data;
    },
    onSuccess: (d: any) => { toast.success(`Fournisseur « ${d.name} » supprimé`); navigate("/suppliers"); },
    onError: (e: any) => toast.error(e.message),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["supplier-detail", id],
    queryFn: () => fetch(`/api/suppliers/${id}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!id,
  });

  const addNote = useMutation({
    mutationFn: ({ content, type }: { content: string; type: string }) =>
      fetch(`/api/suppliers/${id}/notes`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, type }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-detail", id] });
      setNoteContent("");
    },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  if (!data?.supplier) return (
    <div className="p-8 text-center text-gray-400">Fournisseur introuvable</div>
  );

  const s = data.supplier;
  const purchases: any[] = data.purchases ?? [];
  const notes: any[] = data.notes ?? [];
  const accounting = data.accounting ?? {};
  const emp = data.assignedEmployee;

  const typeColor = s.supplierType === "GOODS" ? "blue" : "purple";
  const scoreColor = s.qualityScore >= 80 ? "emerald" : s.qualityScore >= 60 ? "amber" : "red";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600"/>
              </div>
              <h2 className="text-base font-bold text-gray-900">Supprimer le fournisseur</h2>
            </div>
            <p className="text-sm text-gray-600 mb-1">Vous êtes sur le point de supprimer définitivement :</p>
            <p className="text-sm font-semibold text-gray-900 mb-4">« {s.name} »</p>
            <p className="text-xs text-red-500 mb-5">Cette action est irréversible. L'historique des achats et les données associées seront perdus.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60">
                {deleteMutation.isPending ? "Suppression…" : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <button onClick={() => navigate("/suppliers")}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors">
            <ArrowLeft className="w-4 h-4"/>Retour aux fournisseurs
          </button>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${s.supplierType === "GOODS" ? "bg-blue-100" : "bg-purple-100"}`}>
                {s.supplierType === "GOODS"
                  ? <Package className="w-7 h-7 text-blue-600"/>
                  : <Wrench className="w-7 h-7 text-purple-600"/>}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-400">{s.supplierCode}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.status === "active" ? "bg-emerald-100 text-emerald-700" : s.status === "blocked" ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"}`}>
                    {s.status === "active" ? "Actif" : s.status === "blocked" ? "Bloqué" : "Inactif"}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.supplierType === "GOODS" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                    {s.supplierType === "GOODS" ? "Biens" : "Services"}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mt-0.5">{s.name}</h1>
                {s.category && <p className="text-sm text-gray-500">{s.category}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              {canDelete && (
                <button onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 px-4 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5"/>Supprimer
                </button>
              )}
              <button onClick={() => navigate(`/suppliers/${id}/edit`)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                <Edit2 className="w-3.5 h-3.5"/>Modifier
              </button>
              <button onClick={() => navigate("/purchases")}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
                <ShoppingCart className="w-3.5 h-3.5"/>Nouvel achat
              </button>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-4 gap-3 mt-4">
            {[
              { label: "Total achats", value: fmt(s.totalPurchases) + " Ar", color: "text-gray-900" },
              { label: "Nb livraisons", value: s.purchaseCount, color: "text-blue-700" },
              { label: "Poids total", value: s.totalWeight ? fmt(s.totalWeight) + " kg" : "—", color: "text-gray-700" },
              { label: "Score qualité", value: (s.qualityScore ?? s.score) + "/100", color: `text-${scoreColor}-700` },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <p className="text-xs text-gray-400">{label}</p>
                <p className={`text-lg font-bold ${color} mt-0.5`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-6 overflow-x-auto">
          <div className="flex min-w-max">
            {TABS.map(({ id: tid, label, icon: Icon }) => (
              <button key={tid} onClick={() => setActiveTab(tid)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tid ? "border-emerald-500 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                <Icon className="w-3.5 h-3.5"/>{label}
                {tid === "notes" && notes.length > 0 && (
                  <span className="ml-1 bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">{notes.length}</span>
                )}
                {tid === "purchases" && purchases.length > 0 && (
                  <span className="ml-1 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{purchases.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* ── GÉNÉRAL ── */}
        {activeTab === "general" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <InfoCard title="Informations générales">
              <Row label="Code fournisseur" value={s.supplierCode ?? "—"}/>
              <Row label="Nom" value={s.name}/>
              <Row label="Type" value={s.supplierType === "GOODS" ? "Fournisseur de biens" : "Fournisseur de services"}/>
              <Row label="Catégorie" value={s.category ?? "—"}/>
              <Row label="Statut" value={s.status === "active" ? "Actif" : s.status === "blocked" ? "Bloqué" : "Inactif"}/>
              <Row label="Région" value={s.region || "—"}/>
              <Row label="Pays" value={s.country ?? "Madagascar"}/>
              <Row label="Créé le" value={fmtDate(s.createdAt)}/>
              <Row label="Modifié le" value={fmtDate(s.updatedAt)}/>
            </InfoCard>

            <InfoCard title="Informations fiscales">
              <Row label="NIF" value={s.nif ?? "—"}/>
              <Row label="STAT" value={s.stat ?? "—"}/>
              <Row label="RCCM" value={s.rccm ?? "—"}/>
              <Row label="Assujetti TVA" value={s.isVatSubject ? "Oui" : "Non"}/>
            </InfoCard>

            {emp && (
              <InfoCard title="Commercial assigné">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-emerald-600"/>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{emp.name}</p>
                    <p className="text-xs text-gray-400">{emp.position}</p>
                  </div>
                </div>
                <Row label="Département" value={emp.department ?? "—"}/>
                <Row label="Téléphone" value={emp.phone ?? "—"}/>
                <Row label="Email" value={emp.email ?? "—"}/>
              </InfoCard>
            )}

            <InfoCard title="Modes de règlement">
              <Row label="Mode de paiement" value={s.paymentMethod ?? "—"}/>
              <Row label="Délai paiement" value={s.paymentTerms ? s.paymentTerms + " jours" : "—"}/>
              {s.bankName && <Row label="Banque" value={s.bankName}/>}
              {s.bankAccount && <Row label="N° compte" value={s.bankAccount}/>}
            </InfoCard>
          </div>
        )}

        {/* ── COORDONNÉES ── */}
        {activeTab === "contacts" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <InfoCard title="Adresse">
              {s.address && <Row label="Adresse" value={s.address}/>}
              {s.city && <Row label="Ville" value={s.city}/>}
              <Row label="Région" value={s.region || "—"}/>
              <Row label="Pays" value={s.country ?? "Madagascar"}/>
              {s.address || s.city
                ? <a href={`https://maps.google.com/?q=${encodeURIComponent([s.address, s.city, s.country].filter(Boolean).join(", "))}`}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline mt-2">
                    <MapPin className="w-3 h-3"/>Voir sur la carte
                  </a>
                : null}
            </InfoCard>

            <InfoCard title="Contacts">
              {s.phone && (
                <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
                  <Phone className="w-3.5 h-3.5 text-gray-400"/>
                  <a href={`tel:${s.phone}`} className="text-sm text-blue-600 hover:underline">{s.phone}</a>
                  <span className="text-xs text-gray-400">Tél</span>
                </div>
              )}
              {s.mobile && (
                <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
                  <Phone className="w-3.5 h-3.5 text-gray-400"/>
                  <a href={`tel:${s.mobile}`} className="text-sm text-blue-600 hover:underline">{s.mobile}</a>
                  <span className="text-xs text-gray-400">Mobile</span>
                </div>
              )}
              {s.whatsapp && (
                <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
                  <Phone className="w-3.5 h-3.5 text-green-500"/>
                  <a href={`https://wa.me/${s.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                    className="text-sm text-green-600 hover:underline">{s.whatsapp}</a>
                  <span className="text-xs text-gray-400">WhatsApp</span>
                </div>
              )}
              {s.email && (
                <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
                  <Mail className="w-3.5 h-3.5 text-gray-400"/>
                  <a href={`mailto:${s.email}`} className="text-sm text-blue-600 hover:underline">{s.email}</a>
                </div>
              )}
              {s.website && (
                <div className="flex items-center gap-2 py-1.5">
                  <Globe className="w-3.5 h-3.5 text-gray-400"/>
                  <a href={s.website.startsWith("http") ? s.website : `https://${s.website}`} target="_blank" rel="noreferrer"
                    className="text-sm text-blue-600 hover:underline truncate">{s.website}</a>
                </div>
              )}
              {!s.phone && !s.email && !s.mobile && (
                <p className="text-gray-300 text-sm py-4 text-center">Aucun contact renseigné</p>
              )}
            </InfoCard>
          </div>
        )}

        {/* ── COMPTABILITÉ ── */}
        {activeTab === "accounting" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Compte fournisseur", value: "401 — Fournisseurs", cls: "text-gray-900" },
                { label: "Total achats", value: fmt(accounting.totalAchats) + " Ar", cls: "text-gray-800" },
                { label: "Solde journal 401", value: fmt(accounting.solde) + " Ar", cls: accounting.solde > 0 ? "text-red-600" : "text-emerald-700" },
                { label: "Nb livraisons", value: s.purchaseCount, cls: "text-blue-700" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className={`text-lg font-bold ${cls}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Détail journal compte 401</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Débit (paiements)</p>
                  <p className="font-mono font-bold text-blue-700 text-lg">{fmt(accounting.totalDebit)} Ar</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Crédit (factures)</p>
                  <p className="font-mono font-bold text-orange-600 text-lg">{fmt(accounting.totalCredit)} Ar</p>
                </div>
                <div className={`rounded-lg p-3 ${accounting.solde > 0 ? "bg-red-50" : "bg-emerald-50"}`}>
                  <p className="text-xs text-gray-500">Solde (dettes)</p>
                  <p className={`font-mono font-bold text-lg ${accounting.solde > 0 ? "text-red-600" : "text-emerald-700"}`}>{fmt(Math.abs(accounting.solde))} Ar</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
              <p><strong>PCG 2005 :</strong> Les achats de matières premières (vanille) sont comptabilisés :</p>
              <p className="mt-1">→ Débit <strong>601/602</strong> (Achats) · Débit <strong>44566</strong> (TVA déductible) · Crédit <strong>401</strong> (Fournisseur)</p>
              <p className="mt-1">→ Paiement : Débit <strong>401</strong> · Crédit <strong>512</strong> (Banque) / <strong>53</strong> (Caisse)</p>
            </div>
          </div>
        )}

        {/* ── ACHATS ── */}
        {activeTab === "purchases" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-800">Historique des achats ({purchases.length})</h3>
              <button onClick={() => navigate("/purchases")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700">
                <Plus className="w-3.5 h-3.5"/>Nouvel achat
              </button>
            </div>
            {purchases.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200 text-gray-300">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30"/>
                <p>Aucun achat enregistré pour ce fournisseur</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {["Date", "Montant", "Poids (kg)", "Prix / kg", "Humidité", "Mode paiement", "Lot", ""].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {purchases.map((p: any) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDate(p.created_at)}</td>
                        <td className="px-4 py-2.5 font-mono font-bold text-gray-800">{fmt(p.total_amount)} Ar</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{p.weight} kg</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{fmt(p.price_per_kg)} Ar</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${p.humidity < 40 ? "bg-green-100 text-green-700" : p.humidity < 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>
                            {p.humidity}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">{p.payment_method}</td>
                        <td className="px-4 py-2.5 text-xs">
                          {p.lot_number
                            ? <span className="font-mono text-blue-700">{p.lot_number}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {p.lot_status && (
                            <span className={`px-1.5 py-0.5 rounded text-xs ${p.lot_status === "ready" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                              {p.lot_status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td className="px-4 py-2.5 text-xs font-bold text-gray-700 uppercase">Total</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-gray-900">{fmt(purchases.reduce((s: number, p: any) => s + Number(p.total_amount), 0))} Ar</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-gray-700">{purchases.reduce((s: number, p: any) => s + Number(p.weight), 0).toFixed(1)} kg</td>
                      <td colSpan={5}/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── QUALITÉ ── */}
        {activeTab === "quality" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 self-start">Score qualité global</h3>
              <ScoreGauge score={s.qualityScore ?? s.score}/>
              <div className="mt-4 w-full space-y-2">
                {[
                  { label: "Score de base", value: s.score, max: 100 },
                  { label: "Humidité moy.", value: s.avgHumidity != null ? Math.max(0, 100 - (s.avgHumidity - 30) * 3) : null, max: 100 },
                  { label: "Nb livraisons", value: Math.min(100, (s.purchaseCount ?? 0) * 20), max: 100 },
                ].map(({ label, value, max }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-medium">{value != null ? `${Math.round(value)}/${max}` : "—"}</span>
                    </div>
                    {value != null && (
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(value / max) * 100}%` }}/>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Métriques vanille</h3>
              {s.avgHumidity != null ? (
                <>
                  <div className={`p-3 rounded-lg border ${s.avgHumidity < 40 ? "bg-green-50 border-green-200" : s.avgHumidity < 48 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
                    <p className="text-xs text-gray-500 mb-0.5">Humidité moyenne</p>
                    <p className={`text-2xl font-bold ${s.avgHumidity < 40 ? "text-green-700" : s.avgHumidity < 48 ? "text-amber-600" : "text-red-600"}`}>
                      {s.avgHumidity.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {s.avgHumidity < 35 ? "Excellent — très bonne qualité" : s.avgHumidity < 40 ? "Bonne qualité" : s.avgHumidity < 45 ? "Qualité acceptable" : "Qualité à surveiller"}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                    <p className="font-medium mb-1">Référentiel qualité vanille :</p>
                    <p>• &lt; 35% humidité : Excellent (Prime qualité)</p>
                    <p>• 35–40% : Bonne qualité (Norme export)</p>
                    <p>• 40–45% : Acceptable (Surveillance)</p>
                    <p>• &gt; 45% : Risque moisissure (Refus possible)</p>
                  </div>
                </>
              ) : (
                <p className="text-gray-300 text-sm text-center py-8">Aucune donnée de qualité disponible</p>
              )}
              <InfoCard title="Livraisons">
                <Row label="Nombre total" value={s.purchaseCount ?? 0}/>
                <Row label="Poids total" value={s.totalWeight ? fmt(s.totalWeight) + " kg" : "—"}/>
                <Row label="Dernière livraison" value={fmtDate(s.lastPurchaseDate)}/>
              </InfoCard>
            </div>
          </div>
        )}

        {/* ── NOTES ── */}
        {activeTab === "notes" && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Ajouter une note interne</h3>
              <div className="flex gap-2 mb-3">
                {Object.entries(NOTE_TYPES).map(([k, v]) => (
                  <button key={k} onClick={() => setNoteType(k)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${noteType === k ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {v}
                  </button>
                ))}
              </div>
              <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)}
                rows={3} placeholder="Saisir une note interne…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"/>
              <button
                onClick={() => noteContent.trim() && addNote.mutate({ content: noteContent, type: noteType })}
                disabled={!noteContent.trim() || addNote.isPending}
                className="mt-2 flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40">
                <Plus className="w-3.5 h-3.5"/>
                {addNote.isPending ? "Enregistrement…" : "Ajouter la note"}
              </button>
            </div>

            <div className="space-y-3">
              {notes.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-300">
                  <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30"/>
                  <p>Aucune note pour ce fournisseur</p>
                </div>
              ) : notes.map((n: any) => (
                <div key={n.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${n.type === "incident" ? "bg-red-100 text-red-600" : n.type === "quality" ? "bg-green-100 text-green-700" : n.type === "payment" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                      {NOTE_TYPES[n.type] ?? n.type}
                    </span>
                    <span className="text-xs text-gray-400">{fmtDt(n.createdAt)}</span>
                    <span className="text-xs text-gray-400 ml-auto">par {n.author}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="p-5 space-y-0">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-medium text-gray-800 text-right max-w-48 truncate">{value ?? "—"}</span>
    </div>
  );
}
