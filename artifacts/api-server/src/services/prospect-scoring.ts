interface ProspectInput {
  country?: string | null;
  source?: string | null;
  activityType?: string | null;
  estimatedVolume?: number | null;
  budgetRange?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  vatRegistered?: boolean;
  vatNumber?: string | null;
}

const PREMIUM_MARKETS = [
  "Germany", "France", "USA", "United States", "Netherlands", "Switzerland",
  "UK", "United Kingdom", "Belgium", "Japan", "Canada", "Hungary", "Hongrie",
  "Austria", "Autriche", "Italy", "Italie", "Spain", "Espagne",
];

const GOOD_MARKETS = [
  "Poland", "Pologne", "Czech Republic", "République tchèque", "Slovakia", "Slovaquie",
  "Romania", "Roumanie", "Bulgaria", "Bulgarie", "Croatia", "Croatie", "Slovenia", "Slovénie",
  "Portugal", "Ireland", "Irlande", "Denmark", "Danemark", "Sweden", "Suède",
  "Norway", "Norvège", "Finland", "Finlande", "Australia", "Australie",
  "New Zealand", "Nouvelle-Zélande", "UAE", "Émirats arabes unis",
  "Singapore", "Singapour", "South Korea", "Corée du Sud",
];

const SOURCE_SCORES: Record<string, number> = {
  referral: 25,
  kompass: 20,
  salon_sial: 20,
  salon_vivaness: 20,
  import_excel: 18,
  site_web: 15,
  web: 15,
  linkedin: 15,
  email_entrant: 15,
  salon: 18,
  manuel: 10,
};

const ACTIVITY_SCORES: Record<string, number> = {
  importateur: 20,
  distributeur: 18,
  transformateur: 15,
  industriel: 15,
  artisan: 12,
  autre: 5,
};

const BUDGET_SCORES: Record<string, number> = {
  plus_200: 10,
  "100_200": 8,
  "50_100": 5,
  moins_50: 2,
};

export function scoreProspect(p: ProspectInput): number {
  let score = 0;

  // Géographie (30 pts)
  const country = (p.country ?? "").trim();
  if (PREMIUM_MARKETS.some(m => country.toLowerCase().includes(m.toLowerCase()))) score += 30;
  else if (GOOD_MARKETS.some(m => country.toLowerCase().includes(m.toLowerCase()))) score += 22;
  else score += 12;

  // Source (25 pts max)
  score += SOURCE_SCORES[p.source ?? ""] ?? 10;

  // Activité (20 pts)
  score += ACTIVITY_SCORES[p.activityType ?? ""] ?? 5;

  // Volume (15 pts)
  const vol = p.estimatedVolume ?? 0;
  if (vol >= 5) score += 15;
  else if (vol >= 2) score += 10;
  else if (vol >= 0.5) score += 5;
  else score += 2;

  // Budget (10 pts)
  score += BUDGET_SCORES[p.budgetRange ?? ""] ?? 2;

  // Complétude contact (5 pts)
  const hasContact = p.email && p.phone && p.website;
  const hasVat = p.vatRegistered && p.vatNumber;
  if (hasContact && hasVat) score += 5;
  else if (hasContact) score += 3;
  else score += 1;

  return Math.min(score, 100);
}
