import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Cloudflare Workers / Hyperdrive Prisma factory.
 * Create a client from the current DATABASE_URL for each request path.
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

// Backward-compatible default export for existing route modules.
// New code should prefer getPrisma().
const prisma = getPrisma();
export default prisma;
