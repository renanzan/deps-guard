import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterPackages, resolveExitCode } from "../src/filter.js";

const baseConfig = {
  critical: [],
  ignore: [],
  updateType: "patch",
};

const outdatedMap = {
  react: { current: "18.2.0", wanted: "18.2.0", latest: "19.0.0" }, // major
  typescript: { current: "5.0.0", wanted: "5.0.0", latest: "5.4.0" }, // minor
  prettier: { current: "3.2.0", wanted: "3.2.0", latest: "3.2.5" }, // patch
  zod: { current: "3.22.0", wanted: "3.22.0", latest: "3.22.0" }, // none (igual)
};

describe("filterPackages — classificação básica", () => {
  it("coloca pacotes críticos na bucket critical", () => {
    const result = filterPackages(outdatedMap, {
      ...baseConfig,
      critical: ["react"],
    });
    assert.ok("react" in result.critical);
    assert.equal(result.critical.react.type, "major");
  });

  it("coloca pacotes ignorados na bucket ignored", () => {
    const result = filterPackages(outdatedMap, {
      ...baseConfig,
      ignore: ["prettier"],
    });
    assert.ok("prettier" in result.ignored);
  });

  it("pacotes sem regra ficam em regular", () => {
    const result = filterPackages(outdatedMap, baseConfig);
    assert.ok("react" in result.regular);
    assert.ok("typescript" in result.regular);
    assert.ok("prettier" in result.regular);
  });

  it("pacotes sem atualização real não aparecem em nenhuma bucket", () => {
    const result = filterPackages(outdatedMap, baseConfig);
    assert.ok(!("zod" in result.critical));
    assert.ok(!("zod" in result.regular));
    assert.ok(!("zod" in result.ignored));
  });

  it("ignore tem prioridade sobre critical", () => {
    const result = filterPackages(outdatedMap, {
      ...baseConfig,
      critical: ["react"],
      ignore: ["react"],
    });
    assert.ok(!("react" in result.critical));
    assert.ok("react" in result.ignored);
  });
});

describe("filterPackages — threshold de updateType", () => {
  it("threshold minor filtra patches para ignored", () => {
    const result = filterPackages(outdatedMap, {
      ...baseConfig,
      updateType: "minor",
    });
    assert.ok(!("prettier" in result.regular));
    assert.ok("prettier" in result.ignored);
    assert.ok("typescript" in result.regular);
    assert.ok("react" in result.regular);
  });

  it("threshold major filtra minor e patch para ignored", () => {
    const result = filterPackages(outdatedMap, {
      ...baseConfig,
      updateType: "major",
    });
    assert.ok(!("typescript" in result.regular));
    assert.ok(!("prettier" in result.regular));
    assert.ok("react" in result.regular);
  });

  it("threshold patch deixa tudo passar", () => {
    const result = filterPackages(outdatedMap, {
      ...baseConfig,
      updateType: "patch",
    });
    assert.equal(result.counts.regular, 3);
  });
});

describe("filterPackages — counts", () => {
  it("conta corretamente com config mista", () => {
    const result = filterPackages(outdatedMap, {
      critical: ["react"],
      ignore: ["prettier"],
      updateType: "patch",
    });
    assert.equal(result.counts.critical, 1); // react
    assert.equal(result.counts.regular, 1); // typescript
    assert.equal(result.counts.ignored, 1); // prettier (zod é equal, não conta)
    assert.equal(result.counts.total, 3);
  });

  it("anota o tipo de atualização em cada pacote", () => {
    const result = filterPackages(outdatedMap, baseConfig);
    assert.equal(result.regular.react.type, "major");
    assert.equal(result.regular.typescript.type, "minor");
    assert.equal(result.regular.prettier.type, "patch");
  });
});

describe("resolveExitCode", () => {
  const makeResult = (critical, regular, ignored) => ({
    critical: Object.fromEntries(critical.map((n) => [n, {}])),
    regular: Object.fromEntries(regular.map((n) => [n, {}])),
    ignored: Object.fromEntries(ignored.map((n) => [n, {}])),
    counts: {
      critical: critical.length,
      regular: regular.length,
      ignored: ignored.length,
      total: critical.length + regular.length + ignored.length,
    },
  });

  it("failOn=critical retorna 1 quando há críticos", () => {
    const result = makeResult(["react"], [], []);
    assert.equal(resolveExitCode(result, "critical"), 1);
  });

  it("failOn=critical retorna 0 quando só há regular", () => {
    const result = makeResult([], ["prettier"], []);
    assert.equal(resolveExitCode(result, "critical"), 0);
  });

  it("failOn=any retorna 1 quando há regular", () => {
    const result = makeResult([], ["prettier"], []);
    assert.equal(resolveExitCode(result, "any"), 1);
  });

  it("failOn=any retorna 0 quando só há ignored", () => {
    const result = makeResult([], [], ["zod"]);
    assert.equal(resolveExitCode(result, "any"), 0);
  });

  it("failOn=never sempre retorna 0", () => {
    const result = makeResult(["react"], ["prettier"], []);
    assert.equal(resolveExitCode(result, "never"), 0);
  });
});
