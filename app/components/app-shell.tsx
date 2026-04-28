import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Form, Link, useLocation } from "react-router";

export type ShellUser = {
  name: string;
  email?: string | null;
};

export type ShellNavItem = {
  label: string;
  href: string;
  match?: string[];
};

export type ShellCollectionLink = {
  id: string;
  name: string;
  href: string;
  count?: number;
};

export type ShellStatus = {
  label: string;
  tone?: "neutral" | "success" | "warning";
};

const DEFAULT_NAV_ITEMS: ShellNavItem[] = [
  { label: "Home", href: "/", match: ["/", "/home"] },
  { label: "Recipes", href: "/recipes", match: ["/recipes", "/cookbooks", "/collections"] },
  { label: "Plan", href: "/meal-planner", match: ["/meal-planner"] },
  { label: "Lists", href: "/shopping-lists", match: ["/shopping-lists"] },
  { label: "Logs", href: "/stats", match: ["/stats", "/logs"] },
  { label: "Imports", href: "/imports/paprika", match: ["/imports"] },
  { label: "Settings", href: "/settings", match: ["/settings"] },
];

const SHELL_OPT_OUT_PATTERNS = [
  /^\/login\/?$/,
  /^\/change-password\/?$/,
  /^\/onboarding(?:\/.*)?$/,
  /^\/recipes\/[^/]+\/cook\/?$/,
];

export function shouldUseAppShell(pathname: string) {
  return !SHELL_OPT_OUT_PATTERNS.some((pattern) => pattern.test(pathname));
}

function isActivePath(pathname: string, item: ShellNavItem) {
  const matches = item.match ?? [item.href];
  return matches.some((match) => {
    if (match === "/") return pathname === "/" || pathname === "/home";
    return pathname === match || pathname.startsWith(`${match}/`);
  });
}

function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AppShell({
  children,
  user,
  navItems = DEFAULT_NAV_ITEMS,
  cookbooks = [],
  collections = [],
  lensSummary = "Original recipes",
  status,
  forceBare = false,
}: {
  children: ReactNode;
  user: ShellUser;
  navItems?: ShellNavItem[];
  cookbooks?: ShellCollectionLink[];
  collections?: ShellCollectionLink[];
  lensSummary?: string;
  status?: ShellStatus;
  forceBare?: boolean;
}) {
  const location = useLocation();
  const online = useOnlineStatus();
  const resolvedStatus = useMemo<ShellStatus>(
    () => status ?? { label: online ? "Synced" : "Offline", tone: online ? "success" : "warning" },
    [online, status]
  );

  if (forceBare || !shouldUseAppShell(location.pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Sidebar
        pathname={location.pathname}
        navItems={navItems}
        cookbooks={cookbooks}
        collections={collections}
        lensSummary={lensSummary}
        status={resolvedStatus}
        user={user}
      />
      <div className="min-w-0">
        <TopBar user={user} status={resolvedStatus} />
        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function Sidebar({
  pathname,
  navItems = DEFAULT_NAV_ITEMS,
  cookbooks = [],
  collections = [],
  lensSummary = "Original recipes",
  status,
  user,
}: {
  pathname: string;
  navItems?: ShellNavItem[];
  cookbooks?: ShellCollectionLink[];
  collections?: ShellCollectionLink[];
  lensSummary?: string;
  status: ShellStatus;
  user: ShellUser;
}) {
  return (
    <aside className="hidden min-h-screen border-r border-rule bg-paper-2 lg:flex lg:flex-col">
      <div className="border-b border-rule px-4 py-4">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
            PS
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">ProjectSpice</span>
            <span className="block truncate text-xs text-ink-3">Family library</span>
          </span>
        </Link>
      </div>

      <div className="border-b border-rule px-4 py-3">
        <p className="text-xs font-semibold uppercase text-ink-3">AI Lens</p>
        <p className="mt-1 truncate text-sm text-ink">{lensSummary}</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item);
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                  active ? "bg-paper-3 text-ink" : "text-ink-3 hover:bg-paper-3 hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <SidebarLinkGroup title="Cookbooks" items={cookbooks} emptyLabel="No cookbooks pinned" />
        <SidebarLinkGroup title="Collections" items={collections} emptyLabel="No collections pinned" />
      </nav>

      <div className="border-t border-rule px-4 py-3">
        <StatusPill status={status} />
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-paper-3 text-xs font-semibold text-ink">
            {initials(user.name) || "U"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            {user.email && <p className="truncate text-xs text-ink-3">{user.email}</p>}
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarLinkGroup({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: ShellCollectionLink[];
  emptyLabel: string;
}) {
  return (
    <section className="mt-6">
      <h2 className="px-3 text-xs font-semibold uppercase text-ink-4">{title}</h2>
      <div className="mt-2 space-y-1">
        {items.length === 0 ? (
          <p className="px-3 text-xs text-ink-4">{emptyLabel}</p>
        ) : (
          items.slice(0, 6).map((item) => (
            <Link
              key={item.id}
              to={item.href}
              className="flex min-h-8 items-center justify-between gap-3 rounded-md px-3 text-sm text-ink-3 hover:bg-paper-3 hover:text-ink"
            >
              <span className="truncate">{item.name}</span>
              {typeof item.count === "number" && (
                <span className="shrink-0 text-xs text-ink-4">{item.count}</span>
              )}
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

export function TopBar({ user, status }: { user: ShellUser; status: ShellStatus }) {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur">
      <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Form method="get" action="/recipes" role="search" className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="global-recipe-search">
            Search recipes
          </label>
          <input
            id="global-recipe-search"
            name="q"
            type="search"
            placeholder="Search recipes"
            className="ps-control w-full max-w-xl border border-rule bg-paper-2 px-3 text-sm text-ink placeholder:text-ink-4 focus-visible:ps-focus-ring"
          />
        </Form>

        <div className="hidden items-center gap-2 sm:flex">
          <Link
            to="/recipes/new"
            className="ps-control inline-flex items-center justify-center border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ps-focus-ring"
          >
            Add
          </Link>
          <Link
            to="/imports/paprika"
            className="ps-control inline-flex items-center justify-center border border-rule bg-paper-2 px-4 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring"
          >
            Import
          </Link>
        </div>

        <StatusPill status={status} className="hidden md:inline-flex" />
        <Link
          to="/settings"
          aria-label={`Account settings for ${user.name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-3 text-xs font-semibold text-ink focus-visible:ps-focus-ring"
        >
          {initials(user.name) || "U"}
        </Link>
      </div>
    </header>
  );
}

function StatusPill({ status, className }: { status: ShellStatus; className?: string }) {
  const tone =
    status.tone === "success"
      ? "bg-ok/10 text-ok"
      : status.tone === "warning"
        ? "bg-warn/10 text-warn"
        : "bg-paper-3 text-ink-3";

  return (
    <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-medium ${tone} ${className ?? ""}`}>
      {status.label}
    </span>
  );
}
