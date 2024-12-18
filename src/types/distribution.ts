import { S3Config } from "./util";

export type DistributionConfig = {
  s3: DistributionS3Config;
  agents: DistributionAgentConfig[];
};

export type DistributionS3Config = {
  path: string;
} & S3Config;

export type DistributionAgentConfig = {
  name: string;
  pathKey: string;
  key: string;
  certs: string[];
};

export type DistributionAgentClientConfig = {
  s3Url: string;
  pathKey: string;
  key: string;
};
