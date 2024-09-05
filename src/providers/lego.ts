import { spawn } from "child_process";
import { resolve } from "path";
import { SHA3 } from "crypto-js";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";

import { CertConfig, CertItem } from "~/types/cert";
import { config } from "~/utils/config";
import { Provider } from "~/types/provider";
import { getCertExpires } from "~/utils/ssl";
import { escapeString } from "~/utils/common";
import { createLogger } from "~/utils/logger";

const logger = createLogger("provider:lego");

class LegoProvider implements Provider {
  runOrRenew(cert: CertConfig): Promise<CertItem> {
    let firstRun = true;
    const certPath = resolve(
      config.storePath,
      "certs/",
      "lego/",
      escapeString(cert.name, /[a-z0-9\-]/i)
    );
    if (!existsSync(certPath)) {
      logger.info("LegoProvider.runOrRenew: cert path not exists", {
        cert,
        certPath,
      });
      mkdirSync(certPath, { recursive: true });
      writeFileSync(
        resolve(certPath, "domains.json"),
        JSON.stringify(cert.domains)
      );
    } else if (
      existsSync(
        resolve(
          certPath,
          "certificates/",
          cert.domains[0]?.replace("*", "_") + ".json"
        )
      ) &&
      readFileSync(resolve(certPath, "domains.json"), "utf-8") ===
        JSON.stringify(cert.domains)
    ) {
      firstRun = false;
    }

    logger.info("LegoProvider.runOrRenew", { cert, certPath, firstRun });

    const lego = spawn(
      config.legoPath,
      [
        "--email",
        config.email,
        ...cert.domains.map((domain) => ["--domains", domain]).flat(),
        "--path",
        certPath,
        "--dns",
        cert.dnsProvider,
        "--server",
        config.env === "prod"
          ? "https://acme-v02.api.letsencrypt.org/directory"
          : "https://acme-staging-v02.api.letsencrypt.org/directory",
        "--accept-tos",
        firstRun ? "run" : "renew",
      ],
      {
        env: cert.envs,
      }
    );

    return new Promise((reso, reject) => {
      lego.stdout.on("data", (data) => {
        logger.info("lego cli stdout", { data: data.toString() });
      });

      lego.stderr.on("data", (data) => {
        logger.info("lego cli stderr", { data: data.toString() });
      });

      lego.on("close", (code) => {
        if (code === 0) {
          const certPathCrt = resolve(
            certPath,
            "certificates/",
            cert.domains[0]?.replace("*", "_") + ".crt"
          );
          const crt = readFileSync(certPathCrt, "utf-8");
          const key = readFileSync(
            certPathCrt.replace(".crt", ".key"),
            "utf-8"
          );

          writeFileSync(
            resolve(certPath, "domains.json"),
            JSON.stringify(cert.domains)
          );

          reso({
            name: cert.name,
            cert: crt,
            key: key,
            expires: getCertExpires(crt),
            domains: cert.domains,
          } as CertItem);
        } else {
          reject(false);
        }
      });
    });
  }

  listCerts(): Promise<CertItem[]> {
    const certBasePath = resolve(config.storePath, "certs", "lego");
    if (!existsSync(certBasePath)) {
      return Promise.resolve([]);
    }

    return Promise.resolve(
      readdirSync(certBasePath)
        .filter((v) => !v.startsWith("."))
        .filter((folder) => {
          return config.certs.findIndex((v) => v.name === folder) !== -1;
        })
        .map((certName) => {
          const cert =
            config.certs[config.certs.findIndex((v) => v.name === certName)];
          const certPath = resolve(certBasePath, certName, "certificates/");
          const fileBasePath = cert?.domains[0]?.replace("*", "_");

          if (!existsSync(resolve(certPath, fileBasePath + ".crt"))) {
            return null;
          }

          const crt = readFileSync(
            resolve(certPath, fileBasePath + ".crt"),
            "utf-8"
          );
          const key = readFileSync(
            resolve(certPath, fileBasePath + ".key"),
            "utf-8"
          );

          return {
            name: certName,
            cert: crt,
            key: key,
            expires: getCertExpires(crt),
            domains: cert?.domains,
            identifier: SHA3(
              JSON.stringify(cert?.domains || []) + getCertExpires(crt)
            )
              .toString()
              .substring(0, 16),
          } as CertItem;
        })
        .filter((v) => v !== null)
    );
  }
}

export const legoProvider = new LegoProvider();
