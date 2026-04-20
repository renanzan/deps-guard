/**
 * adapters/yarn.js
 *
 * Suporta Yarn Classic (v1) e Yarn Berry (v2+).
 *
 * Yarn Classic — `yarn outdated --json` emite linhas NDJSON onde cada linha
 * é um objeto. A linha relevante tem `type: "table"` com data.body:
 * [["package", "current", "wanted", "latest", "packageType", "url"], ...]
 *
 * Yarn Berry — não tem `outdated` nativo. Usamos `yarn npm info <pkg> --json`
 * via `yarn info --all --json`, que lista versões. Como alternativa mais
 * simples, tentamos o plugin `yarn-outdated-formatter` se disponível,
 * senão fazemos fallback para o próprio `npm outdated --json` (npm está
 * sempre disponível como runtime). Documentamos esse comportamento.
 */

import { execSync } from "node:child_process";

/**
 * @param {string} cwd
 * @returns {Promise<import("../filter.js").OutdatedMap>}
 */
export async function getOutdated(cwd) {
  const yarnVersion = getYarnMajorVersion(cwd);

  if (yarnVersion >= 2) {
    return getOutdatedBerry(cwd);
  }

  return getOutdatedClassic(cwd);
}

// ---------------------------------------------------------------------------
// Yarn Classic (v1)
// ---------------------------------------------------------------------------

/**
 * @param {string} cwd
 * @returns {Promise<import("../filter.js").OutdatedMap>}
 */
async function getOutdatedClassic(cwd) {
  let stdout = "";

  try {
    stdout = execSync("yarn outdated --json", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    // Yarn Classic sai com status 1 quando há desatualizados
    stdout = err.stdout?.toString() ?? "";
    if (!stdout.trim()) {
      const message = err.stderr?.toString().trim();
      throw new Error(`yarn outdated falhou: ${message || err.message}`);
    }
  }

  if (!stdout.trim()) return {};

  // NDJSON: cada linha é um objeto JSON independente
  const lines = stdout.trim().split("\n");

  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed?.type !== "table" || !Array.isArray(parsed?.data?.body)) {
      continue;
    }

    const header = parsed.data.head ?? [];
    const pkgIdx = header.indexOf("Package");
    const currentIdx = header.indexOf("Current");
    const wantedIdx = header.indexOf("Wanted");
    const latestIdx = header.indexOf("Latest");

    /** @type {import("../filter.js").OutdatedMap} */
    const result = {};

    for (const row of parsed.data.body) {
      const name = row[pkgIdx] ?? row[0];
      const current = row[currentIdx] ?? row[1] ?? "0.0.0";
      const wanted = row[wantedIdx] ?? row[2] ?? current;
      const latest = row[latestIdx] ?? row[3] ?? current;

      if (name) {
        result[name] = { current, wanted, latest };
      }
    }

    return result;
  }

  return {};
}

// ---------------------------------------------------------------------------
// Yarn Berry (v2+)
// ---------------------------------------------------------------------------

/**
 * Yarn Berry não tem `outdated` nativo. Estratégia:
 * 1. Tenta rodar `yarn npm audit` — sem informação de latest.
 * 2. Fallback: lê package.json e consulta a registry via `npm info` para
 *    cada dep, montando o OutdatedMap manualmente. Isso é mais lento mas
 *    não requer plugins.
 *
 * @param {string} cwd
 * @returns {Promise<import("../filter.js").OutdatedMap>}
 */
async function getOutdatedBerry(cwd) {
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");

  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error("package.json não encontrado");
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    throw new Error("Não foi possível ler o package.json");
  }

  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  if (!Object.keys(deps).length) return {};

  /** @type {import("../filter.js").OutdatedMap} */
  const result = {};

  for (const [name, versionRange] of Object.entries(deps)) {
    try {
      const infoRaw = execSync(`npm info ${name} version --json`, {
        cwd,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10_000,
      });

      const latest = JSON.parse(infoRaw.trim()).replace(/"/g, "");
      const current = versionRange.replace(/^[^0-9]*/, "");

      result[name] = {
        current,
        wanted: current,
        latest,
      };
    } catch {
      // Ignora pacotes que não conseguimos consultar (privados, etc.)
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} cwd
 * @returns {number} major version do yarn (1, 2, 3, 4...)
 */
function getYarnMajorVersion(cwd) {
  try {
    const out = execSync("yarn --version", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return parseInt(out.trim().split(".")[0], 10) || 1;
  } catch {
    return 1;
  }
}
