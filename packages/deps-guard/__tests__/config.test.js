/**
 * Testa a resolução de configuração: defaults, arquivo e argv.
 */

import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { resolveConfig } from "../src/config.js";

// Diretório temporário para simular projetos
const TMP = join(tmpdir(), "deps-guard-test-" + process.pid);

before(() => mkdirSync(TMP, { recursive: true }));
after(() => rmSync(TMP, { recursive: true, force: true }));

function writeConfig(dir, content) {
  writeFileSync(join(dir, "deps.guard.json"), JSON.stringify(content));
}

describe("resolveConfig — defaults", () => {
  it("retorna todos os defaults quando não há arquivo nem argv", () => {
    const config = resolveConfig({}, TMP);
    assert.deepEqual(config.critical, []);
    assert.deepEqual(config.ignore, []);
    assert.equal(config.failOn, "critical");
    assert.equal(config.updateType, "patch");
    assert.equal(config.ci, false);
    assert.equal(config.json, false);
    assert.equal(config.noUpdate, false);
  });
});

describe("resolveConfig — arquivo deps.guard.json", () => {
  it("lê critical e ignore do arquivo", () => {
    const dir = join(TMP, "file-test");
    mkdirSync(dir, { recursive: true });
    writeConfig(dir, { critical: ["react", "next"], ignore: ["zod"] });

    const config = resolveConfig({}, dir);
    assert.deepEqual(config.critical, ["react", "next"]);
    assert.deepEqual(config.ignore, ["zod"]);
  });

  it("lê failOn e updateType do arquivo", () => {
    const dir = join(TMP, "file-test-2");
    mkdirSync(dir, { recursive: true });
    writeConfig(dir, { failOn: "any", updateType: "minor" });

    const config = resolveConfig({}, dir);
    assert.equal(config.failOn, "any");
    assert.equal(config.updateType, "minor");
  });

  it("ignora valores inválidos no arquivo e mantém defaults", () => {
    const dir = join(TMP, "file-invalid");
    mkdirSync(dir, { recursive: true });
    writeConfig(dir, { failOn: "invalid-value", updateType: "mega" });

    const config = resolveConfig({}, dir);
    assert.equal(config.failOn, "critical"); // default
    assert.equal(config.updateType, "patch"); // default
  });

  it("sobe a árvore de diretórios para encontrar o arquivo", () => {
    const parentDir = join(TMP, "monorepo-root");
    const childDir = join(parentDir, "packages", "app");
    mkdirSync(childDir, { recursive: true });
    writeConfig(parentDir, { critical: ["react"] });

    // Resolve a partir do diretório filho — deve encontrar o arquivo no pai
    const config = resolveConfig({}, childDir);
    assert.deepEqual(config.critical, ["react"]);
  });
});

describe("resolveConfig — argv tem prioridade", () => {
  it("argv sobrescreve critical do arquivo", () => {
    const dir = join(TMP, "argv-override");
    mkdirSync(dir, { recursive: true });
    writeConfig(dir, { critical: ["react"] });

    const config = resolveConfig({ critical: "next,typescript" }, dir);
    assert.deepEqual(config.critical, ["next", "typescript"]);
  });

  it("argv sobrescreve failOn do arquivo", () => {
    const dir = join(TMP, "argv-failon");
    mkdirSync(dir, { recursive: true });
    writeConfig(dir, { failOn: "any" });

    const config = resolveConfig({ failOn: "never" }, dir);
    assert.equal(config.failOn, "never");
  });

  it("parsePackageList lida com espaços extras", () => {
    const config = resolveConfig(
      { critical: " react , next , typescript " },
      TMP
    );
    assert.deepEqual(config.critical, ["react", "next", "typescript"]);
  });

  it("parsePackageList ignora entradas vazias (vírgulas duplas)", () => {
    const config = resolveConfig({ critical: "react,,next" }, TMP);
    assert.deepEqual(config.critical, ["react", "next"]);
  });
});

describe("resolveConfig — modo CI", () => {
  it("--ci força noUpdate = true", () => {
    const config = resolveConfig({ ci: true }, TMP);
    assert.equal(config.ci, true);
    assert.equal(config.noUpdate, true);
  });

  it("env CI=true ativa modo ci", () => {
    const original = process.env.CI;
    process.env.CI = "true";
    const config = resolveConfig({}, TMP);
    assert.equal(config.ci, true);
    process.env.CI = original;
  });

  it("env CI=1 também ativa modo ci", () => {
    const original = process.env.CI;
    process.env.CI = "1";
    const config = resolveConfig({}, TMP);
    assert.equal(config.ci, true);
    process.env.CI = original;
  });
});
