import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterVulns,
  groupBySeverity,
  meetsSeverityThreshold,
  shouldAuditFail,
} from "../src/audit-filter.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeVuln(id, severity, overrides = {}) {
  return {
    id,
    severity,
    title: `Mock vuln ${id}`,
    url: `https://github.com/advisories/${id}`,
    packages: ["some-pkg"],
    via: ["some-pkg"],
    fixAvailable: true,
    fixedIn: "1.0.1",
    isDirect: true,
    ...overrides,
  };
}

const auditMap = {
  "GHSA-aaaa-1111-aaaa": makeVuln("GHSA-aaaa-1111-aaaa", "critical"),
  "GHSA-bbbb-2222-bbbb": makeVuln("GHSA-bbbb-2222-bbbb", "high"),
  "GHSA-cccc-3333-cccc": makeVuln("GHSA-cccc-3333-cccc", "moderate"),
  "GHSA-dddd-4444-dddd": makeVuln("GHSA-dddd-4444-dddd", "low"),
  "GHSA-eeee-5555-eeee": makeVuln("GHSA-eeee-5555-eeee", "info"),
};

const baseConfig = { auditLevel: "info", ignoreAdvisories: [] };

// ---------------------------------------------------------------------------
// meetsSeverityThreshold
// ---------------------------------------------------------------------------

describe("meetsSeverityThreshold", () => {
  it("critical atinge todos os níveis", () => {
    assert.equal(meetsSeverityThreshold("critical", "info"), true);
    assert.equal(meetsSeverityThreshold("critical", "low"), true);
    assert.equal(meetsSeverityThreshold("critical", "moderate"), true);
    assert.equal(meetsSeverityThreshold("critical", "high"), true);
    assert.equal(meetsSeverityThreshold("critical", "critical"), true);
  });

  it("high não atinge critical", () => {
    assert.equal(meetsSeverityThreshold("high", "critical"), false);
    assert.equal(meetsSeverityThreshold("high", "high"), true);
    assert.equal(meetsSeverityThreshold("high", "moderate"), true);
  });

  it("moderate não atinge high nem critical", () => {
    assert.equal(meetsSeverityThreshold("moderate", "critical"), false);
    assert.equal(meetsSeverityThreshold("moderate", "high"), false);
    assert.equal(meetsSeverityThreshold("moderate", "moderate"), true);
  });

  it("info só atinge info", () => {
    assert.equal(meetsSeverityThreshold("info", "low"), false);
    assert.equal(meetsSeverityThreshold("info", "info"), true);
  });
});

// ---------------------------------------------------------------------------
// filterVulns — classificação básica
// ---------------------------------------------------------------------------

describe("filterVulns — classificação básica", () => {
  it("sem ignores e auditLevel=info, todas as vulns ficam ativas", () => {
    const result = filterVulns(auditMap, baseConfig);
    assert.equal(result.counts.total, 5);
    assert.equal(result.counts.ignored, 0);
  });

  it("auditLevel=high filtra moderate/low/info para ignored", () => {
    const result = filterVulns(auditMap, { ...baseConfig, auditLevel: "high" });
    assert.equal(result.counts.total, 2); // critical + high
    assert.equal(result.counts.ignored, 3); // moderate + low + info
    assert.ok("GHSA-aaaa-1111-aaaa" in result.vulns);
    assert.ok("GHSA-bbbb-2222-bbbb" in result.vulns);
    assert.ok("GHSA-cccc-3333-cccc" in result.ignored);
  });

  it("auditLevel=critical filtra tudo exceto critical", () => {
    const result = filterVulns(auditMap, {
      ...baseConfig,
      auditLevel: "critical",
    });
    assert.equal(result.counts.total, 1);
    assert.equal(result.counts.critical, 1);
    assert.equal(result.counts.high, 0);
  });

  it("mapa vazio resulta em resultado zerado", () => {
    const result = filterVulns({}, baseConfig);
    assert.equal(result.counts.total, 0);
    assert.equal(result.counts.ignored, 0);
    assert.deepEqual(result.vulns, {});
    assert.deepEqual(result.ignored, {});
  });
});

// ---------------------------------------------------------------------------
// filterVulns — ignoreAdvisories
// ---------------------------------------------------------------------------

describe("filterVulns — ignoreAdvisories", () => {
  it("ignora advisory pelo ID exato", () => {
    const result = filterVulns(auditMap, {
      ...baseConfig,
      ignoreAdvisories: ["GHSA-aaaa-1111-aaaa"],
    });
    assert.ok(!("GHSA-aaaa-1111-aaaa" in result.vulns));
    assert.ok("GHSA-aaaa-1111-aaaa" in result.ignored);
    assert.equal(result.counts.total, 4);
  });

  it("comparação de ID é case-insensitive", () => {
    const result = filterVulns(auditMap, {
      ...baseConfig,
      ignoreAdvisories: ["ghsa-aaaa-1111-aaaa"],
    });
    assert.ok("GHSA-aaaa-1111-aaaa" in result.ignored);
  });

  it("ignora múltiplos advisories", () => {
    const result = filterVulns(auditMap, {
      ...baseConfig,
      ignoreAdvisories: ["GHSA-aaaa-1111-aaaa", "GHSA-bbbb-2222-bbbb"],
    });
    assert.equal(result.counts.total, 3);
    assert.equal(result.counts.ignored, 2);
  });

  it("ignore tem prioridade sobre auditLevel", () => {
    // critical deveria passar pelo auditLevel=critical, mas é ignorado
    const result = filterVulns(auditMap, {
      auditLevel: "critical",
      ignoreAdvisories: ["GHSA-aaaa-1111-aaaa"],
    });
    assert.ok(!("GHSA-aaaa-1111-aaaa" in result.vulns));
    assert.equal(result.counts.total, 0);
  });
});

// ---------------------------------------------------------------------------
// filterVulns — counts por severidade
// ---------------------------------------------------------------------------

describe("filterVulns — counts por severidade", () => {
  it("conta corretamente cada nível", () => {
    const result = filterVulns(auditMap, baseConfig);
    assert.equal(result.counts.critical, 1);
    assert.equal(result.counts.high, 1);
    assert.equal(result.counts.moderate, 1);
    assert.equal(result.counts.low, 1);
    assert.equal(result.counts.info, 1);
    assert.equal(result.counts.total, 5);
  });

  it("counts.ignored não entra em counts por severidade", () => {
    const result = filterVulns(auditMap, {
      ...baseConfig,
      ignoreAdvisories: ["GHSA-aaaa-1111-aaaa"],
    });
    assert.equal(result.counts.critical, 0); // foi ignorado
    assert.equal(result.counts.total, 4);
    assert.equal(result.counts.ignored, 1);
  });
});

// ---------------------------------------------------------------------------
// shouldAuditFail
// ---------------------------------------------------------------------------

describe("shouldAuditFail", () => {
  function makeResult(severities) {
    const vulns = {};
    severities.forEach((s, i) => {
      const id = `GHSA-test-${i}`;
      vulns[id] = makeVuln(id, s);
    });
    const counts = {
      info: 0,
      low: 0,
      moderate: 0,
      high: 0,
      critical: 0,
      total: severities.length,
      ignored: 0,
    };
    for (const s of severities) counts[s]++;
    return { vulns, ignored: {}, counts };
  }

  it("retorna true quando há critical e auditFailOn=critical", () => {
    const result = makeResult(["critical"]);
    assert.equal(shouldAuditFail(result, "critical"), true);
  });

  it("retorna false quando só há high e auditFailOn=critical", () => {
    const result = makeResult(["high"]);
    assert.equal(shouldAuditFail(result, "critical"), false);
  });

  it("retorna true quando há high e auditFailOn=high", () => {
    const result = makeResult(["high"]);
    assert.equal(shouldAuditFail(result, "high"), true);
  });

  it("retorna true quando há moderate e auditFailOn=moderate", () => {
    const result = makeResult(["moderate"]);
    assert.equal(shouldAuditFail(result, "moderate"), true);
  });

  it("retorna false quando auditFailOn=never independente das vulns", () => {
    const result = makeResult(["critical", "high"]);
    assert.equal(shouldAuditFail(result, "never"), false);
  });

  it("retorna false quando não há vulns ativas", () => {
    const result = makeResult([]);
    assert.equal(shouldAuditFail(result, "high"), false);
  });
});

// ---------------------------------------------------------------------------
// groupBySeverity
// ---------------------------------------------------------------------------

describe("groupBySeverity", () => {
  it("agrupa vulns por severidade", () => {
    const result = filterVulns(auditMap, baseConfig);
    const groups = groupBySeverity(result);
    assert.equal(groups.critical.length, 1);
    assert.equal(groups.high.length, 1);
    assert.equal(groups.moderate.length, 1);
    assert.equal(groups.low.length, 1);
    assert.equal(groups.info.length, 1);
  });

  it("grupos vazios resultam em arrays vazios, não undefined", () => {
    const result = filterVulns(
      { "GHSA-x": makeVuln("GHSA-x", "critical") },
      baseConfig
    );
    const groups = groupBySeverity(result);
    assert.deepEqual(groups.high, []);
    assert.deepEqual(groups.moderate, []);
  });
});
