import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

// Cloudflare Workers can use Neon's HTTP transport, which avoids relying
// on a long-lived outbound WebSocket connection for database queries.
neonConfig.poolQueryViaFetch = true;

// Node/local development still needs a WebSocket implementation when
// the Neon driver falls back to WebSocket transport.
if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

const adapter = new PrismaNeon({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

export default prisma;
