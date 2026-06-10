import {
  createRequestHandler,
  RouterContextProvider,
} from "react-router";

import { cloudflareRuntimeContext } from "../app/server/runtime-context";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  fetch(request, env, ctx) {
    const routerContext = new RouterContextProvider();

    routerContext.set(cloudflareRuntimeContext, { env, ctx });

    return requestHandler(request, routerContext);
  },
} satisfies ExportedHandler<Env>;
