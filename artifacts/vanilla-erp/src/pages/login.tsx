import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Shield, Smartphone, Mail, ArrowLeft, Eye, EyeOff, Lock, User } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type LoginForm = z.infer<typeof loginSchema>;

interface LoginBranding {
  companyName: string;
  logoUrl: string | null;
  login: {
    bgColor: string;
    primaryColor: string;
    accentColor: string;
    headline1: string;
    headline2: string;
    tagline: string;
    badge: string;
    copyright: string;
    prop1: string;
    prop2: string;
    prop3: string;
  };
}

const DEFAULT_BRANDING: LoginBranding = {
  companyName: "Vanilla ERP",
  logoUrl: null,
  login: {
    bgColor: "#0a1f12",
    primaryColor: "#1a3c2a",
    accentColor: "#c4973a",
    headline1: "Gérez votre",
    headline2: "depuis un seul écran.",
    tagline: "Plateforme ERP complète pour la filière vanille de Madagascar — procurement, logistique, finance, CRM et conformité réunis dans un système de classe mondiale.",
    badge: "Madagascar · Bourbon Vanilla",
    copyright: "Vanilla ERP",
    prop1: "🌿|Traçabilité complète|Du champ au client, chaque lot suivi",
    prop2: "📊|Pilotage en temps réel|Dashboards financiers et logistiques unifiés",
    prop3: "🔒|Sécurité enterprise|RBAC granulaire, 2FA, audit complet",
  },
};

function parseProp(val: string): { emoji: string; title: string; desc: string } {
  const [emoji = "", title = "", desc = ""] = (val || "").split("|");
  return { emoji, title, desc };
}

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

function useBranding() {
  const [branding, setBranding] = useState<LoginBranding>(DEFAULT_BRANDING);
  useEffect(() => {
    fetch("/api/public/branding")
      .then(r => r.json())
      .then((d: Partial<LoginBranding>) => {
        setBranding({
          companyName: d.companyName ?? DEFAULT_BRANDING.companyName,
          logoUrl: d.logoUrl ?? null,
          login: { ...DEFAULT_BRANDING.login, ...(d.login ?? {}) },
        });
      })
      .catch(() => {});
  }, []);
  return branding;
}

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"credentials" | "2fa">("credentials");
  const [twoFaMethod, setTwoFaMethod] = useState<"totp" | "email">("totp");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const time = useClock();
  const branding = useBranding();

  useEffect(() => { setMounted(true); }, []);

  const { login: lp, companyName, logoUrl } = branding;
  const props = [parseProp(lp.prop1), parseProp(lp.prop2), parseProp(lp.prop3)];
  const showLogo = logoUrl && !logoError;

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const json = await r.json();
      if (!r.ok) { setError(json.error ?? "Identifiants invalides"); return; }
      if (json.requires2fa) {
        setTwoFaMethod(json.method ?? "totp");
        setStep("2fa");
        if (json.method === "email") await sendEmailOtp();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation("/dashboard");
    } catch {
      setError("Erreur de connexion. Vérifiez votre réseau.");
    } finally {
      setLoading(false);
    }
  };

  const sendEmailOtp = async () => {
    try {
      const r = await fetch("/api/auth/2fa/email-otp/send", { method: "POST", credentials: "include" });
      if (r.ok) setEmailSent(true);
    } catch { /* silent */ }
  };

  const onVerify2fa = async () => {
    if (otp.length < 6) { setError("Le code doit contenir 6 chiffres"); return; }
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: otp }),
      });
      const json = await r.json();
      if (!r.ok) { setError(json.error ?? "Code invalide"); return; }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation("/dashboard");
    } catch {
      setError("Erreur de vérification.");
    } finally {
      setLoading(false);
    }
  };

  const timeStr = time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = time.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const focusStyle = { borderColor: lp.primaryColor, boxShadow: `0 0 0 3px ${lp.primaryColor}18` };
  const blurStyle  = { borderColor: "#e0d8cc", boxShadow: "none" };

  return (
    <div
      className="min-h-screen flex"
      style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", opacity: mounted ? 1 : 0, transition: "opacity 0.6s ease" }}
    >
      {/* ── LEFT PANEL ────────────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col relative overflow-hidden"
        style={{ background: `linear-gradient(145deg, ${lp.bgColor} 0%, ${lp.primaryColor} 100%)` }}
      >
        {/* Pattern overlay */}
        <div className="absolute inset-0" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.025'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10" style={{ background: `radial-gradient(circle, ${lp.accentColor} 0%, transparent 70%)`, transform: "translate(30%, -30%)" }} />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-8" style={{ background: `radial-gradient(circle, ${lp.primaryColor} 0%, transparent 70%)`, transform: "translate(-30%, 30%)" }} />
        <svg className="absolute inset-0 w-full h-full opacity-5" preserveAspectRatio="none">
          <line x1="0" y1="100%" x2="100%" y2="0" stroke={lp.accentColor} strokeWidth="1" />
          <line x1="0" y1="80%" x2="80%" y2="0" stroke={lp.accentColor} strokeWidth="0.5" />
        </svg>

        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">
          {/* Top bar */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
                style={showLogo ? { background: "rgba(255,255,255,0.1)" } : { background: lp.accentColor }}
              >
                {showLogo ? (
                  <img src={logoUrl!} alt={companyName} className="w-full h-full object-contain p-0.5"
                    onError={() => setLogoError(true)} />
                ) : (
                  <span className="text-white font-black text-lg" style={{ fontFamily: "Georgia, serif" }}>
                    {companyName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <p className="text-white font-semibold text-sm tracking-widest uppercase opacity-90">{companyName}</p>
                <p className="text-xs tracking-wider opacity-40" style={{ color: lp.accentColor }}>Enterprise Platform</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white font-mono text-lg font-light tracking-wider opacity-80">{timeStr}</p>
              <p className="text-xs opacity-30 capitalize mt-0.5" style={{ color: lp.accentColor }}>{dateStr}</p>
            </div>
          </div>

          {/* Center: Headline */}
          <div className="flex-1 flex flex-col justify-center mt-8">
            {lp.badge && (
              <div className="mb-2">
                <span className="text-xs font-semibold tracking-[0.3em] uppercase px-3 py-1 rounded-full border"
                  style={{ color: lp.accentColor, borderColor: `${lp.accentColor}50`, background: `${lp.accentColor}12` }}>
                  {lp.badge}
                </span>
              </div>
            )}
            <h1 className="text-white leading-none font-light mt-4"
              style={{ fontSize: "clamp(2.5rem, 4vw, 3.5rem)", letterSpacing: "-0.02em", fontFamily: "Georgia, 'Times New Roman', serif" }}>
              {lp.headline1}<br />
              <span style={{ color: lp.accentColor, fontStyle: "italic" }}>{companyName}</span><br />
              {lp.headline2}
            </h1>
            {lp.tagline && (
              <p className="mt-6 text-sm leading-relaxed opacity-50" style={{ color: "#d4e8da", maxWidth: "380px" }}>
                {lp.tagline}
              </p>
            )}

            {/* Divider */}
            <div className="my-10 flex items-center gap-4">
              <div className="flex-1 h-px opacity-15" style={{ background: lp.accentColor }} />
              <div className="w-1.5 h-1.5 rounded-full opacity-40" style={{ background: lp.accentColor }} />
              <div className="flex-1 h-px opacity-15" style={{ background: lp.accentColor }} />
            </div>

            {/* Value props */}
            <div className="space-y-3">
              {props.filter(p => p.title).map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-lg">{p.emoji}</span>
                  <div>
                    <p className="text-sm font-medium text-white opacity-70">{p.title}</p>
                    {p.desc && <p className="text-xs opacity-30" style={{ color: "#d4e8da" }}>{p.desc}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom trust */}
          <div className="flex items-center gap-6 pt-8 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            {["ISO 27001", "SOC 2", "RGPD"].map(b => (
              <div key={b} className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#4ade80" }} />
                <span className="text-xs font-medium opacity-40" style={{ color: "#d4e8da" }}>{b}</span>
              </div>
            ))}
            <div className="ml-auto text-xs opacity-25" style={{ color: "#d4e8da" }}>v3.8.1</div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col" style={{ background: "#faf6ef" }}>

        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 p-6 border-b border-amber-100">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden"
            style={showLogo ? { background: "rgba(255,255,255,0.1)", border: `1px solid ${lp.primaryColor}30` } : { background: lp.primaryColor }}
          >
            {showLogo
              ? <img src={logoUrl!} alt={companyName} className="w-full h-full object-contain" onError={() => setLogoError(true)} />
              : <span className="text-white font-black text-sm" style={{ fontFamily: "Georgia, serif" }}>{companyName.charAt(0)}</span>
            }
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: lp.primaryColor }}>{companyName}</p>
            <p className="text-xs text-gray-400">Madagascar Operations</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 xl:p-14">
          <div className="w-full max-w-[400px]">

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-8">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: lp.primaryColor, color: "#fff" }}>1</div>
              <div className="flex-1 h-px transition-all" style={{ background: step === "2fa" ? lp.primaryColor : "#e2d9ce" }} />
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                style={{ background: step === "2fa" ? lp.primaryColor : "#e2d9ce", color: step === "2fa" ? "#fff" : "#aaa" }}>2</div>
            </div>

            {/* Heading */}
            <div className="mb-8">
              {step === "credentials" ? (
                <>
                  <h2 className="text-2xl font-semibold" style={{ color: "#0f2318", fontFamily: "Georgia, serif", letterSpacing: "-0.02em" }}>
                    Connexion sécurisée
                  </h2>
                  <p className="text-sm mt-1.5" style={{ color: "#7a8c82" }}>Accès réservé aux utilisateurs autorisés</p>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-semibold" style={{ color: "#0f2318", fontFamily: "Georgia, serif", letterSpacing: "-0.02em" }}>
                    Double authentification
                  </h2>
                  <p className="text-sm mt-1.5" style={{ color: "#7a8c82" }}>
                    {twoFaMethod === "email" ? "Vérifiez votre messagerie" : "Consultez votre application d'authentification"}
                  </p>
                </>
              )}
            </div>

            {/* ── STEP 1 ── */}
            {step === "credentials" && (
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" autoComplete="off">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#3d5240" }}>
                    Adresse email
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#9aab9e" }} />
                    <input type="email" {...form.register("email")} placeholder="prenom.nom@sevan.mg" autoComplete="username"
                      className="w-full pl-10 pr-4 py-3.5 rounded-xl text-sm outline-none transition-all"
                      style={{ background: "#fff", border: "1.5px solid #e0d8cc", color: "#1a2d1d" }}
                      onFocus={e => Object.assign(e.target.style, focusStyle)}
                      onBlur={e => Object.assign(e.target.style, blurStyle)}
                    />
                  </div>
                  {form.formState.errors.email && (
                    <p className="text-xs mt-1.5" style={{ color: "#dc2626" }}>{form.formState.errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#3d5240" }}>
                    Mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#9aab9e" }} />
                    <input type={showPass ? "text" : "password"} {...form.register("password")} autoComplete="current-password"
                      className="w-full pl-10 pr-12 py-3.5 rounded-xl text-sm outline-none transition-all"
                      style={{ background: "#fff", border: "1.5px solid #e0d8cc", color: "#1a2d1d" }}
                      onFocus={e => Object.assign(e.target.style, focusStyle)}
                      onBlur={e => Object.assign(e.target.style, blurStyle)}
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-60"
                      style={{ color: "#9aab9e" }}>
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.formState.errors.password && (
                    <p className="text-xs mt-1.5" style={{ color: "#dc2626" }}>{form.formState.errors.password.message}</p>
                  )}
                </div>

                {error && (
                  <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
                    style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626" }}>
                    <span className="text-base">⚠</span> {error}
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all"
                  style={{
                    background: `linear-gradient(135deg, ${lp.primaryColor} 0%, ${lp.bgColor === lp.primaryColor ? lp.primaryColor + "cc" : lp.primaryColor + "cc"} 100%)`,
                    color: "#fff",
                    letterSpacing: "0.04em",
                    boxShadow: loading ? "none" : `0 4px 24px ${lp.primaryColor}55`,
                    opacity: loading ? 0.8 : 1,
                  }}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Authentification…
                    </span>
                  ) : "Accéder à la plateforme"}
                </button>

                <div className="flex items-center justify-center gap-2 pt-2">
                  <Shield className="w-3.5 h-3.5" style={{ color: "#9aab9e" }} />
                  <p className="text-xs" style={{ color: "#9aab9e" }}>Connexion chiffrée TLS 1.3 · Session 8h</p>
                </div>
              </form>
            )}

            {/* ── STEP 2 ── */}
            {step === "2fa" && (
              <div className="space-y-5">
                <div className="flex items-start gap-4 p-4 rounded-xl"
                  style={{ background: twoFaMethod === "email" ? "#eff6ff" : "#f5f3ff", border: `1px solid ${twoFaMethod === "email" ? "#bfdbfe" : "#ddd6fe"}` }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: twoFaMethod === "email" ? "#dbeafe" : "#ede9fe" }}>
                    {twoFaMethod === "email"
                      ? <Mail className="w-4 h-4" style={{ color: "#2563eb" }} />
                      : <Smartphone className="w-4 h-4" style={{ color: "#7c3aed" }} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: twoFaMethod === "email" ? "#1d4ed8" : "#6d28d9" }}>
                      {twoFaMethod === "email" ? "Code par email" : "Application TOTP"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: twoFaMethod === "email" ? "#3b82f6" : "#8b5cf6" }}>
                      {twoFaMethod === "email"
                        ? emailSent ? "Code envoyé — vérifiez votre messagerie." : "Envoi en cours…"
                        : "Entrez le code affiché dans Google Authenticator."}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#3d5240" }}>
                    Code de vérification
                  </label>
                  <input type="text" inputMode="numeric" maxLength={6} placeholder="· · · · · ·"
                    value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={e => { if (e.key === "Enter") onVerify2fa(); }}
                    className="w-full py-4 rounded-xl text-3xl font-mono text-center tracking-[0.6em] outline-none transition-all"
                    style={{ background: "#fff", border: "1.5px solid #e0d8cc", color: "#1a2d1d" }}
                    onFocus={e => Object.assign(e.target.style, focusStyle)}
                    onBlur={e => Object.assign(e.target.style, blurStyle)}
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
                    style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626" }}>
                    <span className="text-base">⚠</span> {error}
                  </div>
                )}

                <div className="flex gap-2.5">
                  <button onClick={() => { setStep("credentials"); setOtp(""); setError(null); }}
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:opacity-80"
                    style={{ background: "#fff", border: "1.5px solid #e0d8cc" }}>
                    <ArrowLeft className="w-4 h-4" style={{ color: "#3d5240" }} />
                  </button>
                  <button onClick={onVerify2fa} disabled={loading || otp.length < 6}
                    className="flex-1 py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all"
                    style={{
                      background: otp.length < 6 ? "#e8e0d6" : `linear-gradient(135deg, ${lp.primaryColor}, ${lp.primaryColor}cc)`,
                      color: otp.length < 6 ? "#aaa" : "#fff",
                      boxShadow: otp.length < 6 ? "none" : `0 4px 24px ${lp.primaryColor}55`,
                      letterSpacing: "0.04em",
                    }}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Vérification…
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Shield className="w-4 h-4" />
                        Confirmer l'identité
                      </span>
                    )}
                  </button>
                </div>

                {twoFaMethod === "email" && (
                  <button onClick={sendEmailOtp}
                    className="text-xs text-center w-full transition-opacity hover:opacity-60"
                    style={{ color: "#7a8c82" }}>
                    Renvoyer le code par email
                  </button>
                )}
              </div>
            )}

            {/* Bottom */}
            <div className="mt-10 pt-6 border-t flex items-center justify-between" style={{ borderColor: "#e8e0d6" }}>
              <p className="text-xs" style={{ color: "#b0bdb5" }}>
                © {new Date().getFullYear()} {lp.copyright || companyName}
              </p>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs" style={{ color: "#b0bdb5" }}>Systèmes opérationnels</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
