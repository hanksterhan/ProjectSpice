import { data, Form, Link } from "react-router";
import { eq, and, asc } from "drizzle-orm";
import type { Route } from "./+types/logs.$id";
import { requireUser } from "~/lib/auth.server";
import { createDb, schema } from "~/db";
import { appImageSrcSet, appImageUrl } from "~/lib/image-url";
import { AppShell } from "~/components/app-shell";
import { Chip, SectionHeader } from "~/components/ui";

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

  return { user, log, photos, recipe: recipeRows[0] ?? null };
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
  const { user, log, photos, recipe } = loaderData;

  const backHref = recipe ? `/recipes/${recipe.id}` : "/recipes";
  const backLabel = recipe ? recipe.title : "Recipes";

  const uploadError =
    actionData && "error" in actionData ? (actionData as { error: string }).error : null;

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl space-y-6">
        <SectionHeader
          eyebrow={formatDate(log.cookedAt)}
          title="Cook Log"
          description={recipe ? `A cooking memory for ${recipe.title}.` : "A free-form cooking memory."}
          actions={
            <Link to={backHref} className="ps-control inline-flex items-center justify-center border border-rule bg-paper-2 px-4 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:ps-focus-ring">
              {backLabel}
            </Link>
          }
        />

        <section className="ps-surface space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{formatDate(log.cookedAt)}</Chip>
            {photos.length > 0 && <Chip>{photos.length} photo{photos.length === 1 ? "" : "s"}</Chip>}
          </div>

          {recipe && (
            <p className="ps-display text-2xl text-ink">
              <Link
                to={`/recipes/${recipe.id}`}
                className="hover:underline"
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
                  className={n <= log.rating! ? "text-warn" : "text-ink-4/40"}
                  aria-hidden="true"
                >
                  ★
                </span>
              ))}
            </div>
          )}

          {log.notes && (
            <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{log.notes}</p>
          )}

          {log.modifications && (
            <div className="rounded-md border border-rule bg-paper-3 p-3">
              <p className="mb-1 text-xs font-semibold uppercase text-ink-3">
                Modifications
              </p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{log.modifications}</p>
            </div>
          )}
        </section>

        <section className="ps-surface p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">Photos</h2>
            <Chip>{photos.length} saved</Chip>
          </div>

          {photos.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((photo) => (
                <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg bg-paper-3">
                  <img
                    src={appImageUrl(photo.imageKey, { width: 512, format: "webp" }) ?? undefined}
                    srcSet={appImageSrcSet(photo.imageKey, [256, 512, 768])}
                    sizes="(min-width: 640px) 33vw, 50vw"
                    alt={photo.caption ?? "Cooking photo"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <Form
                    method="post"
                    className="absolute right-1 top-1"
                    onSubmit={(e) => {
                      if (!confirm("Delete this photo?")) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="_intent" value="delete-photo" />
                    <input type="hidden" name="photoId" value={photo.id} />
                    <button
                      type="submit"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white opacity-0 transition-opacity hover:bg-black/75 focus:opacity-100 group-hover:opacity-100"
                      aria-label="Delete photo"
                    >
                      ×
                    </button>
                  </Form>
                  {photo.caption && (
                    <p className="absolute bottom-0 left-0 right-0 truncate bg-black/55 px-2 py-1 text-xs text-white">
                      {photo.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {photos.length === 0 && (
            <p className="mb-4 rounded-md border border-dashed border-rule bg-paper-3 px-3 py-8 text-center text-sm text-ink-3">No photos yet.</p>
          )}

          <Form
            method="post"
            encType="multipart/form-data"
            className="flex w-fit flex-col gap-2"
          >
            <input type="hidden" name="_intent" value="upload-photo" />
            <label className="ps-control inline-flex cursor-pointer select-none items-center gap-2 border border-rule bg-paper-2 px-4 text-sm font-medium text-ink transition-colors hover:bg-paper-3 focus-within:ps-focus-ring">
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
              <p className="text-xs text-err">{uploadError}</p>
            )}
          </Form>
        </section>
      </div>
    </AppShell>
  );
}
