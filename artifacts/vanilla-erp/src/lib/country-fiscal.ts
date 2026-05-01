export interface CountryFiscalConfig {
  proId1Label: string;
  proId2Label: string;
  showVat: boolean;
  vatLabel?: string;
  vatRegisteredLabel?: string;
}

const COUNTRY_CONFIG: Record<string, CountryFiscalConfig> = {
  FR: { proId1Label: "SIRET (14 chiffres)", proId2Label: "SIREN (9 chiffres)", showVat: true },
  DE: { proId1Label: "Handelsregisternummer", proId2Label: "Steuernummer", showVat: true },
  HU: { proId1Label: "Numéro d'entreprise (Cégjegyzékszám)", proId2Label: "Numéro de TVA hongrois (HU + 8 chiffres)", showVat: true },
  IT: { proId1Label: "Codice Fiscale", proId2Label: "Partita IVA", showVat: true },
  ES: { proId1Label: "NIF", proId2Label: "CIF", showVat: true },
  NL: { proId1Label: "KVK-nummer", proId2Label: "BTW-nummer", showVat: true },
  BE: { proId1Label: "Numéro d'entreprise", proId2Label: "TVA BE", showVat: true },
  CH: { proId1Label: "UID (Unternehmens-Identifikationsnummer)", proId2Label: "Numéro IDE", showVat: true },
  GB: { proId1Label: "Company Number", proId2Label: "VAT Registration Number", showVat: true },
  US: { proId1Label: "EIN (Employer Identification Number)", proId2Label: "DUNS Number", showVat: false },
  CA: { proId1Label: "Numéro d'entreprise (Business Number)", proId2Label: "Numéro de TPS/TVH", showVat: true, vatRegisteredLabel: "Enregistré TPS/TVH" },
  JP: { proId1Label: "法人番号 (Hōjin Bangō)", proId2Label: "事業者登録番号", showVat: false },
  AU: { proId1Label: "ABN (Australian Business Number)", proId2Label: "ACN (Australian Company Number)", showVat: true, vatLabel: "GST Registration" },
  AT: { proId1Label: "Firmenbuchnummer", proId2Label: "UID-Nummer", showVat: true },
  PL: { proId1Label: "KRS / REGON", proId2Label: "NIP", showVat: true },
  PT: { proId1Label: "NIPC", proId2Label: "NIF", showVat: true },
  SE: { proId1Label: "Organisationsnummer", proId2Label: "Momsregistreringsnummer", showVat: true },
  DK: { proId1Label: "CVR-nummer", proId2Label: "Momsregistreringsnummer", showVat: true },
  NO: { proId1Label: "Organisasjonsnummer", proId2Label: "MVA-nummer", showVat: true },
  SG: { proId1Label: "UEN (Unique Entity Number)", proId2Label: "", showVat: false },
};

const DEFAULT: CountryFiscalConfig = {
  proId1Label: "Numéro d'enregistrement commercial",
  proId2Label: "Autre identifiant",
  showVat: false,
};

export const COUNTRY_LIST = [
  { code: "FR", name: "France" }, { code: "DE", name: "Allemagne" }, { code: "HU", name: "Hongrie" },
  { code: "IT", name: "Italie" }, { code: "ES", name: "Espagne" }, { code: "NL", name: "Pays-Bas" },
  { code: "BE", name: "Belgique" }, { code: "CH", name: "Suisse" }, { code: "GB", name: "Royaume-Uni" },
  { code: "US", name: "États-Unis" }, { code: "CA", name: "Canada" }, { code: "JP", name: "Japon" },
  { code: "AU", name: "Australie" }, { code: "AT", name: "Autriche" }, { code: "PL", name: "Pologne" },
  { code: "PT", name: "Portugal" }, { code: "SE", name: "Suède" }, { code: "DK", name: "Danemark" },
  { code: "NO", name: "Norvège" }, { code: "SG", name: "Singapour" }, { code: "AE", name: "Émirats arabes unis" },
  { code: "MG", name: "Madagascar" }, { code: "MU", name: "Maurice" }, { code: "ZA", name: "Afrique du Sud" },
  { code: "KR", name: "Corée du Sud" }, { code: "CN", name: "Chine" }, { code: "IN", name: "Inde" },
  { code: "BR", name: "Brésil" }, { code: "MX", name: "Mexique" }, { code: "AR", name: "Argentine" },
  { code: "MA", name: "Maroc" }, { code: "TN", name: "Tunisie" }, { code: "EG", name: "Égypte" },
];

export function getCountryFiscal(code: string): CountryFiscalConfig {
  return COUNTRY_CONFIG[code] ?? DEFAULT;
}

export function getCountryName(code: string): string {
  return COUNTRY_LIST.find(c => c.code === code)?.name ?? code;
}
