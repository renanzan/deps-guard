/**
 * config.js
 *
 * Resolve a configuração final do deps-guard mesclando:
 *   1. Valores padrão
 *   2. deps.guard.json (encontrado percorrendo a árvore de diretórios)
 *   3. Flags de CLI (argv) — maior prioridade
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * @typedef {{
 *   critical:          string[],
 *   ignore:            string[],
 *   failOn:            "critical" | "any" | "never",
 *   updateType:        "major" | "minor" | "patch",
 *   ci:                boolean,
 *   json:              boolean,
 *   noUpdate:          boolean,
 *   audit:             boolean,
 *   auditLevel:        "info" | "low" | "moderate" | "high" | "critical",
 *   ignoreAdvisories:  string[],
 *   auditFailOn:       "info" | "low" | "moderate" | "high" | "critical" | "never",
 * }} Config
 */

/** @type {Config} */
const DEFAULTS = {
  critical: [],
  ignore: [],
  failOn: "critical",
  updateType: "patch",
  ci: false,
  json: false,
  noUpdate: false,
  audit: false,
  auditLevel: "high",
  ignoreAdvisories: [],
  auditFailOn: "critical",
};

const VALID_FAIL_ON = new Set(["critical", "any", "never"]);
const VALID_UPDATE_TYPE = new Set(["major", "minor", "patch"]);
const VALID_SEVERITY = new Set(["info", "low", "moderate", "high", "critical"]);
const VALID_AUDIT_FAILON = new Set([
  "info",
  "low",
  "moderate",
  "high",
  "critical",
  "never",
]);

function findConfigFile(cwd) {
  let dir = cwd;
  while (true) {
    const candidate = join(dir, "deps.guard.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readConfigFile(filePath) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    console.warn(
      `[deps-guard] Não foi possível ler ${filePath} — usando padrões.`
    );
    return {};
  }

  const out = {};

  if (Array.isArray(raw.critical))
    out.critical = raw.critical.filter((x) => typeof x === "string");

  if (Array.isArray(raw.ignore))
    out.ignore = raw.ignore.filter((x) => typeof x === "string");

  if (raw.failOn !== undefined) {
    if (VALID_FAIL_ON.has(raw.failOn)) out.failOn = raw.failOn;
    else
      console.warn(
        `[deps-guard] failOn inválido: "${raw.failOn}" — usando "critical".`
      );
  }

  if (raw.updateType !== undefined) {
    if (VALID_UPDATE_TYPE.has(raw.updateType)) out.updateType = raw.updateType;
    else
      console.warn(
        `[deps-guard] updateType inválido: "${raw.updateType}" — usando "patch".`
      );
  }

  if (typeof raw.audit === "boolean") out.audit = raw.audit;

  if (raw.auditLevel !== undefined) {
    if (VALID_SEVERITY.has(raw.auditLevel)) out.auditLevel = raw.auditLevel;
    else
      console.warn(
        `[deps-guard] auditLevel inválido: "${raw.auditLevel}" — usando "high".`
      );
  }

  if (Array.isArray(raw.ignoreAdvisories))
    out.ignoreAdvisories = raw.ignoreAdvisories.filter(
      (x) => typeof x === "string"
    );

  if (raw.auditFailOn !== undefined) {
    if (VALID_AUDIT_FAILON.has(raw.auditFailOn))
      out.auditFailOn = raw.auditFailOn;
    else
      console.warn(
        `[deps-guard] auditFailOn inválido: "${raw.auditFailOn}" — usando "critical".`
      );
  }

  return out;
}

function parsePackageList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {Record<string, unknown>} argv
 * @param {string} cwd
 * @returns {Config}
 */
export function resolveConfig(argv, cwd) {
  const filePath = findConfigFile(cwd);
  const fileConfig = filePath ? readConfigFile(filePath) : {};
  const argvConfig = {};

  if (argv.critical) argvConfig.critical = parsePackageList(argv.critical);
  if (argv.ignore) argvConfig.ignore = parsePackageList(argv.ignore);

  if (argv.failOn && VALID_FAIL_ON.has(argv.failOn))
    argvConfig.failOn = argv.failOn;

  if (argv.updateType && VALID_UPDATE_TYPE.has(argv.updateType))
    argvConfig.updateType = argv.updateType;

  if (argv.ci || process.env.CI === "true" || process.env.CI === "1")
    argvConfig.ci = true;

  if (argv.json) argvConfig.json = true;
  if (argv.noUpdate) argvConfig.noUpdate = true;
  if (argv.audit) argvConfig.audit = true;

  if (argv.auditLevel && VALID_SEVERITY.has(argv.auditLevel))
    argvConfig.auditLevel = argv.auditLevel;

  if (argv.ignoreAdvisories)
    argvConfig.ignoreAdvisories = parsePackageList(argv.ignoreAdvisories);

  if (argv.auditFailOn && VALID_AUDIT_FAILON.has(argv.auditFailOn))
    argvConfig.auditFailOn = argv.auditFailOn;

  const merged = { ...DEFAULTS, ...fileConfig, ...argvConfig };
  if (merged.ci) merged.noUpdate = true;

  return merged;
}
