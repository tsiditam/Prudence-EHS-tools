import { describe, it, expect } from "vitest";
import {
  RegLensScoring,
  CITATION_REGISTRY,
  validateCitation,
  computeAuditScore,
  SCORING_QUESTIONS,
} from "../src/lib/scoring.js";

const finding = (severity, requirement_type = "Regulatory Requirement") => ({ severity, requirement_type });

describe("RegLensScoring.computeScore", () => {
  it("returns 100 / Excellent with no findings", () => {
    const r = RegLensScoring.computeScore([]);
    expect(r.score).toBe(100);
    expect(r.band).toBe("Excellent");
    expect(r.caps_applied).toEqual([]);
  });

  it("is deterministic for the same findings", () => {
    const f = [finding("Critical"), finding("Major"), finding("Minor")];
    expect(RegLensScoring.computeScore(f)).toEqual(RegLensScoring.computeScore(f));
  });

  it("applies the documented deduction schedule", () => {
    // 2 critical (10+10), 3 major (5+5+4), 4 minor (2+2+2+1) = 41 → 59
    const f = [
      finding("Critical"), finding("Critical"),
      finding("Major"), finding("Major"), finding("Major"),
      finding("Minor"), finding("Minor"), finding("Minor"), finding("Minor"),
    ];
    const r = RegLensScoring.computeScore(f);
    expect(r.deductions).toEqual({ critical: 20, major: 14, minor: 7, total: 41 });
    expect(r.score).toBe(59);
    expect(r.band).toBe("High Risk");
  });

  it("caps minor deductions at 10", () => {
    const f = Array.from({ length: 12 }, () => finding("Minor"));
    const r = RegLensScoring.computeScore(f);
    expect(r.deductions.minor).toBe(10);
    expect(r.caps_applied).toContain("Minor deductions capped at 10");
  });

  it("floors best-practice-only reviews at 60", () => {
    const f = Array.from({ length: 6 }, () => finding("Critical", "Best Practice"));
    const r = RegLensScoring.computeScore(f);
    expect(r.score).toBe(60);
    expect(r.caps_applied).toContain("Best-practice-only floor: 60");
  });

  it("never drops below the absolute floor of 20", () => {
    const f = Array.from({ length: 12 }, () => finding("Critical"));
    const r = RegLensScoring.computeScore(f);
    expect(r.score).toBe(20);
    expect(r.band).toBe("Critical Risk");
  });

  it("is case-insensitive on severity", () => {
    expect(RegLensScoring.computeScore([finding("critical")]).deductions.critical).toBe(10);
  });

  it("maps every band to a color", () => {
    for (const s of [100, 85, 77, 72, 65, 45, 25]) {
      const band = RegLensScoring.getBand(s);
      expect(RegLensScoring.getBandColor(band)).not.toBe("#8E8E93");
    }
  });
});

describe("validateCitation", () => {
  it("verifies exact registry matches and attaches the title", () => {
    const r = validateCitation("29 CFR 1910.134");
    expect(r).toEqual({ valid: true, verified: true, title: "Respiratory Protection" });
  });

  it("strips subsection parentheticals before matching", () => {
    expect(validateCitation("29 CFR 1910.147(c)(4)(i)").verified).toBe(true);
    expect(validateCitation("29  CFR   1910.1200(g)").verified).toBe(true);
  });

  it("flags well-formed but unregistered citations as unverified", () => {
    const r = validateCitation("29 CFR 1910.9999");
    expect(r.valid).toBe(true);
    expect(r.verified).toBe(false);
  });

  it("rejects free text", () => {
    expect(validateCitation("common sense")).toEqual({ valid: false, verified: false });
    expect(validateCitation("")).toEqual({ valid: false, verified: false });
  });

  it("registry has no duplicate keys after whitespace normalization", () => {
    const keys = Object.keys(CITATION_REGISTRY).map((k) => k.replace(/\s+/g, " "));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("computeAuditScore (industry checklist mode)", () => {
  const items = [
    { id: "a", text: "Critical item", reg: "29 CFR 1910.38", severity: "Critical" },
    { id: "b", text: "Major item", reg: "29 CFR 1910.132", severity: "Major" },
    { id: "c", text: "Minor item", reg: "Best Practice", severity: "Minor" },
  ];

  it("scores 100 when every applicable item is yes", () => {
    const r = computeAuditScore(items, { a: "yes", b: "yes", c: "yes" });
    expect(r.score).toBe(100);
    expect(r.criticalFlag).toBe(false);
    expect(r.findings).toEqual([]);
  });

  it("weights by severity (10/5/2) and halves partial answers", () => {
    // a yes (10), b partial (2.5), c no (0) of 17 → 73.5 → 74
    const r = computeAuditScore(items, { a: "yes", b: "partial", c: "no" });
    expect(r.score).toBe(74);
    expect(r.band).toBe("Moderate Risk");
    expect(r.findings.map((f) => f.id)).toEqual(["b", "c"]);
  });

  it("excludes N/A items from the denominator", () => {
    const r = computeAuditScore(items, { a: "na", b: "yes", c: "yes" });
    expect(r.score).toBe(100);
  });

  it("raises the red flag when a critical item is answered no", () => {
    const r = computeAuditScore(items, { a: "no", b: "yes", c: "yes" });
    expect(r.criticalFlag).toBe(true);
    expect(r.criticalReasons[0]).toMatch(/Critical item/);
  });

  it("counts unanswered items as no", () => {
    const r = computeAuditScore(items, { b: "yes", c: "yes" });
    expect(r.stats.no).toBe(1);
    expect(r.criticalFlag).toBe(true);
  });
});

describe("computeAuditScore (structured 7-category mode)", () => {
  it("sums category weights to 100 when all questions are yes", () => {
    const responses = Object.fromEntries(SCORING_QUESTIONS.map((q) => [q.id, "yes"]));
    const r = computeAuditScore([], responses);
    expect(r.score).toBe(100);
    expect(r.band).toBe("Excellent");
    expect(r.criticalFlag).toBe(false);
  });

  it("applies regulatory penalty deductions to the regulatory category", () => {
    const responses = Object.fromEntries(SCORING_QUESTIONS.map((q) => [q.id, "yes"]));
    const r = computeAuditScore([], responses, { failure_to_abate: true });
    expect(r.categories.regulatory.score).toBe(6);
    expect(r.score).toBe(96);
  });
});
