/**
 * Executa `npm outdated --json` e normaliza a saída para OutdatedMap.
 *
 * Saída bruta do npm:
 * {
 *   "react": {
 *     "current": "18.2.0",
 *     "wanted": "18.2.0",
 *     "latest": "19.0.0",
 *     "location": "node_modules/react",
 *     "packageType": "dependencies",
 *     ...
 *   }
 * }
 */

import { execSync } from "node:child_process";

/**
 * @param {string} cwd
 * @returns {Promise<import("../filter.js").OutdatedMap>}
 */
export async function getOutdated(cwd) {
  let stdout = "";

  try {
    stdout = execSync("npm outdated --json", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    // npm outdated sai com status 1 quando encontra desatualizados —
    // isso é "sucesso" para nós: a saída útil está em stdout.
    stdout = err.stdout?.toString() ?? "";
    if (!stdout.trim()) {
      // stderr vazio e stdout vazio = sem node_modules ou outro erro real
      const message = err.stderr?.toString().trim();
      throw new Error(`npm outdated falhou: ${message || err.message}`);
    }
  }

  if (!stdout.trim()) return {};

  let raw;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new Error("npm outdated retornou JSON inválido");
  }

  /** @type {import("../filter.js").OutdatedMap} */
  const result = {};

  for (const [name, info] of Object.entries(raw)) {
    result[name] = {
      current: info.current ?? "0.0.0",
      wanted: info.wanted ?? info.current ?? "0.0.0",
      latest: info.latest ?? info.current ?? "0.0.0",
    };
  }

  return result;
}
