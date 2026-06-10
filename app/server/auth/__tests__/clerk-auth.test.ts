import { RouterContextProvider } from "react-router";
import { describe, expect, it } from "vitest";

import {
  cloudflareRuntimeContext,
  type CloudflareRuntimeContext,
} from "~/server/runtime-context";

import {
  getBypassAuthenticatedUser,
  getSignInRedirectUrl,
  isAuthBypassEnabled,
  isPublicAuthPath,
} from "../clerk-auth";

describe("Clerk auth route helpers", () => {
  it("treats sign-in and sign-up pages as public auth routes", () => {
    expect(isPublicAuthPath("https://spice.local/sign-in")).toBe(true);
    expect(isPublicAuthPath("https://spice.local/sign-in/factor-one")).toBe(true);
    expect(isPublicAuthPath("https://spice.local/sign-up")).toBe(true);
    expect(isPublicAuthPath("https://spice.local/sign-up/continue")).toBe(true);
    expect(isPublicAuthPath("https://spice.local/recipes/new")).toBe(false);
  });

  it("preserves the attempted URL when redirecting to sign-in", () => {
    const request = new Request("https://spice.local/recipes/new?mode=chat");

    expect(getSignInRedirectUrl(request)).toBe(
      "/sign-in?redirect_url=https%3A%2F%2Fspice.local%2Frecipes%2Fnew%3Fmode%3Dchat",
    );
  });

  it("uses a stable test user for explicit auth bypass mode", () => {
    expect(getBypassAuthenticatedUser()).toEqual({
      userId: "test-user",
    });
  });

  it("honors request-scoped auth bypass only in development", () => {
    const context = createRuntimeContext("development");
    const request = new Request("https://spice.local/", {
      headers: {
        "x-projectspice-auth-bypass": "1",
      },
    });

    expect(isAuthBypassEnabled(context, request)).toBe(true);
    expect(isAuthBypassEnabled(createRuntimeContext("production"), request)).toBe(
      false,
    );
  });
});

function createRuntimeContext(
  environment: CloudflareRuntimeContext["env"]["ENVIRONMENT"],
) {
  const context = new RouterContextProvider();

  context.set(cloudflareRuntimeContext, {
    ctx: {} as ExecutionContext,
    env: {
      ENVIRONMENT: environment,
    } as Env,
  });

  return context;
}
