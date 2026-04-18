import { createSessionStorage } from "react-router";

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function getSessionStorage(env: Env) {
  return createSessionStorage<{ userId: string }>({
    cookie: {
      name: "__session",
      httpOnly: true,
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: env.ENVIRONMENT !== "development",
      secrets: [env.SESSION_SECRET],
    },
    async createData(data) {
      const id = crypto.randomUUID();
      await env.SESSIONS.put(`session:${id}`, JSON.stringify(data), {
        expirationTtl: SESSION_TTL_SECONDS,
      });
      return id;
    },
    async readData(id) {
      const raw = await env.SESSIONS.get(`session:${id}`);
      if (!raw) return null;
      return JSON.parse(raw) as { userId: string };
    },
    async updateData(id, data) {
      await env.SESSIONS.put(`session:${id}`, JSON.stringify(data), {
        expirationTtl: SESSION_TTL_SECONDS,
      });
    },
    async deleteData(id) {
      await env.SESSIONS.delete(`session:${id}`);
    },
  });
}
