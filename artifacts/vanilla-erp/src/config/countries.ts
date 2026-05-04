export type CountryMode = "MADAGASCAR" | "EUROPE" | "AFRICA";

export interface CountryConfig {
  flag: string;
  label: string;
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  taxSystem: string;
  locale: string;
  modules: {
    payroll: boolean;
    export: boolean;
    vat: boolean;
    cnaps: boolean;
  };
  fields: {
    fiscal: string[];
    fiscalLabels: Record<string, string>;
  };
  payroll: {
    socialContributions: { key: string; label: string; rate: number }[];
  };
}

export const COUNTRY_CONFIG: Record<CountryMode, CountryConfig> = {
  MADAGASCAR: {
    flag: "🇲🇬",
    label: "Madagascar",
    currency: "MGA",
    currencySymbol: "Ar",
    dateFormat: "DD/MM/YYYY",
    taxSystem: "NIF_STAT",
    locale: "fr-MG",
    modules: {
      payroll: true,
      export: true,
      vat: false,
      cnaps: true,
    },
    fields: {
      fiscal: ["company_nif", "company_stat", "company_rcs"],
      fiscalLabels: {
        company_nif: "NIF",
        company_stat: "STAT",
        company_rcs: "RCS",
      },
    },
    payroll: {
      socialContributions: [
        { key: "cnaps",  label: "CNAPS",  rate: 0.13 },
        { key: "ostie",  label: "OSTIE",  rate: 0.05 },
        { key: "irsa",   label: "IRSA",   rate: 0.00 },
      ],
    },
  },

  EUROPE: {
    flag: "🇪🇺",
    label: "Europe",
    currency: "EUR",
    currencySymbol: "€",
    dateFormat: "DD-MM-YYYY",
    taxSystem: "VAT",
    locale: "fr-FR",
    modules: {
      payroll: true,
      export: true,
      vat: true,
      cnaps: false,
    },
    fields: {
      fiscal: ["company_vat", "company_registration", "company_eori"],
      fiscalLabels: {
        company_vat: "N° TVA",
        company_registration: "N° entreprise",
        company_eori: "EORI",
      },
    },
    payroll: {
      socialContributions: [
        { key: "urssaf",     label: "URSSAF",     rate: 0.2215 },
        { key: "retraite",   label: "Retraite",   rate: 0.065 },
        { key: "assurance",  label: "Assurance chômage", rate: 0.024 },
      ],
    },
  },

  AFRICA: {
    flag: "🌍",
    label: "Afrique",
    currency: "USD",
    currencySymbol: "$",
    dateFormat: "DD/MM/YYYY",
    taxSystem: "TAX_ID",
    locale: "fr-CI",
    modules: {
      payroll: true,
      export: true,
      vat: false,
      cnaps: false,
    },
    fields: {
      fiscal: ["company_tax_id", "company_rccm", "company_import_license"],
      fiscalLabels: {
        company_tax_id: "Tax ID",
        company_rccm: "RCCM",
        company_import_license: "Licence import/export",
      },
    },
    payroll: {
      socialContributions: [
        { key: "cnss",    label: "CNSS",    rate: 0.14 },
        { key: "taxe_ap", label: "Taxe AP", rate: 0.015 },
      ],
    },
  },
};

export function getCountryConfig(mode: string): CountryConfig {
  return COUNTRY_CONFIG[(mode as CountryMode)] ?? COUNTRY_CONFIG.MADAGASCAR;
}

export const COUNTRY_OPTIONS = (Object.keys(COUNTRY_CONFIG) as CountryMode[]).map(k => ({
  value: k,
  ...COUNTRY_CONFIG[k],
}));
