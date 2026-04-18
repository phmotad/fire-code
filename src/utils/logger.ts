import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  isDev
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } })
    : undefined,
);

export type Logger = typeof logger;
