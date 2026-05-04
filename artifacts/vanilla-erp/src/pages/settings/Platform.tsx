import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2, MapPin, FileText, DollarSign, Palette, Settings,
  Save, Loader2, Upload, ExternalLink, RefreshCw, Mail, Bell, ToggleLeft,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PlatformSetting {
  id: string;
  settingKey: string;
  settingValue: string | null;
  settingType: string;
  category: string;
  label: string;
  description: string | null;
  isPublic: boolean;
}

type SettingsMap = Record<string, string>;

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS = [
  { key: "company",       label: "Entreprise",    icon: Building2 },
  { key: "contact",       label: "Coordonnées",   icon: MapPin },
  { key: "legal",         label: "Fiscalité",     icon: FileText },
  { key: "finance",       label: "Finance",       icon: DollarSign },
  { key: "branding",      label: "Branding",      icon: Palette },
  { key: "email",         label: "Emails",        icon: Mail },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "features",      label: "Fonctionnalités", icon: ToggleLeft },
  { key: "system",        label: "Système",       icon: Settings },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any).error ?? r.statusText);
  return j;
}

// ─── Field components ────────────────────────────────────────────────────────
const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition";

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isValid = /^#[0-9A-Fa-f]{6}$/.test(value);
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <input type="color" value={isValid ? value : "#000000"} onChange={e => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5 bg-white" />
      </div>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="#1a6c3c"
        className={`${inputCls} font-mono ${!isValid && value ? "border-red-400 focus:ring-red-400" : ""}`} />
      <div className="w-8 h-8 rounded-lg border border-gray-200 shrink-0" style={{ background: isValid ? value : "transparent" }} />
    </div>
  );
}

function FileUrlField({ value, onChange, onUpload, uploading }: {
  value: string; onChange: (v: string) => void;
  onUpload: (file: File) => void; uploading: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          placeholder="https://... ou laisser vide" className={`${inputCls} flex-1`} />
        <button type="button" onClick={() => ref.current?.click()}
          className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-xs hover:bg-gray-50 whitespace-nowrap shrink-0">
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          Uploader
        </button>
        {value && (
          <a href={value} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-xs hover:bg-gray-50 shrink-0">
            <ExternalLink className="h-3 w-3" /> Voir
          </a>
        )}
      </div>
      {value && /\.(png|jpg|jpeg|svg|webp)$/i.test(value) && (
        <div className="h-16 w-32 border border-gray-200 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
          <img src={value} alt="preview" className="max-h-14 max-w-30 object-contain" onError={e => (e.currentTarget.style.display = "none")} />
        </div>
      )}
      <input ref={ref} type="file" accept=".png,.jpg,.jpeg,.webp,.svg" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
    </div>
  );
}

function ToggleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const on = value === "true";
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(on ? "false" : "true")}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? "bg-emerald-600" : "bg-gray-300"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
      </button>
      <span className={`text-sm font-medium ${on ? "text-emerald-700" : "text-gray-500"}`}>{on ? "Activé" : "Désactivé"}</span>
    </div>
  );
}

// ─── Single setting field ────────────────────────────────────────────────────
function SettingField({ setting, value, onChange, onUpload, uploading }: {
  setting: PlatformSetting;
  value: string;
  onChange: (key: string, v: string) => void;
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-800">{setting.label}</label>
        {setting.isPublic && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-teal-50 text-teal-700 border border-teal-200 rounded">Public</span>
        )}
      </div>
      {setting.description && <p className="text-xs text-gray-400">{setting.description}</p>}

      {setting.settingType === "boolean" ? (
        <ToggleField value={value} onChange={v => onChange(setting.settingKey, v)} />
      ) : setting.settingType === "color" ? (
        <ColorField value={value} onChange={v => onChange(setting.settingKey, v)} />
      ) : setting.settingType === "file_url" ? (
        <FileUrlField value={value} onChange={v => onChange(setting.settingKey, v)} onUpload={onUpload} uploading={uploading} />
      ) : setting.settingType === "number" ? (
        <input type="number" value={value} onChange={e => onChange(setting.settingKey, e.target.value)} className={inputCls} />
      ) : setting.settingType === "email" ? (
        <input type="email" value={value} onChange={e => onChange(setting.settingKey, e.target.value)} className={inputCls} />
      ) : setting.settingType === "url" ? (
        <input type="url" value={value} onChange={e => onChange(setting.settingKey, e.target.value)} placeholder="https://" className={inputCls} />
      ) : (
        <input type="text" value={value} onChange={e => onChange(setting.settingKey, e.target.value)} className={inputCls} />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PlatformSettingsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("company");
  const [allSettings, setAllSettings] = useState<PlatformSetting[]>([]);
  const [values, setValues] = useState<SettingsMap>({});
  const [originalValues, setOriginalValues] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  // Load all settings
  useEffect(() => {
    apiFetch("/api/platform-settings")
      .then(({ settings }: { settings: PlatformSetting[] }) => {
        setAllSettings(settings);
        const map: SettingsMap = {};
        for (const s of settings) map[s.settingKey] = s.settingValue ?? "";
        setValues(map);
        setOriginalValues(map);
      })
      .catch(() => toast.error("Impossible de charger la configuration"))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  // Settings for the active tab
  const tabSettings = allSettings.filter(s => s.category === activeTab);

  // Find changed keys in this tab only
  const changedKeys = tabSettings
    .map(s => s.settingKey)
    .filter(k => values[k] !== originalValues[k]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: SettingsMap = {};
      for (const k of changedKeys) payload[k] = values[k];
      if (Object.keys(payload).length === 0) {
        toast("Aucune modification à enregistrer");
        setSaving(false);
        return;
      }
      await apiFetch("/api/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setOriginalValues(prev => ({ ...prev, ...payload }));
      qc.invalidateQueries({ queryKey: ["company-settings"] });
      qc.invalidateQueries({ queryKey: ["platform-settings"] });
      toast.success(`${Object.keys(payload).length} paramètre(s) enregistré(s)`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const r = await fetch("/api/platform-settings/logo", { method: "POST", credentials: "include", body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const url = j.logoUrl + "?t=" + Date.now();
      handleChange("logo_url", url);
      setOriginalValues(prev => ({ ...prev, logo_url: url }));
      qc.invalidateQueries({ queryKey: ["company-settings"] });
      toast.success("Logo uploadé");
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur upload logo");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleReset = () => {
    if (!confirm("Réinitialiser tous les champs de cet onglet aux valeurs originales ?")) return;
    const reset: SettingsMap = {};
    for (const s of tabSettings) reset[s.settingKey] = originalValues[s.settingKey] ?? "";
    setValues(prev => ({ ...prev, ...reset }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  const activeTabConfig = TABS.find(t => t.key === activeTab)!;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Configuration ERP</h1>
        <p className="text-sm text-gray-500 mt-1">Paramètres centralisés — utilisés partout dans l'ERP</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === key
                ? "bg-white shadow text-emerald-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50 rounded-t-xl">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <activeTabConfig.icon className="w-4 h-4 text-emerald-700" />
          </div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{activeTabConfig.label}</h2>
          {changedKeys.length > 0 && (
            <span className="ml-auto text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
              {changedKeys.length} modification(s)
            </span>
          )}
        </div>

        <div className="p-6">
          {/* Branding tab: logo preview panel */}
          {activeTab === "branding" && values["logo_url"] && (
            <div className="mb-6 p-4 bg-gray-800 rounded-xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden p-1 shrink-0">
                <img src={values["logo_url"]} alt="Logo preview" className="max-h-10 max-w-10 object-contain" />
              </div>
              <div>
                <div className="text-white font-semibold text-sm">{values["erp_name"] || "Vanilla ERP"}</div>
                <div className="text-white/60 text-xs">Aperçu sidebar</div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {tabSettings.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Aucun paramètre dans cette catégorie.</p>
            ) : (
              tabSettings.map(setting => (
                <SettingField
                  key={setting.settingKey}
                  setting={setting}
                  value={values[setting.settingKey] ?? ""}
                  onChange={handleChange}
                  onUpload={handleLogoUpload}
                  uploading={logoUploading}
                />
              ))
            )}
          </div>

          {/* Action buttons */}
          {tabSettings.length > 0 && (
            <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-100">
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Réinitialiser
              </button>
              <button
                onClick={handleSave}
                disabled={saving || changedKeys.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-sm"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Sauvegarde…" : changedKeys.length > 0 ? `Sauvegarder (${changedKeys.length})` : "Sauvegarder"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
