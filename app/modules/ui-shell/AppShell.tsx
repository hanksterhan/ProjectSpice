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
import { NavLink } from "react-router";

type AppShellProps = {
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
  { label: "Workbench", to: "/ai" },
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

export function AppShell({ children, defaultDrawer = null }: AppShellProps) {
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
              <ShellNav className="shell-nav" />
              <ThemeToggle
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

function ShellNav({ className }: { className: string }) {
  return (
    <nav className={className} aria-label="Primary navigation">
      {navItems.map((item) => (
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

function ThemeToggle({
  onToggle,
  theme,
}: {
  onToggle: () => void;
  theme: ThemeMode;
}) {
  const isDark = theme === "dark";

  return (
    <button
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className="icon-button theme-toggle-button"
      title={isDark ? "Light mode" : "Dark mode"}
      type="button"
      onClick={onToggle}
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
      <span className="sr-only">{isDark ? "Dark mode enabled" : "Light mode enabled"}</span>
    </button>
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
