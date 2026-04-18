import { redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { AppLoadContext } from "react-router";
import { createDb, schema } from "~/db";
import { getSessionStorage } from "./sessions.server";

const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256
  );
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const hashHex = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(
    saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  );
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256
  );
  const computed = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time comparison to prevent timing attacks
  if (computed.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ hashHex.charCodeAt(i);
  }
  return diff === 0;
}

export async function getUserId(
  request: Request,
  context: AppLoadContext
): Promise<string | null> {
  const { getSession } = getSessionStorage(context.cloudflare.env);
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  return typeof userId === "string" ? userId : null;
}

export async function getUser(request: Request, context: AppLoadContext) {
  const userId = await getUserId(request, context);
  if (!userId) return null;
  const { db } = createDb(context.cloudflare.env.DB);
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { id: true, email: true, name: true },
  });
  return user ?? null;
}

export async function requireUser(request: Request, context: AppLoadContext) {
  const user = await getUser(request, context);
  if (!user) throw redirect("/login");
  return user;
}

export async function createUserSession(
  request: Request,
  context: AppLoadContext,
  userId: string,
  redirectTo: string
) {
  const { getSession, commitSession } = getSessionStorage(
    context.cloudflare.env
  );
  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", userId);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export async function logout(request: Request, context: AppLoadContext) {
  const { getSession, destroySession } = getSessionStorage(
    context.cloudflare.env
  );
  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/login", {
    headers: { "Set-Cookie": await destroySession(session) },
  });
}
