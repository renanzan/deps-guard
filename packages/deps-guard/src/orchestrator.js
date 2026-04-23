/**
 * orchestrator.js
 *
 * Coordena o fluxo completo do deps-guard:
 *   check + audit (paralelo) → filter → report → (update) → exit
 *
 * É o único módulo que chama process.exit().
 */

import { filterVulns, shouldAuditFail } from "./audit-filter.js";
import { checkAudit } from "./auditor.js";
import { checkOutdated } from "./checker.js";
import { filterPackages, resolveExitCode } from "./filter.js";
import {
  askUpdateChoice,
  createSpinner,
  renderAllGood,
  renderError,
  renderJson,
  renderReport,
} from "./reporter.js";
import { runUpdate } from "./updater.js";

/**
 * @param {import("./config.js").Config} config
 * @param {string} cwd
 */
export async function run(config, cwd) {
  const spinner = createSpinner();
  spinner.start();

  // ------------------------------------------------------------------
  // 1. Outdated + audit em paralelo
  // ------------------------------------------------------------------
  let outdated, pm, root;
  let auditMap = {},
    auditWarning = null;

  try {
    const checks = [checkOutdated(cwd)];
    if (config.audit) checks.push(checkAudit(cwd));

    const [outdatedResult, auditResult] = await Promise.all(checks);

    ({ outdated, pm, root } = outdatedResult);

    if (auditResult) {
      auditMap = auditResult.auditMap;
      auditWarning = auditResult.warning;
    }
  } catch (err) {
    spinner.fail("Falha ao verificar dependências.");
    renderError(err.message);
    process.exit(2);
  }

  spinner.stop();

  // ------------------------------------------------------------------
  // 2. Filtrar e classificar
  // ------------------------------------------------------------------
  const depsResult = filterPackages(outdated, config);
  const auditResult = filterVulns(auditMap, config);

  const depsExitCode = resolveExitCode(depsResult, config.failOn);
  const auditShouldFail =
    config.audit && shouldAuditFail(auditResult, config.auditFailOn);
  const exitCode = depsExitCode === 1 || auditShouldFail ? 1 : 0;

  // ------------------------------------------------------------------
  // 3. Renderizar saída
  // ------------------------------------------------------------------
  if (config.json) {
    renderJson(depsResult, auditResult, {
      pm,
      root,
      auditEnabled: config.audit,
    });
    process.exit(exitCode);
  }

  const hasIssues =
    depsResult.counts.critical > 0 ||
    depsResult.counts.regular > 0 ||
    (config.audit && auditResult.counts.total > 0);

  if (!hasIssues) {
    renderAllGood(config.audit, auditResult);
    process.exit(0);
  }

  renderReport(depsResult, auditResult, {
    pm,
    auditEnabled: config.audit,
    auditWarning,
  });

  // ------------------------------------------------------------------
  // 4. Modo CI / --no-update
  // ------------------------------------------------------------------
  if (config.ci || config.noUpdate) {
    process.exit(exitCode);
  }

  // ------------------------------------------------------------------
  // 5. Prompt interativo
  // ------------------------------------------------------------------
  const choice = await askUpdateChoice(depsResult, auditResult, config.audit);

  if (!choice || choice === "ignore") {
    console.log("");
    console.log("  Nenhuma alteração realizada.\n");
    process.exit(0);
  }

  // ------------------------------------------------------------------
  // 6. Executar ação escolhida
  // ------------------------------------------------------------------
  console.log("");

  if (choice === "audit-fix") {
    const success = await runUpdate({ packages: [], pm, root, auditFix: true });
    process.exit(success ? 0 : 2);
  }

  const packages =
    choice === "critical"
      ? Object.keys(depsResult.critical)
      : [
          ...Object.keys(depsResult.critical),
          ...Object.keys(depsResult.regular),
        ];

  const success = await runUpdate({ packages, pm, root, auditFix: false });

  if (success) {
    console.log("");
    process.exit(0);
  } else {
    renderError("A atualização falhou. Tente rodar manualmente.");
    process.exit(2);
  }
}
