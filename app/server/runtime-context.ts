import {
  createContext,
  type AppLoadContext,
  type RouterContextProvider,
} from "react-router";

export type CloudflareRuntimeContext = {
  ctx: ExecutionContext;
  env: Env;
};

export type RuntimeLoadContext = AppLoadContext | RouterContextProvider;

export const cloudflareRuntimeContext = createContext<CloudflareRuntimeContext>();

export function getCloudflareRuntimeContext(
  context: RuntimeLoadContext,
): CloudflareRuntimeContext {
  if (isRouterContextProvider(context)) {
    return context.get(cloudflareRuntimeContext);
  }

  const legacyContext = context as AppLoadContext & {
    cloudflare?: CloudflareRuntimeContext;
  };

  if (legacyContext.cloudflare) {
    return legacyContext.cloudflare;
  }

  throw new Error("Cloudflare runtime context is not available.");
}

function isRouterContextProvider(
  context: RuntimeLoadContext,
): context is RouterContextProvider {
  return typeof (context as RouterContextProvider).get === "function";
}
