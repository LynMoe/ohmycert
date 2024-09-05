export type DistributionConfig = {
  s3: DistributionS3Config;
  agents: DistributionAgentConfig[];
};

export type DistributionS3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  path: string;
  accessKey: string;
  secretKey: string;
};

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
