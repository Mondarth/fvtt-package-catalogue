/**
 * Logging: one JSON object per line, for the container's log driver. Nothing else writes to the console.
 */
import { LOG_LEVELS, type LogLevel } from './config.js';

/** Details logged with a message. */
export type LogFields = Readonly<Record<string, unknown>>;

/** A namespaced logger. */
export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** A logger whose lines carry these fields too. */
  child(fields: LogFields): Logger;
}

/** How a logger writes. */
export interface LoggerOptions {
  /** The lowest level logged. */
  readonly level: LogLevel;
  /** Where each line goes; standard output by default. */
  readonly write?: (line: string) => void;
  /** The time each line is stamped with; the current time by default. */
  readonly now?: () => Date;
}

/**
 * An error as a log can carry it, with what caused it: JSON drops an Error's own properties. Drizzle, for one, wraps
 * the database's error in a cause.
 */
function serialisable(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  const { name, message, stack, cause } = value;
  return { name, message, stack, ...(cause !== undefined && { cause: serialisable(cause) }) };
}

/**
 * A logger writing JSON lines.
 *
 * @param options - The level and where lines go
 * @returns The logger
 */
export function createLogger({
  level,
  write = line => process.stdout.write(`${line}\n`),
  now = () => new Date(),
}: LoggerOptions): Logger {
  const lowest = LOG_LEVELS.indexOf(level);

  const make = (base: LogFields): Logger => {
    const log =
      (at: LogLevel) =>
      (message: string, fields: LogFields = {}): void => {
        if (LOG_LEVELS.indexOf(at) < lowest) return;
        const entries = Object.entries({ ...base, ...fields }).map(([key, value]) => [key, serialisable(value)]);
        write(JSON.stringify({ time: now().toISOString(), level: at, message, ...Object.fromEntries(entries) }));
      };
    return {
      debug: log('debug'),
      info: log('info'),
      warn: log('warn'),
      error: log('error'),
      child: fields => make({ ...base, ...fields }),
    };
  };

  return make({});
}
