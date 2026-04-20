/**
 * checker.js
 *
 * Detecta o package manager do projeto percorrendo a árvore de diretórios
 * e delega a execução para o adapter correspondente.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** @typedef {"npm" | "pnpm" | "yarn" | "bun"} PackageManager */

/**
 * Mapeamento de lock file → package manager, em ordem de prioridade.
 * A ordem importa: bun e pnpm têm nomes únicos e são verificados primeiro.
 */
const LOCK_FILES = [
  { file: "bun.lockb", pm: /** @type {PackageManager} */ ("bun") },
  { file: "pnpm-lock.yaml", pm: /** @type {PackageManager} */ ("pnpm") },
  { file: "yarn.lock", pm: /** @type {PackageManager} */ ("yarn") },
  { file: "package-lock.json", pm: /** @type {PackageManager} */ ("npm") },
];

/**
 * Detecta o package manager percorrendo a árvore de diretórios a partir de `cwd`.
 * Sobe um nível por vez até encontrar um lock file ou chegar na raiz do sistema.
 *
 * @param {string} cwd
 * @returns {{ pm: PackageManager, root: string }}
 */
export function detectPackageManager(cwd) {
  let dir = cwd;

  while (true) {
    for (const { file, pm } of LOCK_FILES) {
      if (existsSync(join(dir, file))) {
        return { pm, root: dir };
      }
    }

    const parent = dirname(dir);
    if (parent === dir) break; // chegou na raiz do sistema de arquivos
    dir = parent;
  }

  // Nenhum lock file encontrado: fallback para npm
  return { pm: "npm", root: cwd };
}

/**
 * Carrega o adapter correspondente ao package manager detectado.
 *
 * @param {PackageManager} pm
 * @returns {Promise<{ getOutdated: (cwd: string) => Promise<import("./filter.js").OutdatedMap> }>}
 */
async function loadAdapter(pm) {
  switch (pm) {
    case "npm":
      return import("./adapters/npm.js");
    case "pnpm":
      return import("./adapters/pnpm.js");
    case "yarn":
      return import("./adapters/yarn.js");
    case "bun":
      return import("./adapters/bun.js");
    default:
      throw new Error(`Package manager não suportado: ${pm}`);
  }
}

/**
 * Detecta o package manager e executa a verificação de dependências.
 *
 * @param {string} cwd
 * @returns {Promise<{
 *   outdated: import("./filter.js").OutdatedMap,
 *   pm: PackageManager,
 *   root: string
 * }>}
 */
export async function checkOutdated(cwd) {
  const { pm, root } = detectPackageManager(cwd);
  const adapter = await loadAdapter(pm);
  const outdated = await adapter.getOutdated(root);

  return { outdated, pm, root };
}
