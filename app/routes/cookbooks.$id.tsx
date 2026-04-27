import { Form, Link, useNavigation } from "react-router";
import { redirect } from "react-router";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Route } from "./+types/cookbooks.$id";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { appImageUrl } from "~/lib/image-url";

export function meta({ data }: Route.MetaArgs) {
  const name = (data as { cookbook: { name: string } } | undefined)?.cookbook?.name ?? "Cookbook";
  return [{ title: `${name} — ProjectSpice` }];
}

// ─── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const [cookbook] = await db
    .select({
      id: schema.cookbooks.id,
      name: schema.cookbooks.name,
      description: schema.cookbooks.description,
      archived: schema.cookbooks.archived,
    })
    .from(schema.cookbooks)
    .where(
      and(
        eq(schema.cookbooks.id, params.id),
        eq(schema.cookbooks.userId, user.id)
      )
    );

  if (!cookbook) throw new Response("Not Found", { status: 404 });

  const recipes = await db
    .select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      totalTimeMin: schema.recipes.totalTimeMin,
      imageKey: schema.recipes.imageKey,
      sortOrder: schema.cookbookRecipes.sortOrder,
    })
    .from(schema.cookbookRecipes)
    .innerJoin(schema.recipes, eq(schema.cookbookRecipes.recipeId, schema.recipes.id))
    .where(
      and(
        eq(schema.cookbookRecipes.cookbookId, params.id),
        isNull(schema.recipes.deletedAt)
      )
    )
    .orderBy(asc(schema.cookbookRecipes.sortOrder), asc(schema.recipes.title));

  return { cookbook, recipes };
}

// ─── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");
  const { db } = createDb(context.cloudflare.env.DB);

  // Verify ownership
  const [cookbook] = await db
    .select({ id: schema.cookbooks.id })
    .from(schema.cookbooks)
    .where(
      and(
        eq(schema.cookbooks.id, params.id),
        eq(schema.cookbooks.userId, user.id)
      )
    );
  if (!cookbook) throw new Response("Not Found", { status: 404 });

  if (intent === "remove-recipe") {
    const recipeId = String(fd.get("recipeId") ?? "");
    await db
      .delete(schema.cookbookRecipes)
      .where(
        and(
          eq(schema.cookbookRecipes.cookbookId, params.id),
          eq(schema.cookbookRecipes.recipeId, recipeId)
        )
      );
    return redirect(`/cookbooks/${params.id}`);
  }

  return { error: "Unknown action." };
}

// ─── Component ─────────────────────────────────────────────────────────────────

function formatTime(min: number | null) {
  if (!min) return null;
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function CookbookDetail({ loaderData }: Route.ComponentProps) {
  const { cookbook, recipes } = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link
          to="/settings/cookbooks"
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ← Cookbooks
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 truncate">
            {cookbook.name}
            {cookbook.archived && (
              <span className="ml-2 text-xs text-gray-400 font-normal">archived</span>
            )}
          </h1>
          {cookbook.description && (
            <p className="text-xs text-gray-500 truncate">{cookbook.description}</p>
          )}
        </div>
        <span className="ml-auto text-sm text-gray-500 shrink-0">
          {recipes.length} recipe{recipes.length !== 1 ? "s" : ""}
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {recipes.length === 0 ? (
          <div className="text-center text-gray-500 py-16">
            <p className="text-base font-medium">No recipes in this cookbook yet.</p>
            <p className="text-sm mt-1">
              Recipes are linked to cookbooks during Paprika import, or you can add them from a{" "}
              <Link to="/recipes" className="text-blue-600 hover:underline">
                recipe's detail page
              </Link>
              .
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 bg-white border rounded-lg">
            {recipes.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                {appImageUrl(r.imageKey) ? (
                  <img
                    src={appImageUrl(r.imageKey) ?? undefined}
                    alt=""
                    className="w-12 h-12 rounded object-cover shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-12 h-12 rounded bg-gray-100 shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <Link
                    to={`/recipes/${r.id}`}
                    className="font-medium text-sm text-gray-900 hover:text-blue-600 truncate block"
                  >
                    {r.title}
                  </Link>
                  {r.totalTimeMin && (
                    <span className="text-xs text-gray-400">{formatTime(r.totalTimeMin)}</span>
                  )}
                </div>

                <Form method="post">
                  <input type="hidden" name="_intent" value="remove-recipe" />
                  <input type="hidden" name="recipeId" value={r.id} />
                  <button
                    type="submit"
                    disabled={busy}
                    aria-label={`Remove ${r.title} from cookbook`}
                    className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50 px-2 py-1"
                    onClick={(e) => {
                      if (!confirm(`Remove "${r.title}" from this cookbook?`)) {
                        e.preventDefault();
                      }
                    }}
                  >
                    Remove
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
