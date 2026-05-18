import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Receipt,
  ChefHat,
  LineChart,
  Bell,
  Sparkles,
  Menu,
  X,
  Search,
  LogOut,
  Loader2,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { restaurant } from "@/lib/mock-data";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/recipes", label: "Recipes", icon: ChefHat },
  { to: "/ingredients", label: "Ingredients", icon: LineChart },
  { to: "/alerts", label: "Margin Alerts", icon: Bell },
] as const;

export function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = (user.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen w-full min-w-0 bg-background">
      {/* Sidebar — desktop */}
      <aside className="group hidden lg:flex w-16 hover:w-64 flex-col overflow-hidden border-r border-border bg-card/40 sticky top-0 h-screen transition-[width] duration-200 ease-out">
        <BrandHeader />
        <SidebarNav path={path} />
        <SidebarFooter />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-72 bg-card border-r border-border flex flex-col">
            <BrandHeader onClose={() => setOpen(false)} />
            <SidebarNav path={path} onNavigate={() => setOpen(false)} />
            <SidebarFooter />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 min-w-0 border-b border-border bg-background/80 backdrop-blur">
          <div className="flex h-16 min-w-0 items-center gap-3 px-4 lg:px-8">
            <button
              className="lg:hidden -ml-1 p-2 rounded-md hover:bg-muted"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="hidden md:flex items-center gap-2 max-w-md rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground">
                <Search className="h-4 w-4" />
                <span>Search invoices, ingredients, recipes…</span>
                <kbd className="ml-auto text-[10px] font-medium bg-background border border-border rounded px-1.5 py-0.5">
                  ⌘K
                </kbd>
              </div>
            </div>
            <Link
              to="/alerts"
              className="relative p-2 rounded-md hover:bg-muted"
              aria-label="Alerts"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
            </Link>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/login" });
              }}
              className="p-2 rounded-md hover:bg-muted text-muted-foreground"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-chart-5 grid place-items-center text-primary-foreground text-sm font-semibold">
              {initials}
            </div>
          </div>
        </header>

        {/* Page header */}
        <div className="min-w-0 box-border px-4 pb-4 pt-6 lg:px-8 lg:pt-10">
          <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
            </div>
            {action}
          </div>
        </div>

        <main className="min-w-0 flex-1 min-w-0 box-border px-4 pb-16 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function BrandHeader({ onClose }: { onClose?: () => void }) {
  return (
    <div className="h-16 flex items-center justify-between border-b border-border px-4 transition-[padding] duration-200 lg:group-hover:px-5">
      <Link to="/" className="flex min-w-0 items-center gap-2">
        <div className="h-8 w-8 shrink-0 rounded-lg bg-foreground text-background grid place-items-center">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 overflow-hidden leading-tight transition-opacity duration-150 lg:w-0 lg:opacity-0 lg:group-hover:w-auto lg:group-hover:opacity-100">
          <div className="text-sm font-semibold">Marginly</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">AI · F&B</div>
        </div>
      </Link>
      {onClose && (
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted lg:hidden">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function SidebarNav({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-2 lg:group-hover:p-3">
      {nav.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? path === "/" : path.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={`flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors lg:group-hover:justify-start ${
              active
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title={label}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate transition-opacity duration-150 lg:w-0 lg:opacity-0 lg:group-hover:w-auto lg:group-hover:opacity-100">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-border p-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
      <div className="rounded-xl bg-gradient-to-br from-accent to-card p-4">
        <div className="text-xs text-muted-foreground mb-1">Restaurant</div>
        <div className="text-sm font-semibold">{restaurant.name}</div>
        <div className="text-xs text-muted-foreground mt-2">Pro plan · {restaurant.owner}</div>
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card-surface min-w-0 p-5 ${className}`}>{children}</div>;
}
