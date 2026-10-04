import type { FastifyInstance } from "fastify";

import { registerListingRoutes } from "./listings.js";
import { registerMarketRoutes } from "./market.js";
import { registerStreamRoutes } from "./streams.js";
import { registerUserRoutes } from "./users.js";

export async function registerApiRoutes(app: FastifyInstance) {
  await registerStreamRoutes(app);
  await registerListingRoutes(app);
  await registerMarketRoutes(app);
  await registerUserRoutes(app);
}
