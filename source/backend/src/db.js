import knex from "knex";
import pg from "pg";
pg.types.setTypeParser(20, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new Error("Money exceeds safe integer range");
  return n;
});
export const db = knex({
  client: "pg",
  connection:
    process.env.DATABASE_URL ||
    "postgres://obsidian:local-db-password@localhost:5432/obsidian",
  pool: { min: 0, max: 10 },
});
export const camel = (value) => {
  if (Array.isArray(value)) return value.map(camel);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        camel(v),
      ]),
    );
  return value;
};
export const json = (value) => JSON.stringify(value);
