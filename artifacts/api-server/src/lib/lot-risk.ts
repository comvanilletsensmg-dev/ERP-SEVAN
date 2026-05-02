/**
 * Vanilla lot risk computation.
 * Pure function — easy to unit test, share between routes & cron.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RiskInput {
  humidity: number;
  weightInitial: number;
  weightCurrent: number;
  status: string;
  createdAt: Date | string;
  history: { humidity: number; createdAt: Date | string }[];
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  reasons: string[];
  suggestions: string[];
  shouldBlock: boolean;
  blockedReason: string | null;
}

const HUMIDITY_CRITICAL = 35; // > 35% blocks export
const WEIGHT_LOSS_PCT = 10;   // > 10% loss is suspicious
const HUMIDITY_DELTA = 5;     // > 5% variation is suspicious
const CURING_MAX_DAYS = 30;

const PHENOLED = ["PHENOLED", "MOLDY"]; // statuses that forbid sale

function normalize(s: string): string {
  const u = s.toUpperCase();
  if (u === "DRYING") return "SORTING";
  if (u === "SOLD") return "SHIPPED";
  return u;
}

export function calculateRisk(lot: RiskInput): RiskResult {
  const reasons: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  const status = normalize(lot.status);

  // Humidity rule
  if (lot.humidity > HUMIDITY_CRITICAL) {
    score += 40;
    reasons.push(`Humidité critique ${lot.humidity.toFixed(1)}% (> ${HUMIDITY_CRITICAL}%)`);
    suggestions.push("Sécher davantage avant transformation suivante");
  }

  // Humidity variation across history
  if (lot.history.length >= 2) {
    const sorted = [...lot.history].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const min = Math.min(...sorted.map((h) => h.humidity));
    const max = Math.max(...sorted.map((h) => h.humidity));
    if (max - min > HUMIDITY_DELTA) {
      score += 20;
      reasons.push(`Variation d'humidité ${(max - min).toFixed(1)}% (> ${HUMIDITY_DELTA}%)`);
      suggestions.push("Vérifier les conditions de stockage (ventilation, hygrométrie)");
    }
  }

  // Weight loss
  if (lot.weightInitial > 0) {
    const lossPct = ((lot.weightInitial - lot.weightCurrent) / lot.weightInitial) * 100;
    if (lossPct > WEIGHT_LOSS_PCT) {
      score += 20;
      reasons.push(`Perte de poids ${lossPct.toFixed(1)}% (> ${WEIGHT_LOSS_PCT}%)`);
      suggestions.push("Inspecter le lot pour pertes anormales (siphonage, vol, déshydratation)");
    }
  }

  // Curing too long
  if (status === "CURING") {
    const daysInCuring = Math.floor(
      (Date.now() - new Date(lot.createdAt).getTime()) / 86_400_000
    );
    if (daysInCuring > CURING_MAX_DAYS) {
      score += 20;
      reasons.push(`Étuvage depuis ${daysInCuring} jours (> ${CURING_MAX_DAYS})`);
      suggestions.push("Faire avancer le lot vers la phase de tri/séchage");
    }
  }

  // Final
  score = Math.min(100, Math.max(0, score));
  const level: RiskLevel = score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";

  // Blocking conditions
  let shouldBlock = false;
  let blockedReason: string | null = null;
  if (PHENOLED.includes(status)) {
    shouldBlock = true;
    blockedReason = `Vente interdite — statut ${status}`;
  } else if (lot.humidity > HUMIDITY_CRITICAL) {
    shouldBlock = true;
    blockedReason = `Humidité ${lot.humidity.toFixed(1)}% > ${HUMIDITY_CRITICAL}% — export bloqué`;
  } else if (lot.weightCurrent <= 0) {
    shouldBlock = true;
    blockedReason = "Poids nul ou négatif — lot invalide";
  } else if (level === "HIGH") {
    shouldBlock = true;
    blockedReason = `Score de risque ${score} (élevé)`;
  }

  return { score, level, reasons, suggestions, shouldBlock, blockedReason };
}

// ─── Status transitions ───────────────────────────────────────────────────────

export const STATUSES = [
  "RAW",
  "CURING",
  "SORTING",
  "READY",
  "AVAILABLE",
  "SHIPPED",
  "PHENOLED",
  "MOLDY",
  "DOWNGRADED",
] as const;
export type LotStatus = (typeof STATUSES)[number];

const FORWARD: Record<string, string[]> = {
  RAW: ["CURING"],
  CURING: ["SORTING"],
  SORTING: ["READY"],
  READY: ["AVAILABLE"],
  AVAILABLE: ["SHIPPED"],
  SHIPPED: [], // terminal
  PHENOLED: ["DOWNGRADED"],
  MOLDY: ["DOWNGRADED"],
  DOWNGRADED: [], // terminal
};

const EXCEPTION_TARGETS: LotStatus[] = ["PHENOLED", "MOLDY", "DOWNGRADED"];

export function isValidTransition(from: string, to: string): boolean {
  const f = normalize(from);
  const t = normalize(to);
  if (!STATUSES.includes(t as LotStatus)) return false;
  if (f === t) return true; // same-status updates allowed (note/measure refresh)
  if (FORWARD[f]?.includes(t)) return true;
  // Any non-terminal → exception
  if (EXCEPTION_TARGETS.includes(t as LotStatus) && !["SHIPPED", "DOWNGRADED"].includes(f)) {
    return true;
  }
  return false;
}

export function normalizeStatus(s: string): string {
  return normalize(s);
}
