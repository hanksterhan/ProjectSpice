import { Link } from "react-router";
import type { Route } from "./+types/stats";
import { requireUser } from "~/lib/auth.server";
import {
  buildWeeklyCadence,
  getAverageCooksPerWeek,
  getDormantRecipes,
  type DormantRecipeInput,
} from "~/lib/cooking-stats";
import { AppShell } from "~/components/app-shell";
import { Chip, SectionHeader } from "~/components/ui";

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
    user,
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
    user,
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
    <AppShell user={user}>
      <div className="space-y-6">
        <SectionHeader
          eyebrow="Cooking history"
          title="Cooking Stats"
          description="Track cadence, favorite repeats, and recipes that deserve another turn."
          actions={
            <Link to="/logs/new" className="ps-control inline-flex items-center justify-center border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ps-focus-ring">
              Log Cook
            </Link>
          }
        />

        {!hasLogs ? (
          <section className="ps-surface px-5 py-12 text-center">
            <p className="text-sm font-semibold text-ink">No cooking stats yet</p>
            <p className="mt-1 text-sm text-ink-3">
              Log a cook from any recipe and this page will start tracking cadence.
            </p>
            <Link to="/logs/new" className="ps-control mt-4 inline-flex items-center justify-center border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ps-focus-ring">
              Log a Cook
            </Link>
          </section>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Total cooks" value={summary.total_logs} />
              <StatTile label="Recipes cooked" value={summary.distinct_recipes} />
              <StatTile label="Per week" value={formatAverage(averageCooksPerWeek)} />
              <StatTile label="Last cooked" value={formatDate(summary.last_cooked_at)} />
            </section>

            <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
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
                <div className="flex h-36 items-end gap-1.5" aria-label="Weekly cadence chart">
                  {weeklyCadence.map((week) => (
                    <div key={week.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <div className="flex h-28 w-full items-end">
                        <div
                          className="min-h-[3px] w-full rounded-t bg-primary"
                          style={{ height: `${Math.max(3, (week.cookCount / maxWeekCount) * 100)}%` }}
                          title={`${week.cookCount} cook${week.cookCount === 1 ? "" : "s"} week of ${week.weekStart}`}
                        />
                      </div>
                      <span className="truncate text-[10px] text-ink-3">{week.label}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
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
                <div className="divide-y divide-rule">
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
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {dormant.map((recipe) => (
                    <Link
                      key={recipe.id}
                      to={`/recipes/${recipe.id}`}
                      className="rounded-lg border border-rule bg-paper-3 p-3 transition-colors hover:bg-paper-4"
                    >
                      <p className="line-clamp-2 text-sm font-medium text-ink">{recipe.title}</p>
                      <p className="mt-1 text-xs text-ink-3">
                        {recipe.daysSinceCooked} days since last cook · {recipe.cookCount} total
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-3">
                  Nothing stale yet. Your recently cooked favorites are still in rotation.
                </p>
              )}
            </Panel>
          </>
        )}
      </div>
    </AppShell>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ps-surface p-4">
      <p className="text-xs font-semibold uppercase text-ink-3">{label}</p>
      <p className="ps-display mt-2 text-2xl text-ink">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ps-surface p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <Chip>History</Chip>
      </div>
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
        <span className="truncate font-medium text-ink">{label}</span>
        <span className="tabular-nums text-ink-3">{value}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-3">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
        />
      </div>
      {sublabel && <p className="mt-1 text-xs text-ink-3">{sublabel}</p>}
    </>
  );

  return href ? (
    <Link to={href} className="block transition-opacity hover:opacity-80">
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
    <Link to={href} className="flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-paper-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{title}</p>
        <p className="text-xs text-ink-3">{detail}</p>
      </div>
      <span className="shrink-0 text-xs text-ink-3">{date}</span>
    </Link>
  );
}
