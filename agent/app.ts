import { readdir } from "fs/promises";

import { downloadConfigFromS3 } from "./utils/s3";
import { exec } from "./utils/cmd";
import { createLogger, flushLog } from "./utils/logger";
import config from "./utils/config";
const logger = createLogger("main");

// check uid
if ((await exec("id", ["-u"])) !== "0") {
  logger.info(await exec("id", ["-u"]), (await exec("id", ["-u"])) === "0");
  console.error("Please run as root");
  process.exit(1);
}
await config.init();

let result;
try {
  result = await downloadConfigFromS3(config.config);
  logger.info(
    "Downloaded config, cert names",
    result.map((r) => r.name)
  );
} catch (e: any) {
  logger.error("Failed to download config", { e: e.stack });
  process.exit(1);
}

const scripts = (await readdir("/etc/ohmycert/scripts")).filter(
  (f) => !f.startsWith(".") && f.endsWith(".js")
);

for (const script of scripts) {
  logger.info(`Running script ${script}`);
  try {
    const { default: userFunc } = await import(
      `/etc/ohmycert/scripts/${script}`
    );

    await userFunc(result, { exec, logger: createLogger(script) });
  } catch (e: any) {
    logger.error(`Failed to run script ${script}`, { e: e.stack });
  }
}

logger.info("All scripts finished");

await flushLog();

process.exit(0);
