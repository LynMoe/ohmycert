import { X509 } from "jsrsasign";

export function getCertExpires(cert: string): number {
  const certs = cert
    .split("-----END CERTIFICATE-----")
    .filter((c) => c.trim())
    .map((c) => c + "-----END CERTIFICATE-----");

  const x509 = new X509();
  if (certs.length > 1) {
    x509.readCertPEM(certs[0] as string);
  } else {
    x509.readCertPEM(cert);
  }

  const notAfter = x509.getNotAfter();

  const year = parseInt(`20${notAfter.substring(0, 2)}`);
  const month = parseInt(notAfter.substring(2, 4)) - 1;
  const day = parseInt(notAfter.substring(4, 6));
  const hour = parseInt(notAfter.substring(6, 8));
  const minute = parseInt(notAfter.substring(8, 10));
  const second = parseInt(notAfter.substring(10, 12));

  return new Date(Date.UTC(year, month, day, hour, minute, second)).getTime();
}
