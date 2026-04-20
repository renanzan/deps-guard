/**
 * semver.js
 *
 * Funções puras para comparação de versões semânticas.
 * Sem I/O, sem efeitos colaterais — 100% testável em isolamento.
 */

/** @typedef {"major" | "minor" | "patch" | "none"} UpdateType */

/**
 * Converte uma string de versão semver em tupla numérica [major, minor, patch].
 * Tolera prefixos de range (^, ~, >=, etc.) e sufixos de pré-release.
 *
 * @param {string} version
 * @returns {[number, number, number]}
 */
export function parseVersion(version) {
  if (!version || typeof version !== "string") return [0, 0, 0];

  // Remove prefixos de range comuns
  const clean = version.replace(/^[^0-9]*/, "");

  // Pega apenas a parte base (ignora -alpha.1, +build.123, etc.)
  const base = clean.split(/[-+]/)[0];
  const parts = base.split(".").map(Number);

  const major = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;

  return [major, minor, patch];
}

/**
 * Compara duas versões semver e retorna o tipo de atualização necessária.
 *
 * @param {string} current  Versão instalada atualmente
 * @param {string} latest   Versão mais recente disponível
 * @returns {UpdateType}
 */
export function getUpdateType(current, latest) {
  const [curMajor, curMinor, curPatch] = parseVersion(current);
  const [latMajor, latMinor, latPatch] = parseVersion(latest);

  if (latMajor > curMajor) return "major";
  if (latMinor > curMinor) return "minor";
  if (latPatch > curPatch) return "patch";
  return "none";
}

/**
 * Retorna true se `latest` for de fato mais recente que `current`.
 *
 * @param {string} current
 * @param {string} latest
 * @returns {boolean}
 */
export function isOutdated(current, latest) {
  return getUpdateType(current, latest) !== "none";
}

/**
 * Verifica se o tipo de atualização atinge o limite mínimo configurado.
 * Útil para filtrar patches quando o usuário só quer ver major/minor.
 *
 * @param {UpdateType} type        Tipo real da atualização
 * @param {UpdateType} threshold   Tipo mínimo configurado
 * @returns {boolean}
 */
export function meetsThreshold(type, threshold) {
  const order = { major: 3, minor: 2, patch: 1, none: 0 };
  return (order[type] ?? 0) >= (order[threshold] ?? 1);
}
