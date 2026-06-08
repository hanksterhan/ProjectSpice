import {
  createContext,
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Link, NavLink } from "react-router";

type AppShellProps = {
  children: ReactNode;
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

const ShellCommandContext = createContext<(command: ShellCommand | null) => void>(
  () => undefined,
);
const ShellDrawerContext = createContext<(drawer: ShellDrawer | null) => void>(
  () => undefined,
);

type DrawerMode = "closed" | "peek" | "pinned";

export function AppShell({ children }: AppShellProps) {
  const [command, setCommand] = useState<ShellCommand | null>(defaultCommand);
  const [drawer, setDrawer] = useState<ShellDrawer | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("closed");
  const activeCommand = command ?? defaultCommand;
  const isDrawerVisible = drawerMode !== "closed";
  const isDrawerPinned = drawerMode === "pinned";

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

  return (
    <div className="app-shell" onMouseMove={closePeekDrawerOutsideBounds}>
      <ShellCommandContext.Provider value={setCommand}>
        <ShellDrawerContext.Provider value={setDrawer}>
          <header className="shell-header">
            <div className="shell-identity">
              <button
                className="icon-button"
                type="button"
                title={drawer ? drawer.title : "Navigation"}
                aria-expanded={isDrawerVisible}
                aria-controls="shell-drawer"
                aria-label={drawer ? drawer.title : "Navigation"}
                onClick={() => setDrawerMode((mode) => (mode === "pinned" ? "closed" : "pinned"))}
              >
                <MenuIcon />
                <span className="sr-only">{drawer ? drawer.title : "Navigation"}</span>
              </button>

              {activeCommand.backHref ? (
                <Link
                  className="icon-button"
                  to={activeCommand.backHref}
                  title={activeCommand.backLabel ?? "Back"}
                  aria-label={activeCommand.backLabel ?? "Back"}
                >
                  <ArrowLeftIcon />
                  <span className="sr-only">{activeCommand.backLabel ?? "Back"}</span>
                </Link>
              ) : (
                <NavLink to="/" className="brand-mark" aria-label="ProjectSpice home">
                  <span aria-hidden="true">PS</span>
                </NavLink>
              )}

              <div className="shell-current-page">
                {activeCommand.eyebrow ? <span>{activeCommand.eyebrow}</span> : null}
                <strong>{activeCommand.title}</strong>
              </div>
            </div>

            <div className="shell-command-cluster">
              <ShellNav className="shell-nav" />

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
            onMouseEnter={() => setDrawerMode((mode) => (mode === "closed" ? "peek" : mode))}
          />

          <div className={isDrawerPinned ? "shell-body drawer-pinned" : "shell-body"}>
            {isDrawerVisible ? (
              <aside
                className={isDrawerPinned ? "shell-drawer pinned" : "shell-drawer peeking"}
                id="shell-drawer"
                aria-label={drawer?.title ?? "Navigation"}
                onMouseDown={() => setDrawerMode((mode) => (mode === "peek" ? "pinned" : mode))}
                onMouseLeave={() => setDrawerMode((mode) => (mode === "peek" ? "closed" : mode))}
              >
                <div className="shell-drawer-header">
                  <h2>{drawer?.title ?? "Navigation"}</h2>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Close menu"
                    title="Close"
                    onClick={closeDrawer}
                  >
                    <CloseIcon />
                  </button>
                </div>
                <div className="shell-drawer-body">
                  {drawer?.content ?? <ShellNav className="shell-menu-nav" />}
                </div>
              </aside>
            ) : null}

            <main className="shell-main">{children}</main>
          </div>
        </ShellDrawerContext.Provider>
      </ShellCommandContext.Provider>
    </div>
  );
}

export function useShellCommand({
  actions,
  backHref,
  backLabel,
  eyebrow,
  title,
}: ShellCommand) {
  const setCommand = useContext(ShellCommandContext);

  useEffect(() => {
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

  useEffect(() => {
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

function ArrowLeftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
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

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
