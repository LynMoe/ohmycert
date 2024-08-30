import { JSONFile } from "lowdb/node";
import { resolve } from "path";
import { Low } from "lowdb";

import { DbScheme } from "~/types/db";
import { config } from "~/utils/config";

const db = new Low(
  new JSONFile<DbScheme>(resolve(config.storePath, "db.json")),
  {
    destinationData: {},
  } as DbScheme
);

await db.read();

export default db;
