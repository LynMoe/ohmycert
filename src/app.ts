import cron from "node-cron";

import { legoProvider } from "~/providers/lego";
import { CertItem } from "~/types/cert";
import {
  DestinationConfigAli,
  DestinationConfigDogecloud,
  DestinationConfigTencent,
  DestinationType,
} from "~/types/destination";
import { config } from "~/utils/config";
import { createLogger } from "~/utils/logger";
import { aliCdn, aliDcdn } from "~/destinations/ali";
import { dogecloudCdn } from "./destinations/dogecloud";
import { tencentCdn, tencentEo } from "./destinations/tencent";
import { eventBus } from "./utils/eventbus";

const logger = createLogger("app");

let isRunning = false;

async function runMain() {
  logger.info("Starting main loop");
  const configMap = config.configMap;

  for (const cert of config.certs) {
    logger.info("Processing cert " + cert.name, { cert });
    if (cert.envs["_"] && configMap[cert.envs["_"]]) {
      cert.envs = { ...configMap[cert.envs["_"]], ...cert.envs };
    }

    try {
      await legoProvider.runOrRenew(cert);
      logger.info("Cert processed " + cert.name, { cert });
    } catch (e: any) {
      logger.error("Error while running or renewing cert " + cert.name, {
        cert,
        e: e.stack,
      });
    }
  }

  let certList: Record<string, CertItem> = {};
  try {
    certList = (await legoProvider.listCerts()).reduce(
      (acc: Record<string, CertItem>, current) => {
        acc[current.name] = current;
        return acc;
      },
      {}
    );
  } catch (e: any) {
    logger.error("Error while getting cert list", { e: e.stack });
    return;
  }

  for (const destination of config.destinations) {
    logger.info("Processing destination", { destination });
    if (destination.config["_"] && configMap[destination.config["_"]]) {
      destination.config = {
        ...configMap[destination.config["_"]],
        ...destination.config,
      };
    }

    if (!certList[destination.cert]) {
      logger.warn("Cert not found for destination", { destination });
      continue;
    }

    try {
      switch (destination.destination) {
        case DestinationType.alicdn: {
          await aliCdn.deployCert(
            destination.domain,
            certList[destination.cert] as CertItem,
            destination.config as DestinationConfigAli
          );

          await aliCdn.cleanCert(destination.config as DestinationConfigAli);
          break;
        }

        case DestinationType.alidcdn: {
          await aliDcdn.deployCert(
            destination.domain,
            certList[destination.cert] as CertItem,
            destination.config as DestinationConfigAli
          );

          await aliDcdn.cleanCert(destination.config as DestinationConfigAli);
          break;
        }

        case DestinationType.tencentcdn: {
          await tencentCdn.deployCert(
            destination.domain,
            certList[destination.cert] as CertItem,
            destination.config as DestinationConfigTencent
          );

          await tencentCdn.cleanCert(
            destination.config as DestinationConfigTencent
          );
          break;
        }

        case DestinationType.tencenteo: {
          await tencentEo.deployCert(
            destination.domain,
            certList[destination.cert] as CertItem,
            destination.config as DestinationConfigTencent
          );

          await tencentEo.cleanCert(
            destination.config as DestinationConfigTencent
          );
          break;
        }

        case DestinationType.dogecloud: {
          await dogecloudCdn.deployCert(
            destination.domain,
            certList[destination.cert] as CertItem,
            destination.config as DestinationConfigDogecloud
          );

          await dogecloudCdn.cleanCert(
            destination.config as DestinationConfigDogecloud
          );
          break;
        }
      }
    } catch (e: any) {
      logger.error("Error while processing destination", {
        destination,
        e: e.stack,
      });
    }
  }
}

function runWarp() {
  if (isRunning) {
    logger.warn("Main loop is already running, skipping");
    return;
  }
  return runMain()
    .catch(console.error)
    .finally(() => {
      isRunning = false;
    });
}

if (process.argv.length < 3) {
  logger.error("No command specified");
  process.exit(1);
} else {
  const command = process.argv[2];
  switch (command) {
    case "run": {
      logger.info("Running once");
      runWarp();
      break;
    }

    case "daemon": {
      logger.info("Running in daemon mode", config.daemonCron);
      logger.info("The first run will be in 5 seconds");

      setTimeout(() => {
        runWarp();
      }, 5000);

      cron.schedule(config.daemonCron || "41 4 * * *", () => {
        runWarp();
      });

      eventBus.on("config:reload", () => {
        logger.info("Config reloaded, running main loop");
        runWarp();
      });
      break;
    }

    default:
      logger.error("Unknown command:", command);
      process.exit(1);
  }

  process.on("SIGINT", () => {
    logger.info("Received SIGINT, exiting");
    process.exit(0);
  });
}
