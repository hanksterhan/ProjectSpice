import { Link } from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import type { Route } from "./+types/settings";
import { requireUser } from "~/lib/auth.server";
import { AppShell } from "~/components/app-shell";
import { Chip, SectionHeader } from "~/components/ui";

const PAREN_KEY = "spice_parenthetical_mode";
const CONTRAST_KEY = "spice_contrast_mode";
const FONT_SIZE_KEY = "spice_font_size";
const REDUCED_MOTION_KEY = "spice_reduced_motion";

function notifyDisplayPreferenceChange() {
  window.dispatchEvent(new Event("spice:display-preferences"));
}

function Switch({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={checked}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border border-rule transition-colors focus-visible:ps-focus-ring ${
        checked ? "bg-primary" : "bg-paper-4"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-paper-2 shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function ParentheticalToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(localStorage.getItem(PAREN_KEY) === "1");
  }, []);
  function toggle() {
    setOn((prev) => {
      const next = !prev;
      localStorage.setItem(PAREN_KEY, next ? "1" : "0");
      return next;
    });
  }
  return (
    <div className="ps-row flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">Inline ingredient quantities</p>
        <p className="mt-0.5 text-xs text-ink-3">
          Show ingredient amounts as parentheticals in directions instead of popovers.
        </p>
      </div>
      <Switch checked={on} onToggle={toggle} label="Toggle inline ingredient quantities" />
    </div>
  );
}

function AccessibilityPreferences() {
  const [highContrast, setHighContrast] = useState(false);
  const [largeFont, setLargeFont] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setHighContrast(localStorage.getItem(CONTRAST_KEY) === "high");
    setLargeFont(localStorage.getItem(FONT_SIZE_KEY) === "large");
    setReducedMotion(localStorage.getItem(REDUCED_MOTION_KEY) === "true");
  }, []);

  function toggleContrast() {
    setHighContrast((prev) => {
      const next = !prev;
      localStorage.setItem(CONTRAST_KEY, next ? "high" : "standard");
      notifyDisplayPreferenceChange();
      return next;
    });
  }

  function toggleLargeFont() {
    setLargeFont((prev) => {
      const next = !prev;
      if (next) localStorage.setItem(FONT_SIZE_KEY, "large");
      else localStorage.removeItem(FONT_SIZE_KEY);
      notifyDisplayPreferenceChange();
      return next;
    });
  }

  function toggleReducedMotion() {
    setReducedMotion((prev) => {
      const next = !prev;
      if (next) localStorage.setItem(REDUCED_MOTION_KEY, "true");
      else localStorage.removeItem(REDUCED_MOTION_KEY);
      notifyDisplayPreferenceChange();
      return next;
    });
  }

  return (
    <>
      <div className="ps-row flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">High contrast</p>
          <p className="mt-0.5 text-xs text-ink-3">
            Increase text, border, and focus contrast throughout the app.
          </p>
        </div>
        <Switch checked={highContrast} onToggle={toggleContrast} label="Toggle high contrast mode" />
      </div>
      <div className="ps-row flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Large font</p>
          <p className="mt-0.5 text-xs text-ink-3">
            Enlarge the interface for reading recipes at arm's length.
          </p>
        </div>
        <Switch checked={largeFont} onToggle={toggleLargeFont} label="Toggle large font mode" />
      </div>
      <div className="ps-row flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Reduce motion</p>
          <p className="mt-0.5 text-xs text-ink-3">
            Minimize transitions and animations beyond your system setting.
          </p>
        </div>
        <Switch checked={reducedMotion} onToggle={toggleReducedMotion} label="Toggle reduced motion mode" />
      </div>
    </>
  );
}

export function meta() {
  return [{ title: "Settings — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  return { user };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  return (
    <AppShell user={loaderData.user}>
      <div className="mx-auto max-w-4xl space-y-6">
        <SectionHeader
          eyebrow="Account and preferences"
          title="Settings"
          description="Tune cooking ergonomics, manage organization, and keep account controls in one quiet workspace."
          actions={<Chip>{loaderData.user.name}</Chip>}
        />

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase text-ink-3">Preferences</h2>
          <div className="ps-surface divide-y divide-rule overflow-hidden">
            <ParentheticalToggle />
            <AccessibilityPreferences />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <SettingsGroup title="Organization">
            <SettingsLink to="/settings/tags" title="Manage Tags" description="Clean up lightweight facets." />
            <SettingsLink to="/settings/cookbooks" title="Manage Cookbooks" description="Archive and maintain source containers." />
            <SettingsLink to="/settings/collections" title="Manage Collections" description="Curate menu and occasion folders." />
          </SettingsGroup>

          <SettingsGroup title="AI and cooking">
            <SettingsLink to="/settings/ai-profiles" title="AI Profiles" description="Personalize improvement behavior by family member or goal." />
            <SettingsLink to="/stats" title="Cooking Stats" description="Review cadence, ratings, and recent cooking history." />
            <SettingsLink to="/meal-planner" title="Meal Planner" description="Plan upcoming meals from the same recipe library." />
          </SettingsGroup>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase text-ink-3">Data Portability</h2>
            <div className="ps-surface p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink">Export my data</p>
                  <p className="mt-1 text-xs text-ink-3">
                    Downloads a ZIP with all your recipes, cooking logs, and metadata in
                    JSON, Paprika-compatible HTML, and Schema.org JSON-LD formats.
                  </p>
                </div>
                <a
                  href="/api/export"
                  download
                  className="ps-control inline-flex shrink-0 items-center justify-center border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ps-focus-ring"
                >
                  Export
                </a>
              </div>
            </div>
          </div>

          <SettingsGroup title="Account">
            <SettingsLink to="/change-password" title="Change Password" description="Update the password for this ProjectSpice account." />
          </SettingsGroup>
        </section>
      </div>
    </AppShell>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase text-ink-3">{title}</h2>
      <nav className="ps-surface divide-y divide-rule overflow-hidden">{children}</nav>
    </section>
  );
}

function SettingsLink({
  to,
  title,
  description,
}: {
  to: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="ps-row flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-paper-3 focus-visible:ps-focus-ring"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-ink-3">{description}</span>
      </span>
      <span className="text-sm text-ink-4" aria-hidden="true">
        &gt;
      </span>
    </Link>
  );
}
