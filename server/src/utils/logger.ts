import winston from 'winston';
import config from '../config';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: config.env === 'production' ? logFormat : consoleFormat,
    level: config.logLevel,
  }),
];

if (config.env === 'production') {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: logFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: logFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
}

const logger = winston.createLogger({
  level: config.logLevel,
  format: logFormat,
  defaultMeta: { service: 'voiceai-backend' },
  transports,
  exitOnError: false,
});

// Create a stream for morgan
export const morganStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

export default logger;