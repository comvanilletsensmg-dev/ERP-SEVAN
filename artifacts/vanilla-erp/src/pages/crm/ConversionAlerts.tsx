import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

interface ConversionAlert {
  id: string;
  prospectId: string;
  triggerType: string;
  triggerId?: string;
  status: string;
  score: number;
  prospectName: string;
  reason?: string;
  resolvedClientId?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  prospect?: { id: string; status: string; score: number; company: string } | null;
  client?: { id: string; clientCode?: string; name: string } | null;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, credentials: "include" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Erreur ${r.status}`);
  return data;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:   { label: "En attente",  color: "#b45309", bg: "#fef3c7", icon: "⏳" },
  converted: { label: "Converti",    color: "#059669", bg: "#d1fae5", icon: "✅" },
  dismissed: { label: "Ignoré",      color: "#6b7280", bg: "#f3f4f6", icon: "⊘" },
  escalated: { label: "Escaladé",    color: "#7c3aed", bg: "#ede9fe", icon: "🔺" },
};

const TRIGGER_LABELS: Record<string, string> = {
  deal: "Création deal", quote: "Création devis", manual: "Manuel",
};

function AlertCard({ alert, onAction }: { alert: ConversionAlert; onAction: () => void }) {
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState("");

  const convertMut = useMutation({
    mutationFn: () => apiFetch(`/api/crm/conversion-alerts/${alert.id}/convert`, { method: "POST" }),
    onSuccess: (data) => {
      setFeedback(`✅ Converti → ${data.clientCode ?? ""} ${data.clientName ?? ""}`);
      qc.invalidateQueries({ queryKey: ["crm-conversion-alerts"] });
      qc.invalidateQueries({ queryKey: ["crm-alert-count"] });
      qc.invalidateQueries({ queryKey: ["crm-clients"] });
      onAction();
    },
    onError: (e: Error) => setFeedback(`❌ ${e.message}`),
  });

  const dismissMut = useMutation({
    mutationFn: () => apiFetch(`/api/crm/conversion-alerts/${alert.id}/dismiss`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-conversion-alerts"] });
      qc.invalidateQueries({ queryKey: ["crm-alert-count"] });
    },
    onError: (e: Error) => setFeedback(`❌ ${e.message}`),
  });

  const escalateMut = useMutation({
    mutationFn: () => apiFetch(`/api/crm/conversion-alerts/${alert.id}/escalate`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-conversion-alerts"] }),
    onError: (e: Error) => setFeedback(`❌ ${e.message}`),
  });

  const status = STATUS_CONFIG[alert.status] ?? STATUS_CONFIG.pending;
  const isPending = alert.status === "pending" || alert.status === "escalated";

  return (
    <div className={`bg-white rounded-xl border-l-4 shadow-sm overflow-hidden ${
      alert.status === "pending" ? "border-amber-400" :
      alert.status === "escalated" ? "border-purple-400" :
      alert.status === "converted" ? "border-green-400" : "border-gray-300"
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: status.color, backgroundColor: status.bg }}>
                {status.icon} {status.label}
              </span>
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                {TRIGGER_LABELS[alert.triggerType] ?? alert.triggerType}
              </span>
              <span className="text-xs text-gray-400">{new Date(alert.createdAt).toLocaleDateString("fr-FR")}</span>
            </div>

            <h3 className="font-bold text-[#1a3c2a] text-base">{alert.prospectName}</h3>

            {/* Score bar */}
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${
                  alert.score >= 60 ? "bg-green-500" : alert.score >= 40 ? "bg-amber-500" : "bg-red-400"
                }`} style={{ width: `${Math.min(alert.score, 100)}%` }} />
              </div>
              <span className={`text-sm font-bold tabular-nums ${
                alert.score >= 60 ? "text-green-600" : alert.score >= 40 ? "text-amber-600" : "text-red-500"
              }`}>{alert.score}/100</span>
            </div>

            {alert.reason && (
              <p className="mt-2 text-xs text-gray-500 bg-amber-50 rounded px-2 py-1 border border-amber-100">
                ⚠ {alert.reason}
              </p>
            )}

            {alert.status === "converted" && alert.client && (
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xs text-green-700">Client créé :</p>
                <Link href={`/crm/clients/${alert.client.id}`}>
                  <span className="text-xs font-mono bg-green-100 text-green-800 px-2 py-0.5 rounded cursor-pointer hover:underline">
                    {alert.client.clientCode ?? "—"} — {alert.client.name}
                  </span>
                </Link>
              </div>
            )}
          </div>

          {/* Actions */}
          {isPending && (
            <div className="flex flex-col gap-1.5 shrink-0">
              <button onClick={() => convertMut.mutate()} disabled={convertMut.isPending}
                className="px-3 py-1.5 bg-[#1a3c2a] text-white rounded-lg text-xs font-medium disabled:opacity-50 hover:bg-[#2d5a3f] whitespace-nowrap">
                {convertMut.isPending ? "..." : "✓ Convertir"}
              </button>
              <Link href={`/crm/prospects/${alert.prospectId}`}>
                <button className="w-full px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50 whitespace-nowrap">
                  Voir prospect
                </button>
              </Link>
              {alert.status !== "escalated" && (
                <button onClick={() => escalateMut.mutate()} disabled={escalateMut.isPending}
                  className="px-3 py-1.5 border border-purple-200 text-purple-600 rounded-lg text-xs hover:bg-purple-50 whitespace-nowrap">
                  🔺 Escalader
                </button>
              )}
              <button onClick={() => dismissMut.mutate()} disabled={dismissMut.isPending}
                className="px-3 py-1.5 border border-red-100 text-red-400 rounded-lg text-xs hover:bg-red-50 whitespace-nowrap">
                Ignorer
              </button>
            </div>
          )}
        </div>

        {feedback && (
          <div className={`mt-2 text-xs px-2 py-1 rounded ${feedback.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {feedback}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConversionAlerts() {
  const [filterStatus, setFilterStatus] = useState("pending");
  const qc = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery<ConversionAlert[]>({
    queryKey: ["crm-conversion-alerts", filterStatus],
    queryFn: () => apiFetch(`/api/crm/conversion-alerts${filterStatus ? `?status=${filterStatus}` : ""}`),
    refetchInterval: 30_000,
  });

  const pending = alerts.filter(a => a.status === "pending").length;
  const escalated = alerts.filter(a => a.status === "escalated").length;
  const converted = alerts.filter(a => a.status === "converted").length;

  return (
    <div className="min-h-screen bg-[#faf6ef]">
      {/* Header */}
      <div className="bg-white border-b border-amber-100 px-6 py-5">
        <h1 className="text-2xl font-bold text-[#1a3c2a]">Alertes de conversion</h1>
        <p className="text-sm text-gray-500 mt-1">Prospects à qualifier manuellement avant conversion client</p>

        {/* Stats */}
        <div className="flex gap-4 mt-4 flex-wrap">
          {[
            { label: "En attente", value: pending, warn: pending > 0, key: "pending" },
            { label: "Escaladés",  value: escalated, warn: escalated > 0, key: "escalated" },
            { label: "Convertis",  value: converted, warn: false, key: "converted" },
          ].map(s => (
            <button key={s.key} onClick={() => setFilterStatus(s.key)}
              className={`rounded-lg border px-4 py-2 text-center min-w-[110px] transition-colors ${
                filterStatus === s.key ? "bg-[#1a3c2a] text-white border-[#1a3c2a]" :
                s.warn ? "border-amber-200 bg-amber-50 hover:bg-amber-100" : "border-amber-100 bg-white hover:bg-amber-50"
              }`}>
              <p className={`text-xl font-bold ${filterStatus === s.key ? "text-white" : s.warn ? "text-amber-700" : "text-[#1a3c2a]"}`}>{s.value}</p>
              <p className={`text-xs ${filterStatus === s.key ? "text-white/80" : "text-gray-500"}`}>{s.label}</p>
            </button>
          ))}
          <button onClick={() => setFilterStatus("")}
            className={`rounded-lg border px-4 py-2 text-center min-w-[110px] transition-colors ${filterStatus === "" ? "bg-[#1a3c2a] text-white border-[#1a3c2a]" : "border-amber-100 bg-white hover:bg-amber-50"}`}>
            <p className={`text-xl font-bold ${filterStatus === "" ? "text-white" : "text-[#1a3c2a]"}`}>{alerts.length || "—"}</p>
            <p className={`text-xs ${filterStatus === "" ? "text-white/80" : "text-gray-500"}`}>Tout voir</p>
          </button>
        </div>
      </div>

      {/* How it works banner */}
      <div className="mx-6 mt-5 bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2">⚙ Fonctionnement automatique</h3>
        <div className="flex gap-6 flex-wrap text-xs text-blue-700">
          <span>🟢 <strong>Score ≥ 60 + Qualifié</strong> → Conversion silencieuse + code CLI-XXXX créé</span>
          <span>🟡 <strong>Score &lt; 60 ou non qualifié</strong> → Alerte créée ici pour traitement manuel</span>
          <span>🔺 <strong>Escalade</strong> → Notifie le Super Admin pour décision</span>
        </div>
      </div>

      {/* Alerts list */}
      <div className="p-6 space-y-3">
        {isLoading && <div className="text-center py-20 text-gray-400">Chargement...</div>}
        {!isLoading && alerts.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">🎉</p>
            <p className="text-gray-500 font-medium">
              {filterStatus === "pending" ? "Aucune alerte en attente — tout est traité !" : "Aucune alerte dans cette catégorie"}
            </p>
          </div>
        )}
        {alerts.map(a => (
          <AlertCard key={a.id} alert={a} onAction={() => qc.invalidateQueries({ queryKey: ["crm-conversion-alerts"] })} />
        ))}
      </div>
    </div>
  );
}
