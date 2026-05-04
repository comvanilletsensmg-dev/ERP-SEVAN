/**
 * useCountry — returns the country configuration derived from the
 * `country_mode` platform setting (cached via TanStack Query).
 *
 * Usage:
 *   const country = useCountry();
 *   country.currency       // "MGA"
 *   country.modules.vat    // false
 *   country.fields.fiscal  // ["company_nif", ...]
 */
import { usePlatformSettings } from "./use-platform-settings";
import { getCountryConfig, type CountryConfig } from "../config/countries";

export function useCountry(): CountryConfig {
  const { getSetting } = usePlatformSettings();
  const mode = getSetting("country_mode", "MADAGASCAR");
  return getCountryConfig(mode);
}
