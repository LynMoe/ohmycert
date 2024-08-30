import { CertConfig } from "~/types/cert";
import { DestinationConfig, DestinationType } from "~/types/destination";

export type Config = {
  env: "dev" | "prod";
  email: string;
  storePath: string;
  logPath: string;
  legoPath: string;
  daemonCron: string;
  configMap: Record<string, ConfigMap>;
  certs: CertConfig[];
  destinations: ConfigDestination[];
};

type ConfigDestination = {
  name: string;
  cert: string;
  domain: string;
  destination: DestinationType;
  config: DestinationConfig;
};

type ConfigMap = {};
