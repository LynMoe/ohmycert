import { readFileSync } from "fs";
import { resolve } from "path";
import { env } from "process";

import { Config } from "~/types/config";

export const config: Config = JSON.parse(
  readFileSync(
    resolve(
      "./config",
      `config${env["OHMYCERTCONFIG"] ? "." + env["OHMYCERTCONFIG"] : ""}.json`
    ),
    "utf-8"
  )
);
