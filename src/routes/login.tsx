import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Marginly" },
      { name: "description", content: "Sign in to your AI restaurant margin dashboard." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate({ to: "/" });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="flex flex-col justify-between p-8 lg:p-12">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-foreground text-background grid place-items-center">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-semibold">Marginly</span>
        </Link>

        <div className="max-w-sm w-full mx-auto py-12 lg:py-0">
          <h1 className="text-3xl font-semibold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {mode === "signin"
              ? "Sign in to track ingredient costs, recipes, and AI-powered margin alerts."
              : "Start a 14-day trial. No credit card required."}
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="you@restaurant.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-foreground text-background rounded-lg px-4 py-2.5 text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{mode === "signin" ? "Sign in" : "Create account"} <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          <p className="text-xs text-muted-foreground mt-6 text-center">
            {mode === "signin" ? (
              <>New to Marginly? <button onClick={() => setMode("signup")} className="text-foreground font-medium hover:underline">Create an account</button></>
            ) : (
              <>Already have an account? <button onClick={() => setMode("signin")} className="text-foreground font-medium hover:underline">Sign in</button></>
            )}
          </p>
        </div>

        <div className="text-xs text-muted-foreground">© 2026 Marginly Labs</div>
      </div>

      <div className="hidden lg:flex relative bg-gradient-to-br from-foreground to-primary text-background p-12 flex-col justify-between overflow-hidden">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-chart-5/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-chart-2/20 blur-3xl" />
        <div className="relative">
          <div className="text-xs uppercase tracking-widest text-background/70">AI · F&B Operations</div>
          <h2 className="mt-4 text-4xl font-semibold leading-tight max-w-md">
            Know your food cost<br />before your menu does.
          </h2>
        </div>
        <div className="relative space-y-6">
          <Stat label="Avg margin recovered" value="+4.2%" />
          <Stat label="Invoices automated" value="98%" />
          <Stat label="Hours saved / week" value="11h" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-background/70">{label}</div>
    </div>
  );
}
