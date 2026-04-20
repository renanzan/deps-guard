/**
 * adapters/pnpm.js
 *
 * Executa `pnpm outdated --format json` e normaliza para OutdatedMap.
 *
 * pnpm em modo workspace (`-r`) retorna um array de objetos por workspace:
 * [
 *   {
 *     "react": { "current": "18.2.0", "latest": "19.0.0", "wanted": "18.2.0" }
 *   },
 *   ...
 * ]
 *
 * Em projetos simples retorna um único objeto flat (mesmo formato do npm).
 * Ambos os formatos são tratados aqui.
 */

import { execSync } from "node:child_process";

/**
 * @param {string} cwd
 * @returns {Promise<import("../filter.js").OutdatedMap>}
 */
export async function getOutdated(cwd) {
  // Detecta se é workspace para usar a flag correta
  const isWorkspace = await detectWorkspace(cwd);
  const cmd = isWorkspace
    ? "pnpm -r outdated --format json"
    : "pnpm outdated --format json";

  let stdout = "";

  try {
    stdout = execSync(cmd, {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    // pnpm também sai com status 1 quando há desatualizados
    stdout = err.stdout?.toString() ?? "";
    if (!stdout.trim()) {
      const message = err.stderr?.toString().trim();
      throw new Error(`pnpm outdated falhou: ${message || err.message}`);
    }
  }

  if (!stdout.trim()) return {};

  let raw;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new Error("pnpm outdated retornou JSON inválido");
  }

  // Modo workspace: array de objetos; mescla todos (último vence em duplicatas)
  const merged = Array.isArray(raw)
    ? raw.reduce((acc, workspace) => ({ ...acc, ...workspace }), {})
    : raw;

  /** @type {import("../filter.js").OutdatedMap} */
  const result = {};

  for (const [name, info] of Object.entries(merged)) {
    result[name] = {
      current: info.current ?? "0.0.0",
      wanted: info.wanted ?? info.current ?? "0.0.0",
      latest: info.latest ?? info.current ?? "0.0.0",
    };
  }

  return result;
}

/**
 * Verifica se o diretório é um workspace pnpm procurando por pnpm-workspace.yaml.
 *
 * @param {string} cwd
 * @returns {Promise<boolean>}
 */
async function detectWorkspace(cwd) {
  const { existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  return existsSync(join(cwd, "pnpm-workspace.yaml"));
}
