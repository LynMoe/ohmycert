import { cdn } from "tencentcloud-sdk-nodejs-cdn";
import { teo } from "tencentcloud-sdk-nodejs-teo";
import { ssl } from "tencentcloud-sdk-nodejs-ssl";
import { UploadCertificateRequest } from "tencentcloud-sdk-nodejs-ssl/tencentcloud/services/ssl/v20191205/ssl_models";
import { UpdateDomainConfigRequest } from "tencentcloud-sdk-nodejs-cdn/tencentcloud/services/cdn/v20180606/cdn_models";
import { ModifyHostsCertificateRequest } from "tencentcloud-sdk-nodejs-teo/tencentcloud/services/teo/v20220901/teo_models";
const CdnClient = cdn.v20180606.Client;
const TeoClient = teo.v20220901.Client;
const SslClient = ssl.v20191205.Client;

import { CertItem } from "~/types/cert";
import { Destination, DestinationConfigTencent } from "~/types/destination";
import db from "~/utils/db";
import { escapeString } from "~/utils/common";
import { createLogger } from "~/utils/logger";

const logger = createLogger("destination:tencent");

if (!db.data.destinationData.tencent) {
  await db.update((data) => {
    data.destinationData.tencent = {
      cdnCertName: {},
      eoCertName: {},
      sslCertList: {},
    };
  });
}

async function cleanCert(config: DestinationConfigTencent): Promise<void> {
  const casClient = createSslClient(config);

  const list = await casClient.DescribeCertificates({
    SearchKey: "ohmycert",
  });
  if (list.TotalCount) {
    for (const sslCert of list.Certificates || []) {
      const sslCertName = sslCert.Alias;
      if (!sslCertName || !sslCertName.startsWith("ohmycert-")) {
        continue;
      }
      if (
        !Object.values(db.data.destinationData.tencent.cdnCertName).includes(
          sslCertName
        ) &&
        !Object.values(db.data.destinationData.tencent.eoCertName).includes(
          sslCertName
        )
      ) {
        logger.info("tencent clean delete", {
          certificateId: sslCert.CertificateId,
          sslCertName,
        });
        try {
          const result = await casClient.DeleteCertificate({
            CertificateId: sslCert.CertificateId as string,
          });

          if (result.DeleteResult) {
            logger.info("tencent clean delete success", {
              certificateId: sslCert.CertificateId,
              sslCertName,
            });
            db.update((data) => {
              delete data.destinationData.tencent.sslCertList[sslCertName];
            });
          } else {
            logger.error("tencent clean delete failed", {
              certificateId: sslCert.CertificateId,
              sslCertName,
              result,
            });
            throw new Error(
              "tencent clean delete failed, api response with no result"
            );
          }
        } catch (e: any) {
          logger.error("tencent clean delete failed", {
            certificateId: sslCert.CertificateId,
            sslCertName,
            e: e.stack,
          });
        }
      }
    }
  }
}

function getClientConfig(config: DestinationConfigTencent, endpoint: string) {
  return {
    credential: {
      secretId: config.secretId,
      secretKey: config.secretKey,
    },
    region: "",
    profile: {
      httpProfile: {
        endpoint,
      },
    },
  };
}

function createCdnClient(config: DestinationConfigTencent) {
  return new CdnClient(getClientConfig(config, "cdn.tencentcloudapi.com"));
}

function createTeoClient(config: DestinationConfigTencent) {
  return new TeoClient(getClientConfig(config, "teo.tencentcloudapi.com"));
}

function createSslClient(config: DestinationConfigTencent) {
  return new SslClient(getClientConfig(config, "ssl.tencentcloudapi.com"));
}

async function uploadCert(
  config: DestinationConfigTencent,
  cert: CertItem,
  sslCertName: string
): Promise<string> {
  if (db.data.destinationData.tencent.sslCertList[sslCertName]) {
    logger.info("Tencent.uploadCert already deployed", {
      certName: cert.name,
      sslCertName,
    });
    return db.data.destinationData.tencent.sslCertList[sslCertName];
  }

  const client = createSslClient(config);
  const req = {
    CertificatePublicKey: cert.cert,
    CertificatePrivateKey: cert.key,
    Alias: sslCertName,
    Repeatable: true,
  } as UploadCertificateRequest;

  try {
    const res = await client.UploadCertificate(req);
    logger.info("Tencent.uploadCert response", {
      certName: cert.name,
      res,
    });

    if (res.CertificateId) {
      logger.info("Tencent.uploadCert success", {
        certName: cert.name,
        sslCertName,
      });
      await db.update((data) => {
        data.destinationData.tencent.sslCertList[sslCertName] =
          res.CertificateId;
      });

      return res.CertificateId;
    } else {
      throw new Error("Tencent.uploadCert failed, api response with no certId");
    }
  } catch (e: any) {
    logger.error("Tencent.uploadCert failed", {
      certName: cert.name,
      e: e.stack,
    });

    throw e;
  }
}

class TencentCdn implements Destination {
  async deployCert(
    domain: string,
    cert: CertItem,
    config: DestinationConfigTencent
  ): Promise<boolean> {
    logger.info("TencentCdn.deployCert", {
      domain,
      certName: cert.name,
      config,
    });
    const client = createCdnClient(config);

    const sslCertName =
      "ohmycert-" +
      escapeString(cert.name, /[a-z0-9]/i) +
      "-" +
      cert.identifier;
    // 如果已经部署当前证书, 则直接返回
    if (db.data.destinationData.tencent.cdnCertName[domain] === sslCertName) {
      logger.info("TencentCdn domain " + domain + " already deployed");
      return true;
    }

    const req = {
      Domain: domain,
      Https: {
        Switch: "on",
        Http2: "on",
        CertInfo: {
          CertId: await uploadCert(config, cert, sslCertName),
          Message: sslCertName,
        },
      },
    } as UpdateDomainConfigRequest;

    try {
      const res = await client.UpdateDomainConfig(req);
      logger.info("TencentCdn.deployCert setSSL success", {
        domain,
        certName: cert.name,
        res,
      });

      await db.update((data) => {
        data.destinationData.tencent.cdnCertName[domain] = sslCertName;
      });

      return true;
    } catch (e: any) {
      logger.error("TencentCdn.deployCert setSSL failed", {
        domain,
        certName: cert.name,
        e: e.stack,
      });
    }

    return false;
  }

  async cleanCert(config: DestinationConfigTencent): Promise<void> {
    return cleanCert(config);
  }
}
export const tencentCdn = new TencentCdn();

class TencentEo implements Destination {
  async deployCert(
    domain: string,
    cert: CertItem,
    config: DestinationConfigTencent
  ): Promise<boolean> {
    logger.info("TencentEo.deployCert", {
      domain,
      certName: cert.name,
      config,
    });
    const client = createTeoClient(config);

    const sslCertName =
      "ohmycert-" +
      escapeString(cert.name, /[a-z0-9]/i) +
      "-" +
      cert.identifier;
    // 如果已经部署当前证书, 则直接返回
    if (db.data.destinationData.tencent.eoCertName[domain] === sslCertName) {
      logger.info("TencentEo domain " + domain + " already deployed");
      return true;
    }

    if (!config.zoneId) {
      throw new Error("TencentEo.deployCert zoneId is required");
    }
    const req = {
      ZoneId: config.zoneId,
      Hosts: [domain],
      Mode: "sslcert",
      ServerCertInfo: [
        {
          CertId: await uploadCert(config, cert, sslCertName),
        },
      ],
    } as ModifyHostsCertificateRequest;

    try {
      const res = await client.ModifyHostsCertificate(req);
      logger.info("TencentEo.deployCert setSSL success", {
        domain,
        certName: cert.name,
        res,
      });

      await db.update((data) => {
        data.destinationData.tencent.eoCertName[domain] = sslCertName;
      });

      return true;
    } catch (e: any) {
      logger.error("TencentEo.deployCert setSSL failed", {
        domain,
        certName: cert.name,
        e: e.stack,
      });
    }

    return false;
  }

  async cleanCert(config: DestinationConfigTencent): Promise<void> {
    return cleanCert(config);
  }
}
export const tencentEo = new TencentEo();
