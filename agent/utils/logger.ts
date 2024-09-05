import { mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";

const logDirectory = "/var/log/ohmycert";
await mkdir(logDirectory, { recursive: true });

const logFilePath = join(logDirectory, "ohmycert-agent.log");
const MAX_LOG_LINES = 500;
let logBuffer = "";

const formatLog = (level: string, module: string, message: string): string => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] [${module}] ${message}\n`;
};

const writeLog = async (log: string) => {
  console.log("write", log);
  try {
    let existingLogs = "";
    try {
      existingLogs = await readFile(logFilePath, "utf8");
    } catch (err) {}

    const newLogs = existingLogs + log;
    await writeFile(logFilePath, newLogs);
  } catch (err) {
    console.error("Error writing log:", err);
  }
};

const ensureLogFileSize = async () => {
  try {
    const data = await readFile(logFilePath, "utf8");
    const lines = data.split("\n");
    console.log("Ensuring log file size", lines);
    if (lines.length > MAX_LOG_LINES) {
      console.log("Trimming log file");
      const trimmedData = lines.slice(-MAX_LOG_LINES).join("\n");
      await writeFile(logFilePath, trimmedData);
    }
  } catch (err) {
    console.error("Error ensuring log file size:", err);
  }
};

export const createLogger = (module: string) => {
  const log = async (level: string, ...args: any[]) => {
    const message = args
      .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : arg))
      .join(" ");
    const formattedLog = formatLog(level, module, message);
    console[level === "ERROR" ? "error" : "log"](formattedLog.trim());
    // await writeLog(formattedLog);
    // await maybeEnsureLogFileSize();

    logBuffer += formattedLog;

    console.log("Logged", level, message);
  };

  return {
    info: (...args: any[]) => log("INFO", ...args),
    warn: (...args: any[]) => log("WARN", ...args),
    error: (...args: any[]) => log("ERROR", ...args),
  };
};

export const flushLog = async () => {
  if (logBuffer) {
    await writeLog(logBuffer);
    logBuffer = "";
  }

  await ensureLogFileSize();
};
