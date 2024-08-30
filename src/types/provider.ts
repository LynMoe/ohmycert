import { CertConfig, CertItem } from "~/types/cert";

export interface Provider {
  runOrRenew(cert: CertConfig): Promise<CertItem>;
  listCerts(): Promise<CertItem[]>;
}
