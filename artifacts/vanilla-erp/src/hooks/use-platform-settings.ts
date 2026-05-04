/**
 * usePlatformSettings — React hook to read ERP platform settings.
 * Fetches from /api/platform-settings and caches in TanStack Query (5 min stale).
 *
 * Usage:
 *   const { getSetting, settings } = usePlatformSettings();
 *   const name = getSetting("company_name", "Vanilla ERP");
 */
import { useQuery } from "@tanstack/react-query";

type SettingsMap = Record<string, string>;

interface PlatformSetting {
  settingKey: string;
  settingValue: string | null;
}

async function fetchPlatformSettings(): Promise<SettingsMap> {
  const r = await fetch("/api/platform-settings", { credentials: "include" });
  if (!r.ok) return {};
  const { settings } = await r.json() as { settings: PlatformSetting[] };
  const map: SettingsMap = {};
  for (const s of settings) map[s.settingKey] = s.settingValue ?? "";
  return map;
}

export function usePlatformSettings() {
  const { data: settings = {}, isLoading } = useQuery<SettingsMap>({
    queryKey: ["platform-settings"],
    queryFn: fetchPlatformSettings,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  function getSetting(key: string, fallback = ""): string {
    return settings[key] ?? fallback;
  }

  function isFeatureEnabled(key: string): boolean {
    return getSetting(key) === "true";
  }

  return { settings, getSetting, isFeatureEnabled, isLoading };
}
