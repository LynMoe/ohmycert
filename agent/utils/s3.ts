import { cipher, util } from "node-forge";
import { CertItem } from "~/types/cert";
import { DistributionAgentClientConfig } from "~/types/distribution";
import { createLogger } from "./logger";
const logger = createLogger("main");

function decryptText(cipherText: string, key: string): string {
  const decoded = util.decode64(cipherText);
  const iv = decoded.slice(0, 12); // 96 bits for IV
  const tag = decoded.slice(-16); // 128 bits for GCM tag
  const encrypted = decoded.slice(12, -16);

  const decipher = cipher.createDecipher("AES-GCM", util.createBuffer(key));
  decipher.start({
    iv: util.createBuffer(iv),
    tag: util.createBuffer(tag),
  });
  decipher.update(util.createBuffer(encrypted));
  const result = decipher.finish();
  if (result) {
    return decipher.output.toString();
  } else {
    throw new Error("Decryption failed");
  }
}

export async function downloadConfigFromS3(
  config: DistributionAgentClientConfig
): Promise<CertItem[]> {
  const s3Path =
    (config.s3Url.endsWith("/") ? config.s3Url : config.s3Url + "/") +
    config.pathKey +
    ".json.bin";

  logger.info(`Downloading file from S3`, s3Path);

  try {
    const result = await fetch(s3Path);
    if (!result.ok) {
      logger.error(`Failed to download file: ${result.statusText}`, {
        status: result.status,
        body: await result.text(),
      });
      throw new Error(`Failed to download file: ${result.statusText}`);
    }

    const body = await result.text();
    const decrypted = decryptText(body, config.key);
    const payload = JSON.parse(decrypted);
    return payload;
  } catch (e: any) {
    logger.error(`Failed to parse file`, e);
    throw new Error(`Failed to parse file`);
  }
}
