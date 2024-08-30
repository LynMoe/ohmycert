export type CertConfig = {
  name: string;
  domains: string[];
  dnsProvider: string;
  envs: { [key: string]: string };
};

export type CertItem = {
  name: string;
  cert: string;
  key: string;
  expires: number;
  identifier: string;
  domains: string[];
};
