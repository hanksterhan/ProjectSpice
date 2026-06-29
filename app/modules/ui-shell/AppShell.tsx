import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Show,
  SignInButton,
  SignUpButton,
  useClerk,
  useUser,
} from "@clerk/react-router";
import {
  BookOpen,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  UserRound,
} from "lucide-react";
import { NavLink, useFetcher } from "react-router";

import type {
  LibraryPreferences,
  ThemePreference,
} from "~/server/user-preferences/user-preferences.types";

type AppShellProps = {
  authEnabled?: boolean;
  children: ReactNode;
  defaultDrawer?: ShellDrawer | null;
  initialPreferences?: LibraryPreferences;
};

export type ShellCommand = {
  backHref?: string;
  backLabel?: string;
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
};

export type ShellDrawer = {
  content: ReactNode;
  title: string;
};

const navItems = [
  { label: "Library", to: "/" },
  { label: "New", to: "/recipes/new" },
];

const defaultCommand: ShellCommand = {
  title: "ProjectSpice",
};
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const ShellCommandContext = createContext<(command: ShellCommand | null) => void>(
  () => undefined,
);
const ShellDrawerContext = createContext<(drawer: ShellDrawer | null) => void>(
  () => undefined,
);

type DrawerMode = "closed" | "peek" | "pinned";
type ThemeMode = "light" | "dark";
type DrawerBounds = {
  min: number;
  max: number;
};
type SettingsUpdateResult = {
  preferences?: LibraryPreferences;
};

const defaultDrawerWidth = 360;

export function AppShell({
  authEnabled = true,
  children,
  defaultDrawer = null,
  initialPreferences,
}: AppShellProps) {
  const [command, setCommand] = useState<ShellCommand | null>(defaultCommand);
  const [drawer, setDrawer] = useState<ShellDrawer | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("closed");
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    initialPreferences?.themeMode ?? "system",
  );
  const [theme, setTheme] = useState<ThemeMode>(
    initialPreferences?.themeMode === "dark" ? "dark" : "light",
  );
  const [hideCookbooksByDefault, setHideCookbooksByDefault] = useState(
    initialPreferences?.hideCookbooksByDefault ?? false,
  );
  const [drawerBounds, setDrawerBounds] = useState<DrawerBounds>({
    min: 288,
    max: 520,
  });
  const [drawerWidth, setDrawerWidth] = useState(defaultDrawerWidth);
  const activeDrawer = drawer ?? defaultDrawer;
  const activeCommand = command ?? defaultCommand;
  const isDrawerVisible = drawerMode !== "closed";
  const canRevealDrawer = Boolean(activeDrawer);
  const shellStyle = {
    "--shell-drawer-width": `${drawerWidth}px`,
  } as CSSProperties;
  const settingsFetcher = useFetcher<SettingsUpdateResult>();
  const submitSettingsUpdate = (settings: Record<string, string>) => {
    settingsFetcher.submit(settings, {
      action: "/preferences/settings",
      method: "post",
    });
  };

  useEffect(() => {
    function updateDrawerBounds() {
      const nextBounds = getDrawerBounds();

      setDrawerBounds(nextBounds);
      setDrawerWidth((width) => clampDrawerWidth(width, nextBounds));
    }

    updateDrawerBounds();
    window.addEventListener("resize", updateDrawerBounds);

    return () => window.removeEventListener("resize", updateDrawerBounds);
  }, []);

  useEffect(() => {
    setThemePreference(initialPreferences?.themeMode ?? "system");
    setHideCookbooksByDefault(
      initialPreferences?.hideCookbooksByDefault ?? false,
    );
  }, [initialPreferences]);

  useEffect(() => {
    if (themePreference === "light" || themePreference === "dark") {
      setTheme(themePreference);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => {
      setTheme(mediaQuery.matches ? "dark" : "light");
    };

    updateSystemTheme();
    mediaQuery.addEventListener("change", updateSystemTheme);

    return () => {
      mediaQuery.removeEventListener("change", updateSystemTheme);
    };
  }, [themePreference]);

  useEffect(() => {
    const savedPreferences = settingsFetcher.data?.preferences;

    if (!savedPreferences) {
      return;
    }

    setThemePreference(savedPreferences.themeMode);
    setHideCookbooksByDefault(savedPreferences.hideCookbooksByDefault);
  }, [settingsFetcher.data]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("projectspice-theme", theme);
  }, [theme]);

  const closeDrawer = () => setDrawerMode("closed");
  const closePeekDrawerOutsideBounds = (event: MouseEvent<HTMLDivElement>) => {
    if (drawerMode !== "peek") {
      return;
    }

    const drawerElement = event.currentTarget.querySelector("#shell-drawer");
    const drawerRight = drawerElement?.getBoundingClientRect().right ?? 0;

    if (event.clientX > drawerRight + 4 || event.clientY < 64) {
      closeDrawer();
    }
  };
  const resizeDrawerBy = (delta: number) => {
    setDrawerWidth((width) => clampDrawerWidth(width + delta, drawerBounds));
  };
  const resizeDrawerTo = (width: number) => {
    setDrawerWidth(clampDrawerWidth(width, drawerBounds));
  };
  const startDrawerResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = drawerWidth;

    function handlePointerMove(pointerEvent: PointerEvent) {
      resizeDrawerTo(startWidth + pointerEvent.clientX - startX);
    }

    function handlePointerUp() {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    }

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp, { once: true });
  };
  const handleDrawerResizeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeDrawerBy(event.shiftKey ? -48 : -16);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeDrawerBy(event.shiftKey ? 48 : 16);
    }
  };

  return (
    <div className="app-shell" onMouseMove={closePeekDrawerOutsideBounds} style={shellStyle}>
      <ShellCommandContext.Provider value={setCommand}>
        <ShellDrawerContext.Provider value={setDrawer}>
          <header className="shell-header">
            <div className="shell-identity">
              <button
                className="icon-button"
                type="button"
                title={activeDrawer ? activeDrawer.title : "Navigation"}
                aria-expanded={isDrawerVisible}
                aria-controls="shell-drawer"
                aria-label={activeDrawer ? activeDrawer.title : "Navigation"}
                onClick={() => setDrawerMode((mode) => (mode === "pinned" ? "closed" : "pinned"))}
              >
                <MenuIcon />
                <span className="sr-only">{activeDrawer ? activeDrawer.title : "Navigation"}</span>
              </button>

              <NavLink to="/" className="brand-link" aria-label="ProjectSpice recipe library">
                <span className="brand-mark" aria-hidden="true">PS</span>
                <strong>ProjectSpice</strong>
              </NavLink>
            </div>

            {activeCommand.title !== defaultCommand.title ? (
              <div className="shell-current-page" aria-live="polite">
                {activeCommand.eyebrow ? <span>{activeCommand.eyebrow}</span> : null}
                <strong>{activeCommand.title}</strong>
              </div>
            ) : (
              <div className="shell-current-page empty" aria-hidden="true" />
            )}

            <div className="shell-command-cluster">
              <ShellNav
                className="shell-nav"
                omitLibrary={activeCommand.backHref === "/"}
              />
              {authEnabled ? <AuthControls /> : null}
              <SettingsMenu
                authEnabled={authEnabled}
                hideCookbooksByDefault={hideCookbooksByDefault}
                onCookbookDefaultChange={(hideCookbooks) => {
                  setHideCookbooksByDefault(hideCookbooks);
                  submitSettingsUpdate({
                    hideCookbooksByDefault: hideCookbooks ? "1" : "0",
                    intent: "set-hide-cookbooks-by-default",
                  });
                }}
                onThemePreferenceChange={(nextThemePreference) => {
                  setThemePreference(nextThemePreference);
                  submitSettingsUpdate({
                    intent: "set-theme",
                    themeMode: nextThemePreference,
                  });
                }}
                themePreference={themePreference}
              />

              {activeCommand.actions ? (
                <nav className="shell-context-actions" aria-label="Page actions">
                  {activeCommand.actions}
                </nav>
              ) : null}
            </div>
          </header>

          <div
            className="shell-sidebar-activation-zone"
            aria-hidden="true"
            onMouseEnter={() =>
              setDrawerMode((mode) => (canRevealDrawer && mode === "closed" ? "peek" : mode))
            }
          />

          <div className={`shell-body drawer-${drawerMode}`}>
            <aside
              aria-hidden={!isDrawerVisible}
              className={`shell-drawer ${drawerMode}`}
              id="shell-drawer"
              aria-label={activeDrawer?.title ?? "Navigation"}
              onMouseLeave={() => setDrawerMode((mode) => (mode === "peek" ? "closed" : mode))}
            >
              <div className="shell-drawer-body">
                {activeDrawer?.content ?? null}
              </div>
              {drawerMode === "pinned" ? (
                <button
                  aria-label="Resize library menu"
                  aria-orientation="vertical"
                  aria-valuemax={drawerBounds.max}
                  aria-valuemin={drawerBounds.min}
                  aria-valuenow={drawerWidth}
                  className="shell-drawer-resize-handle"
                  onKeyDown={handleDrawerResizeKeyDown}
                  onPointerDown={startDrawerResize}
                  role="separator"
                  type="button"
                />
              ) : null}
            </aside>

            <main className="shell-main">{children}</main>
          </div>
        </ShellDrawerContext.Provider>
      </ShellCommandContext.Provider>
    </div>
  );
}

function AuthControls() {
  return (
    <div className="shell-auth-controls">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="button button-secondary compact" type="button">
            Sign In
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="button button-primary compact" type="button">
            Sign Up
          </button>
        </SignUpButton>
      </Show>
    </div>
  );
}

function getDrawerBounds(): DrawerBounds {
  const viewportWidth = window.innerWidth;
  const min = Math.round(Math.min(Math.max(280, viewportWidth * 0.18), 360));
  const maxByViewport = Math.max(min, viewportWidth - 360);
  const max = Math.round(Math.min(Math.max(420, viewportWidth * 0.42), maxByViewport));

  return {
    min,
    max: Math.max(min, max),
  };
}

function clampDrawerWidth(width: number, bounds: DrawerBounds) {
  return Math.min(bounds.max, Math.max(bounds.min, width));
}

export function useShellCommand({
  actions,
  backHref,
  backLabel,
  eyebrow,
  title,
}: ShellCommand) {
  const setCommand = useContext(ShellCommandContext);

  useIsomorphicLayoutEffect(() => {
    setCommand({
      actions,
      backHref,
      backLabel,
      eyebrow,
      title,
    });

    return () => setCommand(null);
  }, [actions, backHref, backLabel, eyebrow, setCommand, title]);
}

export function useShellDrawer(drawer: ShellDrawer | null) {
  const setDrawer = useContext(ShellDrawerContext);

  useIsomorphicLayoutEffect(() => {
    setDrawer(drawer);

    return () => setDrawer(null);
  }, [drawer, setDrawer]);
}

function ShellNav({
  className,
  omitLibrary = false,
}: {
  className: string;
  omitLibrary?: boolean;
}) {
  const visibleNavItems = omitLibrary
    ? navItems.filter((item) => item.to !== "/")
    : navItems;

  return (
    <nav className={className} aria-label="Primary navigation">
      {visibleNavItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            isActive ? "shell-nav-link active" : "shell-nav-link"
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function SettingsMenu({
  authEnabled,
  hideCookbooksByDefault,
  onCookbookDefaultChange,
  onThemePreferenceChange,
  themePreference,
}: {
  authEnabled: boolean;
  hideCookbooksByDefault: boolean;
  onCookbookDefaultChange: (hideCookbooks: boolean) => void;
  onThemePreferenceChange: (themePreference: ThemePreference) => void;
  themePreference: ThemePreference;
}) {
  return (
    <details className="shell-settings-menu">
      <summary className="icon-button" title="Settings" aria-label="Settings">
        <Settings aria-hidden="true" size={18} strokeWidth={2.35} />
        <span className="sr-only">Settings</span>
      </summary>
      <div className="shell-settings-menu-popover">
        {authEnabled ? (
          <Show when="signed-in">
            <AccountSettingsControls />
            <div className="shell-settings-menu-separator" />
          </Show>
        ) : null}
        <fieldset className="settings-fieldset">
          <legend>Theme</legend>
          <div className="settings-theme-switch">
            <ThemePreferenceButton
              active={themePreference === "system"}
              icon={<Monitor aria-hidden="true" size={15} strokeWidth={2.4} />}
              label="System"
              onClick={() => onThemePreferenceChange("system")}
            />
            <ThemePreferenceButton
              active={themePreference === "light"}
              icon={<Sun aria-hidden="true" size={15} strokeWidth={2.4} />}
              label="Light"
              onClick={() => onThemePreferenceChange("light")}
            />
            <ThemePreferenceButton
              active={themePreference === "dark"}
              icon={<Moon aria-hidden="true" size={15} strokeWidth={2.4} />}
              label="Dark"
              onClick={() => onThemePreferenceChange("dark")}
            />
          </div>
        </fieldset>
        <div className="shell-settings-menu-separator" />
        <label className="settings-switch">
          <input
            checked={!hideCookbooksByDefault}
            onChange={(event) =>
              onCookbookDefaultChange(!event.currentTarget.checked)
            }
            type="checkbox"
          />
          <span className="settings-switch-visual" aria-hidden="true" />
          <span className="settings-switch-label">
            <BookOpen aria-hidden="true" size={15} strokeWidth={2.4} />
            Show cookbooks
          </span>
        </label>
      </div>
    </details>
  );
}

function ThemePreferenceButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className="settings-theme-option"
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function AccountSettingsControls() {
  const clerk = useClerk();
  const { user } = useUser();
  const username =
    user?.username ??
    user?.primaryEmailAddress?.emailAddress ??
    user?.fullName ??
    "Signed in";

  return (
    <div className="shell-account-settings">
      <div className="shell-account-summary">
        <span>Signed in as</span>
        <strong>{username}</strong>
      </div>
      <button
        className="menu-action"
        type="button"
        onClick={(event) => {
          clerk.openUserProfile();
          event.currentTarget.closest("details")?.removeAttribute("open");
        }}
      >
        <UserRound aria-hidden="true" size={15} strokeWidth={2.4} />
        Manage account
      </button>
      <button
        className="menu-danger-action"
        type="button"
        onClick={() => void clerk.signOut()}
      >
        <LogOut aria-hidden="true" size={15} strokeWidth={2.4} />
        Sign out
      </button>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}
