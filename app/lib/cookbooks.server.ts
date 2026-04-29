import { and, asc, eq } from "drizzle-orm";
import { schema, type Db } from "~/db";

export async function findCookbookByName(
  db: Db,
  userId: string,
  name: string
): Promise<{ id: string } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const [row] = await db
    .select({ id: schema.cookbooks.id })
    .from(schema.cookbooks)
    .where(and(eq(schema.cookbooks.userId, userId), eq(schema.cookbooks.name, trimmed)))
    .orderBy(asc(schema.cookbooks.createdAt), asc(schema.cookbooks.id))
    .limit(1);

  return row ?? null;
}

export async function getOrCreateCookbookByName(
  db: Db,
  userId: string,
  name: string,
  description?: string | null
): Promise<{ id: string } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  await db
    .insert(schema.cookbooks)
    .values({
      id: crypto.randomUUID(),
      userId,
      name: trimmed,
      description: description?.trim() || null,
    })
    .onConflictDoNothing();

  return findCookbookByName(db, userId, trimmed);
}
