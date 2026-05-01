import { useState, useCallback, useEffect } from "react";
import {
  getFormLabels,
  validateTaxField,
  formatTaxField,
  hasVat,
  type FormLabels,
} from "../config/countryTax";

export interface TaxErrors {
  proId1?: string | null;
  proId2?: string | null;
  vat?: string | null;
}

export function useTaxValidation(countryCode?: string | null) {
  const [labels, setLabels] = useState<FormLabels>(() => getFormLabels(countryCode));
  const [errors, setErrors] = useState<TaxErrors>({});
  const [showVat, setShowVat] = useState(() => hasVat(countryCode));

  useEffect(() => {
    const config = getFormLabels(countryCode);
    setLabels(config);
    setShowVat(config.showVat);
    setErrors({});
  }, [countryCode]);

  const validateField = useCallback(
    (fieldName: "proId1" | "proId2" | "vat", value?: string | null): boolean => {
      const result = validateTaxField(countryCode, fieldName, value);
      setErrors((prev) => ({ ...prev, [fieldName]: result.valid ? null : result.message }));
      return result.valid;
    },
    [countryCode]
  );

  const formatField = useCallback(
    (fieldName: "proId1" | "proId2" | "vat", value?: string | null): string => {
      return formatTaxField(countryCode, fieldName, value);
    },
    [countryCode]
  );

  const validateAll = useCallback(
    (data: { proId1?: string | null; proId2?: string | null; vat?: string | null }): boolean => {
      const newErrors: TaxErrors = {};
      let isValid = true;

      (["proId1", "proId2"] as const).forEach((field) => {
        const result = validateTaxField(countryCode, field, data[field]);
        if (!result.valid) {
          newErrors[field] = result.message;
          isValid = false;
        }
      });

      if (showVat) {
        const result = validateTaxField(countryCode, "vat", data.vat);
        if (!result.valid) {
          newErrors.vat = result.message;
          isValid = false;
        }
      }

      setErrors(newErrors);
      return isValid;
    },
    [countryCode, showVat]
  );

  return { labels, errors, showVat, validateField, formatField, validateAll };
}
