/**
 * The integration suite truncates every table, so it only ever runs against a
 * database whose name says it is disposable — never the dev or prod database.
 */
const DISPOSABLE_DB = /(_int|_ci|_test)$/;

export function getIntegrationDatabaseUrl(): string {
  const url = process.env.INTEGRATION_DATABASE_URL;
  if (!url) {
    throw new Error(
      "INTEGRATION_DATABASE_URL is not set. Point it at a disposable database, e.g. " +
        "postgresql://user:pass@localhost:5432/nexa_gen_int"
    );
  }
  const name = integrationDatabaseName(url);
  if (!DISPOSABLE_DB.test(name)) {
    throw new Error(
      `Refusing to run integration tests against "${name}": the database name must end in _int, _ci or _test.`
    );
  }
  return url;
}

export function integrationDatabaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}
