/**
 * config.js
 *
 * Resolve a configuração final do deps-guard mesclando:
 *   1. Valores padrão
 *   2. deps.guard.json (encontrado percorrendo a árvore de diretórios)
 *   3. Flags de CLI (argv) — maior prioridade
 *
 * Exporta um objeto de configuração plano e validado.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * @typedef {{
 *   critical:    string[],
 *   ignore:      string[],
 *   failOn:      "critical" | "any" | "never",
 *   updateType:  "major" | "minor" | "patch",
 *   ci:          boolean,
 *   json:        boolean,
 *   noUpdate:    boolean,
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
};

const VALID_FAIL_ON = new Set(["critical", "any", "never"]);
const VALID_UPDATE_TYPE = new Set(["major", "minor", "patch"]);

/**
 * Procura pelo deps.guard.json subindo a árvore de diretórios a partir de `cwd`.
 *
 * @param {string} cwd
 * @returns {string | null} Caminho do arquivo encontrado, ou null
 */
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

/**
 * Lê e valida o deps.guard.json.
 * Erros de validação emitem warnings mas não interrompem a execução.
 *
 * @param {string} filePath
 * @returns {Partial<Config>}
 */
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

  if (Array.isArray(raw.critical)) {
    out.critical = raw.critical.filter((x) => typeof x === "string");
  }

  if (Array.isArray(raw.ignore)) {
    out.ignore = raw.ignore.filter((x) => typeof x === "string");
  }

  if (raw.failOn !== undefined) {
    if (VALID_FAIL_ON.has(raw.failOn)) {
      out.failOn = raw.failOn;
    } else {
      console.warn(
        `[deps-guard] failOn inválido: "${raw.failOn}" — usando "critical".`
      );
    }
  }

  if (raw.updateType !== undefined) {
    if (VALID_UPDATE_TYPE.has(raw.updateType)) {
      out.updateType = raw.updateType;
    } else {
      console.warn(
        `[deps-guard] updateType inválido: "${raw.updateType}" — usando "patch".`
      );
    }
  }

  return out;
}

/**
 * Parseia uma string de pacotes separados por vírgula.
 * Tolerante a espaços extras e entradas vazias.
 *
 * @param {string | undefined} value
 * @returns {string[]}
 */
function parsePackageList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolve a configuração final mesclando defaults, arquivo e argv.
 *
 * @param {Record<string, unknown>} argv  Objeto parseado pelo Commander
 * @param {string} cwd
 * @returns {Config}
 */
export function resolveConfig(argv, cwd) {
  const filePath = findConfigFile(cwd);
  const fileConfig = filePath ? readConfigFile(filePath) : {};

  // Constrói overrides de argv (apenas os que foram explicitamente passados)
  const argvConfig = {};

  if (argv.critical) {
    argvConfig.critical = parsePackageList(argv.critical);
  }

  if (argv.ignore) {
    argvConfig.ignore = parsePackageList(argv.ignore);
  }

  if (argv.failOn && VALID_FAIL_ON.has(argv.failOn)) {
    argvConfig.failOn = argv.failOn;
  }

  if (argv.updateType && VALID_UPDATE_TYPE.has(argv.updateType)) {
    argvConfig.updateType = argv.updateType;
  }

  if (argv.ci || process.env.CI === "true" || process.env.CI === "1") {
    argvConfig.ci = true;
  }

  if (argv.json) {
    argvConfig.json = true;
  }

  if (argv.noUpdate) {
    argvConfig.noUpdate = true;
  }

  // Em modo CI, noUpdate é sempre true
  const merged = { ...DEFAULTS, ...fileConfig, ...argvConfig };
  if (merged.ci) merged.noUpdate = true;

  return merged;
}
