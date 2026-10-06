import { spawnSync } from "node:child_process";
const run = (args) => {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};
run(["scripts/db-migrate.mjs"]);
run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
