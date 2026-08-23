/**
 * Non-secret DB pool settings parsing for Platform Core DB.
 *
 * Defaults are conservative and apply whenever a setting is omitted or empty.
 * Secrets (connection strings) never appear in this module or in source.
 */

export const DB_POOL_DEFAULTS = {
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
} as const;

/**
 * Narrow readonly environment shape accepted by pool-settings helpers.
 * Deliberately not the full augmented `NodeJS.ProcessEnv`.
 */
export type DbPoolEnvironment = {
  readonly DATABASE_URL?: string;
  readonly DB_POOL_MAX?: string;
  readonly DB_POOL_IDLE_TIMEOUT_MS?: string;
  readonly DB_POOL_CONNECTION_TIMEOUT_MS?: string;
};

export type DbPoolSettings = {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
};

function parsePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer, received "${raw}"`);
  }
  return value;
}

export function readDbPoolSettings(env: DbPoolEnvironment): DbPoolSettings {
  return {
    max: parsePositiveInt("DB_POOL_MAX", env.DB_POOL_MAX, DB_POOL_DEFAULTS.max),
    idleTimeoutMillis: parsePositiveInt(
      "DB_POOL_IDLE_TIMEOUT_MS",
      env.DB_POOL_IDLE_TIMEOUT_MS,
      DB_POOL_DEFAULTS.idleTimeoutMillis,
    ),
    connectionTimeoutMillis: parsePositiveInt(
      "DB_POOL_CONNECTION_TIMEOUT_MS",
      env.DB_POOL_CONNECTION_TIMEOUT_MS,
      DB_POOL_DEFAULTS.connectionTimeoutMillis,
    ),
  };
}
