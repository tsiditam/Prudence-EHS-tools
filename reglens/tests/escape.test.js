import { describe, it, expect } from "vitest";
import { escapeHtml, escapeDeep } from "../src/lib/escape.js";

describe("escapeHtml", () => {
  it("escapes the five HTML metacharacters", () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;"
    );
  });
  it("returns an empty string for null and undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("escapeDeep", () => {
  it("escapes strings anywhere in a nested structure and leaves numbers alone", () => {
    const input = { title: "<b>", n: 3, ok: true, list: ["<i>", { deep: "a&b" }], nothing: null };
    expect(escapeDeep(input)).toEqual({
      title: "&lt;b&gt;", n: 3, ok: true, list: ["&lt;i&gt;", { deep: "a&amp;b" }], nothing: null,
    });
  });
  it("does not mutate its input", () => {
    const input = { s: "<" };
    escapeDeep(input);
    expect(input.s).toBe("<");
  });
});
