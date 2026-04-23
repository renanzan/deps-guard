/**
 * adapters/npm.audit.js
 *
 * Executa `npm audit --json` e normaliza para AuditMap.
 * Suporta dois formatos de saída:
 *
 * FORMATO NOVO — npm v7+ e pnpm v8+ (chave `vulnerabilities`):
 * {
 *   "auditReportVersion": 2,
 *   "vulnerabilities": {
 *     "lodash": {
 *       "severity": "critical",
 *       "isDirect": true,
 *       "via": [
 *         { "source": 1001, "title": "...", "url": "https://github.com/advisories/GHSA-...", "severity": "critical" },
 *         { "source": 1002, ... }   ← N advisories por pacote
 *       ],
 *       "fixAvailable": true | { "name": "lodash", "version": "4.17.21", "isSemVerMajor": false }
 *     }
 *   }
 * }
 *
 * FORMATO ANTIGO — npm v6 e pnpm v7- (chave `advisories`):
 * {
 *   "advisories": {
 *     "1523": {
 *       "id": 1523,
 *       "github_advisory_id": "GHSA-jf85-cpcp-j695",
 *       "module_name": "lodash",
 *       "title": "Prototype Pollution in lodash",
 *       "severity": "high",
 *       "url": "https://npmjs.com/advisories/1523",
 *       "patched_versions": ">=4.17.21",
 *       "cves": ["CVE-2019-10744"],
 *       "findings": [{ "version": "4.17.11", "paths": ["lodash"] }]
 *     }
 *   }
 * }
 *
 * DECISÃO: AuditMap tem 1 entrada por ADVISORY individual, não por pacote.
 * Um pacote como lodash pode ter 7 advisories distintos.
 */

import { execSync } from "node:child_process";

/**
 * @param {string} cwd
 * @returns {Promise<import("../audit-filter.js").AuditMap>}
 */
export async function getAudit(cwd) {
  let stdout = "";

  try {
    stdout = execSync("pnpm audit --json", {
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
 * Detecta o formato e normaliza para AuditMap.
 * Exportado para uso nos testes sem spawnar processos.
 *
 * @param {Record<string, unknown>} raw
 * @returns {import("../audit-filter.js").AuditMap}
 */
export function normalizeNpmAudit(raw) {
  if (!raw || typeof raw !== "object") return {};

  // Formato novo (npm v7+ / pnpm v8+): chave "vulnerabilities"
  if (raw.vulnerabilities && typeof raw.vulnerabilities === "object") {
    return normalizeNewFormat(raw.vulnerabilities);
  }

  // Formato antigo (npm v6 / pnpm v7-): chave "advisories"
  if (raw.advisories && typeof raw.advisories === "object") {
    return normalizeOldFormat(raw.advisories);
  }

  return {};
}

// ---------------------------------------------------------------------------
// Normalizador — formato novo (npm v7+)
// 1 entrada por advisory dentro de `via`, não por pacote
// ---------------------------------------------------------------------------

/**
 * @param {Record<string, unknown>} vulnerabilities
 * @returns {import("../audit-filter.js").AuditMap}
 */
function normalizeNewFormat(vulnerabilities) {
  /** @type {import("../audit-filter.js").AuditMap} */
  const result = {};

  for (const [pkgName, vuln] of Object.entries(vulnerabilities)) {
    const viaRaw = Array.isArray(vuln.via) ? vuln.via : [];
    const advisories = viaRaw.filter(
      (v) => typeof v === "object" && v !== null
    );
    const transitiveVia = viaRaw.filter((v) => typeof v === "string");
    const isDirect = !!vuln.isDirect;

    const fixAvailable =
      vuln.fixAvailable === true ||
      (typeof vuln.fixAvailable === "object" && vuln.fixAvailable !== null);

    const fixedIn =
      typeof vuln.fixAvailable === "object" && vuln.fixAvailable !== null
        ? vuln.fixAvailable.version ?? null
        : null;

    if (advisories.length > 0) {
      // 1 entrada por advisory direto
      for (const advisory of advisories) {
        const id =
          extractGhsa(advisory.url) ??
          extractCve(advisory.title ?? "") ??
          `npm-${advisory.source ?? pkgName}`;

        // Mesmo advisory afetando múltiplos pacotes: adiciona à lista sem duplicar
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
      // Sem advisories diretos: vulnerabilidade transitiva pura
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
// Normalizador — formato antigo (npm v6 / pnpm v7-)
// Cada chave em `advisories` JÁ é um advisory individual
// ---------------------------------------------------------------------------

/**
 * @param {Record<string, unknown>} advisories
 * @returns {import("../audit-filter.js").AuditMap}
 */
function normalizeOldFormat(advisories) {
  /** @type {import("../audit-filter.js").AuditMap} */
  const result = {};

  for (const advisory of Object.values(advisories)) {
    if (!advisory || typeof advisory !== "object") continue;

    // ID preferencial: github_advisory_id (GHSA) > CVE > id numérico
    const id =
      advisory.github_advisory_id ??
      advisory.cves?.[0] ??
      (advisory.id ? `npm-${advisory.id}` : null) ??
      `npm-advisory-${Math.random().toString(36).slice(2)}`;

    const fixAvailable =
      !!advisory.patched_versions &&
      advisory.patched_versions !== "<0.0.0" &&
      advisory.patched_versions !== "*";

    // `findings` lista as versões afetadas e paths
    const packages = advisory.findings
      ? [
          ...new Set(
            advisory.findings
              .flatMap((f) => f.paths ?? [])
              .map((p) => p.split(">").pop().trim())
          ),
        ]
      : [advisory.module_name ?? "unknown"];

    result[id] = {
      id,
      severity: normalizeSeverity(advisory.severity),
      title: advisory.title ?? `Vulnerabilidade em ${advisory.module_name}`,
      url: advisory.url ?? "",
      packages:
        packages.length > 0 ? packages : [advisory.module_name ?? "unknown"],
      via: [advisory.module_name ?? "unknown"],
      fixAvailable,
      fixedIn: fixAvailable ? advisory.patched_versions : null,
      isDirect: true,
    };
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
