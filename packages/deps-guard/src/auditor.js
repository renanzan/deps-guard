/**
 * auditor.js
 *
 * Detecta o package manager e executa a verificação de vulnerabilidades,
 * delegando ao adapter correto.
 *
 * Paralelo ao checker.js, mas para audit em vez de outdated.
 * Reutiliza detectPackageManager do checker para consistência.
 */

import { detectPackageManager } from "./checker.js";

/**
 * @param {string} pm
 * @returns {Promise<{ getAudit: (cwd: string) => Promise<import("./audit-filter.js").AuditMap> }>}
 */
async function loadAuditAdapter(pm) {
  switch (pm) {
    case "npm":
      return import("./adapters/npm.audit.js");
    case "pnpm":
      return import("./adapters/pnpm.audit.js");
    case "yarn":
      return import("./adapters/yarn.audit.js");
    case "bun":
      return import("./adapters/bun.audit.js");
    default:
      throw new Error(`Package manager não suportado para audit: ${pm}`);
  }
}

/**
 * Executa o audit de vulnerabilidades para o projeto em `cwd`.
 *
 * @param {string} cwd
 * @returns {Promise<{
 *   auditMap: import("./audit-filter.js").AuditMap,
 *   pm:       string,
 *   root:     string,
 *   warning:  string | null,
 * }>}
 */
export async function checkAudit(cwd) {
  const { pm, root } = detectPackageManager(cwd);

  // Bun ainda não tem saída JSON estável para audit — emite aviso
  const warning =
    pm === "bun"
      ? "bun audit não tem saída JSON estável. O parsing é best-effort e pode ser impreciso."
      : null;

  const adapter = await loadAuditAdapter(pm);
  const auditMap = await adapter.getAudit(root);

  return { auditMap, pm, root, warning };
}
