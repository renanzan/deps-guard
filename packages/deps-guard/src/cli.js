/**
 * cli.js
 *
 * Define o contrato da CLI usando Commander.
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
    .option(
      "-c, --critical <packages>",
      "Pacotes críticos separados por vírgula (ex: react,next,typescript)"
    )
    .option(
      "-i, --ignore <packages>",
      "Pacotes a ignorar separados por vírgula (ex: zod,eslint)"
    )
    .option(
      "--fail-on <level>",
      'Quando sair com código 1: "critical" (padrão), "any" ou "never"',
      "critical"
    )
    .option(
      "--update-type <type>",
      'Tipo mínimo a reportar: "major", "minor" ou "patch" (padrão)',
      "patch"
    )
    .option(
      "--audit",
      "Ativa verificação de vulnerabilidades (CVEs/GHSA) via audit do package manager"
    )
    .option(
      "--audit-level <level>",
      'Severidade mínima a reportar: "info", "low", "moderate", "high" (padrão) ou "critical"',
      "high"
    )
    .option(
      "--ignore-advisories <ids>",
      "IDs de advisories a ignorar, separados por vírgula (ex: GHSA-xxxx-yyyy-zzzz,CVE-2023-1234)"
    )
    .option(
      "--audit-fail-on <level>",
      'Quando sair com código 1 por vulnerabilidades: "critical" (padrão), "high", "moderate", "low", "info" ou "never"',
      "critical"
    )
    .option(
      "--ci",
      "Modo CI: sem prompts, apenas reportar e sair (detectado via env CI)"
    )
    .option("--json", "Imprime o relatório como JSON no stdout")
    .option("--no-update", "Não oferece atualizar, apenas reporta")
    .addHelpText(
      "after",
      `
Exemplos:
  $ deps-guard
  $ deps-guard --critical react,next --ignore zod
  $ deps-guard --audit --audit-level high --audit-fail-on critical
  $ deps-guard --audit --ignore-advisories GHSA-xxxx-yyyy-zzzz
  $ deps-guard --ci --json

Arquivo de configuração (deps.guard.json):
  {
    "critical": ["react", "react-dom", "next"],
    "ignore": ["zod"],
    "failOn": "critical",
    "updateType": "patch",
    "audit": true,
    "auditLevel": "high",
    "ignoreAdvisories": ["GHSA-xxxx-yyyy-zzzz"],
    "auditFailOn": "critical"
  }
`
    );

  program.parse(process.argv);

  const argv = program.opts();
  const config = resolveConfig(argv, process.cwd());

  await run(config, process.cwd());
}
