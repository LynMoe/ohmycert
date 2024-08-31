import { readFileSync } from "fs";
import { resolve } from "path";
import { env } from "process";
import chokidar from "chokidar";

import { Config } from "~/types/config";
import { eventBus } from "~/utils/eventbus";

const configFileName = resolve(
  "./config",
  `config${env["OHMYCERTCONFIG"] ? "." + env["OHMYCERTCONFIG"] : ""}.json`
);

let config: Config = JSON.parse(readFileSync(configFileName, "utf-8"));

const watcher = chokidar.watch(configFileName);
watcher.on("change", () => {
  try {
    console.log("Config file changed, reloading");
    config = JSON.parse(readFileSync(configFileName, "utf-8"));
    eventBus.emit("config:reload");
  } catch (error) {
    console.error("Error reloading config", error);
  }
});

export { config };
