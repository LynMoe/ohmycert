import { readFileSync } from "fs";
import { resolve } from "path";

import { Config } from "~/types/config";

export const config: Config = JSON.parse(
  readFileSync(resolve("./config", "config.json"), "utf-8")
);
