/**
 * orchestrator.js
 *
 * Coordena o fluxo completo do deps-guard:
 *   check → filter → report → (update) → exit
 *
 * É o único módulo que chama process.exit().
 */

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

  // ------------------------------------------------------------------
  // 1. Verificar dependências
  // ------------------------------------------------------------------
  spinner.start();

  let outdated, pm, root;

  try {
    ({ outdated, pm, root } = await checkOutdated(cwd));
  } catch (err) {
    spinner.fail("Falha ao verificar dependências.");
    renderError(err.message);
    process.exit(2);
  }

  spinner.stop();

  // ------------------------------------------------------------------
  // 2. Filtrar e classificar
  // ------------------------------------------------------------------
  const result = filterPackages(outdated, config);
  const exitCode = resolveExitCode(result, config.failOn);

  // ------------------------------------------------------------------
  // 3. Renderizar saída
  // ------------------------------------------------------------------
  if (config.json) {
    renderJson(result, { pm, root });
    process.exit(exitCode);
  }

  if (result.counts.critical === 0 && result.counts.regular === 0) {
    renderAllGood();
    process.exit(0);
  }

  renderReport(result, { pm });

  // ------------------------------------------------------------------
  // 4. Modo CI: apenas reportar e sair
  // ------------------------------------------------------------------
  if (config.ci || config.noUpdate) {
    process.exit(exitCode);
  }

  // ------------------------------------------------------------------
  // 5. Prompt interativo
  // ------------------------------------------------------------------
  const choice = await askUpdateChoice(result);

  if (!choice || choice === "ignore") {
    console.log("");
    console.log("  Nenhuma atualização realizada.\n");
    process.exit(exitCode);
  }

  // ------------------------------------------------------------------
  // 6. Executar atualização
  // ------------------------------------------------------------------
  const packages =
    choice === "critical"
      ? Object.keys(result.critical)
      : [...Object.keys(result.critical), ...Object.keys(result.regular)];

  console.log("");
  const success = await runUpdate({ packages, pm, root });

  if (success) {
    console.log("");
    process.exit(0);
  } else {
    renderError("A atualização falhou. Tente rodar manualmente.");
    process.exit(2);
  }
}
