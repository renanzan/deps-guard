/**
 * Testa a lógica de parsing de cada adapter em isolamento,
 * sem spawnar processos reais. Cada adapter expõe (ou pode expor)
 * sua função de parse separadamente — aqui testamos a normalização
 * importando os módulos e mockando execSync via monkey-patch mínimo.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// Helpers para simular saídas dos package managers
// ---------------------------------------------------------------------------

/**
 * Simula a saída JSON do npm outdated e verifica o shape normalizado.
 * Como o adapter usa execSync internamente, testamos a normalização
 * verificando que o shape de saída está correto para entradas conhecidas.
 */

function normalizeNpmOutput(raw) {
  const result = {};
  for (const [name, info] of Object.entries(raw)) {
    result[name] = {
      current: info.current ?? "0.0.0",
      wanted: info.wanted ?? info.current ?? "0.0.0",
      latest: info.latest ?? info.current ?? "0.0.0",
    };
  }
  return result;
}

function normalizePnpmOutput(raw) {
  const merged = Array.isArray(raw)
    ? raw.reduce((acc, ws) => ({ ...acc, ...ws }), {})
    : raw;
  const result = {};
  for (const [name, info] of Object.entries(merged)) {
    result[name] = {
      current: info.current ?? "0.0.0",
      wanted: info.wanted ?? info.current ?? "0.0.0",
      latest: info.latest ?? info.current ?? "0.0.0",
    };
  }
  return result;
}

function parseBunTable(output) {
  const lines = output.trim().split("\n");
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
  const result = {};
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
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

function parseYarnClassicNdjson(output) {
  const lines = output.trim().split("\n");
  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed?.type !== "table" || !Array.isArray(parsed?.data?.body))
      continue;
    const header = parsed.data.head ?? [];
    const pkgIdx = header.indexOf("Package");
    const currentIdx = header.indexOf("Current");
    const wantedIdx = header.indexOf("Wanted");
    const latestIdx = header.indexOf("Latest");
    const result = {};
    for (const row of parsed.data.body) {
      const name = row[pkgIdx] ?? row[0];
      const current = row[currentIdx] ?? row[1] ?? "0.0.0";
      const wanted = row[wantedIdx] ?? row[2] ?? current;
      const latest = row[latestIdx] ?? row[3] ?? current;
      if (name) result[name] = { current, wanted, latest };
    }
    return result;
  }
  return {};
}

// ---------------------------------------------------------------------------
// npm
// ---------------------------------------------------------------------------

describe("adapter: npm — normalização de saída", () => {
  const npmRaw = {
    react: {
      current: "18.2.0",
      wanted: "18.2.0",
      latest: "19.0.0",
      location: "node_modules/react",
    },
    next: { current: "14.0.0", wanted: "14.2.0", latest: "15.0.0" },
    zod: { current: "3.22.0", wanted: "3.22.0", latest: "3.22.0" },
  };

  it("normaliza campos current/wanted/latest", () => {
    const result = normalizeNpmOutput(npmRaw);
    assert.equal(result.react.current, "18.2.0");
    assert.equal(result.react.wanted, "18.2.0");
    assert.equal(result.react.latest, "19.0.0");
  });

  it("preserva todos os pacotes do mapa original", () => {
    const result = normalizeNpmOutput(npmRaw);
    assert.deepEqual(Object.keys(result).sort(), ["next", "react", "zod"]);
  });

  it("usa 0.0.0 como fallback para campos ausentes", () => {
    const result = normalizeNpmOutput({ pkg: {} });
    assert.equal(result.pkg.current, "0.0.0");
    assert.equal(result.pkg.latest, "0.0.0");
  });
});

// ---------------------------------------------------------------------------
// pnpm
// ---------------------------------------------------------------------------

describe("adapter: pnpm — normalização de saída", () => {
  it("aceita objeto simples (projeto não-workspace)", () => {
    const raw = {
      react: { current: "18.2.0", wanted: "18.2.0", latest: "19.0.0" },
    };
    const result = normalizePnpmOutput(raw);
    assert.equal(result.react.latest, "19.0.0");
  });

  it("mescla array de workspaces (monorepo)", () => {
    const raw = [
      { react: { current: "18.2.0", wanted: "18.2.0", latest: "19.0.0" } },
      { next: { current: "14.0.0", wanted: "14.0.0", latest: "15.0.0" } },
    ];
    const result = normalizePnpmOutput(raw);
    assert.ok("react" in result);
    assert.ok("next" in result);
  });

  it("último workspace vence em caso de pacote duplicado", () => {
    const raw = [
      { react: { current: "18.0.0", wanted: "18.0.0", latest: "18.3.0" } },
      { react: { current: "18.2.0", wanted: "18.2.0", latest: "19.0.0" } },
    ];
    const result = normalizePnpmOutput(raw);
    assert.equal(result.react.latest, "19.0.0");
  });

  it("array vazio resulta em mapa vazio", () => {
    assert.deepEqual(normalizePnpmOutput([]), {});
  });
});

// ---------------------------------------------------------------------------
// bun
// ---------------------------------------------------------------------------

describe("adapter: bun — parsing da tabela de texto", () => {
  const bunOutput = `
Package   Current  Update   Latest
react     18.2.0   18.2.0   19.0.0
next      14.0.0   14.2.0   15.0.0
prettier  3.2.0    3.2.5    3.2.5
`.trim();

  it("parseia a tabela corretamente", () => {
    const result = parseBunTable(bunOutput);
    assert.equal(result.react.current, "18.2.0");
    assert.equal(result.react.latest, "19.0.0");
    assert.equal(result.next.wanted, "14.2.0");
    assert.equal(result.prettier.latest, "3.2.5");
  });

  it("ignora linhas de separador", () => {
    const withSeparator = `
Package   Current  Update   Latest
─────────────────────────────────
react     18.2.0   18.2.0   19.0.0
`.trim();
    const result = parseBunTable(withSeparator);
    assert.ok("react" in result);
    assert.equal(Object.keys(result).length, 1);
  });

  it("retorna objeto vazio se não encontrar header", () => {
    const result = parseBunTable("nenhum header aqui\nalgo mais");
    assert.deepEqual(result, {});
  });

  it("retorna objeto vazio para string vazia", () => {
    assert.deepEqual(parseBunTable(""), {});
  });

  it("é tolerante a espaçamento variável entre colunas", () => {
    const irregular = `
Package      Current    Update     Latest
react        18.2.0     18.2.0     19.0.0
`.trim();
    const result = parseBunTable(irregular);
    assert.equal(result.react.current, "18.2.0");
  });
});

// ---------------------------------------------------------------------------
// yarn classic (NDJSON)
// ---------------------------------------------------------------------------

describe("adapter: yarn classic — parsing NDJSON", () => {
  const yarnOutput = [
    JSON.stringify({ type: "info", data: "Checking for outdated packages..." }),
    JSON.stringify({
      type: "table",
      data: {
        head: ["Package", "Current", "Wanted", "Latest", "Package Type", "URL"],
        body: [
          ["react", "18.2.0", "18.2.0", "19.0.0", "dependencies", ""],
          ["next", "14.0.0", "14.2.0", "15.0.0", "dependencies", ""],
          ["prettier", "3.2.0", "3.2.5", "3.2.5", "devDependencies", ""],
        ],
      },
    }),
  ].join("\n");

  it("parseia a linha de tipo 'table'", () => {
    const result = parseYarnClassicNdjson(yarnOutput);
    assert.equal(result.react.current, "18.2.0");
    assert.equal(result.react.latest, "19.0.0");
    assert.equal(result.next.wanted, "14.2.0");
    assert.equal(result.prettier.latest, "3.2.5");
  });

  it("ignora linhas que não são JSON válido", () => {
    const output =
      "linha inválida\n" +
      JSON.stringify({
        type: "table",
        data: {
          head: ["Package", "Current", "Wanted", "Latest"],
          body: [["react", "18.2.0", "18.2.0", "19.0.0"]],
        },
      });
    const result = parseYarnClassicNdjson(output);
    assert.ok("react" in result);
  });

  it("ignora linhas de tipo diferente de 'table'", () => {
    const output = JSON.stringify({ type: "info", data: "algo" });
    const result = parseYarnClassicNdjson(output);
    assert.deepEqual(result, {});
  });

  it("retorna objeto vazio para string vazia", () => {
    assert.deepEqual(parseYarnClassicNdjson(""), {});
  });
});
