/**
 * test/audit-adapters.test.js
 *
 * Testa o parsing/normalização de cada adapter de audit em isolamento,
 * sem spawnar processos reais.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBunAuditText } from "../src/adapters/bun.audit.js";
import { normalizeNpmAudit } from "../src/adapters/npm.audit.js";
import { normalizeYarnClassicAudit } from "../src/adapters/yarn.audit.js";

// ---------------------------------------------------------------------------
// npm / pnpm (mesmo normalizador)
// ---------------------------------------------------------------------------

describe("adapter: npm audit — normalizeNpmAudit", () => {
  // Fixture com um pacote com UM advisory
  const singleAdvisoryRaw = {
    vulnerabilities: {
      axios: {
        name: "axios",
        severity: "moderate",
        isDirect: true,
        via: [
          {
            source: 2345,
            name: "axios",
            title: "Server-Side Request Forgery",
            url: "https://github.com/advisories/GHSA-wf5p-g6vw-992j",
            severity: "moderate",
          },
        ],
        effects: [],
        range: "<1.6.0",
        fixAvailable: true,
      },
    },
  };

  // Fixture com um pacote com MÚLTIPLOS advisories (caso real: lodash)
  const multiAdvisoryRaw = {
    vulnerabilities: {
      lodash: {
        name: "lodash",
        severity: "critical",
        isDirect: true,
        via: [
          {
            source: 1001,
            name: "lodash",
            title: "Prototype Pollution",
            url: "https://github.com/advisories/GHSA-jf85-cpcp-j695",
            severity: "critical",
            range: "<4.17.12",
          },
          {
            source: 1002,
            name: "lodash",
            title: "Command Injection",
            url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
            severity: "high",
            range: "<4.17.21",
          },
          {
            source: 1003,
            name: "lodash",
            title: "ReDoS",
            url: "https://github.com/advisories/GHSA-29mw-wpgm-hmr9",
            severity: "moderate",
            range: ">=4.0.0 <4.17.21",
          },
        ],
        effects: [],
        range: "<4.17.21",
        fixAvailable: {
          name: "lodash",
          version: "4.17.21",
          isSemVerMajor: false,
        },
      },
    },
  };

  // Fixture com mesmo advisory afetando dois pacotes (foo e bar usam baz vulnerável)
  const sharedAdvisoryRaw = {
    vulnerabilities: {
      foo: {
        name: "foo",
        severity: "high",
        isDirect: true,
        via: [
          {
            source: 9999,
            name: "foo",
            title: "Vuln in foo",
            url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
            severity: "high",
          },
        ],
        effects: [],
        range: "*",
        fixAvailable: false,
      },
      bar: {
        name: "bar",
        severity: "high",
        isDirect: false,
        via: [
          {
            source: 9999, // mesmo source ID
            name: "bar",
            title: "Vuln in foo", // mesmo advisory
            url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
            severity: "high",
          },
        ],
        effects: [],
        range: "*",
        fixAvailable: false,
      },
    },
  };

  it("cria 1 entrada por advisory, não por pacote", () => {
    const result = normalizeNpmAudit(multiAdvisoryRaw);
    // lodash tem 3 advisories → 3 entradas
    assert.equal(Object.keys(result).length, 3);
  });

  it("extrai GHSA ID da URL de cada advisory", () => {
    const result = normalizeNpmAudit(multiAdvisoryRaw);
    assert.ok("GHSA-JF85-CPCP-J695" in result);
    assert.ok("GHSA-35JH-R3H4-6JHM" in result);
    assert.ok("GHSA-29MW-WPGM-HMR9" in result);
  });

  it("usa severity do advisory individual, não a agregada do pacote", () => {
    const result = normalizeNpmAudit(multiAdvisoryRaw);
    assert.equal(result["GHSA-JF85-CPCP-J695"].severity, "critical");
    assert.equal(result["GHSA-35JH-R3H4-6JHM"].severity, "high");
    assert.equal(result["GHSA-29MW-WPGM-HMR9"].severity, "moderate");
  });

  it("não duplica entrada quando mesmo advisory aparece em dois pacotes", () => {
    const result = normalizeNpmAudit(sharedAdvisoryRaw);
    assert.equal(Object.keys(result).length, 1);
    // Ambos os pacotes devem estar na lista
    assert.ok(result["GHSA-AAAA-BBBB-CCCC"].packages.includes("foo"));
    assert.ok(result["GHSA-AAAA-BBBB-CCCC"].packages.includes("bar"));
  });

  it("extrai título e URL corretamente", () => {
    const result = normalizeNpmAudit(singleAdvisoryRaw);
    const entry = result["GHSA-WF5P-G6VW-992J"];
    assert.equal(entry.title, "Server-Side Request Forgery");
    assert.ok(entry.url.includes("GHSA-wf5p-g6vw-992j"));
  });

  it("fixAvailable como objeto → true + extrai versão", () => {
    const result = normalizeNpmAudit(multiAdvisoryRaw);
    // Todos os advisories do lodash herdam o fixAvailable do pacote
    assert.equal(result["GHSA-JF85-CPCP-J695"].fixAvailable, true);
    assert.equal(result["GHSA-JF85-CPCP-J695"].fixedIn, "4.17.21");
  });

  it("fixAvailable=true sem versão → fixedIn null", () => {
    const result = normalizeNpmAudit(singleAdvisoryRaw);
    assert.equal(result["GHSA-WF5P-G6VW-992J"].fixAvailable, true);
    assert.equal(result["GHSA-WF5P-G6VW-992J"].fixedIn, null);
  });

  it("fixAvailable=false → fixedIn null", () => {
    const result = normalizeNpmAudit(sharedAdvisoryRaw);
    assert.equal(result["GHSA-AAAA-BBBB-CCCC"].fixAvailable, false);
    assert.equal(result["GHSA-AAAA-BBBB-CCCC"].fixedIn, null);
  });

  it("vulnerabilidade transitiva (via = string) gera entrada genérica", () => {
    const raw = {
      vulnerabilities: {
        express: {
          name: "express",
          severity: "moderate",
          isDirect: true,
          via: ["qs"], // transitivo: depende de qs que é vulnerável
          effects: [],
          range: ">=4.0.0 <4.17.3",
          fixAvailable: true,
        },
      },
    };
    const result = normalizeNpmAudit(raw);
    assert.equal(Object.keys(result).length, 1);
    const entry = Object.values(result)[0];
    assert.equal(entry.isDirect, false);
    assert.deepEqual(entry.via, ["qs"]);
  });

  it("retorna objeto vazio para entrada sem vulnerabilities", () => {
    assert.deepEqual(normalizeNpmAudit({}), {});
    assert.deepEqual(normalizeNpmAudit({ vulnerabilities: {} }), {});
  });

  it("severity desconhecida cai para moderate", () => {
    const raw = {
      vulnerabilities: {
        pkg: {
          name: "pkg",
          severity: "unknown",
          isDirect: true,
          via: [
            {
              source: 1,
              title: "Test",
              url: "https://github.com/advisories/GHSA-test-0000-0000",
              severity: "unknown-level",
            },
          ],
          effects: [],
          range: "*",
          fixAvailable: false,
        },
      },
    };
    const result = normalizeNpmAudit(raw);
    const vuln = Object.values(result)[0];
    assert.equal(vuln.severity, "moderate");
  });

  it("reproduz contagem real: 17 advisories para 4 pacotes vulneráveis", () => {
    // Fixture baseada nos dados reais observados com lodash@4.17.11, axios@1.7.3, etc.
    const raw = {
      vulnerabilities: {
        axios: {
          severity: "high",
          isDirect: true,
          via: [
            {
              source: 1,
              title: "SSRF in axios",
              url: "https://github.com/advisories/GHSA-8hc4-vh64-cxmj",
              severity: "high",
            },
            {
              source: 2,
              title: "SSRF via URL",
              url: "https://github.com/advisories/GHSA-jr5f-v2jv-69x6",
              severity: "high",
            },
            {
              source: 3,
              title: "DoS size check",
              url: "https://github.com/advisories/GHSA-4hjh-wcwx-xvwj",
              severity: "high",
            },
            {
              source: 4,
              title: "DoS __proto__",
              url: "https://github.com/advisories/GHSA-43fc-jf86-j433",
              severity: "high",
            },
            {
              source: 5,
              title: "NO_PROXY bypass",
              url: "https://github.com/advisories/GHSA-3p68-rc4w-qgx5",
              severity: "moderate",
            },
            {
              source: 6,
              title: "Metadata exfil",
              url: "https://github.com/advisories/GHSA-fvcv-3m26-pcqx",
              severity: "moderate",
            },
          ],
          fixAvailable: true,
        },
        lodash: {
          severity: "critical",
          isDirect: true,
          via: [
            {
              source: 7,
              title: "Prototype Pollution",
              url: "https://github.com/advisories/GHSA-jf85-cpcp-j695",
              severity: "critical",
            },
            {
              source: 8,
              title: "Command Injection",
              url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
              severity: "high",
            },
            {
              source: 9,
              title: "Prototype Pollution",
              url: "https://github.com/advisories/GHSA-p6mc-m468-83gw",
              severity: "high",
            },
            {
              source: 10,
              title: "ReDoS",
              url: "https://github.com/advisories/GHSA-29mw-wpgm-hmr9",
              severity: "moderate",
            },
            {
              source: 11,
              title: "unset/omit PP",
              url: "https://github.com/advisories/GHSA-xxjr-mmjv-4gpg",
              severity: "moderate",
            },
            {
              source: 12,
              title: "Code Injection",
              url: "https://github.com/advisories/GHSA-r5fr-rjxr-66jc",
              severity: "high",
            },
            {
              source: 13,
              title: "PP array bypass",
              url: "https://github.com/advisories/GHSA-f23m-r3pf-42rh",
              severity: "moderate",
            },
          ],
          fixAvailable: {
            name: "lodash",
            version: "4.17.21",
            isSemVerMajor: false,
          },
        },
        moment: {
          severity: "high",
          isDirect: true,
          via: [
            {
              source: 14,
              title: "ReDoS in moment",
              url: "https://github.com/advisories/GHSA-wc69-rhjr-hc9g",
              severity: "high",
            },
          ],
          fixAvailable: {
            name: "moment",
            version: "2.29.4",
            isSemVerMajor: false,
          },
        },
        qs: {
          severity: "high",
          isDirect: true,
          via: [
            {
              source: 15,
              title: "Prototype Pollution",
              url: "https://github.com/advisories/GHSA-hrpp-h998-j3pp",
              severity: "high",
            },
            {
              source: 16,
              title: "DoS comma parsing",
              url: "https://github.com/advisories/GHSA-w7fw-mjwx-w883",
              severity: "low",
            },
            {
              source: 17,
              title: "DoS bracket notation",
              url: "https://github.com/advisories/GHSA-6rw7-vpxm-498p",
              severity: "moderate",
            },
          ],
          fixAvailable: { name: "qs", version: "6.14.2", isSemVerMajor: false },
        },
      },
    };

    const result = normalizeNpmAudit(raw);
    assert.equal(
      Object.keys(result).length,
      17,
      "deve criar 17 entradas, uma por advisory"
    );

    // Verifica distribuição por severidade
    const bySev = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
    for (const v of Object.values(result)) bySev[v.severity]++;
    assert.equal(bySev.critical, 1);
    assert.equal(bySev.high, 9);
    assert.equal(bySev.moderate, 6);
    assert.equal(bySev.low, 1);
  });
});

// ---------------------------------------------------------------------------
// yarn classic
// ---------------------------------------------------------------------------

describe("adapter: yarn classic audit — normalizeYarnClassicAudit", () => {
  const yarnNdjson = [
    JSON.stringify({ type: "info", data: "auditing packages" }),
    JSON.stringify({
      type: "auditAdvisory",
      data: {
        resolution: { id: 1523, path: "lodash", dev: false },
        advisory: {
          id: 1523,
          github_advisory_id: "GHSA-jf85-cpcp-j695",
          module_name: "lodash",
          title: "Prototype Pollution",
          severity: "high",
          url: "https://www.npmjs.com/advisories/1523",
          patched_versions: ">=4.17.21",
          cves: ["CVE-2019-10744"],
        },
      },
    }),
    JSON.stringify({
      type: "auditAdvisory",
      data: {
        resolution: { id: 2345, path: "axios", dev: false },
        advisory: {
          id: 2345,
          github_advisory_id: "GHSA-wf5p-g6vw-992j",
          module_name: "axios",
          title: "Server-Side Request Forgery",
          severity: "moderate",
          url: "https://www.npmjs.com/advisories/2345",
          patched_versions: ">=1.6.0",
          cves: [],
        },
      },
    }),
    JSON.stringify({
      type: "auditSummary",
      data: { vulnerabilities: { high: 1, moderate: 1 } },
    }),
  ].join("\n");

  it("parseia linhas auditAdvisory", () => {
    const result = normalizeYarnClassicAudit(yarnNdjson);
    assert.ok("GHSA-jf85-cpcp-j695" in result);
    assert.ok("GHSA-wf5p-g6vw-992j" in result);
  });

  it("extrai severity corretamente", () => {
    const result = normalizeYarnClassicAudit(yarnNdjson);
    assert.equal(result["GHSA-jf85-cpcp-j695"].severity, "high");
    assert.equal(result["GHSA-wf5p-g6vw-992j"].severity, "moderate");
  });

  it("marca fixAvailable quando patched_versions está presente", () => {
    const result = normalizeYarnClassicAudit(yarnNdjson);
    assert.equal(result["GHSA-jf85-cpcp-j695"].fixAvailable, true);
    assert.equal(result["GHSA-jf85-cpcp-j695"].fixedIn, ">=4.17.21");
  });

  it("ignora linhas que não são auditAdvisory", () => {
    const result = normalizeYarnClassicAudit(yarnNdjson);
    assert.equal(Object.keys(result).length, 2);
  });

  it("retorna objeto vazio para NDJSON sem advisories", () => {
    const result = normalizeYarnClassicAudit(
      JSON.stringify({ type: "info", data: "nothing" })
    );
    assert.deepEqual(result, {});
  });

  it("advisory sem patched_versions marca fixAvailable=false", () => {
    const line = JSON.stringify({
      type: "auditAdvisory",
      data: {
        resolution: { id: 999 },
        advisory: {
          id: 999,
          github_advisory_id: "GHSA-xxxx-0000-xxxx",
          module_name: "bad-pkg",
          title: "No fix available",
          severity: "critical",
          url: "https://example.com",
          patched_versions: "<0.0.0",
        },
      },
    });
    const result = normalizeYarnClassicAudit(line);
    assert.equal(result["GHSA-xxxx-0000-xxxx"].fixAvailable, false);
  });
});

// ---------------------------------------------------------------------------
// bun
// ---------------------------------------------------------------------------

describe("adapter: bun audit — parseBunAuditText", () => {
  const bunOutput = `
lodash
  Severity: high
  Title: Prototype Pollution
  URL: https://github.com/advisories/GHSA-jf85-cpcp-j695
  Vulnerable: <4.17.21
  Fix: 4.17.21

axios
  Severity: moderate
  Title: Server-Side Request Forgery
  URL: https://github.com/advisories/GHSA-wf5p-g6vw-992j
  Vulnerable: <1.6.0
  Fix: 1.6.0
`.trim();

  it("parseia múltiplos advisories", () => {
    const result = parseBunAuditText(bunOutput);
    assert.equal(Object.keys(result).length, 2);
  });

  it("extrai GHSA ID da URL", () => {
    const result = parseBunAuditText(bunOutput);
    assert.ok(
      "GHSA-JF85-CPCP-J695" in result ||
        Object.values(result).some((v) => v.url.includes("GHSA-jf85-cpcp-j695"))
    );
  });

  it("extrai severity corretamente", () => {
    const result = parseBunAuditText(bunOutput);
    const lodash = Object.values(result).find(
      (v) => v.packages[0] === "lodash"
    );
    assert.ok(lodash);
    assert.equal(lodash.severity, "high");
  });

  it("extrai fix version", () => {
    const result = parseBunAuditText(bunOutput);
    const lodash = Object.values(result).find(
      (v) => v.packages[0] === "lodash"
    );
    assert.equal(lodash.fixAvailable, true);
    assert.equal(lodash.fixedIn, "4.17.21");
  });

  it("retorna objeto vazio para string vazia", () => {
    assert.deepEqual(parseBunAuditText(""), {});
  });

  it("advisory sem fix marca fixAvailable=false", () => {
    const output = `
vulnerable-pkg
  Severity: critical
  Title: Remote Code Execution
  URL: https://github.com/advisories/GHSA-test-0000-0000
  Fix: No fix available
`.trim();
    const result = parseBunAuditText(output);
    const vuln = Object.values(result)[0];
    assert.equal(vuln.fixAvailable, false);
  });
});
