/** Support both standard PostgreSQL and the existing prefixed Prisma integration. */
export function databaseUrls(env) {
  const isPostgres = (value) =>
    typeof value === "string" && /^postgres(?:ql)?:\/\//.test(value);
  const runtime = [env.DATABASE_URL, env.DATABASE_POSTGRES_URL].find(
    isPostgres,
  );
  const direct = [
    env.DATABASE_URL_UNPOOLED,
    env.DIRECT_URL,
    env.DATABASE_POSTGRES_URL,
    runtime,
  ].find(isPostgres);
  return { runtime, direct };
}
