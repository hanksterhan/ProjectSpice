import { data, Form, Link } from "react-router";
import { eq, and, asc } from "drizzle-orm";
import type { Route } from "./+types/logs.$id";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";

export function meta() {
  return [{ title: "Cook Log — ProjectSpice" }];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const [log] = await db
    .select()
    .from(schema.cookingLog)
    .where(
      and(
        eq(schema.cookingLog.id, params.id),
        eq(schema.cookingLog.userId, user.id)
      )
    )
    .limit(1);

  if (!log) throw data(null, { status: 404 });

  const photosPromise = db
    .select()
    .from(schema.cookingLogPhotos)
    .where(eq(schema.cookingLogPhotos.logId, log.id))
    .orderBy(asc(schema.cookingLogPhotos.id));

  const recipePromise = log.recipeId
    ? db
        .select({ id: schema.recipes.id, title: schema.recipes.title })
        .from(schema.recipes)
        .where(
          and(
            eq(schema.recipes.id, log.recipeId),
            eq(schema.recipes.userId, user.id)
          )
        )
        .limit(1)
    : Promise.resolve([] as { id: string; title: string }[]);

  const [photos, recipeRows] = await Promise.all([photosPromise, recipePromise]);

  return { log, photos, recipe: recipeRows[0] ?? null };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const { db } = createDb(context.cloudflare.env.DB);

  const [log] = await db
    .select({ id: schema.cookingLog.id })
    .from(schema.cookingLog)
    .where(
      and(
        eq(schema.cookingLog.id, params.id),
        eq(schema.cookingLog.userId, user.id)
      )
    )
    .limit(1);

  if (!log) throw data(null, { status: 404 });

  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");

  if (intent === "delete-photo") {
    const photoId = String(fd.get("photoId") ?? "");
    const [photo] = await db
      .select()
      .from(schema.cookingLogPhotos)
      .where(
        and(
          eq(schema.cookingLogPhotos.id, photoId),
          eq(schema.cookingLogPhotos.logId, log.id)
        )
      )
      .limit(1);

    if (photo) {
      await context.cloudflare.env.IMAGES.delete(photo.imageKey);
      await db
        .delete(schema.cookingLogPhotos)
        .where(eq(schema.cookingLogPhotos.id, photoId));
    }

    return {};
  }

  if (intent === "upload-photo") {
    const file = fd.get("photo") as File | null;
    if (!file || !(file instanceof File) || file.size === 0) {
      return { error: "No file provided" };
    }

    if (file.size > 10 * 1024 * 1024) {
      return { error: "File too large (max 10 MB)" };
    }

    const contentType = file.type || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return { error: "Only image files are allowed" };
    }

    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const photoId = crypto.randomUUID();
    const imageKey = `logs/${user.id}/${log.id}/${photoId}.${ext}`;

    const bytes = await file.arrayBuffer();
    await context.cloudflare.env.IMAGES.put(imageKey, bytes, {
      httpMetadata: { contentType },
    });

    const caption = String(fd.get("caption") ?? "").trim() || null;
    await db.insert(schema.cookingLogPhotos).values({
      id: photoId,
      logId: log.id,
      imageKey,
      caption,
    });

    return {};
  }

  throw data(null, { status: 400 });
}

const WEEK_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function formatDate(ts: Date | string | number): string {
  const d = new Date(ts);
  return `${WEEK_DAY[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function LogDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { log, photos, recipe } = loaderData;

  const backHref = recipe ? `/recipes/${recipe.id}` : "/recipes";
  const backLabel = recipe ? `← ${recipe.title}` : "← Recipes";

  const uploadError =
    actionData && "error" in actionData ? (actionData as { error: string }).error : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            to={backHref}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            {backLabel}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-sm">Cook Log</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* Metadata */}
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">{formatDate(log.cookedAt)}</p>

          {recipe && (
            <p className="text-lg font-semibold">
              <Link
                to={`/recipes/${recipe.id}`}
                className="hover:underline transition-colors"
              >
                {recipe.title}
              </Link>
            </p>
          )}

          {log.rating !== null && log.rating !== undefined && (
            <div
              className="flex gap-0.5"
              role="img"
              aria-label={`${log.rating} out of 5 stars`}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className={n <= log.rating! ? "text-yellow-400" : "text-muted-foreground/25"}
                  aria-hidden="true"
                >
                  ★
                </span>
              ))}
            </div>
          )}

          {log.notes && (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{log.notes}</p>
          )}

          {log.modifications && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Modifications
              </p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{log.modifications}</p>
            </div>
          )}
        </section>

        {/* Photos */}
        <section>
          <h2 className="text-sm font-semibold mb-3">Photos</h2>

          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {photos.map((photo) => (
                <div key={photo.id} className="relative group aspect-square">
                  <img
                    src={`/cdn/images/${photo.imageKey}`}
                    alt={photo.caption ?? "Cooking photo"}
                    className="w-full h-full object-cover rounded-md"
                    loading="lazy"
                  />
                  <Form
                    method="post"
                    className="absolute top-1 right-1"
                    onSubmit={(e) => {
                      if (!confirm("Delete this photo?")) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="_intent" value="delete-photo" />
                    <input type="hidden" name="photoId" value={photo.id} />
                    <button
                      type="submit"
                      className="bg-black/60 text-white rounded-full w-7 h-7 text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      aria-label="Delete photo"
                    >
                      ×
                    </button>
                  </Form>
                  {photo.caption && (
                    <p className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 rounded-b-md truncate">
                      {photo.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {photos.length === 0 && (
            <p className="text-sm text-muted-foreground mb-4">No photos yet.</p>
          )}

          {/* Upload */}
          <Form
            method="post"
            encType="multipart/form-data"
            className="flex flex-col gap-2 w-fit"
          >
            <input type="hidden" name="_intent" value="upload-photo" />
            <label className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-input px-4 py-2 text-sm hover:bg-muted transition-colors select-none">
              <span>+ Add photo</span>
              <input
                type="file"
                name="photo"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  if (e.currentTarget.form && e.currentTarget.files?.length) {
                    e.currentTarget.form.requestSubmit();
                  }
                }}
              />
            </label>
            {uploadError && (
              <p className="text-xs text-destructive">{uploadError}</p>
            )}
          </Form>
        </section>
      </main>
    </div>
  );
}
