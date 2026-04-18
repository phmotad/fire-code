import pino from 'pino';
import pretty from 'pino-pretty';

const isDev = process.env.NODE_ENV !== 'production';
const level = process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info');
const opts = { level, base: undefined, timestamp: pino.stdTimeFunctions.isoTime };

export const logger = isDev
  ? pino(opts, pretty({ colorize: true, ignore: 'pid,hostname' }))
  : pino(opts);

export type Logger = typeof logger;
