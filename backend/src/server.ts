import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = buildApp();

async function start() {
  try {
    await app.listen({ host: env.host, port: env.port });
  } catch (error) {
    app.log.error(error, "failed to start backend");
    process.exit(1);
  }
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down backend");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await start();
