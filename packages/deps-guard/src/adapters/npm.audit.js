/**
 * adapters/npm.audit.js
 *
 * Executa `npm audit --json` e normaliza para AuditMap.
 *
 * Estrutura do npm audit v7+ (Bulk Advisory endpoint):
 * {
 *   "vulnerabilities": {
 *     "lodash": {                        ← um por PACOTE
 *       "severity": "high",              ← severidade agregada (a mais alta)
 *       "isDirect": true,
 *       "via": [
 *         {                              ← advisory individual (direto)
 *           "source": 1106913,
 *           "name": "lodash",
 *           "title": "Command Injection in lodash",
 *           "url": "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
 *           "severity": "high",
 *           "range": "<4.17.21"
 *         },
 *         "other-pkg"                   ← string = dependência transitiva vulnerável
 *       ],
 *       "fixAvailable": true | { name, version, isSemVerMajor }
 *     }
 *   }
 * }
 *
 * DECISÃO DE DESIGN: o AuditMap tem 1 entrada por ADVISORY, não por pacote.
 * Um pacote como lodash pode ter 7 advisories distintos — cada um com seu
 * próprio GHSA ID, título, severidade e fix. Agrupá-los numa única entrada
 * descarta informação crítica para o usuário.
 */

import { execSync } from "node:child_process";

/**
 * @param {string} cwd
 * @returns {Promise<import("../audit-filter.js").AuditMap>}
 */
export async function getAudit(cwd) {
  let stdout = "";

  try {
    stdout = execSync("npm audit --json", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    // npm audit sai com status != 0 quando encontra vulnerabilidades —
    // comportamento esperado: a saída útil está em stdout.
    stdout = err.stdout?.toString() ?? "";
    if (!stdout.trim()) {
      const message = err.stderr?.toString().trim();
      throw new Error(`npm audit falhou: ${message || err.message}`);
    }
  }

  if (!stdout.trim()) return {};

  let raw;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new Error("npm audit retornou JSON inválido");
  }

  return normalizeNpmAudit(raw);
}

/**
 * Normaliza a saída JSON do npm/pnpm audit para AuditMap.
 * Cria 1 entrada por advisory individual, não por pacote.
 * Exportado para uso nos testes sem spawnar processos.
 *
 * @param {Record<string, unknown>} raw
 * @returns {import("../audit-filter.js").AuditMap}
 */
export function normalizeNpmAudit(raw) {
  const vulnerabilities = raw?.vulnerabilities ?? {};

  /** @type {import("../audit-filter.js").AuditMap} */
  const result = {};

  for (const [pkgName, vuln] of Object.entries(vulnerabilities)) {
    const viaRaw = Array.isArray(vuln.via) ? vuln.via : [];
    const advisories = viaRaw.filter(
      (v) => typeof v === "object" && v !== null
    );
    const transitiveVia = viaRaw.filter((v) => typeof v === "string");
    const isDirect = !!vuln.isDirect;

    // fixAvailable pode ser boolean ou objeto com { name, version, isSemVerMajor }
    const fixAvailable =
      vuln.fixAvailable === true ||
      (typeof vuln.fixAvailable === "object" && vuln.fixAvailable !== null);

    const fixedIn =
      typeof vuln.fixAvailable === "object" && vuln.fixAvailable !== null
        ? vuln.fixAvailable.version ?? null
        : null;

    if (advisories.length > 0) {
      // Cria uma entrada por advisory direto
      for (const advisory of advisories) {
        const id =
          extractGhsa(advisory.url) ??
          extractCve(advisory.title ?? "") ??
          `npm-${advisory.source ?? pkgName}`;

        // Se já existe esse ID (de outro pacote afetado pelo mesmo advisory),
        // acrescenta o pacote à lista sem duplicar a entrada
        if (result[id]) {
          if (!result[id].packages.includes(pkgName)) {
            result[id].packages.push(pkgName);
          }
          continue;
        }

        result[id] = {
          id,
          severity: normalizeSeverity(advisory.severity ?? vuln.severity),
          title: advisory.title ?? `Vulnerabilidade em ${pkgName}`,
          url: advisory.url ?? "",
          packages: [pkgName],
          via: transitiveVia.length > 0 ? transitiveVia : [pkgName],
          fixAvailable,
          fixedIn,
          isDirect,
        };
      }
    } else if (transitiveVia.length > 0) {
      // Sem advisories diretos: vulnerabilidade puramente transitiva.
      // Cria uma entrada genérica para sinalizar o problema.
      const id = `transitive-${pkgName}`;
      if (!result[id]) {
        result[id] = {
          id,
          severity: normalizeSeverity(vuln.severity),
          title: `${pkgName} depende de pacote vulnerável: ${transitiveVia.join(
            ", "
          )}`,
          url: "",
          packages: [pkgName],
          via: transitiveVia,
          fixAvailable,
          fixedIn,
          isDirect: false,
        };
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @param {string | undefined} url */
function extractGhsa(url) {
  if (!url) return null;
  const m = url.match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i);
  return m ? m[0].toUpperCase() : null;
}

/** @param {string} text */
function extractCve(text) {
  const m = text.match(/CVE-\d{4}-\d+/i);
  return m ? m[0].toUpperCase() : null;
}

/** @param {string | undefined} s @returns {import("../audit-filter.js").Severity} */
function normalizeSeverity(s) {
  const valid = new Set(["info", "low", "moderate", "high", "critical"]);
  return /** @type {any} */ (valid.has(s) ? s : "moderate");
}
