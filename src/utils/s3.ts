import { join } from "path";
import { cipher, random, util } from "node-forge";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  DistributionAgentConfig,
  DistributionS3Config,
} from "~/types/distribution";
import { createLogger } from "~/utils/logger";
import { CertItem } from "~/types/cert";
import { S3Config } from "~/types/util";
import { createHash } from "crypto";
const logger = createLogger("s3");

function encryptText(text: string, key: string): string {
  const iv = random.getBytesSync(12); // 96-bit IV
  const cipherIns = cipher.createCipher("AES-GCM", util.createBuffer(key));
  cipherIns.start({ iv: util.createBuffer(iv) });
  cipherIns.update(util.createBuffer(text));
  cipherIns.finish();
  const encrypted = cipherIns.output.getBytes();
  const tag = cipherIns.mode.tag.getBytes();

  // Combine IV, encrypted message, and tag into a single string
  const result = util.encode64(iv + encrypted + tag);
  return result;
}

export async function uploadFileToS3(
  config: S3Config,
  key: string,
  file: Buffer
) {
  logger.info(`Uploading file to S3`, {
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucket,
    key,
    size: file.length,
  });

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });

  const bodyHash = createHash("sha256").update(file).digest("hex");

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: file,
    ContentType: "application/octet-stream",
    ChecksumSHA256: bodyHash,
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: 600,
  });
  const response = await fetch(url, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": "application/octet-stream",
    },
  });

  if (!response.ok) {
    logger.error(`Failed to upload file: ${response.statusText}`, {
      status: response.status,
      body: await response.text(),
    });
    throw new Error(`Failed to upload file: ${response.statusText}`);
  }
}

export async function uploadConfigToS3(
  config: DistributionS3Config,
  agent: DistributionAgentConfig,
  payload: CertItem[]
): Promise<boolean> {
  const s3Path = join(config.path, agent.pathKey + ".json.bin");

  logger.info(`Uploading cert to S3`, {
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucket,
    path: s3Path,
    name: agent.name,
  });

  const body = encryptText(
    JSON.stringify(payload.filter((i) => agent.certs.includes(i.name))),
    agent.key
  );

  try {
    await uploadFileToS3(config, s3Path, Buffer.from(body));
  } catch (e: any) {
    logger.error(`Failed to upload config to S3`, {
      error: e.stack,
    });
    return false;
  }

  return true;
}
