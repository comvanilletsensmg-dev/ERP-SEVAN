import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2, MapPin, FileText, DollarSign, Palette, Settings,
  Save, Loader2, Upload, ExternalLink, RefreshCw, Mail, Bell, ToggleLeft, Globe, ImagePlus,
} from "lucide-react";
import { COUNTRY_OPTIONS, getCountryConfig } from "@/config/countries";

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

// ─── Currency fields ──────────────────────────────────────────────────────────
const CURRENCIES = [
  { code: "MGA", label: "Ariary malgache" },
  { code: "USD", label: "Dollar américain" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "Livre sterling" },
  { code: "JPY", label: "Yen japonais" },
  { code: "CHF", label: "Franc suisse" },
  { code: "CNY", label: "Yuan chinois" },
  { code: "AED", label: "Dirham émirati" },
  { code: "SGD", label: "Dollar de Singapour" },
  { code: "CAD", label: "Dollar canadien" },
  { code: "AUD", label: "Dollar australien" },
  { code: "INR", label: "Roupie indienne" },
  { code: "ZAR", label: "Rand sud-africain" },
  { code: "KES", label: "Shilling kényan" },
  { code: "TZS", label: "Shilling tanzanien" },
];

function CurrencySelectField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition">
      <option value="">— Choisir une devise —</option>
      {CURRENCIES.map(c => (
        <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
      ))}
    </select>
  );
}

function CurrencyMultiField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const selected = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];

  function toggle(code: string) {
    const next = selected.includes(code)
      ? selected.filter(c => c !== code)
      : [...selected, code];
    onChange(next.join(","));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {CURRENCIES.map(c => {
          const active = selected.includes(c.code);
          return (
            <button key={c.code} type="button" onClick={() => toggle(c.code)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors select-none
                ${active
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "bg-white border-gray-300 text-gray-500 hover:border-emerald-400 hover:text-emerald-600"
                }`}>
              <span>{c.code}</span>
              {active && <span className="text-xs opacity-75">✓</span>}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-gray-400">
          Sélectionnées : <span className="text-gray-600 font-medium">{selected.join(", ")}</span>
        </p>
      )}
    </div>
  );
}

// ─── Support hours field ──────────────────────────────────────────────────────
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

const HOURS = Array.from({ length: 25 }, (_, i) =>
  `${String(i).padStart(2, "0")}:00`
);

function parseSupportHours(raw: string): { days: string[]; start: string; end: string } {
  // Expected storage format: "Lun,Mar,Mer,Jeu,Ven|08:00-17:00"
  const [daysPart = "", timePart = ""] = raw.split("|");
  const days = daysPart ? daysPart.split(",").map(d => d.trim()).filter(Boolean) : [];
  const [start = "08:00", end = "17:00"] = timePart ? timePart.split("-") : [];
  return { days, start, end };
}

function serializeSupportHours(days: string[], start: string, end: string): string {
  return `${days.join(",")}|${start}-${end}`;
}

function SupportHoursField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parseSupportHours(value);
  const [days, setDays] = useState<string[]>(parsed.days);
  const [start, setStart] = useState(parsed.start || "08:00");
  const [end, setEnd] = useState(parsed.end || "17:00");

  function toggleDay(day: string) {
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    const ordered = DAYS.filter(d => next.includes(d));
    setDays(ordered);
    onChange(serializeSupportHours(ordered, start, end));
  }

  function updateStart(v: string) { setStart(v); onChange(serializeSupportHours(days, v, end)); }
  function updateEnd(v: string) { setEnd(v); onChange(serializeSupportHours(days, start, v)); }

  const selectCls = "border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white";

  return (
    <div className="space-y-3">
      {/* Days */}
      <div className="flex flex-wrap gap-2">
        {DAYS.map(day => {
          const active = days.includes(day);
          return (
            <button key={day} type="button" onClick={() => toggleDay(day)}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors select-none
                ${active
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "bg-white border-gray-300 text-gray-500 hover:border-emerald-400 hover:text-emerald-600"
                }`}>
              {day}
            </button>
          );
        })}
      </div>

      {/* Time range */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span className="font-medium">De</span>
        <select value={start} onChange={e => updateStart(e.target.value)} className={selectCls}>
          {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <span className="font-medium">à</span>
        <select value={end} onChange={e => updateEnd(e.target.value)} className={selectCls}>
          {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>

      {/* Preview */}
      {days.length > 0 && (
        <p className="text-xs text-gray-400">
          Affiché : <span className="text-gray-600 font-medium">
            {days.join(", ")} · {start.replace(":00", "h")}–{end.replace(":00", "h")}
          </span>
        </p>
      )}
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

      {setting.settingKey === "support_hours" ? (
        <SupportHoursField value={value} onChange={v => onChange(setting.settingKey, v)} />
      ) : setting.settingKey === "accepted_currencies" ? (
        <CurrencyMultiField value={value} onChange={v => onChange(setting.settingKey, v)} />
      ) : ["default_currency", "secondary_currency_1", "secondary_currency_2"].includes(setting.settingKey) ? (
        <CurrencySelectField value={value} onChange={v => onChange(setting.settingKey, v)} />
      ) : setting.settingType === "boolean" ? (
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

// ─── Branding tab ────────────────────────────────────────────────────────────
const BRANDING_KEYS = new Set(["logo_url", "erp_name", "platform_tagline", "primary_color", "accent_color", "favicon_url"]);

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
function luminance(r: number, g: number, b: number) {
  return [r, g, b].reduce((acc, c, i) => {
    const s = c / 255;
    return acc + (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
  }, 0);
}
function contrastRatio(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1), c2 = hexToRgb(hex2);
  if (!c1 || !c2) return 0;
  const l1 = luminance(...c1), l2 = luminance(...c2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
function ContrastBadge({ fg, bg }: { fg: string; bg: string }) {
  const r = contrastRatio(fg, bg);
  const label = r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA Large" : "Faible";
  const cls = r >= 4.5 ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : r >= 3 ? "bg-yellow-50 text-yellow-700 border-yellow-200"
    : "bg-red-50 text-red-700 border-red-200";
  return <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${cls}`}>{r.toFixed(1)}:1 {label}</span>;
}

const COLOR_PRESETS = [
  { name: "Vanille",  primary: "#1A1917", accent: "#185FA5" },
  { name: "Forêt",   primary: "#1A2E1A", accent: "#2D7A2D" },
  { name: "Océan",   primary: "#0F2744", accent: "#1565C0" },
  { name: "Terre",   primary: "#3B1F0A", accent: "#A0522D" },
  { name: "Ardoise", primary: "#1E293B", accent: "#475569" },
  { name: "Rubis",   primary: "#1A0A0A", accent: "#B91C1C" },
];

function BrandingTab({ values, onChange, onLogoUpload, uploading }: {
  values: SettingsMap;
  onChange: (key: string, val: string) => void;
  onLogoUpload: (file: File) => void;
  uploading: boolean;
}) {
  const logoRef = useRef<HTMLInputElement>(null);
  const primaryOk = /^#[0-9A-Fa-f]{6}$/.test(values["primary_color"] ?? "");
  const accentOk  = /^#[0-9A-Fa-f]{6}$/.test(values["accent_color"] ?? "");
  const primary   = primaryOk ? values["primary_color"] : "#1A1917";
  const accent    = accentOk  ? values["accent_color"]  : "#185FA5";

  // Live CSS var update while editing — no save needed
  useEffect(() => {
    if (primaryOk) document.documentElement.style.setProperty("--brand-primary", values["primary_color"]);
    if (accentOk)  document.documentElement.style.setProperty("--brand-accent",  values["accent_color"]);
  }, [values["primary_color"], values["accent_color"], primaryOk, accentOk]);

  return (
    <div className="grid grid-cols-[1fr_256px] gap-8 items-start">
      {/* ── Fields ── */}
      <div className="space-y-8">

        {/* Logo */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-800">Logo principal</p>
          <p className="text-xs text-gray-400">SVG ou PNG fond transparent — affiché dans la sidebar et les emails</p>
          <div className="flex gap-4 items-start">
            <div onClick={() => logoRef.current?.click()}
              className="relative w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 hover:border-emerald-400 cursor-pointer bg-gray-50 flex items-center justify-center overflow-hidden transition-colors group shrink-0">
              {values["logo_url"]
                ? <img src={values["logo_url"]} alt="Logo" className="max-w-[68px] max-h-[68px] object-contain" onError={e => (e.currentTarget.style.display = "none")} />
                : <div className="flex flex-col items-center gap-1 text-gray-300 group-hover:text-emerald-500 transition-colors">
                    <Upload className="w-5 h-5" /><span className="text-[9px]">PNG/SVG</span>
                  </div>
              }
              {uploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-emerald-600" /></div>}
            </div>
            <div className="flex-1 space-y-2">
              <input type="text" value={values["logo_url"] ?? ""} onChange={e => onChange("logo_url", e.target.value)}
                placeholder="https://... ou uploader" className={inputCls} />
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={() => logoRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs hover:bg-gray-50 transition">
                  <Upload className="w-3 h-3" /> Uploader fichier
                </button>
                {values["logo_url"] && (
                  <button type="button" onClick={() => onChange("logo_url", "")}
                    className="px-3 py-1.5 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 transition">
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          </div>
          <input ref={logoRef} type="file" accept=".png,.jpg,.jpeg,.webp,.svg" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onLogoUpload(f); e.target.value = ""; }} />
        </div>

        {/* Name + tagline */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-gray-800">Nom de l'ERP</p>
            <p className="text-xs text-gray-400">Titre navigateur + sidebar</p>
            <input type="text" value={values["erp_name"] ?? ""} onChange={e => onChange("erp_name", e.target.value)}
              placeholder="Vanilla ERP" className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-gray-800">Sous-titre sidebar</p>
            <p className="text-xs text-gray-400">Ligne sous le nom</p>
            <input type="text" value={values["platform_tagline"] ?? ""} onChange={e => onChange("platform_tagline", e.target.value)}
              placeholder="Madagascar Operations" className={inputCls} />
          </div>
        </div>

        {/* Colors */}
        <div className="space-y-4">
          <p className="text-sm font-semibold text-gray-800">Couleurs</p>
          {/* Presets */}
          <div>
            <p className="text-xs text-gray-400 mb-2">Palettes prédéfinies</p>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map(p => (
                <button key={p.name} type="button"
                  onClick={() => { onChange("primary_color", p.primary); onChange("accent_color", p.accent); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 rounded-lg hover:border-emerald-400 transition text-xs font-medium text-gray-600">
                  <span className="flex gap-0.5">
                    <span className="w-3.5 h-3.5 rounded-sm inline-block" style={{ background: p.primary }} />
                    <span className="w-3.5 h-3.5 rounded-sm inline-block" style={{ background: p.accent }} />
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          {/* Primary */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Couleur principale <span className="text-xs text-gray-400">(sidebar, fond)</span></p>
              {primaryOk && <ContrastBadge fg="#ffffff" bg={values["primary_color"]} />}
            </div>
            <ColorField value={values["primary_color"] ?? ""} onChange={v => onChange("primary_color", v)} />
          </div>
          {/* Accent */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Couleur d'accent <span className="text-xs text-gray-400">(boutons, liens, actif)</span></p>
              {accentOk && <ContrastBadge fg="#ffffff" bg={values["accent_color"]} />}
            </div>
            <ColorField value={values["accent_color"] ?? ""} onChange={v => onChange("accent_color", v)} />
          </div>
        </div>

        {/* Favicon */}
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-gray-800">Favicon</p>
          <p className="text-xs text-gray-400">PNG 32×32 ou ICO — URL directe (onglet navigateur)</p>
          <div className="flex gap-3 items-center">
            <div className="w-8 h-8 border border-gray-200 rounded bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden">
              {values["favicon_url"]
                ? <img src={values["favicon_url"]} alt="fav" className="w-6 h-6 object-contain" onError={e => (e.currentTarget.style.display = "none")} />
                : <Globe className="w-4 h-4 text-gray-300" />
              }
            </div>
            <input type="text" value={values["favicon_url"] ?? ""} onChange={e => onChange("favicon_url", e.target.value)}
              placeholder="https://exemple.com/favicon.png" className={`${inputCls} flex-1`} />
          </div>
        </div>
      </div>

      {/* ── Live preview ── */}
      <div className="sticky top-4 space-y-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Aperçu en direct</p>

        {/* Mini sidebar */}
        <div className="rounded-xl overflow-hidden shadow-md border border-gray-200">
          <div className="p-3 space-y-2.5" style={{ background: primary }}>
            <div className="flex items-center gap-2">
              {values["logo_url"]
                ? <img src={values["logo_url"]} alt="logo" className="w-7 h-7 object-contain rounded-md bg-white/10 p-0.5"
                    onError={e => (e.currentTarget.style.display = "none")} />
                : <div className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold text-white bg-white/15">
                    {(values["erp_name"] || "E").charAt(0).toUpperCase()}
                  </div>
              }
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-white truncate leading-tight">{values["erp_name"] || "Vanilla ERP"}</div>
                <div className="text-[9px] text-white/50 truncate">{values["platform_tagline"] || "Madagascar Operations"}</div>
              </div>
            </div>
            <div className="space-y-0.5">
              {["Tableau de bord", "Logistique", "CRM", "Facturation"].map((item, i) => (
                <div key={item} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px]"
                  style={i === 0 ? { background: accent, color: "#fff" } : { color: "rgba(255,255,255,0.55)" }}>
                  <div className="w-1.5 h-1.5 rounded-sm bg-current opacity-70" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          {/* Browser tab */}
          <div className="bg-gray-100 border-t border-gray-200 px-2.5 py-1.5 flex items-center gap-1.5">
            {values["favicon_url"]
              ? <img src={values["favicon_url"]} className="w-3.5 h-3.5 object-contain shrink-0" alt="fav" onError={e => (e.currentTarget.style.display = "none")} />
              : <div className="w-3.5 h-3.5 rounded-sm bg-gray-300 shrink-0" />
            }
            <span className="text-[10px] text-gray-500 truncate">{values["erp_name"] || "Vanilla ERP"}</span>
          </div>
        </div>

        {/* Color swatches */}
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Palette active</p>
          <div className="flex gap-1.5 mb-1.5">
            <div className="flex-1 h-7 rounded-md" style={{ background: primary }} />
            <div className="flex-1 h-7 rounded-md" style={{ background: accent }} />
            <div className="flex-1 h-7 rounded-md bg-white border border-gray-200" />
          </div>
          <div className="flex gap-1.5 text-[9px] font-mono text-gray-400">
            <span className="flex-1 text-center truncate">{primary}</span>
            <span className="flex-1 text-center truncate">{accent}</span>
            <span className="flex-1 text-center">#ffffff</span>
          </div>
        </div>

        <p className="text-[10px] text-gray-400 text-center">Les couleurs s'appliquent en direct.</p>
      </div>
    </div>
  );
}

// ─── Country mode section (System tab) ───────────────────────────────────────
const SYSTEM_HIDDEN_KEYS = new Set(["country_mode"]);

function CountrySystemSection({ values, onChange }: {
  values: SettingsMap;
  onChange: (key: string, val: string) => void;
}) {
  const current = values["country_mode"] ?? "MADAGASCAR";
  const config = getCountryConfig(current);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" /> Pays principal ERP
        </p>
        <div className="grid grid-cols-3 gap-3">
          {COUNTRY_OPTIONS.map(opt => {
            const active = current === opt.value;
            return (
              <button key={opt.value} type="button" onClick={() => onChange("country_mode", opt.value)}
                className={`relative flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 text-center transition-all
                  ${active
                    ? "border-emerald-500 bg-emerald-50 shadow-sm"
                    : "border-gray-200 bg-white hover:border-emerald-300 hover:bg-gray-50"
                  }`}>
                <span className="text-3xl leading-none">{opt.flag}</span>
                <span className={`text-sm font-semibold ${active ? "text-emerald-700" : "text-gray-700"}`}>
                  {opt.label}
                </span>
                <span className="text-[10px] text-gray-400">{opt.currency} · {opt.taxSystem}</span>
                {active && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Config summary card */}
      <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Finance</p>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Devise</span>
            <span className="font-mono font-semibold text-gray-800">{config.currency} ({config.currencySymbol})</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Format date</span>
            <span className="font-mono font-semibold text-gray-800">{config.dateFormat}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Système fiscal</span>
            <span className="font-mono font-semibold text-gray-800">{config.taxSystem}</span>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Modules actifs</p>
          {[
            { key: "payroll", label: "Paie" },
            { key: "export",  label: "Export" },
            { key: "vat",     label: "TVA" },
            { key: "cnaps",   label: "CNAPS/OSTIE" },
          ].map(m => {
            const on = config.modules[m.key as keyof typeof config.modules];
            return (
              <div key={m.key} className="flex items-center justify-between">
                <span className="text-gray-600">{m.label}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${on ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                  {on ? "Actif" : "Inactif"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Fiscal module ───────────────────────────────────────────────────────────
type TaxRegion = "MADAGASCAR" | "EUROPE" | "AFRICA";

const TAX_FIELDS: Record<TaxRegion, { key: string; label: string; desc: string; required?: boolean }[]> = {
  MADAGASCAR: [
    { key: "company_nif",  label: "NIF",  desc: "Numéro d'identification fiscale", required: true },
    { key: "company_stat", label: "STAT", desc: "Numéro statistique INSTAT",       required: true },
    { key: "company_rcs",  label: "RCS",  desc: "Registre du commerce et des sociétés" },
  ],
  EUROPE: [
    { key: "company_vat",          label: "N° TVA intracom.", desc: "Ex: FR12345678901",                required: true },
    { key: "company_registration", label: "N° entreprise",    desc: "Registre d'entreprise UE" },
    { key: "company_eori",         label: "EORI",             desc: "Numéro douane export" },
  ],
  AFRICA: [
    { key: "company_tax_id",         label: "Tax ID",              desc: "Numéro fiscal africain", required: true },
    { key: "company_rccm",           label: "RCCM",                desc: "Registre du commerce — OHADA" },
    { key: "company_import_license", label: "Licence import/export", desc: "Numéro de licence" },
  ],
};

const REGION_OPTIONS: { value: TaxRegion; flag: string; label: string; desc: string }[] = [
  { value: "MADAGASCAR", flag: "🇲🇬", label: "Madagascar", desc: "NIF · STAT · RCS" },
  { value: "EUROPE",     flag: "🇪🇺", label: "Europe",     desc: "TVA · EORI" },
  { value: "AFRICA",     flag: "🌍",  label: "Afrique",    desc: "Tax ID · RCCM" },
];

// All fiscal-specific keys — excluded from generic legal rendering
const ALL_FISCAL_KEYS = new Set([
  "tax_region",
  ...Object.values(TAX_FIELDS).flat().map(f => f.key),
]);

function FiscalTab({ values, onChange }: {
  values: SettingsMap;
  onChange: (key: string, val: string) => void;
}) {
  const region = (values["tax_region"] ?? "MADAGASCAR") as TaxRegion;
  const fields = TAX_FIELDS[region] ?? TAX_FIELDS.MADAGASCAR;

  return (
    <div className="space-y-6">
      {/* Region selector */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Région fiscale</p>
        <div className="grid grid-cols-3 gap-3">
          {REGION_OPTIONS.map(opt => {
            const active = region === opt.value;
            return (
              <button key={opt.value} type="button" onClick={() => onChange("tax_region", opt.value)}
                className={`relative flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 text-center transition-all
                  ${active
                    ? "border-emerald-500 bg-emerald-50 shadow-sm"
                    : "border-gray-200 bg-white hover:border-emerald-300 hover:bg-gray-50"
                  }`}>
                <span className="text-3xl leading-none">{opt.flag}</span>
                <span className={`text-sm font-semibold ${active ? "text-emerald-700" : "text-gray-700"}`}>
                  {opt.label}
                </span>
                <span className="text-[10px] text-gray-400">{opt.desc}</span>
                {active && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic fields for selected region */}
      <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Identifiants fiscaux — {REGION_OPTIONS.find(o => o.value === region)?.flag}{" "}
          {REGION_OPTIONS.find(o => o.value === region)?.label}
        </p>
        {fields.map(f => (
          <div key={f.key} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-800">{f.label}</label>
              {f.required && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200 rounded">
                  Obligatoire
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">{f.desc}</p>
            <input
              type="text"
              value={values[f.key] ?? ""}
              onChange={e => onChange(f.key, e.target.value)}
              placeholder={f.label}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition
                ${f.required && !values[f.key]
                  ? "border-red-300 focus:ring-red-400 bg-red-50/30"
                  : "border-gray-300 focus:ring-emerald-500 focus:border-transparent bg-white"
                }`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PlatformSettingsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("company");
  const handleTabChange = (key: TabKey) => { setActiveTab(key); setConfirmingReset(false); };
  const [allSettings, setAllSettings] = useState<PlatformSetting[]>([]);
  const [values, setValues] = useState<SettingsMap>({});
  const [originalValues, setOriginalValues] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

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

  // Settings for the active tab (some keys are hidden from the UI)
  const HIDDEN_KEYS = new Set(["fob_min_price_usd"]);
  const isLegalTab    = activeTab === "legal";
  const isSystemTab   = activeTab === "system";
  const isBrandingTab = activeTab === "branding";
  const tabSettings = allSettings.filter(s =>
    s.category === activeTab &&
    !HIDDEN_KEYS.has(s.settingKey) &&
    !(isLegalTab    && ALL_FISCAL_KEYS.has(s.settingKey)) &&
    !(isSystemTab   && SYSTEM_HIDDEN_KEYS.has(s.settingKey)) &&
    !(isBrandingTab && BRANDING_KEYS.has(s.settingKey))
  );

  // Find changed keys in this tab only (+ special sub-tab keys)
  const fiscalKeys      = isLegalTab    ? ["tax_region", ...Object.values(TAX_FIELDS).flat().map(f => f.key)] : [];
  const systemExtraKeys = isSystemTab   ? ["country_mode"] : [];
  const brandingExtraKeys = isBrandingTab ? Array.from(BRANDING_KEYS) : [];
  const allTrackedKeys = [...tabSettings.map(s => s.settingKey), ...fiscalKeys, ...systemExtraKeys, ...brandingExtraKeys];
  const changedKeys = allTrackedKeys.filter(k => values[k] !== originalValues[k]);

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
    const reset: SettingsMap = {};
    for (const k of allTrackedKeys) reset[k] = originalValues[k] ?? "";
    setValues(prev => ({ ...prev, ...reset }));
    setConfirmingReset(false);
    toast("Champs réinitialisés");
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
            onClick={() => handleTabChange(key)}
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
          {/* Branding tab — dedicated component */}
          {isBrandingTab && (
            <BrandingTab
              values={values}
              onChange={handleChange}
              onLogoUpload={handleLogoUpload}
              uploading={logoUploading}
            />
          )}

          {!isBrandingTab && (
          <div className="space-y-6">
            {/* Country mode — System tab */}
            {isSystemTab && (
              <CountrySystemSection values={values} onChange={handleChange} />
            )}

            {/* Fiscal module — Legal tab */}
            {isLegalTab && (
              <FiscalTab values={values} onChange={handleChange} />
            )}

            {/* Generic fields for this tab */}
            {tabSettings.length === 0 && !isLegalTab && !isSystemTab ? (
              <p className="text-gray-400 text-sm text-center py-8">Aucun paramètre dans cette catégorie.</p>
            ) : tabSettings.length > 0 ? (
              <div className={isLegalTab || isSystemTab ? "pt-2 border-t border-gray-100 space-y-6" : "space-y-6"}>
                {isLegalTab && (
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Informations légales générales</p>
                )}
                {isSystemTab && (
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Paramètres système</p>
                )}
                {tabSettings.map(setting => (
                  <SettingField
                    key={setting.settingKey}
                    setting={setting}
                    value={values[setting.settingKey] ?? ""}
                    onChange={handleChange}
                    onUpload={handleLogoUpload}
                    uploading={logoUploading}
                  />
                ))}
              </div>
            ) : null}
          </div>
          )}

          {/* Action buttons */}
          {(tabSettings.length > 0 || isLegalTab || isSystemTab || isBrandingTab) && (
            <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-100">
              {confirmingReset ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Réinitialiser les modifications ?</span>
                  <button type="button" onClick={handleReset}
                    className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
                    Confirmer
                  </button>
                  <button type="button" onClick={() => setConfirmingReset(false)}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingReset(true)}
                  disabled={changedKeys.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Réinitialiser
                </button>
              )}
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
