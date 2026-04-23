/**
 * adapters/bun.audit.js
 *
 * Executa `bun audit` e normaliza para AuditMap.
 *
 * Bun ainda não tem flag `--json` para o audit (como de abril/2025).
 * A saída é texto puro com uma tabela no mesmo estilo do `bun outdated`.
 * O parser é best-effort: extrai o máximo possível e emite um aviso
 * se não conseguir identificar a estrutura esperada.
 *
 * Formato típico esperado:
 *
 *   lodash
 *     Severity: high
 *     Title: Prototype Pollution
 *     URL: https://github.com/advisories/GHSA-jf85-cpcp-j695
 *     Vulnerable: <4.17.21
 *     Fix: 4.17.21
 *
 * Como o formato não é estável, capturamos o máximo possível
 * e documentamos claramente as limitações.
 */

import { execSync } from "node:child_process";

/**
 * @param {string} cwd
 * @returns {Promise<import("../audit-filter.js").AuditMap>}
 */
export async function getAudit(cwd) {
  let stdout = "";

  try {
    stdout = execSync("bun audit", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    stdout = err.stdout?.toString() ?? "";
    if (!stdout.trim()) {
      const message = err.stderr?.toString().trim();
      throw new Error(`bun audit falhou: ${message || err.message}`);
    }
  }

  if (!stdout.trim()) return {};

  return parseBunAuditText(stdout);
}

/**
 * Parser best-effort da saída texto do `bun audit`.
 * Exportado para testes isolados.
 *
 * @param {string} output
 * @returns {import("../audit-filter.js").AuditMap}
 */
export function parseBunAuditText(output) {
  /** @type {import("../audit-filter.js").AuditMap} */
  const result = {};

  // Divide por blocos de advisory (separados por linha em branco ou por nome de pacote sem indentação)
  const lines = output.split("\n");
  let current = null;
  let counter = 0;

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Linha de severidade indica início de um bloco de advisory
    const severityMatch = line.match(/^\s+Severity:\s*(.+)/i);
    if (severityMatch && current) {
      current.severity = normalizeSeverity(
        severityMatch[1].trim().toLowerCase()
      );
      continue;
    }

    const titleMatch = line.match(/^\s+Title:\s*(.+)/i);
    if (titleMatch && current) {
      current.title = titleMatch[1].trim();
      continue;
    }

    const urlMatch = line.match(/^\s+(?:URL|Advisory):\s*(https?:\/\/.+)/i);
    if (urlMatch && current) {
      current.url = urlMatch[1].trim();
      const ghsa = current.url.match(/GHSA-[a-z0-9-]+/i);
      if (ghsa) current.id = ghsa[0].toUpperCase();
      continue;
    }

    const fixMatch = line.match(/^\s+Fix:\s*(.+)/i);
    if (fixMatch && current) {
      const fix = fixMatch[1].trim();
      current.fixAvailable = fix !== "No fix available" && fix !== "-";
      current.fixedIn = current.fixAvailable ? fix : null;
      continue;
    }

    // Linha sem indentação com texto = nome do pacote (início de novo advisory)
    if (
      line &&
      !line.startsWith(" ") &&
      !line.startsWith("\t") &&
      !/^[─━═\-+|]+$/.test(line)
    ) {
      // Salva o advisory anterior se existir
      if (current && current.title) {
        const id = current.id ?? `bun-${counter++}`;
        result[id] = { ...current, id };
      }

      current = {
        id: null,
        severity: "moderate",
        title: `Vulnerabilidade em ${line.trim()}`,
        url: "",
        packages: [line.trim()],
        via: [line.trim()],
        fixAvailable: false,
        fixedIn: null,
        isDirect: true,
      };
    }
  }

  // Salva o último advisory
  if (current && current.title) {
    const id = current.id ?? `bun-${counter}`;
    result[id] = { ...current, id };
  }

  return result;
}

/** @param {string | undefined} s */
function normalizeSeverity(s) {
  const valid = new Set(["info", "low", "moderate", "high", "critical"]);
  return valid.has(s) ? s : "moderate";
}
