import axios from "axios";
import { createHmac } from "crypto";
import { Message, sha1 } from "js-sha1";

import { CertItem } from "~/types/cert";
import { Destination, DestinationConfigDogecloud } from "~/types/destination";
import db from "~/utils/db";
import { escapeString } from "~/utils/common";
import { createLogger } from "~/utils/logger";

const logger = createLogger("destination:dogecloudcdn");

if (!db.data.destinationData.dogecloud) {
  await db.update((data) => {
    data.destinationData.dogecloud = {
      certList: {},
      cdnCertName: {},
    };
  });
}

async function dogecloudApi(
  apiPath: string,
  config: DestinationConfigDogecloud,
  data = {}
) {
  // 这里替换为你的多吉云永久 AccessKey 和 SecretKey，可在用户中心 - 密钥管理中查看
  // 请勿在客户端暴露 AccessKey 和 SecretKey，那样恶意用户将获得账号完全控制权
  const body = JSON.stringify(data);

  const message = apiPath + "\n" + body;
  const hash = sha1.hmac.create(config.secretKey as Message);
  // 更新消息
  hash.update(message);
  // 获取十六进制哈希值
  const sign = hash.hex();

  const authorization = "TOKEN " + config.accessKey + ":" + sign;

  return axios
    .request({
      url: "https://api.dogecloud.com" + apiPath,
      method: "POST",
      data: body,
      responseType: "json",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
    })
    .then((response) => {
      if (response.data.code !== 200) {
        // API 返回错误
        throw new Error(response.data.msg);
      }
      return response.data;
    });
}

async function cleanCert(config: DestinationConfigDogecloud): Promise<void> {
  for (const certName in db.data.destinationData.dogecloud.certList) {
    const certId = db.data.destinationData.dogecloud.certList[certName];

    if (
      Object.values(db.data.destinationData.dogecloud.cdnCertName).includes(
        certName
      )
    ) {
      continue;
    }

    try {
      const result = await dogecloudApi("/cdn/cert/delete.json", config, {
        id: certId,
      });

      if (result.code === 200) {
        logger.info("Dogecloud.cleanCert success", {
          certName,
          certId,
          result,
        });
        await db.update((data) => {
          delete data.destinationData.dogecloud.certList[certName];
        });
      } else {
        logger.error("Dogecloud.cleanCert failed", {
          certName,
          certId,
          result,
        });
      }
    } catch (e: any) {
      logger.error("Dogecloud.cleanCert failed", {
        certName,
        certId,
        e: e.stack,
      });
    }
  }
}

class DogecloudCdn implements Destination {
  async deployCert(
    domain: string,
    cert: CertItem,
    config: DestinationConfigDogecloud
  ): Promise<boolean> {
    logger.info("Dogecloud.deployCert", {
      domain,
      certName: cert.name,
      config,
    });

    const casCertName =
      "ohmycert-" +
      escapeString(cert.name, /[a-z0-9]/i) +
      "-" +
      cert.identifier;
    // 如果已经部署当前证书, 则直接返回
    if (db.data.destinationData.dogecloud.cdnCertName[domain] === casCertName) {
      logger.info("Dogecloud domain " + domain + " already deployed");
      return true;
    }

    const req = {
      note: casCertName,
      cert: cert.cert,
      private: cert.key,
    };

    try {
      if (!db.data.destinationData.dogecloud.certList[casCertName]) {
        const createCert = await dogecloudApi(
          "/cdn/cert/upload.json",
          config,
          req
        );

        if (!createCert?.data?.id) {
          logger.error("Dogecloud.deployCert createCert failed", {
            domain,
            certName: cert.name,
            createCert,
          });
          throw new Error("Create cert failed");
        }
        await db.update((data) => {
          data.destinationData.dogecloud.certList[casCertName] =
            createCert.data.id;
        });
      }

      const setCert = await dogecloudApi("/cdn/cert/bind.json", config, {
        id: db.data.destinationData.dogecloud.certList[casCertName],
        domain: domain,
      });

      if (setCert.code !== 200) {
        logger.error("Dogecloud.deployCert setSSL failed", {
          domain,
          certName: cert.name,
          setCert,
        });
        throw new Error("Set cert failed");
      }

      logger.info("Dogecloud.deployCert setSSL success", {
        domain,
        certName: cert.name,
        setCert,
      });
      await db.update((data) => {
        data.destinationData.dogecloud.cdnCertName[domain] = casCertName;
      });

      return true;
    } catch (e: any) {
      logger.error("Dogecloud.deployCert failed", {
        domain,
        certName: cert.name,
        e: e.stack,
      });
    }
    return false;
  }

  async cleanCert(config: DestinationConfigDogecloud): Promise<void> {
    return cleanCert(config);
  }
}

export const dogecloudCdn = new DogecloudCdn();
