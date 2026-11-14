// Helper to run migrations using node-pg-migrate CLI
import { execSync } from 'child_process';
import { resolve } from 'path';

export const runner = async (options: {
  direction: 'up' | 'down';
  databaseUrl: string;
  dir: string;
  migrationsTable: string;
  log?: (msg: string) => void;
}) => {
  const { direction, databaseUrl, dir, migrationsTable, log } = options;
  const absoluteDir = resolve(process.cwd(), dir);
  const cmd = `npx node-pg-migrate ${direction} --database-url "${databaseUrl}" --dir "${absoluteDir}" --migrations-dir "${absoluteDir}" --migrations-table "${migrationsTable}" --log=false`;
  const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() });
  if (log) log(output);
};