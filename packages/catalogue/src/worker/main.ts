/**
 * The worker: the catalogue's process for work outside requests.
 *
 *   node build/worker/main.js migrate   applies the database migrations, then exits
 *
 * The jobs that keep the catalogue up to date join it here.
 */
import { readConfig } from '#lib/server/config.js';
import { connect } from '#lib/server/db/connect.js';
import { createLogger } from '#lib/server/log.js';

const config = readConfig(process.env);
const log = createLogger({ level: config.LOG_LEVEL }).child({ process: 'worker' });
const [command] = process.argv.slice(2);

async function main(): Promise<number> {
  switch (command) {
    case 'migrate': {
      const connection = connect(config.DATABASE_URL);
      try {
        await connection.migrate(config.MIGRATIONS_DIR);
        log.info('The database is up to date', { migrations: config.MIGRATIONS_DIR });
        return 0;
      } finally {
        await connection.close();
      }
    }
    default:
      log.error('Unknown command', { command, commands: ['migrate'] });
      return 2;
  }
}

main().then(
  code => {
    process.exitCode = code;
  },
  (error: unknown) => {
    log.error('The worker failed', { command, error });
    process.exitCode = 1;
  },
);
