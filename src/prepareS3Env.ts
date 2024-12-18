import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "crypto";
import { S3Config } from "./types/util";
import { eventBus } from "./utils/eventbus";
import {
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";

import archiver from "archiver";
import unzipper from "unzipper";
import { Config } from "./types/config";
import { join } from "path";
import { tmpdir } from "os";

export async function compressFolder(
  zipFile: string,
  folderPath: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipFile);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    output.on("close", () => {
      resolve();
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(folderPath, false);
    archive.finalize();
  });
}

async function decompressBuffer(
  zipFile: Buffer,
  targetPath: string
): Promise<void> {
  const dir = await unzipper.Open.buffer(zipFile);
  await dir.extract({
    path: targetPath,
  });
}

export async function uploadFileToS3(
  config: S3Config,
  key: string,
  file: Buffer
) {
  console.log(`Uploading file to S3`, {
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
    console.error(`Failed to upload file: ${response.statusText}`, {
      status: response.status,
      body: await response.text(),
    });
    throw new Error(`Failed to upload file: ${response.statusText}`);
  }
}

export async function downloadFileFromS3(
  config: S3Config,
  key: string
): Promise<Buffer> {
  console.log(`Downloading file from S3`, {
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucket,
    key,
  });

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });

  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: 600,
  });
  const response = await fetch(url);

  if (!response.ok) {
    console.error(`Failed to download file: ${response.statusText}`, {
      status: response.status,
      body: await response.text(),
    });
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

(async () => {
  let prepareTimeout = setTimeout(() => {
    console.error("Prepare timeout");
    process.exit(1);
  }, 60 * 1000);

  const {
    OMS_S3_ENV,
    OMS_S3_ENDPOINT,
    OMS_S3_REGION,
    OMS_S3_BUCKET,
    OMS_S3_ACCESS_KEY,
    OMS_S3_SECRET_KEY,
    OMS_S3_DATA_PATH,
    OMS_S3_CONFIG_PATH,
    OMS_STORE_PATH,
    OMS_LOG_PATH,
    OMS_LEGO_PATH,
  } = process.env;

  console.log("OMS ENVs", {
    OMS_S3_ENV,
    OMS_S3_ENDPOINT,
    OMS_S3_REGION,
    OMS_S3_BUCKET,
    OMS_S3_ACCESS_KEY,
    OMS_S3_SECRET_KEY,
    OMS_S3_DATA_PATH,
    OMS_S3_CONFIG_PATH,
    OMS_STORE_PATH,
    OMS_LOG_PATH,
    OMS_LEGO_PATH,
  });

  if (
    !OMS_S3_ENDPOINT ||
    !OMS_S3_REGION ||
    !OMS_S3_BUCKET ||
    !OMS_S3_ACCESS_KEY ||
    !OMS_S3_SECRET_KEY ||
    !OMS_S3_DATA_PATH ||
    !OMS_S3_CONFIG_PATH
  ) {
    console.error("Missing required environment variables");
    process.exit(1);
  }

  const s3Config: S3Config = {
    endpoint: OMS_S3_ENDPOINT,
    region: OMS_S3_REGION,
    bucket: OMS_S3_BUCKET,
    accessKey: OMS_S3_ACCESS_KEY,
    secretKey: OMS_S3_SECRET_KEY,
  };

  console.log("Downloading config from S3");
  const configFile = (
    await downloadFileFromS3(s3Config, OMS_S3_CONFIG_PATH)
  ).toString("utf-8");
  const config = JSON.parse(configFile) as Config;

  if (OMS_S3_ENV) config.env = OMS_S3_ENV as "prod" | "dev";
  if (OMS_STORE_PATH) config.storePath = OMS_STORE_PATH;
  if (OMS_LOG_PATH) config.logPath = OMS_LOG_PATH;
  if (OMS_LEGO_PATH) config.legoPath = OMS_LEGO_PATH;

  console.log("Path config", {
    storePath: config.storePath,
    logPath: config.logPath,
    legoPath: config.legoPath,
  });

  mkdirSync(config.storePath, { recursive: true });
  mkdirSync(config.logPath, { recursive: true });

  writeFileSync("./config/config.json", JSON.stringify(config));

  const tmpDir = mkdtempSync(join(tmpdir(), "oms-"));

  // download zip
  console.log("Downloading data.zip from S3");
  await downloadFileFromS3(s3Config, OMS_S3_DATA_PATH)
    .then((res) => {
      console.log("Decompressing data.zip");
      return decompressBuffer(res, config.storePath);
    })
    .catch((e) => {
      console.log("Download data.zip failed", e);
    });

  eventBus.on("oms:finish", async ({ code }) => {
    const zipFile = join(tmpDir, "data_after.zip");
    console.log("Compressing data folder");
    await compressFolder(zipFile, config.storePath);
    console.log("Uploading data.zip to S3");
    await uploadFileToS3(s3Config, OMS_S3_DATA_PATH, readFileSync(zipFile));

    rmSync(tmpDir, { recursive: true, force: true });
    console.log("Exiting with code", code);
    process.exit(code);
  });

  clearTimeout(prepareTimeout);

  process.env["OMS_HOSTED"] = "true";
  await import("./app");
})();
