/**
 * Executa `bun outdated` e normaliza para OutdatedMap.
 *
 * A saída do `bun outdated` é uma tabela em texto puro (não JSON):
 *
 *   Package   Current  Update   Latest
 *   react     18.2.0   18.2.0   19.0.0
 *   next      14.0.0   14.2.0   15.0.0
 *
 * Como não há flag `--json`, fazemos parsing da tabela linha a linha.
 */

import { execSync } from "node:child_process";

/**
 * @param {string} cwd
 * @returns {Promise<import("../filter.js").OutdatedMap>}
 */
export async function getOutdated(cwd) {
  let stdout = "";

  try {
    stdout = execSync("bun outdated", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    stdout = err.stdout?.toString() ?? "";
    if (!stdout.trim()) {
      const message = err.stderr?.toString().trim();
      throw new Error(`bun outdated falhou: ${message || err.message}`);
    }
  }

  if (!stdout.trim()) return {};

  return parseTable(stdout);
}

/**
 * Faz parsing da saída em tabela do `bun outdated`.
 * É tolerante a variações de espaçamento e separadores.
 *
 * @param {string} output
 * @returns {import("../filter.js").OutdatedMap}
 */
function parseTable(output) {
  const lines = output.trim().split("\n");

  // Encontra a linha de header (contém "Package" e "Current")
  const headerIndex = lines.findIndex(
    (l) =>
      l.toLowerCase().includes("package") && l.toLowerCase().includes("current")
  );

  if (headerIndex === -1) return {};

  const header = lines[headerIndex].trim().toLowerCase().split(/\s+/);
  const pkgIdx = header.indexOf("package");
  const currentIdx = header.indexOf("current");
  const wantedIdx = header.findIndex((h) => h === "update" || h === "wanted");
  const latestIdx = header.indexOf("latest");

  if (pkgIdx === -1 || currentIdx === -1 || latestIdx === -1) return {};

  /** @type {import("../filter.js").OutdatedMap} */
  const result = {};

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();

    // Pula linhas de separador (─, ━, -, etc.) e linhas vazias
    if (!line || /^[─━╌\-─+|]+$/.test(line)) continue;

    const cols = line.split(/\s+/);
    if (cols.length < 3) continue;

    const name = cols[pkgIdx];
    const current = cols[currentIdx] ?? "0.0.0";
    const wanted = wantedIdx !== -1 ? cols[wantedIdx] ?? current : current;
    const latest = cols[latestIdx] ?? current;

    if (name && !name.startsWith("-")) {
      result[name] = { current, wanted, latest };
    }
  }

  return result;
}
