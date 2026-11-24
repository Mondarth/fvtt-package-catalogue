/**
 * Applies the accounts' database migrations, then exits: `node build/migrate.js`, run before the server starts, as
 * the deployment's `accounts-migrate` service does.
 */
import { connect } from '#lib/server/db/connect.js';
import { DatabaseUrl, LogLevel } from '#lib/server/config.js';
import { createLogger } from '#lib/server/log.js';

const log = createLogger({ level: LogLevel.parse(process.env.LOG_LEVEL) }).child({ process: 'migrate' });
const migrations = process.env.MIGRATIONS_DIR ?? 'drizzle';

const connection = connect(DatabaseUrl.parse(process.env.DATABASE_URL));
try {
  await connection.migrate(migrations);
  log.info('The database is up to date', { migrations });
} catch (error) {
  log.error('The migrations failed', { error });
  process.exitCode = 1;
} finally {
  await connection.close();
}
