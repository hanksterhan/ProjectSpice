import { Link } from "react-router";
import type { Route } from "./+types/stats";
import { requireUser } from "~/lib/auth.server";
import {
  buildWeeklyCadence,
  getAverageCooksPerWeek,
  getDormantRecipes,
  type DormantRecipeInput,
} from "~/lib/cooking-stats";

type SummaryRow = {
  total_logs: number;
  linked_logs: number;
  distinct_recipes: number;
  first_cooked_at: number | null;
  last_cooked_at: number | null;
};

type YearRow = {
  year: string;
  cook_count: number;
};

type WeekRow = {
  week_start: string;
  cook_count: number;
};

type RecipeStatRow = {
  id: string;
  title: string;
  cook_count: number;
  last_cooked_at: number;
};

export function meta() {
  return [{ title: "Cooking Stats — ProjectSpice" }];
}

function formatDate(value: number | null | undefined): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatAverage(value: number): string {
  return value.toLocaleString("en", {
    minimumFractionDigits: value < 1 && value > 0 ? 1 : 0,
    maximumFractionDigits: 1,
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const d1 = context.cloudflare.env.DB;
  const twelveWeeksAgo = Date.now() - 12 * 7 * 24 * 60 * 60 * 1000;

  const [summary, yearsResult, weeksResult, mostMadeResult, lastCookedResult, dormantResult] =
    await Promise.all([
      d1
        .prepare(
          `SELECT
             COUNT(*) as total_logs,
             COUNT(recipe_id) as linked_logs,
             COUNT(DISTINCT recipe_id) as distinct_recipes,
             MIN(cooked_at) as first_cooked_at,
             MAX(cooked_at) as last_cooked_at
           FROM cooking_log
           WHERE user_id = ?`
        )
        .bind(user.id)
        .first<SummaryRow>(),
      d1
        .prepare(
          `SELECT strftime('%Y', cooked_at / 1000, 'unixepoch') as year,
                  COUNT(*) as cook_count
           FROM cooking_log
           WHERE user_id = ?
           GROUP BY year
           ORDER BY year ASC`
        )
        .bind(user.id)
        .all<YearRow>(),
      d1
        .prepare(
          `SELECT date(
                    cooked_at / 1000,
                    'unixepoch',
                    '-' || ((CAST(strftime('%w', cooked_at / 1000, 'unixepoch') AS INTEGER) + 6) % 7) || ' days'
                  ) as week_start,
                  COUNT(*) as cook_count
           FROM cooking_log
           WHERE user_id = ? AND cooked_at >= ?
           GROUP BY week_start
           ORDER BY week_start ASC`
        )
        .bind(user.id, twelveWeeksAgo)
        .all<WeekRow>(),
      d1
        .prepare(
          `SELECT r.id, r.title, COUNT(*) as cook_count, MAX(cl.cooked_at) as last_cooked_at
           FROM cooking_log cl
           JOIN recipes r ON r.id = cl.recipe_id AND r.user_id = ?
           WHERE cl.user_id = ? AND cl.recipe_id IS NOT NULL AND r.deleted_at IS NULL
           GROUP BY r.id, r.title
           ORDER BY cook_count DESC, last_cooked_at DESC
           LIMIT 8`
        )
        .bind(user.id, user.id)
        .all<RecipeStatRow>(),
      d1
        .prepare(
          `SELECT r.id, r.title, COUNT(*) as cook_count, MAX(cl.cooked_at) as last_cooked_at
           FROM cooking_log cl
           JOIN recipes r ON r.id = cl.recipe_id AND r.user_id = ?
           WHERE cl.user_id = ? AND cl.recipe_id IS NOT NULL AND r.deleted_at IS NULL
           GROUP BY r.id, r.title
           ORDER BY last_cooked_at DESC
           LIMIT 8`
        )
        .bind(user.id, user.id)
        .all<RecipeStatRow>(),
      d1
        .prepare(
          `SELECT r.id, r.title, COUNT(*) as cook_count, MAX(cl.cooked_at) as last_cooked_at
           FROM cooking_log cl
           JOIN recipes r ON r.id = cl.recipe_id AND r.user_id = ?
           WHERE cl.user_id = ? AND cl.recipe_id IS NOT NULL AND r.deleted_at IS NULL
           GROUP BY r.id, r.title
           HAVING last_cooked_at < ?
           ORDER BY cook_count DESC, last_cooked_at ASC
           LIMIT 12`
        )
        .bind(user.id, user.id, Date.now() - 60 * 24 * 60 * 60 * 1000)
        .all<RecipeStatRow>(),
    ]);

  const weeklyCadence = buildWeeklyCadence(
    (weeksResult.results ?? []).map((row) => ({
      weekStart: row.week_start,
      cookCount: row.cook_count,
    }))
  );

  const dormantInputs: DormantRecipeInput[] = (dormantResult.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    cookCount: row.cook_count,
    lastCookedAt: row.last_cooked_at,
  }));

  return {
    summary: summary ?? {
      total_logs: 0,
      linked_logs: 0,
      distinct_recipes: 0,
      first_cooked_at: null,
      last_cooked_at: null,
    },
    years: yearsResult.results ?? [],
    weeklyCadence,
    averageCooksPerWeek: getAverageCooksPerWeek(weeklyCadence),
    mostMade: mostMadeResult.results ?? [],
    lastCooked: lastCookedResult.results ?? [],
    dormant: getDormantRecipes(dormantInputs).slice(0, 6),
  };
}

export default function Stats({ loaderData }: Route.ComponentProps) {
  const {
    summary,
    years,
    weeklyCadence,
    averageCooksPerWeek,
    mostMade,
    lastCooked,
    dormant,
  } = loaderData;
  const maxYearCount = Math.max(1, ...years.map((row) => row.cook_count));
  const maxWeekCount = Math.max(1, ...weeklyCadence.map((row) => row.cookCount));
  const maxRecipeCount = Math.max(1, ...mostMade.map((row) => row.cook_count));
  const hasLogs = summary.total_logs > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/recipes" className="text-gray-500 hover:text-gray-700 text-sm">
            ← Recipes
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="font-semibold text-gray-900">Cooking Stats</h1>
          <Link
            to="/logs/new"
            className="ml-auto rounded-md bg-gray-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Log Cook
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {!hasLogs ? (
          <section className="bg-white rounded-lg border px-5 py-12 text-center">
            <p className="text-sm font-medium text-gray-900">No cooking stats yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Log a cook from any recipe and this page will start tracking cadence.
            </p>
            <Link
              to="/logs/new"
              className="inline-flex mt-4 rounded-md bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              Log a Cook
            </Link>
          </section>
        ) : (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label="Total cooks" value={summary.total_logs} />
              <StatTile label="Recipes cooked" value={summary.distinct_recipes} />
              <StatTile label="Per week" value={formatAverage(averageCooksPerWeek)} />
              <StatTile label="Last cooked" value={formatDate(summary.last_cooked_at)} />
            </section>

            <section className="grid lg:grid-cols-[1fr_1.2fr] gap-6">
              <Panel title="Recipes Cooked Per Year">
                <div className="space-y-3">
                  {years.map((row) => (
                    <BarRow
                      key={row.year}
                      label={row.year}
                      value={row.cook_count}
                      max={maxYearCount}
                    />
                  ))}
                </div>
              </Panel>

              <Panel title="Weekly Cadence">
                <div className="flex items-end gap-1.5 h-36" aria-label="Weekly cadence chart">
                  {weeklyCadence.map((week) => (
                    <div key={week.weekStart} className="flex-1 min-w-0 flex flex-col items-center gap-2">
                      <div className="w-full h-28 flex items-end">
                        <div
                          className="w-full rounded-t bg-gray-900 min-h-[3px]"
                          style={{ height: `${Math.max(3, (week.cookCount / maxWeekCount) * 100)}%` }}
                          title={`${week.cookCount} cook${week.cookCount === 1 ? "" : "s"} week of ${week.weekStart}`}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 truncate">{week.label}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <section className="grid lg:grid-cols-2 gap-6">
              <Panel title="Most-Made Recipes">
                <div className="space-y-3">
                  {mostMade.map((recipe) => (
                    <BarRow
                      key={recipe.id}
                      label={recipe.title}
                      value={recipe.cook_count}
                      max={maxRecipeCount}
                      href={`/recipes/${recipe.id}`}
                      sublabel={`Last cooked ${formatDate(recipe.last_cooked_at)}`}
                    />
                  ))}
                </div>
              </Panel>

              <Panel title="Last-Cooked Dates">
                <div className="divide-y">
                  {lastCooked.map((recipe) => (
                    <RecipeDateRow
                      key={recipe.id}
                      href={`/recipes/${recipe.id}`}
                      title={recipe.title}
                      detail={`${recipe.cook_count} cook${recipe.cook_count === 1 ? "" : "s"}`}
                      date={formatDate(recipe.last_cooked_at)}
                    />
                  ))}
                </div>
              </Panel>
            </section>

            <Panel title="Haven't Cooked In A While">
              {dormant.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {dormant.map((recipe) => (
                    <Link
                      key={recipe.id}
                      to={`/recipes/${recipe.id}`}
                      className="rounded-lg border bg-gray-50 p-3 hover:bg-gray-100 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900 line-clamp-2">{recipe.title}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {recipe.daysSinceCooked} days since last cook · {recipe.cookCount} total
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  Nothing stale yet. Your recently cooked favorites are still in rotation.
                </p>
              )}
            </Panel>
          </>
        )}
      </main>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-2">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function BarRow({
  label,
  value,
  max,
  href,
  sublabel,
}: {
  label: string;
  value: number;
  max: number;
  href?: string;
  sublabel?: string;
}) {
  const content = (
    <>
      <div className="flex justify-between gap-3 text-sm">
        <span className="font-medium text-gray-900 truncate">{label}</span>
        <span className="text-gray-500 tabular-nums">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden mt-1.5">
        <div
          className="h-full rounded-full bg-gray-900"
          style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
        />
      </div>
      {sublabel && <p className="text-xs text-gray-500 mt-1">{sublabel}</p>}
    </>
  );

  return href ? (
    <Link to={href} className="block hover:opacity-80 transition-opacity">
      {content}
    </Link>
  ) : (
    <div>{content}</div>
  );
}

function RecipeDateRow({
  href,
  title,
  detail,
  date,
}: {
  href: string;
  title: string;
  detail: string;
  date: string;
}) {
  return (
    <Link to={href} className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
        <p className="text-xs text-gray-500">{detail}</p>
      </div>
      <span className="text-xs text-gray-500 shrink-0">{date}</span>
    </Link>
  );
}
