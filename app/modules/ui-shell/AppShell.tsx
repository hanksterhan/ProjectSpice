import {
  createContext,
  useContext,
  useEffect,
  useState,
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

export function AppShell({ children }: AppShellProps) {
  const [command, setCommand] = useState<ShellCommand | null>(defaultCommand);
  const activeCommand = command ?? defaultCommand;

  return (
    <div className="app-shell">
      <ShellCommandContext.Provider value={setCommand}>
        <header className="shell-header">
          <div className="shell-identity">
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

            <details className="shell-mobile-menu">
              <summary
                className="icon-button"
                title="Navigation"
                aria-label="Navigation"
              >
                <MenuIcon />
                <span className="sr-only">Navigation</span>
              </summary>
              <div className="shell-mobile-menu-popover">
                <ShellNav className="shell-menu-nav" />
              </div>
            </details>

            {activeCommand.actions ? (
              <nav className="shell-context-actions" aria-label="Page actions">
                {activeCommand.actions}
              </nav>
            ) : null}
          </div>
        </header>

        <main className="shell-main">{children}</main>
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
