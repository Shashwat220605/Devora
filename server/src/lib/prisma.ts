import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Cloudflare Workers run in an edge/serverless environment where a long-lived
 * global PrismaClient can reuse connections across requests in ways that are
 * not reliable for this runtime. Create the adapter/client for each request.
 * Hyperdrive handles database connection pooling at the network layer.
 */
export function getPrisma() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not defined");
  }

  const adapter = new PrismaPg({
    connectionString,
  });

  return new PrismaClient({
    adapter,
  });
}
