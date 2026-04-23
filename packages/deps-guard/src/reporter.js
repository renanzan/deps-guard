/**
 * reporter.js
 *
 * Toda a saída no terminal fica aqui — Chalk, Clack e Ora.
 * Sem lógica de negócio: apenas recebe dados, renderiza e pergunta.
 */

import * as clack from "@clack/prompts";
import chalk from "chalk";
import ora from "ora";
import { groupBySeverity } from "./audit-filter.js";

// ---------------------------------------------------------------------------
// Helpers de formatação — deps
// ---------------------------------------------------------------------------

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

function versionDiff(current, latest) {
  return `${chalk.dim(current)} ${chalk.dim("→")} ${chalk.green.bold(latest)}`;
}

// ---------------------------------------------------------------------------
// Helpers de formatação — audit
// ---------------------------------------------------------------------------

function severityLabel(severity) {
  switch (severity) {
    case "critical":
      return chalk.bgRedBright.white.bold(` CRITICAL `);
    case "high":
      return chalk.bgRed.white.bold(` HIGH     `);
    case "moderate":
      return chalk.bgYellow.black.bold(` MODERATE `);
    case "low":
      return chalk.bgBlue.white(` LOW      `);
    case "info":
      return chalk.bgGray.white(` INFO     `);
    default:
      return chalk.bgGray.white(` UNKNOWN  `);
  }
}

function severityColor(severity) {
  switch (severity) {
    case "critical":
      return chalk.redBright.bold;
    case "high":
      return chalk.red;
    case "moderate":
      return chalk.yellow;
    case "low":
      return chalk.blue;
    default:
      return chalk.dim;
  }
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

export function createSpinner() {
  return ora({ text: chalk.dim("Verificando dependências..."), color: "cyan" });
}

// ---------------------------------------------------------------------------
// Relatório principal
// ---------------------------------------------------------------------------

/**
 * @param {import("./filter.js").FilterResult} depsResult
 * @param {import("./audit-filter.js").AuditFilterResult} auditResult
 * @param {{ pm: string, auditEnabled: boolean, auditWarning: string | null }} meta
 */
export function renderReport(depsResult, auditResult, meta) {
  const { critical, regular, ignored, counts } = depsResult;

  // Linha de resumo
  const parts = [
    chalk.bold(`${counts.critical + counts.regular} desatualizada(s)`),
    counts.critical > 0
      ? chalk.red(`${counts.critical} crítica(s)`)
      : chalk.green("0 críticas"),
    meta.auditEnabled && auditResult.counts.total > 0
      ? chalk.redBright(`${auditResult.counts.total} vulnerabilidade(s)`)
      : null,
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

  if (counts.ignored > 0) {
    console.log(
      chalk.dim(`  ${counts.ignored} pacote(s) ignorado(s) pela configuração\n`)
    );
  }

  // Seção de vulnerabilidades
  if (meta.auditEnabled) {
    renderAuditSection(auditResult, meta.auditWarning);
  }
}

/**
 * @param {import("./audit-filter.js").AuditFilterResult} auditResult
 * @param {string | null} warning
 */
function renderAuditSection(auditResult, warning) {
  if (warning) {
    console.log(chalk.yellow(`  ⚠ ${warning}\n`));
  }

  if (auditResult.counts.total === 0) {
    console.log(chalk.green("  ✔ Nenhuma vulnerabilidade encontrada.\n"));
    return;
  }

  const severityOrder = ["critical", "high", "moderate", "low", "info"];
  const groups = groupBySeverity(auditResult);

  console.log(
    chalk.redBright.bold(`  🔒 Vulnerabilidades (${auditResult.counts.total})`)
  );
  console.log("");

  for (const severity of severityOrder) {
    const vulns = groups[severity] ?? [];
    if (!vulns.length) continue;

    const colorFn = severityColor(severity);

    for (const vuln of vulns) {
      const fixInfo = vuln.fixAvailable
        ? chalk.green(
            `fix disponível${vuln.fixedIn ? `: ${vuln.fixedIn}` : ""}`
          )
        : chalk.red("sem fix disponível");

      const transitiveNote = !vuln.isDirect
        ? chalk.dim(` (transitivo via ${vuln.via.join(" › ")})`)
        : "";

      console.log(
        `    ${chalk.red("●")} ${colorFn(
          vuln.packages[0].padEnd(28)
        )} ${severityLabel(severity)}`
      );
      console.log(`      ${chalk.bold(vuln.title)}${transitiveNote}`);
      console.log(
        `      ${chalk.dim(vuln.id)}  ·  ${fixInfo}  ·  ${chalk.dim(
          chalk.underline(vuln.url)
        )}`
      );
      console.log("");
    }
  }

  if (auditResult.counts.ignored > 0) {
    console.log(
      chalk.dim(
        `  ${auditResult.counts.ignored} vulnerabilidade(s) ignorada(s) pela configuração\n`
      )
    );
  }
}

// ---------------------------------------------------------------------------
// Saída em tudo-ok
// ---------------------------------------------------------------------------

/**
 * @param {boolean} auditEnabled
 * @param {import("./audit-filter.js").AuditFilterResult | null} auditResult
 */
export function renderAllGood(auditEnabled = false, auditResult = null) {
  console.log("");
  console.log(chalk.green("  ✔ Todas as dependências estão atualizadas."));
  if (auditEnabled && auditResult) {
    if (auditResult.counts.total === 0) {
      console.log(chalk.green("  ✔ Nenhuma vulnerabilidade encontrada."));
    }
    // se há vulns, o renderReport cobre — este caminho não deve ocorrer
  }
  // se audit está desabilitado, não exibe nada sobre vulnerabilidades
  console.log("");
}

// ---------------------------------------------------------------------------
// Saída JSON
// ---------------------------------------------------------------------------

export function renderJson(depsResult, auditResult, meta) {
  const output = {
    packageManager: meta.pm,
    root: meta.root,
    deps: {
      counts: depsResult.counts,
      critical: depsResult.critical,
      regular: depsResult.regular,
      ignored: depsResult.ignored,
    },
  };

  if (meta.auditEnabled) {
    output.audit = {
      counts: auditResult.counts,
      vulns: auditResult.vulns,
      ignored: auditResult.ignored,
    };
  }

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Prompt interativo
// ---------------------------------------------------------------------------

/**
 * @param {import("./filter.js").FilterResult} depsResult
 * @param {import("./audit-filter.js").AuditFilterResult} auditResult
 * @param {boolean} auditEnabled
 * @returns {Promise<"critical" | "all" | "audit-fix" | "ignore" | null>}
 */
export async function askUpdateChoice(depsResult, auditResult, auditEnabled) {
  const { counts } = depsResult;
  const options = [];

  if (counts.critical > 0) {
    options.push({
      value: "critical",
      label: "Atualizar apenas os críticos",
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

  if (auditEnabled && auditResult.counts.total > 0) {
    const fixable = Object.values(auditResult.vulns).filter(
      (v) => v.fixAvailable
    ).length;
    options.push({
      value: "audit-fix",
      label: "Corrigir vulnerabilidades",
      hint:
        fixable > 0
          ? `${fixable} com fix disponível`
          : "pode exigir intervenção manual",
    });
  }

  options.push({
    value: "ignore",
    label: "Ignorar por agora",
    hint: "Continua sem alterar nada",
  });

  const choice = await clack.select({
    message: "O que deseja fazer?",
    options,
  });

  if (clack.isCancel(choice)) return null;
  return choice;
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

export function renderError(message) {
  console.error("");
  console.error(chalk.red.bold("  ✖ Erro:") + " " + chalk.red(message));
  console.error("");
}
