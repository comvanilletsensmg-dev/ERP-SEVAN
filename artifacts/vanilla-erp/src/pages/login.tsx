import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      await loginMutation.mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation("/dashboard");
    } catch (error) {
      console.error(error);
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                placeholder="operator@vanilla-erp.mg"
                className="bg-card"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                {...form.register("password")}
                className="bg-card"
              />
            </div>
            {loginMutation.isError && (
              <p className="text-sm text-destructive">Invalid credentials.</p>
            )}
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Authenticating..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
