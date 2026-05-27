import type { ReactNode } from "react";
import { NavLink } from "react-router";

type AppShellProps = {
  children: ReactNode;
};

const navItems = [
  { label: "Library", to: "/" },
  { label: "Workbench", to: "/ai" },
  { label: "New", to: "/recipes/new" },
];

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="shell-header">
        <NavLink to="/" className="brand-mark" aria-label="ProjectSpice home">
          <span aria-hidden="true">PS</span>
          <strong>ProjectSpice</strong>
        </NavLink>

        <nav className="shell-nav" aria-label="Primary navigation">
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
      </header>

      <main className="shell-main">{children}</main>
    </div>
  );
}
