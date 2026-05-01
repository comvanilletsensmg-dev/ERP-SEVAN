interface LeadInput {
  country?: string | null;
  companySize?: number | null;
  industry?: string | null;
  website?: string | null;
}

const HIGH_VALUE_COUNTRIES = ["USA", "United States", "France", "Germany", "UK", "United Kingdom", "Japan", "Canada", "Netherlands", "Belgium", "Switzerland", "Australia", "Réunion"];
const EU_COUNTRIES = ["France", "Germany", "Netherlands", "Belgium", "Italy", "Spain", "Sweden", "Denmark", "Austria", "Finland", "Poland", "Portugal"];
const FOOD_KEYWORDS = ["food", "import", "export", "vanilla", "spice", "épice", "alimentaire", "agroalimentaire", "restaurant", "pastry", "boulangerie", "confiserie", "grocery", "gourmet", "organic", "bio", "flavour", "flavor", "ingredient"];

export function scoreLead(lead: LeadInput): { score: number; details: Record<string, number> } {
  const details: Record<string, number> = {};
  let score = 0;

  // Country criterion (+30 for USA, +25 for EU, +15 for other import countries)
  if (lead.country) {
    const c = lead.country.trim();
    if (c === "USA" || c === "United States") {
      details.country = 30; score += 30;
    } else if (EU_COUNTRIES.some(eu => c.toLowerCase().includes(eu.toLowerCase()))) {
      details.country = 25; score += 25;
    } else if (HIGH_VALUE_COUNTRIES.some(hv => c.toLowerCase().includes(hv.toLowerCase()))) {
      details.country = 15; score += 15;
    } else {
      details.country = 0;
    }
  } else {
    details.country = 0;
  }

  // Company size criterion (+20 if > 100 employees, +10 if > 20)
  if (lead.companySize) {
    if (lead.companySize >= 100) {
      details.companySize = 20; score += 20;
    } else if (lead.companySize >= 20) {
      details.companySize = 10; score += 10;
    } else {
      details.companySize = 5; score += 5;
    }
  } else {
    details.companySize = 0;
  }

  // Industry criterion (+30 for food/import related)
  if (lead.industry) {
    const ind = lead.industry.toLowerCase();
    const match = FOOD_KEYWORDS.some(kw => ind.includes(kw));
    if (match) {
      details.industry = 30; score += 30;
    } else {
      details.industry = 5; score += 5;
    }
  } else {
    details.industry = 0;
  }

  // Website presence (+10)
  if (lead.website && lead.website.trim().length > 3) {
    details.website = 10; score += 10;
  } else {
    details.website = 0;
  }

  return { score: Math.min(100, score), details };
}

export function getScoreLabel(score: number): string {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

export function getScoreColor(score: number): string {
  if (score >= 70) return "text-red-600 bg-red-50";
  if (score >= 40) return "text-amber-600 bg-amber-50";
  return "text-gray-500 bg-gray-50";
}
