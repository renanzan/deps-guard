/**
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
 * Retorna true se o diretório parece ser a raiz de um projeto Node.js
 * (tem package.json ou node_modules).
 *
 * @param {string} dir
 * @returns {boolean}
 */
function isNodeRoot(dir) {
  return (
    existsSync(join(dir, "package.json")) ||
    existsSync(join(dir, "node_modules"))
  );
}

/**
 * Detecta o package manager percorrendo a árvore de diretórios a partir de `cwd`.
 *
 * Algoritmo:
 *   Sobe a árvore verificando lock files em cada nível.
 *   Para quando encontra um lock file (sucesso) ou quando chega em um diretório
 *   que não é raiz de projeto Node.js E cujo pai também não é — isso evita
 *   vazar para fora do workspace sem bloquear monorepos com diretórios
 *   intermediários sem package.json (ex: "packages/web/" → "packages/" → "root/").
 *
 * @param {string} cwd
 * @returns {{ pm: PackageManager, root: string }}
 */
export function detectPackageManager(cwd) {
  let dir = cwd;

  while (true) {
    // 1. Verifica lock files no diretório atual
    for (const { file, pm } of LOCK_FILES) {
      if (existsSync(join(dir, file))) {
        return { pm, root: dir };
      }
    }

    const parent = dirname(dir);
    if (parent === dir) break; // raiz do sistema de arquivos

    // 2. Para se nem o atual nem o pai têm sinais de projeto Node.js.
    //    Isso permite subir por diretórios intermediários (ex: "packages/")
    //    sem package.json, mas para quando claramente saímos do ecossistema.
    if (!isNodeRoot(dir) && !isNodeRoot(parent)) {
      break;
    }

    dir = parent;
  }

  // Nenhum lock file encontrado dentro do escopo do projeto: fallback para npm
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
