import { CertItem } from "~/types/cert";

export interface Destination {
  deployCert(
    domain: string,
    cert: CertItem,
    destConfig: DestinationConfig
  ): Promise<boolean>;
  cleanCert(destConfig: DestinationConfig): Promise<void>;
}

export enum DestinationType {
  alicdn = "alicdn",
  alidcdn = "alidcdn",
  dogecloud = "dogecloud",
}

export interface DestinationConfig {
  _: string;
}

export interface DestinationConfigAli extends DestinationConfig {
  accessKeyId: string;
  accessKeySecret: string;
}

export interface DestinationConfigDogecloud extends DestinationConfig {
  accessKey: string;
  secretKey: string;
}
