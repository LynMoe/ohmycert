import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { isURL } from "validator";

import { DistributionAgentClientConfig } from "~/types/distribution";

class Config {
  config: DistributionAgentClientConfig = {
    s3Url: "",
    pathKey: "",
    key: "",
  };

  async init() {
    try {
      await stat("/etc/ohmycert");
      await stat("/etc/ohmycert/scripts");
      await stat("/etc/ohmycert/config.json");
    } catch (e: any) {
      await mkdir("/etc/ohmycert/scripts", { recursive: true });
      await writeFile(
        "/etc/ohmycert/config.json",
        JSON.stringify(
          {
            s3Url: "",
            pathKey: "",
            key: "",
          },
          null,
          2
        )
      );

      const exampleScript = `import { writeFile } from "fs/promises";
export default async (certs, utils) => {
  // certs: [
  //   {
  //      name: 'cert name',
  //      cert: 'cert pem',
  //      key: 'key pem',
  //      expires: 'timestamp in millisecond',
  //      domains: ['example.com', '*.example.com'],
  //      identifier: 'cert identifier'
  //   }
  // ]
  const { exec, logger } = utils;
  logger.info('Whoami:', await exec('whoami'));
  for (const cert of certs) {
    logger.info('Cert domains:', { domains: cert.domains });
    // await writeFile('/etc/ssl/test.crt', cert.cert);
    // await writeFile('/etc/ssl/test.key', cert.key);
  }
  // await exec('systemctl', ['restart', 'nginx']);
  return;
}
`;
      await writeFile("/etc/ohmycert/scripts/example.js", exampleScript);
      throw new Error(
        "Config file generated, please fill in the config file at /etc/ohmycert/config.json"
      );
    }

    const data = (await readFile("/etc/ohmycert/config.json")).toString();
    this.config = JSON.parse(data);
    if (!this.config.s3Url || !this.config.pathKey || !this.config.key) {
      throw new Error("Config file is not filled");
    }
    if (!isURL(this.config.s3Url)) {
      throw new Error("Invalid URL");
    }
  }
}

export default new Config();
