import { Form, Link, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/home";
import { getUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { AppShell } from "~/components/app-shell";
import { Button, Chip, ImageFallback, RecipeCard, SectionHeader } from "~/components/ui";
import { FAMILY_RECIPE_VISIBILITY } from "~/lib/family-sharing";

type DashboardRecipe = {
  id: string;
  title: string;
  imageKey: string | null;
  totalTimeMin: number | null;
  rating: number | null;
  sourceType: string;
  ownerName: string;
};

type MealPlanItem = {
  id: string;
  date: string;
  mealSlot: string | null;
  recipeId: string | null;
  recipeTitle: string | null;
  notes: string | null;
};

type CookedItem = {
  id: string;
  cookedAt: number;
  rating: number | null;
  recipeId: string | null;
  recipeTitle: string | null;
  notes: string | null;
  imageKey: string | null;
};

type ActiveShoppingList = {
  id: string;
  name: string;
  itemCount: number;
  checkedCount: number;
  ownerName: string;
  isOwner: number;
} | null;

type ImportItem = {
  id: string;
  sourceType: string;
  status: string;
  recipeCountExpected: number | null;
  recipeCountImported: number;
  startedAt: number | null;
  completedAt: number | null;
};

type NamedCount = {
  id: string;
  name: string;
  description: string | null;
  recipeCount: number;
};

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "ProjectSpice" },
    { name: "description", content: "Your personal recipe manager" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getUser(request, context);
  if (user) {
    const { db } = createDb(context.cloudflare.env.DB);
    const fullUser = await db.query.users.findFirst({
      where: eq(schema.users.id, user.id),
      columns: { onboardingCompletedAt: true },
    });
    if (!fullUser?.onboardingCompletedAt) throw redirect("/onboarding");
  }

  if (!user) {
    return {
      environment: context.cloudflare.env.ENVIRONMENT,
      user: null,
      dashboard: null,
    };
  }

  const d1 = context.cloudflare.env.DB;
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    recipeCount,
    suggestionRows,
    mealPlanRows,
    cookedRows,
    shoppingRows,
    importRows,
    cookbookRows,
    collectionRows,
  ] = await Promise.all([
    d1
      .prepare(
        `SELECT COUNT(*) as count
         FROM recipes r
         WHERE (r.user_id = ? OR r.visibility = ?)
           AND r.deleted_at IS NULL`
      )
      .bind(user.id, FAMILY_RECIPE_VISIBILITY)
      .first<{ count: number }>(),
    d1
      .prepare(
        `SELECT r.id, r.title, r.image_key, r.total_time_min, r.rating, r.source_type,
                u.name as owner_name
         FROM recipes r
         JOIN users u ON u.id = r.user_id
         WHERE (r.user_id = ? OR r.visibility = ?)
           AND r.deleted_at IS NULL
         ORDER BY CASE WHEN r.image_key IS NULL THEN 1 ELSE 0 END,
                  COALESCE(r.rating, 0) DESC,
                  r.updated_at DESC
         LIMIT 4`
      )
      .bind(user.id, FAMILY_RECIPE_VISIBILITY)
      .all<{
        id: string;
        title: string;
        image_key: string | null;
        total_time_min: number | null;
        rating: number | null;
        source_type: string;
        owner_name: string;
      }>(),
    d1
      .prepare(
        `SELECT mpe.id, mpe.date, mpe.meal_slot, mpe.recipe_id, r.title as recipe_title,
                mpe.notes
         FROM meal_plan_entries mpe
         LEFT JOIN recipes r ON r.id = mpe.recipe_id AND r.deleted_at IS NULL
         WHERE mpe.user_id = ?
           AND mpe.date BETWEEN ? AND ?
         ORDER BY mpe.date ASC, mpe.meal_slot ASC
         LIMIT 6`
      )
      .bind(user.id, today, soon)
      .all<{
        id: string;
        date: string;
        meal_slot: string | null;
        recipe_id: string | null;
        recipe_title: string | null;
        notes: string | null;
      }>(),
    d1
      .prepare(
        `SELECT cl.id, cl.cooked_at, cl.rating, cl.recipe_id, r.title as recipe_title,
                cl.notes, r.image_key
         FROM cooking_log cl
         LEFT JOIN recipes r ON r.id = cl.recipe_id AND r.deleted_at IS NULL
         WHERE cl.user_id = ?
         ORDER BY cl.cooked_at DESC
         LIMIT 4`
      )
      .bind(user.id)
      .all<{
        id: string;
        cooked_at: number;
        rating: number | null;
        recipe_id: string | null;
        recipe_title: string | null;
        notes: string | null;
        image_key: string | null;
      }>(),
    d1
      .prepare(
        `SELECT sl.id, sl.name, u.name as owner_name,
                CASE WHEN sl.user_id = ? THEN 1 ELSE 0 END as is_owner,
                COUNT(sli.id) as item_count,
                SUM(CASE WHEN sli.checked_at IS NOT NULL THEN 1 ELSE 0 END) as checked_count
         FROM shopping_lists sl
         JOIN users u ON u.id = sl.user_id
         LEFT JOIN shopping_list_items sli ON sli.shopping_list_id = sl.id
         LEFT JOIN shares sh ON sh.resource_type = 'shopping_list'
          AND sh.resource_id = sl.id
          AND (sh.shared_with_user_id IS NULL OR sh.shared_with_user_id = ?)
         WHERE sl.completed_at IS NULL
           AND (sl.user_id = ? OR sh.id IS NOT NULL)
         GROUP BY sl.id
         ORDER BY sl.created_at DESC
         LIMIT 1`
      )
      .bind(user.id, user.id, user.id)
      .all<{
        id: string;
        name: string;
        owner_name: string;
        is_owner: number;
        item_count: number;
        checked_count: number | null;
      }>(),
    d1
      .prepare(
        `SELECT id, source_type, status, recipe_count_expected, recipe_count_imported,
                started_at, completed_at
         FROM import_jobs
         WHERE user_id = ?
           AND status IN ('pending', 'processing', 'failed')
         ORDER BY COALESCE(started_at, completed_at, 0) DESC
         LIMIT 3`
      )
      .bind(user.id)
      .all<{
        id: string;
        source_type: string;
        status: string;
        recipe_count_expected: number | null;
        recipe_count_imported: number;
        started_at: number | null;
        completed_at: number | null;
      }>(),
    d1
      .prepare(
        `SELECT cb.id, cb.name, cb.description, COUNT(r.id) as recipe_count
         FROM cookbooks cb
         LEFT JOIN cookbook_recipes cr ON cr.cookbook_id = cb.id
         LEFT JOIN recipes r ON r.id = cr.recipe_id AND r.deleted_at IS NULL
         WHERE cb.user_id = ?
           AND cb.archived = 0
         GROUP BY cb.id
         ORDER BY cb.created_at DESC
         LIMIT 4`
      )
      .bind(user.id)
      .all<{
        id: string;
        name: string;
        description: string | null;
        recipe_count: number;
      }>(),
    d1
      .prepare(
        `SELECT c.id, c.name, c.description, COUNT(r.id) as recipe_count
         FROM collections c
         LEFT JOIN collection_recipes cr ON cr.collection_id = c.id
         LEFT JOIN recipes r ON r.id = cr.recipe_id AND r.deleted_at IS NULL
         WHERE c.user_id = ?
         GROUP BY c.id
         ORDER BY c.created_at DESC
         LIMIT 4`
      )
      .bind(user.id)
      .all<{
        id: string;
        name: string;
        description: string | null;
        recipe_count: number;
      }>(),
  ]);

  return {
    environment: context.cloudflare.env.ENVIRONMENT,
    user: { name: user.name, email: user.email },
    dashboard: {
      recipeCount: recipeCount?.count ?? 0,
      today,
      suggestions: (suggestionRows.results ?? []).map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        imageKey: recipe.image_key,
        totalTimeMin: recipe.total_time_min,
        rating: recipe.rating,
        sourceType: recipe.source_type,
        ownerName: recipe.owner_name,
      })) satisfies DashboardRecipe[],
      mealPlan: (mealPlanRows.results ?? []).map((item) => ({
        id: item.id,
        date: item.date,
        mealSlot: item.meal_slot,
        recipeId: item.recipe_id,
        recipeTitle: item.recipe_title,
        notes: item.notes,
      })) satisfies MealPlanItem[],
      recentlyCooked: (cookedRows.results ?? []).map((item) => ({
        id: item.id,
        cookedAt: item.cooked_at,
        rating: item.rating,
        recipeId: item.recipe_id,
        recipeTitle: item.recipe_title,
        notes: item.notes,
        imageKey: item.image_key,
      })) satisfies CookedItem[],
      activeShoppingList:
        (shoppingRows.results ?? []).map((list) => ({
          id: list.id,
          name: list.name,
          itemCount: list.item_count,
          checkedCount: list.checked_count ?? 0,
          ownerName: list.owner_name,
          isOwner: list.is_owner,
        }))[0] ?? null,
      importsNeedingReview: (importRows.results ?? []).map((item) => ({
        id: item.id,
        sourceType: item.source_type,
        status: item.status,
        recipeCountExpected: item.recipe_count_expected,
        recipeCountImported: item.recipe_count_imported,
        startedAt: item.started_at,
        completedAt: item.completed_at,
      })) satisfies ImportItem[],
      cookbooks: (cookbookRows.results ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        recipeCount: item.recipe_count,
      })) satisfies NamedCount[],
      collections: (collectionRows.results ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        recipeCount: item.recipe_count,
      })) satisfies NamedCount[],
    },
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  if (!loaderData.user || !loaderData.dashboard) {
    return <SignedOutHome environment={loaderData.environment} />;
  }

  const { dashboard, user } = loaderData;
  const shellCookbooks = dashboard.cookbooks.map((cookbook) => ({
    id: cookbook.id,
    name: cookbook.name,
    href: `/cookbooks/${cookbook.id}`,
    count: cookbook.recipeCount,
  }));
  const shellCollections = dashboard.collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    href: `/collections/${collection.id}`,
    count: collection.recipeCount,
  }));

  return (
    <AppShell user={user} cookbooks={shellCookbooks} collections={shellCollections}>
      <div className="space-y-8">
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.55fr)]">
          <div className="overflow-hidden rounded-lg border border-rule bg-paper-2 shadow-[var(--shadow-1)]">
            <div className="grid min-h-[21rem] lg:grid-cols-[minmax(0,0.95fr)_minmax(18rem,1.05fr)]">
              <div className="flex flex-col justify-between gap-8 p-5 sm:p-6">
                <div className="space-y-4">
                  <Chip tone="neutral">{dashboard.recipeCount} recipes ready</Chip>
                  <div className="space-y-3">
                    <h1 className="ps-display-editorial max-w-xl text-4xl leading-tight text-ink sm:text-5xl">
                      Cook from the family shelf.
                    </h1>
                    <p className="max-w-lg text-sm leading-6 text-ink-3">
                      Pick up tonight's plan, finish the grocery list, or browse something worth
                      putting back in rotation.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <LinkButton to="/recipes">Browse recipes</LinkButton>
                  <LinkButton to="/meal-planner" variant="secondary">
                    Plan week
                  </LinkButton>
                  <LinkButton to="/imports/paprika" variant="secondary">
                    Import
                  </LinkButton>
                </div>
              </div>
              <HeroRecipe recipes={dashboard.suggestions} />
            </div>
          </div>

          <TodayPanel mealPlan={dashboard.mealPlan} shoppingList={dashboard.activeShoppingList} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Suggestions"
              title="Media-led picks"
              description="Recent, rated, and image-backed recipes from your family library."
              actions={<LinkText to="/recipes">View library</LinkText>}
            />
            {dashboard.suggestions.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {dashboard.suggestions.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={{
                      id: recipe.id,
                      title: recipe.title,
                      imageKey: recipe.imageKey,
                      href: `/recipes/${recipe.id}`,
                      meta: recipe.totalTimeMin ? `${recipe.totalTimeMin} min` : recipe.ownerName,
                      badge: recipe.rating ? <Chip>{recipe.rating}/5</Chip> : null,
                    }}
                  />
                ))}
              </div>
            ) : (
              <EmptyPanel
                title="No recipes yet"
                description="Add a recipe or import a cookbook to start building the shelf."
                action={<LinkText to="/recipes/new">Add first recipe</LinkText>}
              />
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <NamedCountPanel
                title="Cookbooks"
                items={dashboard.cookbooks}
                hrefPrefix="/cookbooks"
                empty="Imported sources and family books will appear here."
                actionHref="/settings/cookbooks"
              />
              <NamedCountPanel
                title="Collections"
                items={dashboard.collections}
                hrefPrefix="/collections"
                empty="Curated menus and seasonal sets will appear here."
                actionHref="/settings/collections"
              />
            </div>
          </div>

          <div className="space-y-5">
            <RecentlyCookedPanel items={dashboard.recentlyCooked} />
            <ImportPanel items={dashboard.importsNeedingReview} />
            <AccountPanel user={user} environment={loaderData.environment} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SignedOutHome({ environment }: { environment: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-10 text-ink">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-rule bg-paper-2 p-6 shadow-[var(--shadow-2)]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-ink-3">ProjectSpice</p>
          <h1 className="ps-display-editorial text-4xl text-ink">Family recipes, ready to cook.</h1>
          <p className="text-sm leading-6 text-ink-3">
            Sign in to browse your library, plan meals, review imports, and keep cooking notes in
            one quiet place.
          </p>
        </div>
        <Link
          to="/login"
          className="ps-control inline-flex w-full items-center justify-center border border-transparent bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ps-focus-ring"
        >
          Sign in
        </Link>
        <p className="text-xs text-ink-4">Environment: {environment}</p>
      </div>
    </main>
  );
}

function LinkButton({
  to,
  children,
  variant = "primary",
}: {
  to: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      to={to}
      className={`ps-control inline-flex items-center justify-center border px-4 text-sm font-medium focus-visible:ps-focus-ring ${
        variant === "primary"
          ? "border-transparent bg-primary text-primary-foreground hover:opacity-90"
          : "border-rule bg-paper-2 text-ink hover:bg-paper-3"
      }`}
    >
      {children}
    </Link>
  );
}

function LinkText({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="text-sm font-medium text-ink underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

function HeroRecipe({ recipes }: { recipes: DashboardRecipe[] }) {
  const lead = recipes[0];

  if (!lead) {
    return (
      <div className="min-h-[18rem] bg-paper-3">
        <ImageFallback label="ProjectSpice" className="min-h-[18rem]" />
      </div>
    );
  }

  return (
    <Link to={`/recipes/${lead.id}`} className="group relative block min-h-[18rem] overflow-hidden bg-paper-3">
      <ImageFallback imageKey={lead.imageKey} alt={lead.title} label="Recipe" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 text-white">
        <p className="text-xs font-semibold uppercase opacity-80">Tonight's shelf pull</p>
        <h2 className="mt-1 line-clamp-2 text-2xl font-semibold leading-tight">{lead.title}</h2>
        <p className="mt-2 text-sm opacity-85">
          {lead.totalTimeMin ? `${lead.totalTimeMin} min` : lead.ownerName}
        </p>
      </div>
    </Link>
  );
}

function TodayPanel({
  mealPlan,
  shoppingList,
}: {
  mealPlan: MealPlanItem[];
  shoppingList: ActiveShoppingList;
}) {
  const nextMeal = mealPlan[0];
  const listProgress = shoppingList
    ? Math.round((shoppingList.checkedCount / Math.max(shoppingList.itemCount, 1)) * 100)
    : 0;

  return (
    <section className="space-y-4 rounded-lg border border-rule bg-paper-2 p-5 shadow-[var(--shadow-1)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-ink-3">Today</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Next up</h2>
        </div>
        <LinkText to="/meal-planner">Open plan</LinkText>
      </div>

      <div className="rounded-md border border-rule bg-paper p-4">
        {nextMeal ? (
          <div className="space-y-2">
            <Chip>{formatPlanDate(nextMeal.date)}</Chip>
            <h3 className="text-base font-semibold text-ink">
              {nextMeal.recipeTitle ?? nextMeal.notes ?? "Meal note"}
            </h3>
            <p className="text-sm text-ink-3">
              {nextMeal.mealSlot ? titleCase(nextMeal.mealSlot) : "Unslotted"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-ink">No meals planned yet</h3>
            <p className="text-sm text-ink-3">Add a dinner or drag a recipe into the week.</p>
          </div>
        )}
      </div>

      <div className="rounded-md border border-rule bg-paper p-4">
        {shoppingList ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-ink">{shoppingList.name}</h3>
                <p className="text-sm text-ink-3">
                  {shoppingList.checkedCount} of {shoppingList.itemCount} checked
                  {!shoppingList.isOwner && ` · ${shoppingList.ownerName}`}
                </p>
              </div>
              <LinkText to={`/shopping-lists/${shoppingList.id}`}>List</LinkText>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-paper-3">
              <div className="h-full bg-ok" style={{ width: `${listProgress}%` }} />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-ink">No active shopping list</h3>
            <p className="text-sm text-ink-3">Create one from a meal plan or start a fresh list.</p>
            <LinkText to="/shopping-lists">Create list</LinkText>
          </div>
        )}
      </div>
    </section>
  );
}

function RecentlyCookedPanel({ items }: { items: CookedItem[] }) {
  return (
    <section className="rounded-lg border border-rule bg-paper-2 p-4 shadow-[var(--shadow-1)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Recently cooked</h2>
        <LinkText to="/stats">Stats</LinkText>
      </div>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <Link
              key={item.id}
              to={item.recipeId ? `/recipes/${item.recipeId}` : `/logs/${item.id}`}
              className="flex gap-3 rounded-md p-2 hover:bg-paper-3"
            >
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-paper-3">
                <ImageFallback imageKey={item.imageKey} label="Log" alt={item.recipeTitle ?? "Cooking log"} />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-ink">
                  {item.recipeTitle ?? item.notes ?? "Cooking note"}
                </h3>
                <p className="text-xs text-ink-3">
                  {formatDate(item.cookedAt)}
                  {item.rating ? ` · ${item.rating}/5` : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-3">Cooked recipes and notes will appear here.</p>
      )}
    </section>
  );
}

function ImportPanel({ items }: { items: ImportItem[] }) {
  return (
    <section className="rounded-lg border border-rule bg-paper-2 p-4 shadow-[var(--shadow-1)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Import review</h2>
        <LinkText to="/imports/paprika">Import</LinkText>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-md border border-rule bg-paper p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{formatSource(item.sourceType)}</span>
                <Chip tone={item.status === "failed" ? "warning" : "neutral"}>{item.status}</Chip>
              </div>
              <p className="mt-1 text-xs text-ink-3">
                {item.recipeCountImported}
                {item.recipeCountExpected ? ` of ${item.recipeCountExpected}` : ""} recipes imported
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-3">No active import queues need attention.</p>
      )}
    </section>
  );
}

function NamedCountPanel({
  title,
  items,
  hrefPrefix,
  empty,
  actionHref,
}: {
  title: string;
  items: NamedCount[];
  hrefPrefix: string;
  empty: string;
  actionHref: string;
}) {
  return (
    <section className="rounded-lg border border-rule bg-paper-2 p-4 shadow-[var(--shadow-1)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <LinkText to={actionHref}>Manage</LinkText>
      </div>
      {items.length > 0 ? (
        <div className="grid gap-2">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`${hrefPrefix}/${item.id}`}
              className="rounded-md border border-rule bg-paper p-3 hover:bg-paper-3"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="truncate text-sm font-semibold text-ink">{item.name}</h3>
                <span className="shrink-0 text-xs text-ink-3">{item.recipeCount}</span>
              </div>
              {item.description && <p className="mt-1 line-clamp-2 text-xs text-ink-3">{item.description}</p>}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-3">{empty}</p>
      )}
    </section>
  );
}

function AccountPanel({
  user,
  environment,
}: {
  user: { name: string; email?: string | null };
  environment: string;
}) {
  return (
    <section className="rounded-lg border border-rule bg-paper-2 p-4 shadow-[var(--shadow-1)]">
      <h2 className="text-sm font-semibold text-ink">Signed in</h2>
      <p className="mt-1 text-sm text-ink-3">
        {user.name}
        {user.email ? ` · ${user.email}` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <LinkButton to="/change-password" variant="secondary">Password</LinkButton>
        <Form method="post" action="/logout">
          <Button type="submit" variant="ghost">Sign out</Button>
        </Form>
      </div>
      <p className="mt-3 text-xs text-ink-4">Environment: {environment}</p>
    </section>
  );
}

function EmptyPanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-rule bg-paper-2 p-6 text-center shadow-[var(--shadow-1)]">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-3">{description}</p>
      <div className="mt-3">{action}</div>
    </div>
  );
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function formatPlanDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatSource(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
