import { Link } from "react-router";
import type { Route } from "./+types/settings";
import { requireUser } from "~/lib/auth.server";

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
