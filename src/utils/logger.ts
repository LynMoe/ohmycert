import { mkdirSync } from "fs";
import { resolve } from "path";
import winston from "winston";
import "winston-daily-rotate-file";

import { config } from "~/utils/config";

mkdirSync(resolve(config.logPath), { recursive: true });

const transportAll = new winston.transports.DailyRotateFile({
  filename: resolve(config.logPath, "ohmycert-%DATE%.log"),
  datePattern: "YYYY-MM-DD-HH",
  maxSize: "5m",
});

const transportError = new winston.transports.DailyRotateFile({
  level: "error",
  filename: resolve(config.logPath, "ohmycert-error-%DATE%.log"),
  datePattern: "YYYY-MM-DD-HH",
  maxSize: "5m",
});

transportAll.on("error", (error) => {
  console.error("transportAll", error);
});

transportError.on("error", (error) => {
  console.error("transportError", error);
});

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "ohmycert" },
  transports: [
    transportAll,
    transportError,
    new winston.transports.Console({
      format: winston.format.simple(),
      level: "debug",
    }),
  ],
});

export const createLogger = (module: string) => {
  return logger.child({ module });
};
