import { spawn } from "child_process";

export const exec = async (
  cmd: string,
  args: Array<string> = [],
  options: { [key: string]: any } = {}
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: true, ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim()));
      }
    });
  });
};
