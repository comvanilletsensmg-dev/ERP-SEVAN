import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Upload, Building2, MapPin, Receipt, DollarSign, Save, Loader2, ImagePlus } from "lucide-react";

interface CompanySettings {
  id?: string;
  companyName: string;
  logoUrl?: string | null;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country: string;
  taxId?: string;
  statNumber?: string;
  rcsNumber?: string;
  currency: "MGA" | "USD" | "EUR";
}

type FormData = Omit<CompanySettings, "id" | "logoUrl">;

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any).error ?? r.statusText);
  return j;
}

function SectionCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
          <Icon className="w-4 h-4 text-emerald-700" />
        </div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition";

export default function CompanySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: { companyName: "", country: "Madagascar", currency: "MGA" },
  });

  useEffect(() => {
    apiFetch("/api/settings")
      .then((data) => {
        if (data) {
          const { logoUrl: url, id, ...rest } = data;
          reset(rest);
          setLogoUrl(url ?? null);
        }
      })
      .catch(() => toast.error("Impossible de charger la configuration"))
      .finally(() => setLoading(false));
  }, [reset]);

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      toast.success("Configuration enregistrée");
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!file) return;
    setLogoUploading(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const r = await fetch("/api/settings/logo", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setLogoUrl(j.logoUrl + "?t=" + Date.now());
      toast.success("Logo mis à jour");
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur upload logo");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadLogo(file);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Configuration Entreprise</h1>
          <p className="text-sm text-gray-500 mt-1">Paramètres généraux de l'entreprise</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* A. Informations générales */}
        <SectionCard icon={Building2} title="Informations générales">
          <div className="space-y-5">
            <Field label="Nom de l'entreprise *" error={errors.companyName?.message}>
              <input
                {...register("companyName", { required: "Requis" })}
                className={inputCls}
                placeholder="Vanilla Madagascar Export"
              />
            </Field>

            {/* Logo upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Logo de l'entreprise</label>
              <div className="flex items-start gap-4">
                {/* Preview */}
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                  ) : (
                    <ImagePlus className="w-8 h-8 text-gray-300" />
                  )}
                </div>
                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex-1 min-h-[96px] rounded-xl border-2 border-dashed cursor-pointer flex flex-col items-center justify-center gap-2 transition-colors ${
                    dragOver ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50"
                  }`}
                >
                  {logoUploading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-gray-400" />
                      <p className="text-xs text-gray-500 text-center px-2">
                        Glisser-déposer ou <span className="text-emerald-600 font-medium">parcourir</span>
                        <br />PNG, JPG, SVG — max 2 Mo
                      </p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.svg"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* B. Coordonnées */}
        <SectionCard icon={MapPin} title="Coordonnées">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Email" error={errors.email?.message}>
              <input
                {...register("email", {
                  validate: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Email invalide",
                })}
                type="email"
                className={inputCls}
                placeholder="contact@vanilla-mg.com"
              />
            </Field>
            <Field label="Téléphone">
              <input {...register("phone")} className={inputCls} placeholder="+261 20 22 XXX XX" />
            </Field>
            <Field label="Adresse">
              <input {...register("address")} className={inputCls} placeholder="Lot II M 59, Ambohijatovo" />
            </Field>
            <Field label="Ville">
              <input {...register("city")} className={inputCls} placeholder="Antananarivo" />
            </Field>
            <Field label="Code postal">
              <input {...register("postalCode")} className={inputCls} placeholder="101" />
            </Field>
            <Field label="Pays">
              <input {...register("country")} className={inputCls} placeholder="Madagascar" />
            </Field>
          </div>
        </SectionCard>

        {/* C. Informations fiscales */}
        <SectionCard icon={Receipt} title="Informations fiscales">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="NIF (Numéro d'Identification Fiscale)">
              <input {...register("taxId")} className={inputCls} placeholder="1234567890" />
            </Field>
            <Field label="STAT (Statistique)">
              <input {...register("statNumber")} className={inputCls} placeholder="62900 11 2020 0 10001" />
            </Field>
            <Field label="RCS (Registre de Commerce)">
              <input {...register("rcsNumber")} className={inputCls} placeholder="2020 B 00123" />
            </Field>
          </div>
        </SectionCard>

        {/* D. Devise */}
        <SectionCard icon={DollarSign} title="Devise">
          <div className="max-w-xs">
            <Field label="Devise par défaut *" error={errors.currency?.message}>
              <select
                {...register("currency", { required: "Requis" })}
                className={inputCls}
              >
                <option value="MGA">🇲🇬 MGA — Ariary malgache</option>
                <option value="USD">🇺🇸 USD — Dollar américain</option>
                <option value="EUR">🇪🇺 EUR — Euro</option>
              </select>
            </Field>
            <p className="text-xs text-gray-400 mt-2">
              La devise est utilisée pour l'affichage dans tous les modules de l'ERP.
            </p>
          </div>
        </SectionCard>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}
