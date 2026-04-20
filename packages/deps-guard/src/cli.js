/**
 * cli.js
 *
 * Define o contrato da CLI usando Commander.
 * Faz parse de argv, resolve a configuração final e chama o orchestrator.
 */

import { Command } from "commander";
import { createRequire } from "node:module";
import { resolveConfig } from "./config.js";
import { run } from "./orchestrator.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

export async function main() {
  const program = new Command();

  program
    .name("deps-guard")
    .description(
      "Bloqueie dependências desatualizadas antes que elas rodem no seu projeto."
    )
    .version(pkg.version, "-v, --version")
    // Pacotes críticos — disparam exit code 1 quando desatualizados
    .option(
      "-c, --critical <packages>",
      "Pacotes críticos separados por vírgula (ex: react,next,typescript)"
    )
    // Pacotes a ignorar completamente
    .option(
      "-i, --ignore <packages>",
      "Pacotes a ignorar separados por vírgula (ex: zod,eslint)"
    )
    // Política de falha
    .option(
      "--fail-on <level>",
      'Quando sair com código 1: "critical" (padrão), "any" ou "never"',
      "critical"
    )
    // Tipo mínimo de atualização a reportar
    .option(
      "--update-type <type>",
      'Tipo mínimo a reportar: "major", "minor" ou "patch" (padrão)',
      "patch"
    )
    // Modo não-interativo
    .option(
      "--ci",
      "Modo CI: sem prompts, apenas reportar e sair (detectado via env CI)"
    )
    // Saída em JSON
    .option("--json", "Imprime o relatório como JSON no stdout")
    // Pular o prompt de update
    .option("--no-update", "Não oferece atualizar, apenas reporta")
    .addHelpText(
      "after",
      `
Exemplos:
  $ deps-guard
  $ deps-guard --critical react,next --ignore zod
  $ deps-guard --fail-on any --update-type minor
  $ deps-guard --ci --json

Arquivo de configuração:
  Crie deps.guard.json na raiz do projeto para persistir as opções.
  Flags de CLI têm prioridade sobre o arquivo.

  {
    "critical": ["react", "react-dom", "next"],
    "ignore": ["zod"],
    "failOn": "critical",
    "updateType": "patch"
  }
`
    );

  program.parse(process.argv);

  const argv = program.opts();
  const config = resolveConfig(argv, process.cwd());

  await run(config, process.cwd());
}
