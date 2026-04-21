/**
 * Testa a detecção de package manager pelo lock file.
 */

import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { detectPackageManager } from "../src/checker.js";

const TMP = join(tmpdir(), "deps-guard-checker-" + process.pid);

before(() => mkdirSync(TMP, { recursive: true }));
after(() => rmSync(TMP, { recursive: true, force: true }));

/**
 * Cria um diretório de projeto isolado dentro do TMP do sistema.
 * Todos os projetos recebem package.json por padrão, já que a detecção
 * usa a presença de package.json como limite de subida da árvore.
 */
function makeProject(name, lockFile) {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  // Todo projeto Node.js tem package.json — é o que sinaliza "ainda estou
  // dentro de um projeto" para a lógica de detecção
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name }));
  if (lockFile) writeFileSync(join(dir, lockFile), "");
  return dir;
}

describe("detectPackageManager", () => {
  it("detecta bun pelo bun.lockb", () => {
    const dir = makeProject("bun-proj", "bun.lockb");
    const { pm } = detectPackageManager(dir);
    assert.equal(pm, "bun");
  });

  it("detecta pnpm pelo pnpm-lock.yaml", () => {
    const dir = makeProject("pnpm-proj", "pnpm-lock.yaml");
    const { pm } = detectPackageManager(dir);
    assert.equal(pm, "pnpm");
  });

  it("detecta yarn pelo yarn.lock", () => {
    const dir = makeProject("yarn-proj", "yarn.lock");
    const { pm } = detectPackageManager(dir);
    assert.equal(pm, "yarn");
  });

  it("detecta npm pelo package-lock.json", () => {
    const dir = makeProject("npm-proj", "package-lock.json");
    const { pm } = detectPackageManager(dir);
    assert.equal(pm, "npm");
  });

  it("faz fallback para npm quando não encontra lock file", () => {
    // Tem package.json mas sem lock file — a subida para ao sair do TMP
    // (o TMP não tem package.json, então a detecção não vaza para o workspace)
    const dir = makeProject("no-lock", null);
    const { pm, root } = detectPackageManager(dir);
    assert.equal(pm, "npm");
    assert.equal(root, dir); // root deve ser o próprio diretório informado
  });

  it("retorna o root correto (diretório onde está o lock file)", () => {
    const dir = makeProject("root-check", "pnpm-lock.yaml");
    const { root } = detectPackageManager(dir);
    assert.equal(root, dir);
  });

  it("bun tem prioridade sobre pnpm quando ambos existem", () => {
    const dir = makeProject("bun-pnpm", null);
    writeFileSync(join(dir, "bun.lockb"), "");
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    const { pm } = detectPackageManager(dir);
    assert.equal(pm, "bun");
  });

  it("pnpm tem prioridade sobre yarn quando ambos existem", () => {
    const dir = makeProject("pnpm-yarn", null);
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    writeFileSync(join(dir, "yarn.lock"), "");
    const { pm } = detectPackageManager(dir);
    assert.equal(pm, "pnpm");
  });

  it("sobe a árvore e encontra o lock file no diretório pai (monorepo)", () => {
    // Estrutura: monorepo-root/ (package.json + pnpm-lock.yaml)
    //              packages/web/ (package.json, sem lock file)
    const parentDir = join(TMP, "monorepo");
    const childDir = join(parentDir, "packages", "web");
    mkdirSync(childDir, { recursive: true });
    writeFileSync(
      join(parentDir, "package.json"),
      JSON.stringify({ name: "monorepo" })
    );
    writeFileSync(join(parentDir, "pnpm-lock.yaml"), "");
    writeFileSync(
      join(childDir, "package.json"),
      JSON.stringify({ name: "web" })
    );

    const { pm, root } = detectPackageManager(childDir);
    assert.equal(pm, "pnpm");
    assert.equal(root, parentDir);
  });

  it("não vaza para fora do workspace quando rodando em monorepo externo", () => {
    // Simula um subdiretório sem lock file cujo pai também não tem package.json
    // (ou seja, o pai não é parte de nenhum projeto Node)
    const isolatedDir = join(TMP, "isolated-pkg");
    mkdirSync(isolatedDir, { recursive: true });
    writeFileSync(
      join(isolatedDir, "package.json"),
      JSON.stringify({ name: "isolated" })
    );
    // Não cria lock file — e o TMP pai não tem package.json

    const { pm, root } = detectPackageManager(isolatedDir);
    assert.equal(pm, "npm"); // fallback
    assert.equal(root, isolatedDir); // não subiu além do projeto
  });
});
