import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import * as schema from "./schema";

declare global {
  var classyApparelsPool: Pool | undefined;
}

function required(name: "DB_HOST" | "DB_USER" | "DB_PASSWORD" | "DB_NAME") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Add it in Hostinger's Node.js environment settings.`);
  return value;
}

function databaseHost() {
  const configured = required("DB_HOST");
  // Hostinger's Node.js containers can resolve `localhost` to IPv6 (`::1`).
  // Its local MySQL account expects the IPv4 connection instead.
  return configured === "localhost" || configured === "::1" ? "127.0.0.1" : configured;
}

function pool() {
  if (!global.classyApparelsPool) {
    global.classyApparelsPool = createPool({
      host: databaseHost(),
      port: Number(process.env.DB_PORT ?? 3306),
      user: required("DB_USER"),
      password: required("DB_PASSWORD"),
      database: required("DB_NAME"),
      waitForConnections: true,
      connectionLimit: 8,
      queueLimit: 0,
      charset: "utf8mb4",
      timezone: "Z",
    });
  }
  return global.classyApparelsPool;
}

export function getDb() {
  return drizzle({ client: pool(), schema, mode: "default" });
}
