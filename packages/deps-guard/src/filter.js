/**
 * filter.js
 *
 * Funções puras que aplicam as regras de negócio do deps-guard:
 * separar pacotes em critical / regular / ignored e anotar cada
 * um com seu tipo de atualização.
 *
 * Sem I/O, sem efeitos colaterais — 100% testável em isolamento.
 */

import { getUpdateType, isOutdated, meetsThreshold } from "./semver.js";

/**
 * @typedef {Record<string, { current: string, wanted: string, latest: string }>} OutdatedMap
 *
 * @typedef {{ current: string, wanted: string, latest: string, type: import("./semver.js").UpdateType }} AnnotatedPackage
 *
 * @typedef {{
 *   critical: Record<string, AnnotatedPackage>,
 *   regular:  Record<string, AnnotatedPackage>,
 *   ignored:  Record<string, AnnotatedPackage>,
 *   counts: { critical: number, regular: number, ignored: number, total: number }
 * }} FilterResult
 */

/**
 * Processa o mapa bruto de pacotes desatualizados e os classifica
 * conforme as regras de configuração do usuário.
 *
 * @param {OutdatedMap} outdatedMap   Saída normalizada dos adapters
 * @param {{
 *   critical:    string[],
 *   ignore:      string[],
 *   updateType:  import("./semver.js").UpdateType
 * }} config
 * @returns {FilterResult}
 */
export function filterPackages(outdatedMap, config) {
  const { critical = [], ignore = [], updateType = "patch" } = config;

  const criticalSet = new Set(critical);
  const ignoreSet = new Set(ignore);

  /** @type {Record<string, AnnotatedPackage>} */
  const criticalPkgs = {};
  /** @type {Record<string, AnnotatedPackage>} */
  const regularPkgs = {};
  /** @type {Record<string, AnnotatedPackage>} */
  const ignoredPkgs = {};

  for (const [name, info] of Object.entries(outdatedMap)) {
    const type = getUpdateType(info.current, info.latest);

    // Pacotes que não estão de fato desatualizados são silenciados
    if (!isOutdated(info.current, info.latest)) continue;

    const annotated = { ...info, type };

    if (ignoreSet.has(name)) {
      ignoredPkgs[name] = annotated;
      continue;
    }

    // Pacotes abaixo do threshold configurado também são silenciados
    // (ex.: se updateType = "minor", patches são ignorados)
    if (!meetsThreshold(type, updateType)) {
      ignoredPkgs[name] = annotated;
      continue;
    }

    if (criticalSet.has(name)) {
      criticalPkgs[name] = annotated;
    } else {
      regularPkgs[name] = annotated;
    }
  }

  return {
    critical: criticalPkgs,
    regular: regularPkgs,
    ignored: ignoredPkgs,
    counts: {
      critical: Object.keys(criticalPkgs).length,
      regular: Object.keys(regularPkgs).length,
      ignored: Object.keys(ignoredPkgs).length,
      total:
        Object.keys(criticalPkgs).length +
        Object.keys(regularPkgs).length +
        Object.keys(ignoredPkgs).length,
    },
  };
}

/**
 * Determina o exit code correto com base no resultado do filtro
 * e na política de falha configurada.
 *
 * @param {FilterResult} result
 * @param {"critical" | "any" | "never"} failOn
 * @returns {0 | 1}
 */
export function resolveExitCode(result, failOn) {
  if (failOn === "never") return 0;
  if (failOn === "any" && result.counts.total > result.counts.ignored) return 1;
  if (failOn === "critical" && result.counts.critical > 0) return 1;
  return 0;
}
