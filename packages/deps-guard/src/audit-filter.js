/**
 * Funções puras para classificar vulnerabilidades por severidade
 * e aplicar regras de ignoreAdvisories.
 *
 * Sem I/O, sem efeitos colaterais — 100% testável em isolamento.
 */

/**
 * @typedef {"info" | "low" | "moderate" | "high" | "critical"} Severity
 *
 * @typedef {{
 *   id:           string,
 *   severity:     Severity,
 *   title:        string,
 *   url:          string,
 *   packages:     string[],
 *   via:          string[],
 *   fixAvailable: boolean,
 *   fixedIn:      string | null,
 *   isDirect:     boolean,
 * }} AuditVuln
 *
 * @typedef {Record<string, AuditVuln>} AuditMap
 *
 * @typedef {{
 *   vulns:   Record<string, AuditVuln>,
 *   ignored: Record<string, AuditVuln>,
 *   counts: {
 *     info: number, low: number, moderate: number,
 *     high: number, critical: number,
 *     total: number, ignored: number
 *   }
 * }} AuditFilterResult
 */

/** Ordem numérica de severidade para comparação */
const SEVERITY_ORDER = { info: 1, low: 2, moderate: 3, high: 4, critical: 5 };

/**
 * Verifica se uma severidade atinge o nível mínimo configurado.
 *
 * @param {Severity} severity
 * @param {Severity} threshold
 * @returns {boolean}
 */
export function meetsSeverityThreshold(severity, threshold) {
  return (SEVERITY_ORDER[severity] ?? 0) >= (SEVERITY_ORDER[threshold] ?? 1);
}

/**
 * Filtra e classifica vulnerabilidades conforme configuração.
 *
 * @param {AuditMap} auditMap
 * @param {{
 *   auditLevel:        Severity,
 *   ignoreAdvisories:  string[],
 * }} config
 * @returns {AuditFilterResult}
 */
export function filterVulns(auditMap, config) {
  const { auditLevel = "high", ignoreAdvisories = [] } = config;
  const ignoreSet = new Set(ignoreAdvisories.map((id) => id.toLowerCase()));

  /** @type {Record<string, AuditVuln>} */
  const vulns = {};
  /** @type {Record<string, AuditVuln>} */
  const ignored = {};

  for (const [id, vuln] of Object.entries(auditMap)) {
    const normalizedId = id.toLowerCase();

    if (ignoreSet.has(normalizedId)) {
      ignored[id] = vuln;
      continue;
    }

    if (!meetsSeverityThreshold(vuln.severity, auditLevel)) {
      ignored[id] = vuln;
      continue;
    }

    vulns[id] = vuln;
  }

  const counts = {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
    total: 0,
    ignored: 0,
  };

  for (const vuln of Object.values(vulns)) {
    counts[vuln.severity] = (counts[vuln.severity] ?? 0) + 1;
    counts.total++;
  }

  counts.ignored = Object.keys(ignored).length;

  return { vulns, ignored, counts };
}

/**
 * Determina se a presença de vulnerabilidades deve bloquear o pipeline.
 *
 * @param {AuditFilterResult} result
 * @param {Severity | "never"} auditFailOn
 * @returns {boolean}
 */
export function shouldAuditFail(result, auditFailOn) {
  if (auditFailOn === "never") return false;
  if (result.counts.total === 0) return false;

  // Verifica se alguma vuln ativa atinge o threshold de falha
  for (const vuln of Object.values(result.vulns)) {
    if (
      meetsSeverityThreshold(
        vuln.severity,
        /** @type {Severity} */ (auditFailOn)
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Agrupa vulnerabilidades ativas por severidade para exibição.
 *
 * @param {AuditFilterResult} result
 * @returns {Record<Severity, AuditVuln[]>}
 */
export function groupBySeverity(result) {
  const groups = { critical: [], high: [], moderate: [], low: [], info: [] };

  for (const vuln of Object.values(result.vulns)) {
    groups[vuln.severity]?.push(vuln);
  }

  return groups;
}
