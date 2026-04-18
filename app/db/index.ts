import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = ReturnType<typeof drizzle<Schema>>;

/**
 * Creates a Drizzle instance backed by a D1 Session, providing
 * read-after-write consistency via the D1 Sessions API.
 *
 * bookmark — pass the bookmark from a prior write so reads on replicas
 *   reflect that write. Omit (or pass "first-primary") to always read
 *   from the primary; use this after mutations within the same request.
 */
export function createDb(d1: D1Database, bookmark?: string | null) {
  const session = d1.withSession(bookmark ?? "first-primary");
  // D1DatabaseSession extends D1Database, so it is safe to pass here.
  const db = drizzle(session as unknown as D1Database, { schema });
  return {
    db,
    /** Returns the current session bookmark after any statement execution. */
    getBookmark: () => session.getBookmark(),
  };
}

export { schema };
