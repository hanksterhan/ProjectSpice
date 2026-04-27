import { Link } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/settings";
import { requireUser } from "~/lib/auth.server";

const PAREN_KEY = "spice_parenthetical_mode";

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
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-sm font-medium text-gray-900">Inline ingredient quantities</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Show ingredient amounts as parentheticals in directions instead of popovers.
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
          on ? "bg-gray-900" : "bg-gray-200"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export function meta() {
  return [{ title: "Settings — ProjectSpice" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  return { userName: user.name };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link to="/recipes" className="text-gray-500 hover:text-gray-700 text-sm">
          ← Recipes
        </Link>
        <h1 className="font-semibold text-gray-900">Settings</h1>
        <span className="ml-auto text-sm text-gray-500">{loaderData.userName}</span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Preferences */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Preferences
          </h2>
          <div className="bg-white rounded-lg border divide-y">
            <ParentheticalToggle />
          </div>
        </section>

        {/* Organisation */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Organisation
          </h2>
          <nav className="bg-white rounded-lg border divide-y">
            <Link
              to="/settings/tags"
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900">Manage Tags</span>
              <span className="text-gray-400 text-sm">›</span>
            </Link>
            <Link
              to="/settings/cookbooks"
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900">Manage Cookbooks</span>
              <span className="text-gray-400 text-sm">›</span>
            </Link>
            <Link
              to="/settings/collections"
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900">Manage Collections</span>
              <span className="text-gray-400 text-sm">›</span>
            </Link>
          </nav>
        </section>

        {/* AI */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            AI
          </h2>
          <nav className="bg-white rounded-lg border divide-y">
            <Link
              to="/settings/ai-profiles"
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900">AI Profiles</span>
              <span className="text-gray-400 text-sm">›</span>
            </Link>
          </nav>
        </section>

        {/* Data portability */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Data Portability
          </h2>
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Export my data</p>
                <p className="text-xs text-gray-500 mt-1">
                  Downloads a ZIP with all your recipes, cooking logs, and metadata in
                  JSON, Paprika-compatible HTML, and Schema.org JSON-LD formats.
                </p>
              </div>
              <a
                href="/api/export"
                download
                className="shrink-0 rounded-md bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-700 transition-colors"
              >
                Export
              </a>
            </div>
          </div>
        </section>

        {/* Account */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Account
          </h2>
          <nav className="bg-white rounded-lg border divide-y">
            <Link
              to="/change-password"
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-900">Change Password</span>
              <span className="text-gray-400 text-sm">›</span>
            </Link>
          </nav>
        </section>
      </main>
    </div>
  );
}
