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
  UserButton,
} from "@clerk/react-router";
import { NavLink } from "react-router";

type AppShellProps = {
  authEnabled?: boolean;
  children: ReactNode;
  defaultDrawer?: ShellDrawer | null;
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

const defaultDrawerWidth = 360;

export function AppShell({
  authEnabled = true,
  children,
  defaultDrawer = null,
}: AppShellProps) {
  const [command, setCommand] = useState<ShellCommand | null>(defaultCommand);
  const [drawer, setDrawer] = useState<ShellDrawer | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("closed");
  const [theme, setTheme] = useState<ThemeMode>("light");
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
    const storedTheme = window.localStorage.getItem("projectspice-theme");

    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
      return;
    }

    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

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
                theme={theme}
                onToggle={() => setTheme((mode) => (mode === "dark" ? "light" : "dark"))}
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
      <Show when="signed-in">
        <UserButton />
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
  onToggle,
  theme,
}: {
  onToggle: () => void;
  theme: ThemeMode;
}) {
  const isDark = theme === "dark";

  return (
    <details className="shell-settings-menu">
      <summary className="icon-button" title="Settings" aria-label="Settings">
        <SettingsIcon />
        <span className="sr-only">Settings</span>
      </summary>
      <div className="shell-settings-menu-popover">
        <button
          aria-pressed={isDark}
          className="menu-action theme-menu-action"
          type="button"
          onClick={(event) => {
            onToggle();
            event.currentTarget.closest("details")?.removeAttribute("open");
          }}
        >
          {isDark ? <MoonIcon /> : <SunIcon />}
          {isDark ? "Dark mode" : "Light mode"}
        </button>
      </div>
    </details>
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

function SettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.1.37.32.71.6 1 .3.25.68.4 1.1.4h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.1.4c-.28.29-.5.63-.6 1Z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M20.8 14.6A8.2 8.2 0 0 1 9.4 3.2a7.9 7.9 0 1 0 11.4 11.4Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}
