import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getUpdateType,
  isOutdated,
  meetsThreshold,
  parseVersion,
} from "../src/semver.js";

describe("parseVersion", () => {
  it("parseia versão simples", () => {
    assert.deepEqual(parseVersion("1.2.3"), [1, 2, 3]);
  });

  it("remove prefixo de range ^", () => {
    assert.deepEqual(parseVersion("^2.0.0"), [2, 0, 0]);
  });

  it("remove prefixo de range ~", () => {
    assert.deepEqual(parseVersion("~1.4.2"), [1, 4, 2]);
  });

  it("remove prefixo >=", () => {
    assert.deepEqual(parseVersion(">=3.1.0"), [3, 1, 0]);
  });

  it("ignora sufixo de pré-release", () => {
    assert.deepEqual(parseVersion("2.0.0-alpha.1"), [2, 0, 0]);
  });

  it("ignora sufixo de build metadata", () => {
    assert.deepEqual(parseVersion("1.0.0+build.123"), [1, 0, 0]);
  });

  it("retorna [0,0,0] para string vazia", () => {
    assert.deepEqual(parseVersion(""), [0, 0, 0]);
  });

  it("retorna [0,0,0] para valor nulo", () => {
    assert.deepEqual(parseVersion(null), [0, 0, 0]);
  });

  it("completa partes ausentes com zero", () => {
    assert.deepEqual(parseVersion("3.1"), [3, 1, 0]);
  });
});

describe("getUpdateType", () => {
  it("detecta bump major", () => {
    assert.equal(getUpdateType("1.0.0", "2.0.0"), "major");
  });

  it("detecta bump minor", () => {
    assert.equal(getUpdateType("1.0.0", "1.1.0"), "minor");
  });

  it("detecta bump patch", () => {
    assert.equal(getUpdateType("1.0.0", "1.0.1"), "patch");
  });

  it("retorna none quando versões são iguais", () => {
    assert.equal(getUpdateType("1.2.3", "1.2.3"), "none");
  });

  it("retorna none quando current é mais novo (downgrade)", () => {
    assert.equal(getUpdateType("2.0.0", "1.0.0"), "none");
  });

  it("major tem prioridade sobre minor e patch", () => {
    assert.equal(getUpdateType("1.0.0", "2.5.9"), "major");
  });

  it("funciona com prefixos de range no current", () => {
    assert.equal(getUpdateType("^1.0.0", "1.1.0"), "minor");
  });
});

describe("isOutdated", () => {
  it("retorna true quando há atualização disponível", () => {
    assert.equal(isOutdated("1.0.0", "1.0.1"), true);
  });

  it("retorna false quando versões são iguais", () => {
    assert.equal(isOutdated("2.0.0", "2.0.0"), false);
  });

  it("retorna false em downgrade", () => {
    assert.equal(isOutdated("3.0.0", "2.0.0"), false);
  });
});

describe("meetsThreshold", () => {
  it("major atinge todos os thresholds", () => {
    assert.equal(meetsThreshold("major", "major"), true);
    assert.equal(meetsThreshold("major", "minor"), true);
    assert.equal(meetsThreshold("major", "patch"), true);
  });

  it("minor atinge minor e patch mas não major", () => {
    assert.equal(meetsThreshold("minor", "major"), false);
    assert.equal(meetsThreshold("minor", "minor"), true);
    assert.equal(meetsThreshold("minor", "patch"), true);
  });

  it("patch só atinge threshold patch", () => {
    assert.equal(meetsThreshold("patch", "major"), false);
    assert.equal(meetsThreshold("patch", "minor"), false);
    assert.equal(meetsThreshold("patch", "patch"), true);
  });

  it("none nunca atinge nenhum threshold", () => {
    assert.equal(meetsThreshold("none", "patch"), false);
  });
});
