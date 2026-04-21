/**
 * Toda a saída no terminal fica aqui — Chalk, Clack e Ora.
 * Sem lógica de negócio: apenas recebe dados, renderiza e pergunta.
 */

import * as clack from "@clack/prompts";
import chalk from "chalk";
import ora from "ora";

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------

/** @param {import("./semver.js").UpdateType} type */
function typeLabel(type) {
  switch (type) {
    case "major":
      return chalk.bgRed.white.bold(` MAJOR `);
    case "minor":
      return chalk.bgYellow.black.bold(` MINOR `);
    case "patch":
      return chalk.bgGreen.black.bold(` PATCH `);
    default:
      return chalk.bgGray.white(` NONE  `);
  }
}

/** @param {string} current @param {string} latest */
function versionDiff(current, latest) {
  return `${chalk.dim(current)} ${chalk.dim("→")} ${chalk.green.bold(latest)}`;
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

/**
 * Cria um spinner Ora pré-configurado.
 * @returns {import("ora").Ora}
 */
export function createSpinner() {
  return ora({
    text: chalk.dim("Verificando dependências..."),
    color: "cyan",
  });
}

// ---------------------------------------------------------------------------
// Relatório principal
// ---------------------------------------------------------------------------

/**
 * Renderiza o relatório completo de dependências no terminal.
 *
 * @param {import("./filter.js").FilterResult} result
 * @param {{ pm: string }} meta
 */
export function renderReport(result, meta) {
  const { critical, regular, ignored, counts } = result;

  // Linha de resumo
  const parts = [
    chalk.bold(`${counts.critical + counts.regular} desatualizada(s)`),
    counts.critical > 0
      ? chalk.red(`${counts.critical} crítica(s)`)
      : chalk.green("0 críticas"),
    counts.ignored > 0 ? chalk.dim(`${counts.ignored} ignorada(s)`) : null,
    chalk.dim(`via ${meta.pm}`),
  ].filter(Boolean);

  console.log("");
  console.log("  " + parts.join(chalk.dim("  ·  ")));
  console.log("");

  // Pacotes críticos
  if (counts.critical > 0) {
    console.log(chalk.red.bold(`  ⚠ Pacotes críticos (${counts.critical})`));
    console.log("");

    for (const [name, info] of Object.entries(critical)) {
      console.log(
        `    ${chalk.red("●")} ${chalk.bold(name.padEnd(28))} ${typeLabel(
          info.type
        )}  ${versionDiff(info.current, info.latest)}`
      );
    }
    console.log("");
  }

  // Pacotes regulares
  if (counts.regular > 0) {
    console.log(chalk.cyan(`  ℹ Outros pacotes (${counts.regular})`));
    console.log("");

    for (const [name, info] of Object.entries(regular)) {
      console.log(
        `    ${chalk.dim("○")} ${chalk.dim(name.padEnd(28))} ${typeLabel(
          info.type
        )}  ${versionDiff(info.current, info.latest)}`
      );
    }
    console.log("");
  }

  // Resumo de ignorados (só linha, sem listar)
  if (counts.ignored > 0) {
    console.log(
      chalk.dim(`  ${counts.ignored} pacote(s) ignorado(s) pela configuração`)
    );
    console.log("");
  }
}

// ---------------------------------------------------------------------------
// Saída em tudo-ok
// ---------------------------------------------------------------------------

export function renderAllGood() {
  console.log("");
  console.log(chalk.green("  ✔ Todas as dependências estão atualizadas."));
  console.log("");
}

// ---------------------------------------------------------------------------
// Saída JSON (modo --json)
// ---------------------------------------------------------------------------

/**
 * @param {import("./filter.js").FilterResult} result
 * @param {{ pm: string, root: string }} meta
 */
export function renderJson(result, meta) {
  const output = {
    packageManager: meta.pm,
    root: meta.root,
    counts: result.counts,
    critical: {},
    regular: {},
    ignored: {},
  };

  for (const [name, info] of Object.entries(result.critical)) {
    output.critical[name] = info;
  }
  for (const [name, info] of Object.entries(result.regular)) {
    output.regular[name] = info;
  }
  for (const [name, info] of Object.entries(result.ignored)) {
    output.ignored[name] = info;
  }

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Prompt interativo
// ---------------------------------------------------------------------------

/**
 * Exibe o menu interativo e retorna a escolha do usuário.
 *
 * @param {import("./filter.js").FilterResult} result
 * @returns {Promise<"critical" | "all" | "ignore" | null>}
 */
export async function askUpdateChoice(result) {
  const { counts } = result;

  const options = [];

  if (counts.critical > 0) {
    options.push({
      value: "critical",
      label: `Atualizar apenas os críticos`,
      hint: `${counts.critical} pacote(s)`,
    });
  }

  if (counts.critical + counts.regular > 0) {
    options.push({
      value: "all",
      label: "Atualizar todos",
      hint: `${counts.critical + counts.regular} pacote(s)`,
    });
  }

  options.push({
    value: "ignore",
    label: "Ignorar por agora",
    hint: "Continua sem atualizar",
  });

  const choice = await clack.select({
    message: "O que deseja fazer?",
    options,
  });

  // clack.select retorna Symbol em caso de cancelamento (Ctrl+C)
  if (clack.isCancel(choice)) return null;

  return /** @type {"critical" | "all" | "ignore"} */ (choice);
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/** @param {string} message */
export function renderError(message) {
  console.error("");
  console.error(chalk.red.bold("  ✖ Erro:") + " " + chalk.red(message));
  console.error("");
}
