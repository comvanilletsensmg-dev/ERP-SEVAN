import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Smartphone, Mail, ArrowLeft } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"credentials" | "2fa">("credentials");
  const [twoFaMethod, setTwoFaMethod] = useState<"totp" | "email">("totp");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // ── Step 1 : Credentials ──────────────────────────────────────────────────
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

  // ── Send email OTP ─────────────────────────────────────────────────────────
  const sendEmailOtp = async () => {
    try {
      const r = await fetch("/api/auth/2fa/email-otp/send", { method: "POST", credentials: "include" });
      if (r.ok) setEmailSent(true);
    } catch { /* silent */ }
  };

  // ── Step 2 : 2FA Verify ───────────────────────────────────────────────────
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-serif tracking-tight text-primary">Vanilla ERP</CardTitle>
          <CardDescription>Madagascar Operations Portal</CardDescription>
        </CardHeader>
        <CardContent>

          {/* ── Step: Credentials ── */}
          {step === "credentials" && (
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register("email")}
                  placeholder="operator@vanilla-erp.mg" className="bg-card" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" {...form.register("password")} className="bg-card" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading}>
                {loading ? "Connexion…" : "Sign in"}
              </Button>
            </form>
          )}

          {/* ── Step: 2FA ── */}
          {step === "2fa" && (
            <div className="space-y-5">
              <div className={`flex items-center gap-3 p-4 rounded-xl ${twoFaMethod === "email" ? "bg-blue-50 border border-blue-200" : "bg-violet-50 border border-violet-200"}`}>
                {twoFaMethod === "email"
                  ? <Mail className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  : <Smartphone className="w-5 h-5 text-violet-600 flex-shrink-0" />}
                <div>
                  <p className={`text-sm font-semibold ${twoFaMethod === "email" ? "text-blue-800" : "text-violet-800"}`}>
                    Double authentification requise
                  </p>
                  <p className={`text-xs mt-0.5 ${twoFaMethod === "email" ? "text-blue-600" : "text-violet-600"}`}>
                    {twoFaMethod === "email"
                      ? emailSent ? "Code envoyé sur ton email. Vérifie ta boîte." : "Envoi du code en cours…"
                      : "Ouvre ton application Google Authenticator"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Code à 6 chiffres</Label>
                <Input
                  type="text" inputMode="numeric" maxLength={6}
                  placeholder="000000" className="bg-card text-center text-2xl font-mono tracking-[0.5em] py-3"
                  value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={e => { if (e.key === "Enter") onVerify2fa(); }}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-shrink-0"
                  onClick={() => { setStep("credentials"); setOtp(""); setError(null); }}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <Button className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={onVerify2fa} disabled={loading || otp.length < 6}>
                  <Shield className="w-4 h-4 mr-2" />
                  {loading ? "Vérification…" : "Vérifier le code"}
                </Button>
              </div>

              {twoFaMethod === "email" && (
                <button onClick={sendEmailOtp} className="text-xs text-center text-gray-400 hover:text-gray-600 underline w-full">
                  Renvoyer le code
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
