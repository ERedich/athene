import pg from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "[athene-backend] DATABASE_URL is not set; database routes will fail until it is configured.",
  );
}

export const pool = new pg.Pool({
  connectionString: connectionString ?? undefined,
  max: 10,
});
