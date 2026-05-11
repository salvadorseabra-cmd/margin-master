import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Sparkles, ArrowRight } from "lucide-react";
import { useState } from "react";

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
  const [email, setEmail] = useState("camille@maisonolivier.fr");
  const [password, setPassword] = useState("••••••••");

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
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Sign in to track ingredient costs, recipes, and AI-powered margin alerts.
          </p>

          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/" });
            }}
          >
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Password</label>
                <a className="text-xs text-primary hover:underline">Forgot?</a>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 bg-foreground text-background rounded-lg px-4 py-2.5 text-sm font-medium hover:opacity-90 transition"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted transition"
            >
              Continue with Google
            </button>
          </form>

          <p className="text-xs text-muted-foreground mt-6 text-center">
            New to Marginly? <a className="text-foreground font-medium hover:underline">Start a 14-day trial</a>
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
          <p className="text-sm text-background/70 max-w-sm">
            “Marginly caught a 15% saffron spike before it ate our Risotto margin. It paid for itself in a week.”
            <br />
            <span className="text-background/90 font-medium">— Camille L., Maison Olivier</span>
          </p>
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
