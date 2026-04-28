import { createRequestHandler } from "react-router";
import { processPdfImportJob, type PdfImportMessage } from "../app/lib/pdf-import.server";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      await processPdfImportJob(env, message.body as PdfImportMessage);
      message.ack();
    }
  },
} satisfies ExportedHandler<Env>;
