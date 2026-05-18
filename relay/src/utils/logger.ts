/**
 * Centralized Logger for Delay
 *
 * Uses pino for high-performance structured JSON logging.
 * In development, uses pino-pretty for human-readable output.
 */

import pino from "pino";
import dotenv from "dotenv";

dotenv.config();

// Determine environment
const isDev = process.env.NODE_ENV !== "production";
const logLevel = (process.env.LOG_LEVEL as string) || (isDev ? "debug" : "info");

// Create base logger configuration
const loggerOptions: pino.LoggerOptions = {
  level: logLevel,
  // Add timestamp
  timestamp: pino.stdTimeFunctions.isoTime,
  // Format options for production (JSON structured)
  formatters: {
    level: (label) => ({ level: label }),
  },
};

// In development, use pino-pretty for human-readable output
const transport = isDev
  ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
        singleLine: false,
      },
    }
  : undefined;

// Create the base logger
const baseLogger = pino(loggerOptions, transport ? pino.transport(transport) : undefined);

/**
 * Create a child logger with a specific module name
 * @param moduleName - Name of the module (e.g., 'relay-user', 'storage-deals')
 */
function createLogger(moduleName: string): pino.Logger {
  return baseLogger.child({ module: moduleName });
}

/**
 * Pre-configured loggers for common modules
 */
export const loggers = {
  server: createLogger("server"),
  ipfs: createLogger("ipfs-client"),
  sqlite: createLogger("sqlite-store"),
  bullet: createLogger("bullet-catcher"),
  uploads: createLogger("uploads"),
  visualGraph: createLogger("visual-graph"),
};

