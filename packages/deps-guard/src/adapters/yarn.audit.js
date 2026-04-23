/**
 * adapters/yarn.audit.js
 *
 * Suporta Yarn Classic (v1) e Yarn Berry (v2+).
 *
 * Yarn Classic — `yarn audit --json` emite NDJSON. A linha relevante
 * tem `type: "auditAdvisory"` com dados do advisory:
 * { type: "auditAdvisory", data: { resolution: {...}, advisory: { id, title, severity, url, ... } } }
 *
 * Yarn Berry — `yarn npm audit --json` emite um objeto JSON único
 * com shape similar ao npm v7 (vulnerabilities + metadata).
 */

import { execSync } from "node:child_process";
import { normalizeNpmAudit } from "./npm.audit.js";

/**
 * @param {string} cwd
 * @returns {Promise<import("../audit-filter.js").AuditMap>}
 */
export async function getAudit(cwd) {
  const yarnVersion = getYarnMajorVersion(cwd);

  if (yarnVersion >= 2) {
    return getAuditBerry(cwd);
  }
  return getAuditClassic(cwd);
}

// ---------------------------------------------------------------------------
// Yarn Classic (v1)
// ---------------------------------------------------------------------------

/**
 * @param {string} cwd
 * @returns {Promise<import("../audit-filter.js").AuditMap>}
 */
async function getAuditClassic(cwd) {
  let stdout = "";

  try {
    stdout = execSync("yarn audit --json", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    stdout = err.stdout?.toString() ?? "";
    if (!stdout.trim()) {
      const message = err.stderr?.toString().trim();
      throw new Error(`yarn audit falhou: ${message || err.message}`);
    }
  }

  if (!stdout.trim()) return {};

  return normalizeYarnClassicAudit(stdout);
}

/**
 * Normaliza NDJSON do yarn classic.
 * Exportado para testes isolados.
 *
 * @param {string} ndjson
 * @returns {import("../audit-filter.js").AuditMap}
 */
export function normalizeYarnClassicAudit(ndjson) {
  /** @type {import("../audit-filter.js").AuditMap} */
  const result = {};

  for (const line of ndjson.trim().split("\n")) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed?.type !== "auditAdvisory") continue;

    const advisory = parsed.data?.advisory;
    if (!advisory) continue;

    const id =
      advisory.github_advisory_id ??
      advisory.cves?.[0] ??
      `yarn-${advisory.id}`;

    result[id] = {
      id,
      severity: normalizeSeverity(advisory.severity),
      title: advisory.title ?? "Vulnerabilidade desconhecida",
      url: advisory.url ?? advisory.references ?? "",
      packages: [advisory.module_name ?? "unknown"],
      via: [advisory.module_name ?? "unknown"],
      fixAvailable:
        !!advisory.patched_versions && advisory.patched_versions !== "<0.0.0",
      fixedIn: advisory.patched_versions ?? null,
      isDirect: true,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Yarn Berry (v2+)
// ---------------------------------------------------------------------------

/**
 * @param {string} cwd
 * @returns {Promise<import("../audit-filter.js").AuditMap>}
 */
async function getAuditBerry(cwd) {
  let stdout = "";

  try {
    stdout = execSync("yarn npm audit --json", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    stdout = err.stdout?.toString() ?? "";
    if (!stdout.trim()) {
      const message = err.stderr?.toString().trim();
      throw new Error(`yarn npm audit falhou: ${message || err.message}`);
    }
  }

  if (!stdout.trim()) return {};

  let raw;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new Error("yarn npm audit retornou JSON inválido");
  }

  // Yarn Berry usa formato compatível com npm v7
  return normalizeNpmAudit(raw);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @param {string | undefined} s */
function normalizeSeverity(s) {
  const valid = new Set(["info", "low", "moderate", "high", "critical"]);
  return valid.has(s) ? s : "moderate";
}

/** @param {string} cwd @returns {number} */
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
