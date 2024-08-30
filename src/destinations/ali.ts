import CdnClient, {
  SetCdnDomainSSLCertificateRequest,
} from "@alicloud/cdn20180510";
import DcdnClient, {
  SetDcdnDomainSSLCertificateRequest,
} from "@alicloud/dcdn20180115";
import CasClient, {
  DeleteUserCertificateRequest,
  ListUserCertificateOrderRequest,
} from "@alicloud/cas20200407";
import { Config as AliConfig } from "@alicloud/openapi-client";

import { CertItem } from "~/types/cert";
import { Destination, DestinationConfigAli } from "~/types/destination";
import db from "~/utils/db";
import { escapeString } from "~/utils/common";
import { createLogger } from "~/utils/logger";

const logger = createLogger("destination:ali");

if (!db.data.destinationData.ali) {
  await db.update((data) => {
    data.destinationData.ali = {
      cdnCertName: {},
      dcdnCertName: {},
    };
  });
}

async function cleanCert(config: DestinationConfigAli): Promise<void> {
  const casClient = createCasClient(config);

  const list = await casClient.listUserCertificateOrder({
    orderType: "upload",
  } as ListUserCertificateOrderRequest);

  if (list.statusCode === 200) {
    for (const casCert of list.body?.certificateOrderList || []) {
      const casCertName = casCert.name?.split("-").slice(0, -1).join("-");
      if (!casCertName || !casCertName.startsWith("ohmycert-")) {
        continue;
      }

      if (
        !Object.values(db.data.destinationData.ali.cdnCertName).includes(
          casCertName
        ) &&
        !Object.values(db.data.destinationData.ali.dcdnCertName).includes(
          casCertName
        )
      ) {
        logger.info("ali clean delete", {
          certificateId: casCert.certificateId,
          casCertName,
        });
        await casClient.deleteUserCertificate({
          certId: casCert.certificateId,
        } as DeleteUserCertificateRequest);
      }
    }
  }
}

function createCdnClient(config: DestinationConfigAli) {
  return new CdnClient({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
  } as AliConfig);
}

function createDcdnClient(config: DestinationConfigAli) {
  return new DcdnClient({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    regionId: "cn-hangzhou",
  } as AliConfig);
}

function createCasClient(config: DestinationConfigAli) {
  return new CasClient({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    regionId: "cn-hangzhou",
  } as AliConfig);
}

class AliCdn implements Destination {
  async deployCert(
    domain: string,
    cert: CertItem,
    config: DestinationConfigAli
  ): Promise<boolean> {
    logger.info("AliCdn.deployCert", { domain, certName: cert.name, config });
    const client = createCdnClient(config);

    const casCertName =
      "ohmycert-" +
      escapeString(cert.name, /[a-z0-9]/i) +
      "-" +
      cert.identifier;
    // 如果已经部署当前证书, 则直接返回
    if (db.data.destinationData.ali.cdnCertName[domain] === casCertName) {
      logger.info("AliCdn domain " + domain + " already deployed");
      return true;
    }

    const req = {
      domainName: domain,
      SSLProtocol: "on",
      certType: "upload",
      certName: casCertName + "-" + new Date().getTime(),
      SSLPub: cert.cert,
      SSLPri: cert.key,
    } as SetCdnDomainSSLCertificateRequest;

    const res = await client.setCdnDomainSSLCertificate(req);
    logger.info("AliCdn.deployCert setSSL response", {
      domain,
      certName: cert.name,
      res,
    });
    if (res.statusCode === 200) {
      logger.info("AliCdn.deployCert setSSL success", {
        domain,
        certName: cert.name,
      });
      await db.update((data) => {
        data.destinationData.ali.cdnCertName[domain] = casCertName;
      });

      return true;
    } else {
      logger.error("AliCdn.deployCert setSSL failed", {
        domain,
        certName: cert.name,
        res,
      });
    }
    return false;
  }

  async cleanCert(config: DestinationConfigAli): Promise<void> {
    return cleanCert(config);
  }
}

export const aliCdn = new AliCdn();

export class AliDcdn implements Destination {
  async deployCert(
    domain: string,
    cert: CertItem,
    config: DestinationConfigAli
  ): Promise<boolean> {
    logger.info("AliDcdn.deployCert", { domain, certName: cert.name, config });
    const client = createDcdnClient(config);

    const casCertName =
      "ohmycert-" +
      escapeString(cert.name, /[a-z0-9]/i) +
      "-" +
      cert.identifier;
    // 如果已经部署当前证书, 则直接返回
    if (db.data.destinationData.ali.dcdnCertName[domain] === casCertName) {
      logger.info("AliDcdn domain " + domain + " already deployed");
      return true;
    }

    const req = {
      domainName: domain,
      SSLProtocol: "on",
      certType: "upload",
      certName: casCertName + "-" + new Date().getTime(),
      SSLPub: cert.cert,
      SSLPri: cert.key,
    } as SetDcdnDomainSSLCertificateRequest;

    const res = await client.setDcdnDomainSSLCertificate(req);
    logger.info("AliDcdn.deployCert setSSL response", {
      domain,
      certName: cert.name,
      res,
    });
    if (res.statusCode === 200) {
      logger.info("AliDcdn.deployCert setSSL success", { domain });
      await db.update((data) => {
        data.destinationData.ali.dcdnCertName[domain] = casCertName;
      });

      return true;
    } else {
      logger.error("AliDcdn.deployCert setSSL failed", {
        domain,
        certName: cert.name,
        res,
      });
    }
    return false;
  }

  async cleanCert(config: DestinationConfigAli): Promise<void> {
    return cleanCert(config);
  }
}

export const aliDcdn = new AliDcdn();
