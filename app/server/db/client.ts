import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export type ProjectSpiceDb = ReturnType<typeof createD1Client>;

export function createD1Client(database: D1Database) {
  return drizzle(database, { schema });
}
