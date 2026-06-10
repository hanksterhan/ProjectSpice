import { redirect, type LoaderFunctionArgs } from "react-router";
import { getAuth } from "@clerk/react-router/server";

import {
  getCloudflareRuntimeContext,
  type RuntimeLoadContext,
} from "~/server/runtime-context";

export const publicAuthPathPrefixes = ["/sign-in", "/sign-up"] as const;
const testAuthUserId = "test-user";

export type AuthenticatedUser = {
  userId: string;
};

export function isPublicAuthPath(url: string | URL): boolean {
  const pathname = typeof url === "string" ? new URL(url).pathname : url.pathname;

  return publicAuthPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function getSignInRedirectUrl(request: Request): string {
  const redirectUrl = new URL("/sign-in", request.url);
  redirectUrl.searchParams.set("redirect_url", request.url);

  return `${redirectUrl.pathname}${redirectUrl.search}`;
}

export function redirectToSignIn(request: Request): Response {
  return redirect(getSignInRedirectUrl(request));
}

export function isAuthBypassEnabled(
  context: RuntimeLoadContext,
  request?: Request,
): boolean {
  const env = getCloudflareRuntimeContext(context).env as unknown as Record<
    string,
    unknown
  >;
  const environment = env.ENVIRONMENT ?? process.env.ENVIRONMENT;
  const requestUrl = request ? new URL(request.url) : undefined;
  const bypass = request
    ? request.headers.get("x-projectspice-auth-bypass") === "1" ||
      requestUrl?.searchParams.get("projectspice_auth_bypass") === "1"
    : env.PROJECTSPICE_AUTH_BYPASS === "1" ||
      process.env.PROJECTSPICE_AUTH_BYPASS === "1";

  return environment === "development" && bypass;
}

export function getBypassAuthenticatedUser(): AuthenticatedUser {
  return {
    userId: testAuthUserId,
  };
}

export async function requireAuthenticatedUser(
  args: Pick<LoaderFunctionArgs, "context" | "params" | "request">,
): Promise<AuthenticatedUser> {
  if (isAuthBypassEnabled(args.context, args.request)) {
    return getBypassAuthenticatedUser();
  }

  const auth = await getAuth(args as LoaderFunctionArgs);

  if (!auth.isAuthenticated || !auth.userId) {
    throw redirectToSignIn(args.request);
  }

  return {
    userId: auth.userId,
  };
}
