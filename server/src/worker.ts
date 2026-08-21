import { httpServerHandler } from "cloudflare:node";

type HyperdriveEnv = {
  HYPERDRIVE: {
    connectionString: string;
  };
};

type WorkerHandler = {
  fetch: (
    request: Request,
  ) => Response | Promise<Response>;
};

let handlerPromise: Promise<WorkerHandler> | null = null;

async function getHandler(env: HyperdriveEnv) {
  if (!handlerPromise) {
    process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;

    handlerPromise = import("./app.js").then(({ default: app }) => {
      app.listen(3000);
      return httpServerHandler({ port: 3000 }) as WorkerHandler;
    });
  }

  return handlerPromise;
}

export default {
  async fetch(
    request: Request,
    env: HyperdriveEnv,
  ) {
    const handler = await getHandler(env);
    return handler.fetch(request);
  },
};
