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

const logger = createLogger("app");

async function runMain() {
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
      logger.error("Error while running or renewing cert" + cert.name, {
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

if (process.argv.length < 3) {
  logger.error("No command specified");
  process.exit(1);
} else {
  const command = process.argv[2];
  switch (command) {
    case "run": {
      logger.info("Running once");
      runMain().catch(console.error);
      break;
    }

    case "daemon": {
      logger.info("Running in daemon mode", config.daemonCron);
      logger.info("The first run will be in 5 seconds");

      setTimeout(() => {
        runMain().catch(console.error);
      }, 5000);

      cron.schedule(config.daemonCron || "41 4 * * *", () => {
        runMain().catch(console.error);
      });
      break;
    }

    default:
      logger.error("Unknown command:", command);
      process.exit(1);
  }
}
