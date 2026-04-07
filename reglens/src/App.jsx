/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMediaQuery } from './hooks/useMediaQuery'
import LandingPage from './components/LandingPage'

// ─── Supabase Client ───
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local or Vercel env vars
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

const supabase = (() => {
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const isConfigured = SUPABASE_URL !== "YOUR_SUPABASE_URL" && SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY";
  let supabase_self = null; // self-reference set after return

  async function query(table, method = "GET", body = null, params = "") {
    if (!isConfigured) return null;
    const opts = { method, headers: { ...headers } };
    if (body && method !== "GET") opts.body = JSON.stringify(body);
    if (method === "POST") opts.headers.Prefer = "return=representation";
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, opts);
      if (!res.ok) { console.error(`Supabase ${method} ${table} error:`, res.status); return null; }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (e) { console.error(`Supabase ${table} error:`, e); return null; }
  }

  async function uploadPhoto(path, file) {
    if (!isConfigured) return null;
    try {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/audit-photos/${path}`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) return null;
      return `${SUPABASE_URL}/storage/v1/object/public/audit-photos/${path}`;
    } catch (e) { console.error("Photo upload error:", e); return null; }
  }

  return {
    isConfigured,
    // Auth
    signUp: async (email, password, fullName, companyName) => {
      if (!isConfigured) return { error: "Database not configured" };
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
          method: "POST", headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (data.error || !data.id) return { error: data.error?.message || data.msg || "Signup failed" };
        // Create profile
        await fetch(`${SUPABASE_URL}/rest/v1/user_profiles`, {
          method: "POST",
          headers: { ...headers, Authorization: `Bearer ${data.access_token || SUPABASE_ANON_KEY}`, Prefer: "return=representation" },
          body: JSON.stringify({ id: data.id, email, full_name: fullName, company_name: companyName || null }),
        });
        return { user: data, session: data.access_token ? { access_token: data.access_token, refresh_token: data.refresh_token } : null };
      } catch (e) { return { error: e.message }; }
    },
    signIn: async (email, password) => {
      if (!isConfigured) return { error: "Database not configured" };
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: "POST", headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (data.error) return { error: data.error_description || data.error || "Login failed" };
        return { session: data };
      } catch (e) { return { error: e.message }; }
    },
    signOut: () => { localStorage.removeItem("rl_session"); },
    getSession: () => { try { return JSON.parse(localStorage.getItem("rl_session")); } catch { return null; } },
    setSession: (session) => { localStorage.setItem("rl_session", JSON.stringify(session)); },
    getProfile: async (accessToken) => {
      if (!isConfigured || !accessToken) return null;
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?select=*`, {
          headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        return Array.isArray(data) ? data[0] : null;
      } catch { return null; }
    },
    // Purchases
    getPurchases: async (accessToken) => {
      if (!isConfigured || !accessToken) return [];
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/purchases?order=created_at.desc`, {
          headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        });
        return await res.json();
      } catch { return []; }
    },
    decrementCredit: async (accessToken, creditType) => {
      if (!isConfigured || !accessToken) return false;
      try {
        const profile = await supabase_self.getProfile(accessToken);
        if (!profile || profile[creditType] < 1) return false;
        await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${profile.id}`, {
          method: "PATCH",
          headers: { ...headers, Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ [creditType]: profile[creditType] - 1, updated_at: new Date().toISOString() }),
        });
        return true;
      } catch { return false; }
    },
    // Clients
    getClients: () => query("clients", "GET", null, "?order=name.asc"),
    createClient: (data) => query("clients", "POST", data),
    // Reviews
    getReviews: (limit = 50) => query("compliance_reviews", "GET", null, `?order=created_at.desc&limit=${limit}`),
    getReviewsByClient: (clientId) => query("compliance_reviews", "GET", null, `?client_id=eq.${clientId}&order=created_at.desc`),
    createReview: (data) => query("compliance_reviews", "POST", data),
    updateReview: (id, data) => query("compliance_reviews", "PATCH", data, `?id=eq.${id}`),
    // Audits
    getAudits: (limit = 50) => query("audits", "GET", null, `?order=created_at.desc&limit=${limit}`),
    getAuditsByClient: (clientId) => query("audits", "GET", null, `?client_id=eq.${clientId}&order=created_at.desc`),
    createAudit: (data) => query("audits", "POST", data),
    // Photos
    uploadPhoto,
    createPhotoRecord: (data) => query("audit_photos", "POST", data),
    getAuditPhotos: (auditId) => query("audit_photos", "GET", null, `?audit_id=eq.${auditId}`),
    // Analytics — fire-and-forget, never blocks UI
    trackEvent: (eventType, eventData = {}) => {
      if (!isConfigured) return;
      try {
        const sessionId = sessionStorage.getItem("rl_sid") || (() => {
          const id = crypto.randomUUID();
          sessionStorage.setItem("rl_sid", id);
          return id;
        })();
        query("analytics_events", "POST", {
          session_id: sessionId,
          event_type: eventType,
          event_data: eventData,
        }).catch(() => {});
      } catch {}
    },
  };
})();
// Set self-reference for internal calls
if (supabase._setSelf) supabase._setSelf(supabase);

// ─── PDF Report Generator ───
// ─── Email Report Builder ───
function buildEmailContent(type, data) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const templates = {
    review: {
      subject: `EHS Compliance Review — ${data.programType || "Program"} — Score: ${data.score || "N/A"}`,
      body: `EHS Compliance Review Report\n` +
        `Generated: ${date}\n` +
        `Program: ${data.programType || "N/A"}\n` +
        `Industry: ${data.industry || "N/A"}\n` +
        `Score: ${data.score || "N/A"}/100 (${data.band || "N/A"})\n` +
        `Findings: ${data.findingsCount || 0}\n\n` +
        `Summary:\n${data.summary || "No summary available."}\n\n` +
        `---\n` +
        `This report was generated by RegLens by Prudence EHS.\n` +
        `The full detailed report with findings, citations, and recommendations is attached.\n` +
        `For questions, contact info@prudencesafety.com`,
    },
    readiness: {
      subject: `EHS Readiness Check — ${data.industry || "Facility"} — Score: ${data.score || "N/A"}`,
      body: `EHS Readiness Check Report\n` +
        `Generated: ${date}\n` +
        `Industry: ${data.industry || "N/A"}\n` +
        `Score: ${data.score || "N/A"}/100 (${data.band || "N/A"})\n` +
        `Items: ${data.yes || 0} Yes · ${data.partial || 0} Partial · ${data.no || 0} No · ${data.na || 0} N/A\n` +
        `Gaps Found: ${data.gaps || 0}\n\n` +
        `---\n` +
        `Please download and attach the exported report before sending.\n` +
        `Generated by RegLens by Prudence EHS.`,
    },
    cap: {
      subject: `Corrective Action Plan — ${data.industry || "Facility"} — ${data.actionCount || 0} Actions`,
      body: `Corrective Action Plan\n` +
        `Generated: ${date}\n` +
        `Industry: ${data.industry || "N/A"}\n` +
        `Total Actions: ${data.actionCount || 0}\n` +
        `Critical: ${data.critical || 0} · Major: ${data.major || 0} · Minor: ${data.minor || 0}\n\n` +
        `This plan was generated from the EHS Readiness Check findings and inspector notes.\n` +
        `---\n` +
        `Please download and attach the exported CAP report before sending.\n` +
        `Generated by RegLens by Prudence EHS.`,
    },
    citation: {
      subject: `Draft Abatement Plan Worksheet — ${data.violationCount || 0} Violations`,
      body: `Draft Abatement Plan Worksheet\n` +
        `Generated: ${date}\n` +
        `Violations: ${data.violationCount || 0}\n` +
        `Total Proposed Penalty: ${data.penalty || "N/A"}\n\n` +
        `IMPORTANT: This is a DRAFT planning worksheet — not a legal document.\n` +
        `It should be reviewed by a qualified EHS professional and/or attorney before submission to OSHA.\n\n` +
        `---\n` +
        `Please download and attach the exported abatement plan before sending.\n` +
        `Generated by RegLens by Prudence EHS.`,
    },
  };
  return templates[type] || { subject: "RegLens Report", body: "Report attached." };
}

function generateReviewPDF(result, scoreResult, industryLabel) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const bandColor = RegLensScoring.getBandColor(scoreResult?.band || "Functional");
  const findings = result.findings || [];
  const sevColors = { Critical: "#dc2626", Major: "#d97706", Minor: "#3b82f6" };
  const sevBg = { Critical: "#fef2f2", Major: "#fffbeb", Minor: "#eff6ff" };

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Compliance Review — ${result.documentType || "EHS Program"}</title>
<style>
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } .no-print { display:none; } @page { margin: 0.5in; } }
  body { font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; max-width:800px; margin:0 auto; padding:32px 24px; color:#1a1a1a; line-height:1.5; }
  h1 { font-size:22px; margin:0 0 4px; } h2 { font-size:16px; margin:24px 0 12px; padding-bottom:6px; border-bottom:2px solid #e5e7eb; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; padding-bottom:16px; border-bottom:3px solid #111; }
  .score-box { text-align:center; padding:20px 24px; border-radius:16px; border:2px solid ${bandColor}; background:${bandColor}08; margin-bottom:20px; }
  .score-num { font-size:56px; font-weight:800; color:${bandColor}; } .score-band { font-size:14px; font-weight:600; color:${bandColor}; margin-top:4px; }
  .summary { background:#f9fafb; border-radius:8px; padding:16px; margin-bottom:16px; font-size:13px; line-height:1.7; color:#374151; }
  .stats { display:flex; gap:16px; justify-content:center; margin:12px 0; }
  .stat { text-align:center; padding:8px 16px; border-radius:8px; background:#f9fafb; } .stat-num { font-size:22px; font-weight:700; } .stat-label { font-size:10px; text-transform:uppercase; color:#6b7280; }
  .finding { border-left:4px solid #e5e7eb; border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:12px; page-break-inside:avoid; }
  .finding-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
  .sev { font-size:10px; font-weight:700; padding:3px 8px; border-radius:4px; text-transform:uppercase; }
  .req-type { font-size:9px; font-weight:600; padding:2px 7px; border-radius:4px; }
  .reg { font-family:monospace; font-size:11px; color:#16a34a; background:#f0fdf4; padding:2px 8px; border-radius:4px; display:inline-block; margin:6px 0; }
  .rec { background:#f9fafb; border-radius:6px; padding:10px; margin-top:8px; } .rec-label { font-size:10px; font-weight:600; color:#6b7280; text-transform:uppercase; margin-bottom:4px; }
  .strength { display:flex; gap:8px; padding:6px 0; border-bottom:1px solid #f3f4f6; font-size:13px; }
  .strength:last-child { border:none; }
  .disclaimer { font-size:10px; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:16px; margin-top:32px; line-height:1.6; }
  .breakdown { background:#f9fafb; border-radius:8px; padding:12px 16px; margin-top:12px; font-size:12px; }
  .breakdown-row { display:flex; justify-content:space-between; padding:3px 0; }
  .print-btn { position:fixed; bottom:20px; right:20px; padding:12px 24px; background:#111; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; }
</style></head><body>

<div class="header">
  <div>
    <h1>Compliance Review Report</h1>
    <div style="color:#6b7280;font-size:13px;">${result.documentType || "EHS Program"} — ${industryLabel || "General"} — ${date}</div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:15px;font-weight:700;color:#16a34a;">RegLens</div>
    <div style="font-size:11px;color:#6b7280;">by Prudence EHS</div>
  </div>
</div>

<div class="score-box">
  <div class="score-num">${result.score}</div>
  <div class="score-band">${scoreResult?.band || "—"}</div>
  <div class="stats">
    <div class="stat"><div class="stat-num" style="color:#dc2626">${findings.filter(f=>f.severity==="Critical").length}</div><div class="stat-label">Critical</div></div>
    <div class="stat"><div class="stat-num" style="color:#d97706">${findings.filter(f=>f.severity==="Major").length}</div><div class="stat-label">Major</div></div>
    <div class="stat"><div class="stat-num" style="color:#3b82f6">${findings.filter(f=>f.severity==="Minor").length}</div><div class="stat-label">Minor</div></div>
  </div>
  ${scoreResult && scoreResult.deductions.total > 0 ? `<div class="breakdown">
    <div class="breakdown-row"><span>Starting score</span><span><strong>100</strong></span></div>
    ${scoreResult.deductions.critical > 0 ? `<div class="breakdown-row" style="color:#dc2626"><span>Critical deductions</span><span>-${scoreResult.deductions.critical}</span></div>` : ""}
    ${scoreResult.deductions.major > 0 ? `<div class="breakdown-row" style="color:#d97706"><span>Major deductions</span><span>-${scoreResult.deductions.major}</span></div>` : ""}
    ${scoreResult.deductions.minor > 0 ? `<div class="breakdown-row" style="color:#3b82f6"><span>Minor deductions</span><span>-${scoreResult.deductions.minor}</span></div>` : ""}
    ${scoreResult.caps_applied.map(c => `<div class="breakdown-row" style="color:#d97706;font-style:italic;font-size:11px"><span>${c}</span></div>`).join("")}
    <div class="breakdown-row" style="border-top:1px solid #e5e7eb;margin-top:4px;padding-top:4px;font-weight:700;color:${bandColor}"><span>Final score</span><span>${result.score} (${scoreResult.band})</span></div>
  </div>` : ""}
</div>

<div class="summary"><strong>Summary:</strong> ${result.summary || ""}</div>`;

  // Findings
  if (findings.length > 0) {
    html += `<h2>Findings (${findings.length})</h2>`;
    findings.forEach(f => {
      const isReg = (f.requirement_type || "").includes("Regulatory");
      html += `<div class="finding" style="border-left-color:${sevColors[f.severity] || "#e5e7eb"}">
        <div class="finding-header">
          <span class="sev" style="background:${sevBg[f.severity]};color:${sevColors[f.severity]}">${f.severity}</span>
          <span class="req-type" style="background:${isReg ? "#f0fdf4" : "#eff6ff"};color:${isReg ? "#16a34a" : "#3b82f6"}">${isReg ? "REGULATORY" : "BEST PRACTICE"}</span>
          <strong style="font-size:13px;">${f.title}</strong>
        </div>
        <div style="font-size:13px;color:#374151;line-height:1.6;margin-bottom:6px;">${f.description}</div>
        <span class="reg">${f.regulation}</span>
        ${f.citation_verified ? '<span style="font-size:10px;color:#16a34a;margin-left:8px;">✓ Verified</span>' : ""}
        ${f.citation_unverified ? '<span style="font-size:10px;color:#d97706;margin-left:8px;">⚠ Unverified</span>' : ""}
        ${f.citation_title ? `<span style="font-size:10px;color:#6b7280;margin-left:4px;">(${f.citation_title})</span>` : ""}
        <div class="rec"><div class="rec-label">Recommendation</div><div style="font-size:13px;color:#374151;line-height:1.5;">${f.recommendation}</div></div>
      </div>`;
    });
  }

  // Strengths
  if ((result.strengths || []).length > 0) {
    html += `<h2>Strengths</h2><div style="background:#f0fdf4;border-radius:8px;padding:12px 16px;">`;
    result.strengths.forEach(s => { html += `<div class="strength"><span style="color:#16a34a">✓</span><span>${s}</span></div>`; });
    html += `</div>`;
  }

  html += `
<div class="disclaimer">
  <strong>Disclaimer:</strong> This compliance review is AI-assisted and advisory in nature. It does not guarantee regulatory compliance,
  does not constitute legal advice, and is not a substitute for consultation with a qualified safety or legal professional.
  Findings labeled "Best Practice" are advisory, not regulatory requirements. A determination that no critical gaps were identified
  does not certify that the document is compliant with all applicable regulations.
  <br><br><strong>Prepared by:</strong> RegLens by Prudence EHS — Germantown, MD<br><strong>Report Date:</strong> ${date}
</div>
<button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Compliance-Review-${(result.documentType || "EHS").replace(/[^a-zA-Z]/g, "-")}-${new Date().toISOString().split("T")[0]}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Deterministic Scoring Engine ───
const RegLensScoring = (() => {
  function computeScore(findings) {
    if (!Array.isArray(findings) || findings.length === 0)
      return { score: 100, band: "Excellent", deductions: { critical: 0, major: 0, minor: 0, total: 0 }, caps_applied: [] };
    let score = 100;
    const caps = [];
    const criticals = findings.filter(f => (f.severity || "").toLowerCase() === "critical");
    const majors = findings.filter(f => (f.severity || "").toLowerCase() === "major");
    const minors = findings.filter(f => (f.severity || "").toLowerCase() === "minor");
    let criticalDed = 0;
    criticals.forEach((_, i) => { criticalDed += i < 2 ? 10 : i < 5 ? 9 : 8; });
    let majorDed = 0;
    majors.forEach((_, i) => { majorDed += i < 2 ? 5 : i < 4 ? 4 : 3; });
    let minorDed = 0;
    minors.forEach((_, i) => { minorDed += i < 3 ? 2 : 1; });
    if (minorDed > 10) { minorDed = 10; caps.push("Minor deductions capped at 10"); }
    score -= (criticalDed + majorDed + minorDed);
    if (criticals.length >= 3 && score > 80) { score = 80; caps.push("3+ critical findings: max 80"); }
    if (criticals.length >= 5 && score > 70) { score = 70; caps.push("5+ critical findings: max 70"); }
    if (criticals.length === 0 && majors.length <= 2 && score < 80) { score = 80; caps.push("0 critical + ≤2 major: min 80"); }
    const regulatory = findings.filter(f => (f.requirement_type || "").includes("Regulatory"));
    if (regulatory.length === 0 && score < 60) { score = 60; caps.push("Best-practice-only floor: 60"); }
    if (score < 20) { score = 20; caps.push("Absolute floor: 20"); }
    return { score, band: getBand(score), deductions: { critical: criticalDed, major: majorDed, minor: minorDed, total: criticalDed + majorDed + minorDed }, caps_applied: caps };
  }
  function getBand(s) {
    if (s >= 90) return "Excellent";
    if (s >= 80) return "Strong";
    if (s >= 75) return "Good";
    if (s >= 70) return "Functional";
    if (s >= 60) return "Moderate Risk";
    if (s >= 40) return "High Risk";
    return "Critical Risk";
  }
  function getBandColor(band) {
    return { Excellent: "#34C759", Strong: "#65a30d", Good: "#84cc16", Functional: "#F59E0B", "Moderate Risk": "#ea580c", Weak: "#ea580c", "High Risk": "#EF4444", "Critical Risk": "#991b1b" }[band] || "#8E8E93";
  }
  return { computeScore, getBand, getBandColor };
})();

// ─── Response Parser ───
const CFR_RE = /\d+\s*CFR\s*\d+/i;
const STD_RE = /(ANSI|NFPA|ACGIH|ASHRAE|ASTM|IEEE|API|NRC|CDC|NIH|DHS|EPA|FAA)\s+[A-Z]?\d+/i;

// Known-good citation registry — validates AI-returned citations
const CITATION_REGISTRY = {
  // OSHA General Industry (1910)
  "29 CFR 1910.22": "Walking-Working Surfaces",
  "29 CFR 1910.23": "Ladders",
  "29 CFR 1910.28": "Duty to Have Fall Protection",
  "29 CFR 1910.38": "Emergency Action Plans",
  "29 CFR 1910.39": "Fire Prevention Plans",
  "29 CFR 1910.95": "Occupational Noise Exposure",
  "29 CFR 1910.101": "Compressed Gases",
  "29 CFR 1910.106": "Flammable Liquids",
  "29 CFR 1910.119": "Process Safety Management",
  "29 CFR 1910.120": "HAZWOPER",
  "29 CFR 1910.132": "PPE General Requirements",
  "29 CFR 1910.133": "Eye and Face Protection",
  "29 CFR 1910.134": "Respiratory Protection",
  "29 CFR 1910.137": "Electrical Protective Equipment",
  "29 CFR 1910.138": "Hand Protection",
  "29 CFR 1910.140": "Personal Fall Protection Systems",
  "29 CFR 1910.146": "Permit-Required Confined Spaces",
  "29 CFR 1910.147": "Lockout/Tagout",
  "29 CFR 1910.151": "Medical Services and First Aid",
  "29 CFR 1910.157": "Portable Fire Extinguishers",
  "29 CFR 1910.178": "Powered Industrial Trucks",
  "29 CFR 1910.212": "Machine Guarding",
  "29 CFR 1910.252": "Welding, Cutting, Brazing",
  "29 CFR 1910.269": "Electric Power Generation",
  "29 CFR 1910.303": "Electrical General",
  "29 CFR 1910.332": "Electrical Training",
  "29 CFR 1910.333": "Electrical Safe Work Practices",
  "29 CFR 1910.334": "Electrical Use of Equipment",
  "29 CFR 1910.1000": "Air Contaminants/PELs",
  "29 CFR 1910.1020": "Access to Exposure Records",
  "29 CFR 1910.1026": "Chromium (VI)",
  "29 CFR 1910.1030": "Bloodborne Pathogens",
  "29 CFR 1910.1048": "Formaldehyde",
  "29 CFR 1910.1200": "Hazard Communication",
  "29 CFR 1910.1450": "Laboratory Standard",
  // OSHA Recordkeeping (1904)
  "29 CFR 1904.4": "Recording Criteria",
  "29 CFR 1904.5": "Work-Relatedness",
  "29 CFR 1904.7": "General Recording Criteria",
  "29 CFR 1904.29": "Forms",
  "29 CFR 1904.32": "Annual Summary",
  "29 CFR 1904.33": "Record Retention",
  "29 CFR 1904.39": "Reporting Fatalities/Hospitalizations",
  "29 CFR 1904.41": "Electronic Submission",
  // OSHA Construction (1926)
  "29 CFR 1926.20": "General Safety Provisions",
  "29 CFR 1926.32": "Definitions",
  "29 CFR 1926.62": "Lead in Construction",
  "29 CFR 1926.501": "Fall Protection Duty",
  "29 CFR 1926.502": "Fall Protection Criteria",
  "29 CFR 1926.503": "Fall Protection Training",
  "29 CFR 1926.1101": "Asbestos",
  "29 CFR 1926.1153": "Silica",
  // EPA
  "40 CFR 112": "SPCC",
  "40 CFR 122": "NPDES Permits",
  "40 CFR 262": "Hazardous Waste Generators",
  "40 CFR 263": "Hazardous Waste Transporters",
  "40 CFR 264": "Hazardous Waste TSD Facilities",
  "40 CFR 273": "Universal Waste",
  "40 CFR 302": "Reportable Quantities",
  "40 CFR 355": "Emergency Planning",
  "40 CFR 370": "Hazardous Chemical Reporting",
  "40 CFR 372": "Toxic Chemical Release Reporting",
  "40 CFR 403": "Pretreatment Standards",
  "40 CFR 761": "PCBs",
  "40 CFR 763": "Asbestos (AHERA)",
  // NRC Radiation
  "10 CFR 19": "Notices, Instructions, Reports to Workers",
  "10 CFR 20": "Standards for Protection Against Radiation",
  "10 CFR 30": "Byproduct Material",
  "10 CFR 35": "Medical Use of Byproduct Material",
  "10 CFR 71": "Packaging and Transport of Radioactive Material",
  // NFPA
  "NFPA 10": "Portable Fire Extinguishers",
  "NFPA 13": "Sprinkler Systems",
  "NFPA 25": "Inspection/Testing of Water-Based Fire Protection",
  "NFPA 30": "Flammable and Combustible Liquids",
  "NFPA 45": "Fire Protection for Laboratories",
  "NFPA 70": "National Electrical Code",
  "NFPA 70E": "Electrical Safety in the Workplace",
  "NFPA 72": "National Fire Alarm Code",
  "NFPA 75": "IT Equipment",
  "NFPA 76": "Telecommunications Facilities",
  "NFPA 99": "Health Care Facilities Code",
  "NFPA 101": "Life Safety Code",
  "NFPA 407": "Aircraft Fuel Servicing",
  "NFPA 409": "Aircraft Hangars",
  // ANSI
  "ANSI Z87.1": "Eye and Face Protection",
  "ANSI Z89.1": "Head Protection",
  "ANSI Z136": "Laser Safety",
  "ANSI Z244.1": "Lockout/Tagout",
  "ANSI Z358.1": "Emergency Eyewash and Shower",
  "ANSI Z359.1": "Fall Protection",
  "ANSI Z490.1": "EHS Training",
};

function validateCitation(citation) {
  if (!citation) return { valid: false, verified: false };
  const normalized = citation.trim().replace(/\s+/g, " ");
  // Check exact match
  if (CITATION_REGISTRY[normalized]) return { valid: true, verified: true, title: CITATION_REGISTRY[normalized] };
  // Check base section (strip subsection parentheticals)
  const base = normalized.replace(/\([a-zA-Z0-9]+\)(\([a-zA-Z0-9]+\))*/g, "").trim();
  if (CITATION_REGISTRY[base]) return { valid: true, verified: true, title: CITATION_REGISTRY[base] };
  // Check if it matches CFR or standard pattern
  if (CFR_RE.test(normalized) || STD_RE.test(normalized)) return { valid: true, verified: false };
  return { valid: false, verified: false };
}

// ─── Review Queue (for API failures) ───
function getReviewQueue() {
  try { return JSON.parse(localStorage.getItem("rl_review_queue")) || []; }
  catch { return []; }
}
function addToReviewQueue(item) {
  const queue = getReviewQueue();
  queue.push({ ...item, queuedAt: new Date().toISOString(), status: "pending" });
  localStorage.setItem("rl_review_queue", JSON.stringify(queue));
}
function removeFromReviewQueue(queuedAt) {
  const queue = getReviewQueue().filter(q => q.queuedAt !== queuedAt);
  localStorage.setItem("rl_review_queue", JSON.stringify(queue));
}

function parseReviewResponse(raw) {
  const warnings = [];
  try {
    let cleaned = (raw || "").trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();
    const data = JSON.parse(cleaned);
    if (!data.summary) { data.summary = "No summary was generated. Please re-run the review."; warnings.push("Empty summary — default applied"); }
    if (!Array.isArray(data.findings)) return { data: null, error: "AI response missing findings array.", warnings };
    data.findings.forEach(f => {
      if (!["Critical", "Major", "Minor", "critical", "major", "minor"].includes(f.severity)) warnings.push(`Invalid severity "${f.severity}" on ${f.id}`);
      f.severity = (f.severity || "Major").charAt(0).toUpperCase() + (f.severity || "major").slice(1).toLowerCase();
      if (!f.requirement_type) f.requirement_type = "Regulatory Requirement";
      // Citation validation against registry
      if (f.regulation) {
        const cv = validateCitation(f.regulation);
        if (cv.verified) {
          f.citation_verified = true;
          f.citation_title = cv.title;
        } else if (cv.valid) {
          f.citation_unverified = true;
          warnings.push(`Citation format valid but not in registry: "${f.regulation}"`);
        } else {
          f.citation_unverified = true;
          warnings.push(`Unverified citation: "${f.regulation}"`);
        }
      }
    });
    if (!Array.isArray(data.strengths)) data.strengths = [];
    return { data, error: null, warnings };
  } catch (e) {
    return { data: null, error: "AI returned invalid JSON. Please try again.", warnings };
  }
}

// ─── Industry Profiles ───
const INDUSTRIES = {
  manufacturing: { label: "Manufacturing", icon: "🏭", hazards: "machine guarding, LOTO/energy control, noise exposure, chemical handling, forklift/powered industrial trucks, welding fumes, ergonomic lifting, conveyor systems, compressed gas, electrical panel access, housekeeping/5S, respiratory hazards from particulates", standards: "29 CFR 1910 (General Industry), NFPA 70E, ANSI Z244.1" },
  construction: { label: "Construction", icon: "🏗️", hazards: "fall protection, scaffolding, excavation/trenching, struck-by hazards, crane operations, electrical safety (temporary wiring), silica dust exposure, lead paint, heat illness, concrete/masonry cutting, heavy equipment, multi-employer worksite coordination", standards: "29 CFR 1926 (Construction), ANSI A10 series" },
  "commercial-re": { label: "Commercial Real Estate", icon: "🏢", hazards: "slip/trip/fall, elevator/escalator safety, HVAC maintenance, indoor air quality, asbestos/lead in older buildings, electrical room access, roof access/fall protection, contractor oversight, fire prevention, ADA compliance, parking garage CO monitoring, cooling tower legionella", standards: "29 CFR 1910, ASHRAE 62.1, NFPA 1/101, EPA guidelines" },
  healthcare: { label: "Healthcare", icon: "🏥", hazards: "bloodborne pathogens, sharps injuries, patient handling/ergonomics, workplace violence, hazardous drug exposure, anesthetic gas, ethylene oxide sterilization, tuberculosis exposure, latex allergy, radiation safety, slip/fall, chemical disinfectants", standards: "29 CFR 1910.1030, OSHA healthcare guidelines, Joint Commission, CDC/NIOSH" },
  "government-municipal": { label: "Government / Municipal", icon: "🏛️", hazards: "public works (road crew struck-by), water/wastewater treatment (confined space, chlorine gas), parks maintenance (equipment, heat illness), fleet operations, office ergonomics, code enforcement (building hazards), police/fire facility safety, custodial chemical exposure", standards: "29 CFR 1910/1926, state OSHA plans, NFPA standards" },
  warehousing: { label: "Warehousing / Logistics", icon: "📦", hazards: "forklift/PIT operations, dock safety (fall from height, truck creep), racking/storage collapse, ergonomic lifting/repetitive motion, conveyor pinch points, charging station hazards, pedestrian/vehicle interaction, temperature extremes, loading/unloading struck-by", standards: "29 CFR 1910.176, 1910.178, ANSI/ITSDF B56.1" },
  "food-service": { label: "Food Service / Hospitality", icon: "🍽️", hazards: "slip/trip/fall (wet floors, grease), burns/scalds, knife injuries, chemical cleaning agents, walk-in freezer entrapment, cooking equipment (fryers, ovens), ergonomic strain (lifting, standing), food allergen handling, pest control chemicals, ventilation/IAQ", standards: "29 CFR 1910, state health codes, NFPA 96 (kitchen hoods)" },
  laboratory: { label: "Laboratory", icon: "🔬", hazards: "chemical exposure (corrosives, carcinogens, reactive chemicals, cryogens), fume hood failures, biological agents (BSL-1 through BSL-3), sharps and glassware injuries, compressed gas cylinders, fire/explosion from flammable solvents, radiation safety (X-ray, isotopes), laser hazards (Class 3B/4), ergonomic strain (microscope work, repetitive pipetting), electrical hazards from analytical equipment, waste management (chemical, biological, radioactive, mixed), spill response, eye/skin contact with corrosives, noise from sonicators and centrifuges", standards: "29 CFR 1910.1450 (OSHA Lab Standard), 29 CFR 1910.1200 (HazCom), NRC 10 CFR 20 (radiation), ANSI Z136 (lasers), CDC/NIH BMBL (biosafety), EPA RCRA (hazardous waste), NFPA 45 (fire protection for labs)" },
  energy: { label: "Energy / Utilities", icon: "⚡", hazards: "electrical contact (high voltage), arc flash, line clearance tree trimming, confined space (manholes, vaults), trenching for underground utilities, working at heights (poles, towers), lock-out/tag-out, vehicle/heavy equipment, hydrogen sulfide, natural gas leak detection", standards: "29 CFR 1910.269, NFPA 70E, OSHA electric power standards" },
  automotive: { label: "Automotive / Service Shop", icon: "🔧", hazards: "vehicle lift safety, exhaust ventilation (CO exposure), brake dust (asbestos), battery acid, parts cleaning solvents, welding/cutting, compressed air, tire inflation cages, ergonomic strain (overhead work), noise, flammable liquids storage, pit/trench hazards", standards: "29 CFR 1910, NFPA 30A (motor fuel dispensing), state inspection standards" },
  "data-center": { label: "Data Centers", icon: "🖥️", hazards: "electrical contact (high voltage switchgear, PDUs, UPS), arc flash (critical — high incident energy at main switchboards), battery room hazards (hydrogen gas, sulfuric acid, thermal runaway from lithium-ion), confined space (sub-floor plenums, cable vaults), elevated work (overhead cable trays, ceiling-mounted equipment), noise exposure (CRAC/CRAH units, generators, UPS), diesel generator fuel storage, halon/clean agent suppression system safety, hot/cold aisle temperature extremes, ergonomic strain (server lifting, repetitive racking), lock-out/tag-out (redundant power feeds create complex isolation), contractor management (frequent vendor access)", standards: "29 CFR 1910 (General Industry), NFPA 70E, NFPA 75 (IT Equipment), NFPA 76 (Telecom Facilities), ASHRAE TC 9.9, OSHA electrical standards" },
  aviation: { label: "Aviation", icon: "✈️", hazards: "aircraft ground operations (propeller/rotor strike, jet blast/ingestion, aircraft movement areas), fueling operations (Jet-A, AVGAS — static discharge, spill prevention), hangar fire protection (large-volume flammable vapor, foam suppression), fall protection (aircraft surfaces, maintenance stands, wing work), confined space (fuel tanks, wheel wells, cargo compartments), noise exposure (APU, engine run-ups, ground power units, riveting), hazardous materials (de-icing fluids, hydraulic fluid, paint stripping compounds, chromated primers, composite dust), FOD (foreign object debris/damage) prevention, ergonomic hazards (awkward postures in tight fuselage spaces, overhead work), electrical hazards (aircraft electrical systems, ground power), respiratory hazards (composite sanding dust, paint/primer fumes, fuel vapor), hearing conservation (ramp operations 95-130 dBA)", standards: "29 CFR 1910 (General Industry), 29 CFR 1926 (construction on airport projects), FAA Order 3900.19C/D (FAA facility safety), FAA AC 150/5210-series (airport operations), NFPA 409 (aircraft hangars), NFPA 407 (aircraft fuel servicing), 14 CFR Part 139 (airport certification), OSHA 29 CFR 1910.106 (flammable liquids)" },
};

// ─── EHS Readiness Check Tool ───

// Universal EHS audit sections (apply to ALL industries)
const AUDIT_SECTIONS_UNIVERSAL = [
  {
    id: "mgmt", title: "Management Leadership & Employee Participation", icon: "👔",
    items: [
      { id: "mgmt-1", text: "Written safety and health policy signed by senior management", reg: "OSHA Recommended Practices", severity: "Major" },
      { id: "mgmt-2", text: "Safety responsibilities defined for managers, supervisors, and employees", reg: "OSHA Recommended Practices", severity: "Major" },
      { id: "mgmt-3", text: "Safety goals established with measurable objectives", reg: "OSHA Recommended Practices", severity: "Minor" },
      { id: "mgmt-4", text: "Employees can report hazards without fear of retaliation", reg: "29 CFR 1904.36 / 11(c)", severity: "Critical" },
      { id: "mgmt-5", text: "Safety committee or employee participation mechanism in place", reg: "OSHA Recommended Practices", severity: "Minor" },
    ],
  },
  {
    id: "hazid", title: "Hazard Identification & Assessment", icon: "🔍",
    items: [
      { id: "hazid-1", text: "Documented workplace hazard assessment completed", reg: "29 CFR 1910.132(d)", severity: "Critical" },
      { id: "hazid-2", text: "Job Hazard Analysis (JHA) completed for high-risk tasks", reg: "OSHA Recommended Practices", severity: "Major" },
      { id: "hazid-3", text: "Regular workplace inspections conducted and documented", reg: "29 CFR 1903 / General Duty", severity: "Major" },
      { id: "hazid-4", text: "Near-miss and incident investigation process established", reg: "29 CFR 1904 / General Duty", severity: "Major" },
      { id: "hazid-5", text: "Hazard correction tracking system in place", reg: "OSHA Recommended Practices", severity: "Minor" },
    ],
  },
  {
    id: "hazcom", title: "Hazard Communication (HazCom)", icon: "☣️",
    items: [
      { id: "hc-1", text: "Written HazCom program current and available", reg: "29 CFR 1910.1200(e)", severity: "Critical" },
      { id: "hc-2", text: "Safety Data Sheets accessible to all employees on all shifts", reg: "29 CFR 1910.1200(g)(8)", severity: "Critical" },
      { id: "hc-3", text: "Chemical inventory list maintained and current", reg: "29 CFR 1910.1200(e)(1)", severity: "Major" },
      { id: "hc-4", text: "All containers labeled per GHS requirements", reg: "29 CFR 1910.1200(f)", severity: "Critical" },
      { id: "hc-5", text: "HazCom training provided at hire and when new hazards introduced", reg: "29 CFR 1910.1200(h)", severity: "Major" },
    ],
  },
  {
    id: "eap", title: "Emergency Action Plan", icon: "🚨",
    items: [
      { id: "eap-1", text: "Written Emergency Action Plan in place", reg: "29 CFR 1910.38", severity: "Critical" },
      { id: "eap-2", text: "Evacuation routes posted and assembly points designated", reg: "29 CFR 1910.38(c)", severity: "Critical" },
      { id: "eap-3", text: "Emergency coordinator and alternate designated by name", reg: "29 CFR 1910.38(c)(5)", severity: "Major" },
      { id: "eap-4", text: "Evacuation drills conducted at least annually", reg: "29 CFR 1910.38(d)", severity: "Major" },
      { id: "eap-5", text: "Severe weather and active threat procedures addressed", reg: "DHS / OSHA Guidelines", severity: "Minor" },
    ],
  },
  {
    id: "fire", title: "Fire Prevention", icon: "🔥",
    items: [
      { id: "fire-1", text: "Written Fire Prevention Plan in place", reg: "29 CFR 1910.39", severity: "Critical" },
      { id: "fire-2", text: "Fire extinguishers inspected monthly and serviced annually", reg: "29 CFR 1910.157(e)", severity: "Critical" },
      { id: "fire-3", text: "Sprinkler/suppression systems inspected per NFPA 25", reg: "NFPA 25", severity: "Critical" },
      { id: "fire-4", text: "Hot work permit system in place where applicable", reg: "29 CFR 1910.252(a)", severity: "Major" },
      { id: "fire-5", text: "Flammable/combustible materials stored in approved cabinets", reg: "29 CFR 1910.106(d)", severity: "Major" },
    ],
  },
  {
    id: "ppe", title: "Personal Protective Equipment", icon: "🦺",
    items: [
      { id: "ppe-1", text: "PPE hazard assessment documented (certification)", reg: "29 CFR 1910.132(d)(2)", severity: "Critical" },
      { id: "ppe-2", text: "Appropriate PPE provided at no cost to employees", reg: "29 CFR 1910.132(h)", severity: "Critical" },
      { id: "ppe-3", text: "PPE training documented (what, when, why, how)", reg: "29 CFR 1910.132(f)", severity: "Major" },
      { id: "ppe-4", text: "PPE inspected, maintained, and replaced when defective", reg: "29 CFR 1910.132(e)", severity: "Major" },
      { id: "ppe-5", text: "Eye wash and safety showers provided where required", reg: "29 CFR 1910.151(c)", severity: "Critical" },
    ],
  },
  {
    id: "record", title: "Recordkeeping & Reporting", icon: "🩹",
    items: [
      { id: "rec-1", text: "OSHA 300 Log maintained and current", reg: "29 CFR 1904.29", severity: "Critical" },
      { id: "rec-2", text: "300A summary posted Feb 1 – Apr 30, signed by executive", reg: "29 CFR 1904.32", severity: "Critical" },
      { id: "rec-3", text: "Fatality reporting (8 hr) and severe injury reporting (24 hr) procedure in place", reg: "29 CFR 1904.39", severity: "Critical" },
      { id: "rec-4", text: "Recordability determination criteria documented", reg: "29 CFR 1904.7", severity: "Major" },
      { id: "rec-5", text: "Electronic 300A submission completed if applicable", reg: "29 CFR 1904.41", severity: "Major" },
    ],
  },
  {
    id: "train", title: "Training & Competency", icon: "🎓",
    items: [
      { id: "tr-1", text: "New employee safety orientation program documented", reg: "29 CFR 1910.332 / General Duty", severity: "Major" },
      { id: "tr-2", text: "Job-specific hazard training documented for each role", reg: "Various OSHA standards", severity: "Major" },
      { id: "tr-3", text: "Annual refresher training schedule maintained", reg: "Various OSHA standards", severity: "Minor" },
      { id: "tr-4", text: "Training records retained (who, what, when, trainer)", reg: "29 CFR 1910.1200(h) / Various", severity: "Major" },
      { id: "tr-5", text: "Competency verification after training (practical/written)", reg: "OSHA Recommended Practices", severity: "Minor" },
    ],
  },
  {
    id: "walking", title: "Walking/Working Surfaces & Housekeeping", icon: "🧹",
    items: [
      { id: "ww-1", text: "Aisles and exits kept clear and unobstructed", reg: "29 CFR 1910.22(a)", severity: "Critical" },
      { id: "ww-2", text: "Floor surfaces clean, dry, and in good repair", reg: "29 CFR 1910.22(a)(2)", severity: "Major" },
      { id: "ww-3", text: "Fixed ladders and stairways meet OSHA requirements", reg: "29 CFR 1910.23-28", severity: "Major" },
      { id: "ww-4", text: "Guardrails provided at open-sided platforms ≥4 feet", reg: "29 CFR 1910.29", severity: "Critical" },
      { id: "ww-5", text: "Good housekeeping practices maintained throughout facility", reg: "29 CFR 1910.22 / General Duty", severity: "Minor" },
    ],
  },
];

// Industry-specific audit sections (added to universal based on selected industry)
const AUDIT_SECTIONS_INDUSTRY = {
  manufacturing: [
    { id: "mfg-loto", title: "Lockout/Tagout (Energy Control)", icon: "🔒", items: [
      { id: "ml-1", text: "Written energy control program with machine-specific procedures", reg: "29 CFR 1910.147(c)(4)", severity: "Critical" },
      { id: "ml-2", text: "All energy sources identified per machine (electrical, hydraulic, pneumatic, gravitational, thermal)", reg: "29 CFR 1910.147(c)(4)(i)", severity: "Critical" },
      { id: "ml-3", text: "Annual periodic inspections conducted by authorized employee", reg: "29 CFR 1910.147(c)(6)", severity: "Major" },
      { id: "ml-4", text: "Authorized and affected employees trained and documented", reg: "29 CFR 1910.147(c)(7)", severity: "Major" },
      { id: "ml-5", text: "Contractor coordination procedures for servicing/maintenance", reg: "29 CFR 1910.147(f)(2)", severity: "Major" },
    ]},
    { id: "mfg-guard", title: "Machine Guarding", icon: "⚙️", items: [
      { id: "mg-1", text: "Point-of-operation guards in place on all applicable machines", reg: "29 CFR 1910.212(a)(1)", severity: "Critical" },
      { id: "mg-2", text: "Rotating parts, belts, pulleys, and shafts guarded", reg: "29 CFR 1910.219", severity: "Critical" },
      { id: "mg-3", text: "Guards secured and not easily bypassed", reg: "29 CFR 1910.212(a)(2)", severity: "Major" },
      { id: "mg-4", text: "Abrasive wheel guards and work rests properly adjusted", reg: "29 CFR 1910.215", severity: "Major" },
    ]},
    { id: "mfg-pit", title: "Powered Industrial Trucks", icon: "🚜", items: [
      { id: "mp-1", text: "Forklift operators trained, evaluated, and certified", reg: "29 CFR 1910.178(l)", severity: "Critical" },
      { id: "mp-2", text: "Refresher training conducted every 3 years", reg: "29 CFR 1910.178(l)(4)(iii)", severity: "Major" },
      { id: "mp-3", text: "Pre-shift inspections documented", reg: "29 CFR 1910.178(q)(7)", severity: "Major" },
      { id: "mp-4", text: "Pedestrian traffic management in forklift areas", reg: "29 CFR 1910.176(a)", severity: "Major" },
    ]},
    { id: "mfg-noise", title: "Noise / Hearing Conservation", icon: "🔊", items: [
      { id: "mn-1", text: "Noise monitoring conducted — areas above 85 dBA identified", reg: "29 CFR 1910.95(d)", severity: "Critical" },
      { id: "mn-2", text: "Audiometric testing program for exposed employees (baseline + annual)", reg: "29 CFR 1910.95(g)", severity: "Critical" },
      { id: "mn-3", text: "Hearing protection available and variety offered", reg: "29 CFR 1910.95(i)", severity: "Major" },
      { id: "mn-4", text: "Engineering controls evaluated for noise reduction", reg: "29 CFR 1910.95(b)(1)", severity: "Major" },
    ]},
  ],
  construction: [
    { id: "con-fall", title: "Fall Protection", icon: "🧗", items: [
      { id: "cf-1", text: "Fall protection provided at 6 feet (general) or as required", reg: "29 CFR 1926.501(b)(1)", severity: "Critical" },
      { id: "cf-2", text: "Competent person designated for fall protection", reg: "29 CFR 1926.502(d)(8)", severity: "Critical" },
      { id: "cf-3", text: "Anchorage points identified and rated to 5,000 lbs", reg: "29 CFR 1926.502(d)(15)", severity: "Critical" },
      { id: "cf-4", text: "Written rescue plan for each area where fall arrest is used", reg: "29 CFR 1926.502(d)(20)", severity: "Critical" },
      { id: "cf-5", text: "PFAS equipment inspected before each use", reg: "29 CFR 1926.502(d)(21)", severity: "Major" },
    ]},
    { id: "con-scaffold", title: "Scaffolding", icon: "🏗️", items: [
      { id: "cs-1", text: "Scaffolds erected under direction of competent person", reg: "29 CFR 1926.451(f)(7)", severity: "Critical" },
      { id: "cs-2", text: "Scaffold capacity rated and not overloaded", reg: "29 CFR 1926.451(a)", severity: "Critical" },
      { id: "cs-3", text: "Guardrails, midrails, and toeboards in place", reg: "29 CFR 1926.451(g)", severity: "Critical" },
      { id: "cs-4", text: "Safe access (ladder/stairway) provided", reg: "29 CFR 1926.451(e)", severity: "Major" },
    ]},
    { id: "con-exc", title: "Excavation & Trenching", icon: "🕳️", items: [
      { id: "ce-1", text: "Protective system used for excavations ≥5 feet deep", reg: "29 CFR 1926.652", severity: "Critical" },
      { id: "ce-2", text: "Competent person inspects excavation daily and after rain", reg: "29 CFR 1926.651(k)", severity: "Critical" },
      { id: "ce-3", text: "Underground utilities located before digging", reg: "29 CFR 1926.651(b)", severity: "Critical" },
      { id: "ce-4", text: "Means of egress (ladder/ramp) within 25 feet of workers", reg: "29 CFR 1926.651(c)(2)", severity: "Major" },
    ]},
    { id: "con-elec", title: "Electrical (Construction)", icon: "⚡", items: [
      { id: "cel-1", text: "GFCIs used on all temporary power / assured grounding program", reg: "29 CFR 1926.405(a)(2)(ii)", severity: "Critical" },
      { id: "cel-2", text: "Minimum approach distances maintained from overhead lines", reg: "29 CFR 1926.416(a)", severity: "Critical" },
      { id: "cel-3", text: "Electrical equipment inspected before use", reg: "29 CFR 1926.404(b)(1)", severity: "Major" },
    ]},
  ],
  healthcare: [
    { id: "hc-bbp", title: "Bloodborne Pathogens", icon: "🩸", items: [
      { id: "hb-1", text: "Written Exposure Control Plan reviewed annually", reg: "29 CFR 1910.1030(c)", severity: "Critical" },
      { id: "hb-2", text: "Hepatitis B vaccination offered within 10 working days", reg: "29 CFR 1910.1030(f)(2)", severity: "Critical" },
      { id: "hb-3", text: "Engineering controls (safety sharps) evaluated annually with frontline input", reg: "29 CFR 1910.1030(d)(2)", severity: "Critical" },
      { id: "hb-4", text: "Post-exposure evaluation and follow-up procedure documented", reg: "29 CFR 1910.1030(f)(3)", severity: "Critical" },
      { id: "hb-5", text: "Sharps injury log maintained with required detail", reg: "29 CFR 1910.1030(h)(5)", severity: "Major" },
    ]},
    { id: "hc-ergo", title: "Patient Handling / Ergonomics", icon: "🏥", items: [
      { id: "he-1", text: "Safe patient handling program with mechanical lift equipment", reg: "OSHA Safe Patient Handling Guidelines", severity: "Major" },
      { id: "he-2", text: "Ergonomic job hazard analysiss for patient care tasks", reg: "General Duty Clause", severity: "Major" },
      { id: "he-3", text: "Lift equipment maintained and staff trained on proper use", reg: "OSHA Guidelines", severity: "Major" },
    ]},
    { id: "hc-violence", title: "Workplace Violence Prevention", icon: "🛡️", items: [
      { id: "hv-1", text: "Written workplace violence prevention program", reg: "OSHA Guidelines / General Duty", severity: "Major" },
      { id: "hv-2", text: "Job hazard analysis for violence-prone areas completed", reg: "OSHA Guidelines", severity: "Major" },
      { id: "hv-3", text: "Incident reporting and post-incident response procedures", reg: "OSHA Guidelines", severity: "Major" },
      { id: "hv-4", text: "Staff training on de-escalation and emergency response", reg: "OSHA Guidelines", severity: "Minor" },
    ]},
  ],
  "commercial-re": [
    { id: "cre-iaq", title: "Indoor Air Quality", icon: "🌬️", items: [
      { id: "ci-1", text: "HVAC system maintained per manufacturer specs", reg: "ASHRAE 62.1 / General Duty", severity: "Major" },
      { id: "ci-2", text: "IAQ complaints documented and investigated", reg: "General Duty Clause", severity: "Major" },
      { id: "ci-3", text: "Cooling towers maintained for Legionella prevention", reg: "ASHRAE 188", severity: "Critical" },
    ]},
    { id: "cre-asb", title: "Asbestos / Lead (Older Buildings)", icon: "🏢", items: [
      { id: "ca-1", text: "Asbestos survey conducted for pre-1981 buildings", reg: "EPA AHERA / 40 CFR 763", severity: "Critical" },
      { id: "ca-2", text: "Asbestos management plan in place if ACM present", reg: "29 CFR 1910.1001 / 40 CFR 763", severity: "Critical" },
      { id: "ca-3", text: "Lead paint assessment for pre-1978 buildings", reg: "EPA 40 CFR 745", severity: "Major" },
      { id: "ca-4", text: "Contractors notified of ACM/lead locations before work", reg: "29 CFR 1926.1101(k)(2)", severity: "Critical" },
    ]},
    { id: "cre-cont", title: "Contractor Safety Management", icon: "📋", items: [
      { id: "cc-1", text: "Contractor safety prequalification process", reg: "OSHA Multi-Employer Policy", severity: "Major" },
      { id: "cc-2", text: "Contractor coordination for hot work, LOTO, confined space", reg: "Various OSHA standards", severity: "Major" },
      { id: "cc-3", text: "Injury recordkeeping responsibility defined in contracts", reg: "29 CFR 1904.31", severity: "Major" },
    ]},
  ],
  warehousing: [
    { id: "wh-pit", title: "Powered Industrial Trucks", icon: "🚜", items: [
      { id: "wp-1", text: "All operators trained, evaluated, and certified", reg: "29 CFR 1910.178(l)", severity: "Critical" },
      { id: "wp-2", text: "Pre-shift inspections documented daily", reg: "29 CFR 1910.178(q)(7)", severity: "Major" },
      { id: "wp-3", text: "Pedestrian traffic routes separated from forklift paths", reg: "29 CFR 1910.176(a)", severity: "Critical" },
      { id: "wp-4", text: "Battery charging areas ventilated and equipped with PPE", reg: "29 CFR 1910.178(g)", severity: "Major" },
    ]},
    { id: "wh-dock", title: "Loading Dock Safety", icon: "📦", items: [
      { id: "wd-1", text: "Dock edges protected with guardrails or chains when trailer absent", reg: "29 CFR 1910.28(b)(1)", severity: "Critical" },
      { id: "wd-2", text: "Wheel chocks and/or vehicle restraints used during loading", reg: "29 CFR 1910.178(k)(1)", severity: "Critical" },
      { id: "wd-3", text: "Dock levelers inspected and maintained", reg: "29 CFR 1910.22 / ANSI MH30.2", severity: "Major" },
    ]},
    { id: "wh-ergo", title: "Ergonomics & Material Handling", icon: "💪", items: [
      { id: "we-1", text: "Lifting hazard assessments completed for manual handling tasks", reg: "General Duty Clause / NIOSH", severity: "Major" },
      { id: "we-2", text: "Mechanical aids available (pallet jacks, conveyors, lift tables)", reg: "General Duty Clause", severity: "Major" },
      { id: "we-3", text: "Employees trained on safe lifting techniques", reg: "OSHA Ergonomics Guidelines", severity: "Minor" },
    ]},
  ],
  energy: [
    { id: "en-elec", title: "Electrical Power Safety", icon: "⚡", items: [
      { id: "ee-1", text: "Arc flash job hazard analysis completed and equipment labeled", reg: "NFPA 70E Article 130.5 / 29 CFR 1910.335", severity: "Critical" },
      { id: "ee-2", text: "Qualified electrical workers designated and trained on NFPA 70E", reg: "29 CFR 1910.269 / NFPA 70E", severity: "Critical" },
      { id: "ee-3", text: "Arc-rated PPE selected based on incident energy analysis", reg: "NFPA 70E Article 130.7", severity: "Critical" },
      { id: "ee-4", text: "Energized work permits used for justified live work", reg: "NFPA 70E Article 130.2", severity: "Major" },
      { id: "ee-5", text: "Live-dead-live verification procedures followed", reg: "29 CFR 1910.269(d)", severity: "Critical" },
    ]},
    { id: "en-cs", title: "Confined Space", icon: "🕳️", items: [
      { id: "ecs-1", text: "Confined spaces identified, evaluated, and labeled", reg: "29 CFR 1910.146(c)(1)", severity: "Critical" },
      { id: "ecs-2", text: "Written permit-required confined space program", reg: "29 CFR 1910.146(c)(4)", severity: "Critical" },
      { id: "ecs-3", text: "Atmospheric testing conducted before and during entry", reg: "29 CFR 1910.146(d)(5)", severity: "Critical" },
      { id: "ecs-4", text: "Rescue team or service designated and available", reg: "29 CFR 1910.146(d)(9)", severity: "Critical" },
    ]},
  ],
  automotive: [
    { id: "auto-lift", title: "Vehicle Lift Safety", icon: "🔧", items: [
      { id: "al-1", text: "Vehicle lifts inspected annually by qualified inspector", reg: "ANSI/ALI ALOIM", severity: "Critical" },
      { id: "al-2", text: "Operators trained on lift operation and capacity limits", reg: "General Duty Clause", severity: "Major" },
      { id: "al-3", text: "Lift arms and pads in good condition, positioned at manufacturer lift points", reg: "ANSI/ALI ALOIM", severity: "Major" },
    ]},
    { id: "auto-vent", title: "Exhaust Ventilation", icon: "🌬️", items: [
      { id: "av-1", text: "Vehicle exhaust extraction system operational in enclosed bays", reg: "29 CFR 1910.1000 / General Duty", severity: "Critical" },
      { id: "av-2", text: "CO monitoring available for enclosed work areas", reg: "29 CFR 1910.1000 Table Z-1", severity: "Major" },
      { id: "av-3", text: "Paint booth ventilation and filtration operational", reg: "29 CFR 1910.94(c) / NFPA 33", severity: "Critical" },
    ]},
    { id: "auto-flam", title: "Flammable Liquids & Storage", icon: "🛢️", items: [
      { id: "af-1", text: "Flammable liquids stored in approved cabinets/rooms", reg: "29 CFR 1910.106(d) / NFPA 30", severity: "Critical" },
      { id: "af-2", text: "No smoking enforced near fuel dispensing and storage", reg: "29 CFR 1910.106(b)(6)", severity: "Major" },
      { id: "af-3", text: "Waste oil and used fluids stored and disposed properly", reg: "40 CFR 279 / EPA Used Oil", severity: "Major" },
    ]},
  ],
  "government-municipal": [
    { id: "gov-cs", title: "Confined Space (Water/Wastewater)", icon: "🕳️", items: [
      { id: "gc-1", text: "Permit-required confined spaces identified (manholes, vaults, tanks)", reg: "29 CFR 1910.146", severity: "Critical" },
      { id: "gc-2", text: "Atmospheric testing equipment calibrated and available", reg: "29 CFR 1910.146(d)(5)", severity: "Critical" },
      { id: "gc-3", text: "Rescue team trained and equipped for confined space rescue", reg: "29 CFR 1910.146(d)(9)", severity: "Critical" },
    ]},
    { id: "gov-road", title: "Public Works / Roadway Safety", icon: "🚧", items: [
      { id: "gr-1", text: "Traffic control plan (TCP) used for road work zones", reg: "MUTCD / 29 CFR 1926.202", severity: "Critical" },
      { id: "gr-2", text: "High-visibility apparel (Class 2/3) provided and worn", reg: "29 CFR 1926.201 / ANSI 107", severity: "Critical" },
      { id: "gr-3", text: "Flaggers trained and certified where required", reg: "MUTCD Part 6", severity: "Major" },
    ]},
    { id: "gov-heat", title: "Heat Illness Prevention", icon: "🌡️", items: [
      { id: "gh-1", text: "Heat illness prevention plan in place for outdoor workers", reg: "OSHA Heat NEP / General Duty", severity: "Major" },
      { id: "gh-2", text: "Water, rest, and shade provided during high heat", reg: "OSHA Heat Guidelines", severity: "Critical" },
      { id: "gh-3", text: "Supervisors and employees trained on heat illness recognition", reg: "OSHA Heat Guidelines", severity: "Major" },
    ]},
  ],
  "food-service": [
    { id: "fs-slip", title: "Slip, Trip & Fall Prevention", icon: "⚠️", items: [
      { id: "fsl-1", text: "Non-slip flooring or mats in wet/greasy areas", reg: "29 CFR 1910.22(a)", severity: "Major" },
      { id: "fsl-2", text: "Spill cleanup procedures and supplies readily available", reg: "29 CFR 1910.22 / General Duty", severity: "Major" },
      { id: "fsl-3", text: "Wet floor signage used when mopping/spills", reg: "29 CFR 1910.22 / General Duty", severity: "Minor" },
    ]},
    { id: "fs-burn", title: "Burn & Cut Prevention", icon: "🔪", items: [
      { id: "fsb-1", text: "Fryer and oven safety guards functional", reg: "General Duty Clause", severity: "Major" },
      { id: "fsb-2", text: "Cut-resistant gloves available for knife work", reg: "29 CFR 1910.132", severity: "Minor" },
      { id: "fsb-3", text: "First aid kit stocked and accessible in kitchen", reg: "29 CFR 1910.151", severity: "Major" },
    ]},
    { id: "fs-vent", title: "Kitchen Ventilation", icon: "🌬️", items: [
      { id: "fsv-1", text: "Kitchen hood and exhaust system inspected and cleaned per NFPA 96", reg: "NFPA 96", severity: "Critical" },
      { id: "fsv-2", text: "Fire suppression system in hood serviced semi-annually", reg: "NFPA 96 / NFPA 17A", severity: "Critical" },
    ]},
  ],
  laboratory: [
    { id: "lab-chp", title: "Chemical Hygiene Plan", icon: "📋", items: [
      { id: "lc-1", text: "Written Chemical Hygiene Plan (CHP) current and accessible", reg: "29 CFR 1910.1450(e)", severity: "Critical" },
      { id: "lc-2", text: "Chemical Hygiene Officer (CHO) designated with defined responsibilities", reg: "29 CFR 1910.1450(e)(3)", severity: "Critical" },
      { id: "lc-3", text: "Standard operating procedures for hazardous chemical use documented", reg: "29 CFR 1910.1450(e)(3)(i)", severity: "Critical" },
      { id: "lc-4", text: "Criteria for exposure monitoring and medical consultations defined", reg: "29 CFR 1910.1450(e)(3)(ii)", severity: "Major" },
      { id: "lc-5", text: "CHP reviewed and updated annually", reg: "29 CFR 1910.1450(e)(4)", severity: "Major" },
      { id: "lc-6", text: "Provisions for particularly hazardous substances (carcinogens, reproductive toxins, high acute toxicity)", reg: "29 CFR 1910.1450(e)(3)(viii)", severity: "Critical" },
    ]},
    { id: "lab-fume", title: "Fume Hoods & Ventilation", icon: "💨", items: [
      { id: "lf-1", text: "Fume hoods tested annually for face velocity (≥100 fpm average)", reg: "29 CFR 1910.1450(e)(3)(iv)", severity: "Critical" },
      { id: "lf-2", text: "Fume hood testing records maintained and posted on each hood", reg: "29 CFR 1910.1450(e)(3)(iv)", severity: "Major" },
      { id: "lf-3", text: "Continuous monitoring device (vaneometer, manometer, or alarm) on each hood", reg: "AIHA Z9.5", severity: "Major" },
      { id: "lf-4", text: "Sash height markings indicating proper operating position", reg: "Best Practice / AIHA Z9.5", severity: "Minor" },
      { id: "lf-5", text: "Local exhaust ventilation for operations not suitable for fume hoods (e.g., perchloric acid hoods, glove boxes)", reg: "29 CFR 1910.1450(e)(3)(iv)", severity: "Major" },
    ]},
    { id: "lab-chem", title: "Chemical Storage & Handling", icon: "🧪", items: [
      { id: "ls-1", text: "Chemicals stored by hazard class compatibility (not alphabetically)", reg: "29 CFR 1910.106 / NFPA 45", severity: "Critical" },
      { id: "ls-2", text: "Flammable liquids stored in approved flammable storage cabinets", reg: "29 CFR 1910.106(d)(3)", severity: "Critical" },
      { id: "ls-3", text: "Peroxide-forming chemicals dated on receipt and opening, tested on schedule", reg: "CHP / Best Practice", severity: "Critical" },
      { id: "ls-4", text: "All secondary containers labeled with chemical name and hazard", reg: "29 CFR 1910.1200(f)(6)", severity: "Major" },
      { id: "ls-5", text: "SDSs accessible for all chemicals in the laboratory", reg: "29 CFR 1910.1200(g)(8)", severity: "Critical" },
      { id: "ls-6", text: "Chemical inventory current and reconciled at least annually", reg: "29 CFR 1910.1450(e)(3)(i) / NFPA 45", severity: "Major" },
      { id: "ls-7", text: "Compressed gas cylinders secured, capped when not in use, and stored by compatibility", reg: "29 CFR 1910.101 / CGA P-1", severity: "Critical" },
    ]},
    { id: "lab-waste", title: "Laboratory Waste Management", icon: "🗑️", items: [
      { id: "lw-1", text: "Hazardous waste containers labeled with 'Hazardous Waste,' contents, and accumulation start date", reg: "40 CFR 262.15", severity: "Critical" },
      { id: "lw-2", text: "Waste containers closed except when actively adding waste", reg: "40 CFR 262.15(a)(1)", severity: "Major" },
      { id: "lw-3", text: "Satellite accumulation areas limited to 55 gallons per waste stream", reg: "40 CFR 262.15(a)(2)", severity: "Major" },
      { id: "lw-4", text: "Biohazardous waste autoclaved or treated before disposal", reg: "OSHA 1910.1030 / State regulations", severity: "Critical" },
      { id: "lw-5", text: "Sharps disposed in puncture-resistant containers", reg: "29 CFR 1910.1030(d)(4)(iii)(A)", severity: "Critical" },
      { id: "lw-6", text: "No drain disposal of hazardous chemicals", reg: "40 CFR 403 / Local pretreatment", severity: "Critical" },
    ]},
    { id: "lab-emerg", title: "Lab Emergency Equipment", icon: "🚿", items: [
      { id: "le-1", text: "Emergency eyewash stations within 10 seconds travel of corrosive use areas", reg: "29 CFR 1910.151(c) / ANSI Z358.1", severity: "Critical" },
      { id: "le-2", text: "Safety showers accessible and tested weekly (documented)", reg: "ANSI Z358.1", severity: "Critical" },
      { id: "le-3", text: "Spill kits appropriate to chemicals in use and readily accessible", reg: "29 CFR 1910.120 / CHP", severity: "Major" },
      { id: "le-4", text: "Fire extinguishers appropriate to lab hazards (Class B/C minimum)", reg: "29 CFR 1910.157", severity: "Major" },
      { id: "le-5", text: "Emergency shutoffs for gas, electrical, and ventilation clearly marked", reg: "NFPA 45 / Building code", severity: "Major" },
      { id: "le-6", text: "First aid kit stocked and accessible in each lab area", reg: "29 CFR 1910.151(b)", severity: "Minor" },
    ]},
    { id: "lab-bio", title: "Biosafety", icon: "🦠", items: [
      { id: "lb-1", text: "Institutional Biosafety Committee (IBC) reviews protocols involving biohazards", reg: "NIH Guidelines / 42 CFR 73", severity: "Critical" },
      { id: "lb-2", text: "Biosafety level (BSL) posted at lab entrance with agent information", reg: "CDC/NIH BMBL", severity: "Major" },
      { id: "lb-3", text: "Biological safety cabinets (BSCs) certified annually", reg: "NSF 49 / CDC/NIH BMBL", severity: "Critical" },
      { id: "lb-4", text: "Exposure control plan for bloodborne pathogens in applicable labs", reg: "29 CFR 1910.1030(c)", severity: "Critical" },
      { id: "lb-5", text: "Decontamination procedures documented for work surfaces and equipment", reg: "CDC/NIH BMBL", severity: "Major" },
    ]},
    { id: "lab-rad", title: "Radiation Safety", icon: "☢️", items: [
      { id: "lr-1", text: "Radiation Safety Officer (RSO) designated with current license", reg: "10 CFR 20 / NRC", severity: "Critical" },
      { id: "lr-2", text: "Personnel dosimetry badges issued to radiation workers and monitored", reg: "10 CFR 20.1502", severity: "Critical" },
      { id: "lr-3", text: "Radioactive material areas posted with appropriate signage", reg: "10 CFR 20.1902", severity: "Major" },
      { id: "lr-4", text: "Radiation surveys conducted at required frequencies", reg: "10 CFR 20.1501", severity: "Major" },
      { id: "lr-5", text: "Radioactive waste segregated and disposed through licensed broker", reg: "10 CFR 20.2001", severity: "Critical" },
    ]},
    { id: "lab-ppe", title: "Lab PPE & Training", icon: "🥽", items: [
      { id: "lp-1", text: "Lab-specific PPE assessment documented (splash goggles, gloves, lab coat)", reg: "29 CFR 1910.132(d)", severity: "Critical" },
      { id: "lp-2", text: "Chemical-resistant gloves selected based on chemical compatibility (not one-size-fits-all)", reg: "29 CFR 1910.138 / CHP", severity: "Major" },
      { id: "lp-3", text: "Lab coats provided and laundered by employer (not taken home)", reg: "29 CFR 1910.1450(e)(3)(vii)", severity: "Major" },
      { id: "lp-4", text: "Initial and annual lab safety training documented for all lab personnel", reg: "29 CFR 1910.1450(f)", severity: "Critical" },
      { id: "lp-5", text: "Training covers CHP, specific chemical hazards, emergency procedures, and SDS access", reg: "29 CFR 1910.1450(f)(1)-(4)", severity: "Major" },
      { id: "lp-6", text: "Contact lenses policy defined (permitted with splash goggles)", reg: "CHP / Best Practice", severity: "Minor" },
    ]},
  ],
  aviation: [
    { id: "av-ground", title: "Ground Operations Safety", icon: "✈️", items: [
      { id: "ag-1", text: "Written ground safety plan covering aircraft movement areas, ramp operations, and vehicle operations", reg: "FAA AC 150/5210-20 / 14 CFR 139.329", severity: "Critical" },
      { id: "ag-2", text: "FOD prevention program with documented walk-downs and reporting", reg: "FAA AC 150/5210-24 / 14 CFR 139.337", severity: "Critical" },
      { id: "ag-3", text: "Vehicle/pedestrian training for airfield movement area access", reg: "14 CFR 139.303(b)", severity: "Critical" },
      { id: "ag-4", text: "High-visibility PPE (vests/clothing) requirements for ramp personnel defined", reg: "14 CFR 139.329 / OSHA 1910.132", severity: "Major" },
      { id: "ag-5", text: "Jet blast/propeller/rotor hazard zones posted and enforced", reg: "FAA AC 150/5210-20", severity: "Critical" },
    ]},
    { id: "av-fuel", title: "Fueling Operations", icon: "⛽", items: [
      { id: "af-1", text: "Written fuel handling procedures per NFPA 407", reg: "NFPA 407 / 14 CFR 139.321", severity: "Critical" },
      { id: "af-2", text: "Bonding and grounding procedures for fueling operations documented and followed", reg: "NFPA 407 / 29 CFR 1910.106", severity: "Critical" },
      { id: "af-3", text: "Fuel spill response procedures and equipment in place", reg: "40 CFR 112 / 14 CFR 139.321", severity: "Critical" },
      { id: "af-4", text: "Fueling personnel trained and current on fire safety and spill response", reg: "NFPA 407 / 14 CFR 139.321", severity: "Major" },
      { id: "af-5", text: "Dead-man controls on fueling equipment functional and tested", reg: "NFPA 407", severity: "Major" },
    ]},
    { id: "av-hangar", title: "Hangar Safety", icon: "🏗️", items: [
      { id: "ah-1", text: "Hangar fire protection system (foam/deluge) inspected and current per NFPA 409", reg: "NFPA 409 / 14 CFR 139.317", severity: "Critical" },
      { id: "ah-2", text: "Hangar ventilation adequate for fuel vapor and paint fume control", reg: "29 CFR 1910.94 / NFPA 409", severity: "Critical" },
      { id: "ah-3", text: "Fall protection for work on aircraft surfaces, stands, and docks", reg: "29 CFR 1910.28 / 1910.140", severity: "Critical" },
      { id: "ah-4", text: "Flammable liquid storage within hangar compliant with NFPA 409 limits", reg: "NFPA 409 Section 7.3", severity: "Major" },
      { id: "ah-5", text: "Aircraft jacking and shoring procedures documented with rated equipment", reg: "OEM maintenance manual / OSHA", severity: "Major" },
    ]},
    { id: "av-noise", title: "Aviation Noise & Hearing", icon: "🔊", items: [
      { id: "an-1", text: "Noise exposure monitoring conducted for ramp, maintenance, and run-up operations", reg: "29 CFR 1910.95(d)", severity: "Critical" },
      { id: "an-2", text: "Double hearing protection required for engine run-ups and APU operations (>100 dBA)", reg: "29 CFR 1910.95(i)", severity: "Critical" },
      { id: "an-3", text: "Hearing conservation program includes all employees at/above 85 dBA TWA", reg: "29 CFR 1910.95(c)", severity: "Critical" },
      { id: "an-4", text: "Annual audiometric testing current for all enrolled employees", reg: "29 CFR 1910.95(g)", severity: "Major" },
    ]},
    { id: "av-hazmat", title: "Aviation HazMat", icon: "☣️", items: [
      { id: "am-1", text: "SDS accessible for all aviation chemicals (de-icing fluid, hydraulic fluid, sealants, paints, primers)", reg: "29 CFR 1910.1200(g)(8)", severity: "Critical" },
      { id: "am-2", text: "Chromated primer and paint stripping compound exposure controls documented", reg: "29 CFR 1910.1026 (chromium VI)", severity: "Critical" },
      { id: "am-3", text: "Composite material dust controls in place (sanding, drilling carbon fiber/fiberglass)", reg: "29 CFR 1910.134 / 1910.1000", severity: "Critical" },
      { id: "am-4", text: "De-icing/anti-icing fluid spill containment and stormwater management plan", reg: "40 CFR 122 / Airport SWPPP", severity: "Major" },
      { id: "am-5", text: "Hazardous waste management for paint strippers, solvents, and used fluids", reg: "40 CFR 262", severity: "Major" },
    ]},
    { id: "av-confined", title: "Aircraft Confined Spaces", icon: "🚧", items: [
      { id: "ac-1", text: "Permit-required confined space program covers fuel tanks, wheel wells, and cargo bays", reg: "29 CFR 1910.146", severity: "Critical" },
      { id: "ac-2", text: "Atmospheric testing conducted before entry (LEL, O2, toxic gas)", reg: "29 CFR 1910.146(c)(5)", severity: "Critical" },
      { id: "ac-3", text: "Rescue procedures specific to aircraft confined spaces documented", reg: "29 CFR 1910.146(d)(9)", severity: "Critical" },
      { id: "ac-4", text: "Entrants, attendants, and entry supervisors trained and documented", reg: "29 CFR 1910.146(g)(k)", severity: "Major" },
    ]},
  ],
};

// Audit scoring engine — adapted for Yes/No/Partial/NA responses
// ═══════════════════════════════════════════════════
// DETERMINISTIC EHS COMPLIANCE SCORING ENGINE v2
// ═══════════════════════════════════════════════════
// - 7 weighted categories totaling 100 points
// - Structured OSHA-aligned questions per category
// - Red flag overrides independent of score
// - Priority scoring for findings (severity × likelihood × regulatory_impact)
// - Fully transparent, repeatable, and audit-defensible

const SCORING_CATEGORIES = {
  "written-programs": { name: "Written Programs & Policies", weight: 20, icon: "📋" },
  "training": { name: "Training & Communication", weight: 20, icon: "🎓" },
  "inspections": { name: "Inspections & Audits", weight: 15, icon: "🔍" },
  "hazard-controls": { name: "Hazard Controls & PPE", weight: 15, icon: "🛡️" },
  "incident-mgmt": { name: "Incident Management", weight: 10, icon: "🚨" },
  "regulatory": { name: "Regulatory / OSHA Compliance", weight: 10, icon: "⚖️" },
  "recordkeeping": { name: "Recordkeeping & Documentation", weight: 10, icon: "📁" },
};

// Structured questions — 5-10 per category, each with id, text, point value, category, regulation, and red_flag trigger
const SCORING_QUESTIONS = [
  // ── Written Programs & Policies (20 pts) ──
  { id: "wp-01", text: "Written Safety and Health Plan established and current", points: 3, category: "written-programs", reg: "29 CFR 1910.132 / General Duty", red_flag: null },
  { id: "wp-02", text: "Emergency Action Plan (EAP) written and communicated to employees", points: 3, category: "written-programs", reg: "29 CFR 1910.38", red_flag: "missing_eap" },
  { id: "wp-03", text: "Hazard Communication (HazCom) program with chemical inventory and SDSs", points: 3, category: "written-programs", reg: "29 CFR 1910.1200", red_flag: "missing_hazcom" },
  { id: "wp-04", text: "Lockout/Tagout (LOTO) energy control program documented", points: 3, category: "written-programs", reg: "29 CFR 1910.147", red_flag: "missing_loto" },
  { id: "wp-05", text: "Respiratory Protection program written (if respirators used)", points: 2, category: "written-programs", reg: "29 CFR 1910.134", red_flag: null },
  { id: "wp-06", text: "Fire Prevention Plan documented", points: 2, category: "written-programs", reg: "29 CFR 1910.39", red_flag: null },
  { id: "wp-07", text: "Bloodborne Pathogens Exposure Control Plan (if applicable)", points: 2, category: "written-programs", reg: "29 CFR 1910.1030", red_flag: null },
  { id: "wp-08", text: "Programs reviewed and updated at least annually", points: 2, category: "written-programs", reg: "Best Practice", red_flag: null },

  // ── Training & Communication (20 pts) ──
  { id: "tr-01", text: "New employee safety orientation documented", points: 3, category: "training", reg: "29 CFR 1910.132(f)", red_flag: null },
  { id: "tr-02", text: "Hazard Communication training completed for all employees", points: 3, category: "training", reg: "29 CFR 1910.1200(h)", red_flag: null },
  { id: "tr-03", text: "Job-specific training for high-risk tasks (LOTO, confined space, fall protection)", points: 3, category: "training", reg: "Various OSHA standards", red_flag: "missing_high_risk_training" },
  { id: "tr-04", text: "Emergency evacuation drills conducted at required frequency", points: 2, category: "training", reg: "29 CFR 1910.38(d)", red_flag: null },
  { id: "tr-05", text: "Forklift/PIT operators trained, evaluated, and certified", points: 2, category: "training", reg: "29 CFR 1910.178(l)", red_flag: null },
  { id: "tr-06", text: "Refresher training provided when hazards change or performance deficiencies observed", points: 2, category: "training", reg: "29 CFR 1910.147(c)(7)(iii)", red_flag: null },
  { id: "tr-07", text: "Safety communication system in place (meetings, bulletins, toolbox talks)", points: 2, category: "training", reg: "Best Practice", red_flag: null },
  { id: "tr-08", text: "Training records include date, topic, trainer, and attendee signatures", points: 3, category: "training", reg: "29 CFR 1910.134(k) / Various", red_flag: null },

  // ── Inspections & Audits (15 pts) ──
  { id: "ia-01", text: "Regular workplace safety inspections conducted and documented", points: 3, category: "inspections", reg: "General Duty Clause", red_flag: null },
  { id: "ia-02", text: "Fire extinguisher monthly inspections documented", points: 2, category: "inspections", reg: "29 CFR 1910.157(e)", red_flag: null },
  { id: "ia-03", text: "Eyewash/safety shower inspections weekly (documented)", points: 2, category: "inspections", reg: "ANSI Z358.1", red_flag: null },
  { id: "ia-04", text: "Forklift/PIT pre-shift inspections documented daily", points: 2, category: "inspections", reg: "29 CFR 1910.178(q)(7)", red_flag: null },
  { id: "ia-05", text: "Annual comprehensive facility safety audit completed", points: 2, category: "inspections", reg: "Best Practice / OSHA VPP", red_flag: null },
  { id: "ia-06", text: "Corrective actions from inspections tracked to closure", points: 2, category: "inspections", reg: "Best Practice", red_flag: null },
  { id: "ia-07", text: "Machine guarding inspections completed on all equipment with moving parts", points: 2, category: "inspections", reg: "29 CFR 1910.212", red_flag: null },

  // ── Hazard Controls & PPE (15 pts) ──
  { id: "hc-01", text: "PPE hazard assessment documented per job/task", points: 3, category: "hazard-controls", reg: "29 CFR 1910.132(d)", red_flag: "missing_ppe_assessment" },
  { id: "hc-02", text: "Appropriate PPE provided, maintained, and replaced at no cost to employees", points: 2, category: "hazard-controls", reg: "29 CFR 1910.132(h)", red_flag: null },
  { id: "hc-03", text: "Engineering controls implemented before relying on PPE (hierarchy of controls)", points: 2, category: "hazard-controls", reg: "General Duty / Best Practice", red_flag: null },
  { id: "hc-04", text: "Machine guards in place and functional on all equipment", points: 2, category: "hazard-controls", reg: "29 CFR 1910.212", red_flag: null },
  { id: "hc-05", text: "Chemical exposure controls (ventilation, fume hoods, substitution) in place", points: 2, category: "hazard-controls", reg: "29 CFR 1910.1000 / 1910.1450", red_flag: null },
  { id: "hc-06", text: "Fall protection provided at 4 feet (general industry) or 6 feet (construction)", points: 2, category: "hazard-controls", reg: "29 CFR 1910.28 / 1926.501", red_flag: null },
  { id: "hc-07", text: "Electrical panels accessible with 3-foot clearance and properly labeled", points: 2, category: "hazard-controls", reg: "29 CFR 1910.303(g)(1)", red_flag: null },

  // ── Incident Management (10 pts) ──
  { id: "im-01", text: "Written incident/accident reporting procedure in place", points: 2, category: "incident-mgmt", reg: "29 CFR 1904.29", red_flag: "no_incident_reporting" },
  { id: "im-02", text: "Root cause analysis conducted for all recordable incidents", points: 2, category: "incident-mgmt", reg: "Best Practice", red_flag: null },
  { id: "im-03", text: "Near-miss reporting system established and active", points: 2, category: "incident-mgmt", reg: "Best Practice / OSHA VPP", red_flag: null },
  { id: "im-04", text: "Corrective actions from incidents tracked and verified", points: 2, category: "incident-mgmt", reg: "Best Practice", red_flag: null },
  { id: "im-05", text: "Fatality/hospitalization reporting procedures meet OSHA 8hr/24hr requirements", points: 2, category: "incident-mgmt", reg: "29 CFR 1904.39", red_flag: null },

  // ── Regulatory / OSHA Compliance (10 pts) ──
  { id: "rc-01", text: "OSHA 300 log maintained and 300A summary posted Feb 1–Apr 30", points: 2, category: "regulatory", reg: "29 CFR 1904.32 / 1904.33", red_flag: null },
  { id: "rc-02", text: "OSHA poster (Job Safety and Health — It's the Law) displayed", points: 1, category: "regulatory", reg: "29 CFR 1903.2", red_flag: null },
  { id: "rc-03", text: "No open or unresolved OSHA citations", points: 2, category: "regulatory", reg: "OSHA Act", red_flag: "open_osha_citation" },
  { id: "rc-04", text: "Employee access to exposure and medical records provided", points: 2, category: "regulatory", reg: "29 CFR 1910.1020", red_flag: null },
  { id: "rc-05", text: "Multi-employer worksite responsibilities defined (if applicable)", points: 1, category: "regulatory", reg: "OSHA Multi-Employer Policy", red_flag: null },
  { id: "rc-06", text: "State-specific OSHA requirements identified and addressed (if state-plan state)", points: 2, category: "regulatory", reg: "State OSHA Plan", red_flag: null },

  // ── Recordkeeping & Documentation (10 pts) ──
  { id: "rk-01", text: "Training records maintained with date, topic, trainer, and attendee sign-off", points: 2, category: "recordkeeping", reg: "Various OSHA standards", red_flag: null },
  { id: "rk-02", text: "Safety Data Sheets (SDSs) accessible to all employees on all shifts", points: 2, category: "recordkeeping", reg: "29 CFR 1910.1200(g)(8)", red_flag: null },
  { id: "rk-03", text: "Equipment inspection and maintenance records current", points: 2, category: "recordkeeping", reg: "Various OSHA standards", red_flag: null },
  { id: "rk-04", text: "Incident investigation reports filed and retained", points: 2, category: "recordkeeping", reg: "29 CFR 1904.33", red_flag: null },
  { id: "rk-05", text: "Permits archived (hot work, confined space, energized work)", points: 2, category: "recordkeeping", reg: "29 CFR 1910.146 / 1910.252 / NFPA 70E", red_flag: null },
];

// Red flag definitions
const RED_FLAG_DEFINITIONS = {
  missing_eap: "Missing Emergency Action Plan (required for most employers)",
  missing_hazcom: "Missing Hazard Communication Program (required for all employers with hazardous chemicals)",
  missing_ppe_assessment: "Missing PPE Hazard Assessment (required before PPE selection)",
  missing_high_risk_training: "Missing required training for high-risk work (LOTO, confined space, fall protection)",
  no_incident_reporting: "No incident/accident reporting process in place",
  missing_loto: "Missing Lockout/Tagout program (required where employees service equipment with hazardous energy)",
  open_osha_citation: "Open or unresolved OSHA citation",
};

// Regulatory penalty deductions
const REGULATORY_PENALTIES = {
  open_serious: { label: "Open serious citation", deduction: 2 },
  repeat_citation: { label: "Repeat citation history", deduction: 3 },
  failure_to_abate: { label: "Failure-to-abate notice", deduction: 4 },
};

function computeAuditScore(items, responses, regulatoryPenalties = {}) {
  // responses: { [questionId]: "yes" | "no" | "partial" | "unknown" | "na" }

  // Detect mode: industry checklist items have "severity" field, structured questions have "category" field
  const isIndustryMode = items.length > 0 && items[0].severity && !items[0].category;
  const allQuestions = isIndustryMode ? items : (items.length > 0 ? items : SCORING_QUESTIONS);

  const stats = { total: 0, yes: 0, no: 0, partial: 0, na: 0, unknown: 0 };

  // Count stats
  allQuestions.forEach(q => {
    const a = responses[q.id];
    stats.total++;
    if (a === "yes") stats.yes++;
    else if (a === "partial") stats.partial++;
    else if (a === "na" || a === "not_applicable") stats.na++;
    else if (a === "unknown") stats.unknown++;
    else stats.no++;
  });

  // ═══ INDUSTRY MODE: severity-weighted scoring (for industry checklist items) ═══
  if (isIndustryMode) {
    const applicableItems = allQuestions.filter(q => responses[q.id] !== "na" && responses[q.id] !== "not_applicable");
    if (applicableItems.length === 0) {
      return { score: 100, band: "Excellent", criticalFlag: false, criticalReasons: [], categories: null, findings: [], stats };
    }

    let totalPoints = 0;
    let earnedPoints = 0;
    const findings = [];

    applicableItems.forEach(item => {
      const weight = item.severity === "Critical" ? 10 : item.severity === "Major" ? 5 : 2;
      totalPoints += weight;
      const answer = responses[item.id];
      if (answer === "yes") {
        earnedPoints += weight;
      } else if (answer === "partial") {
        earnedPoints += weight * 0.5;
        findings.push({ ...item, status: "partial", severity: item.severity === "Critical" ? "Major" : "Minor" });
      } else {
        findings.push({ ...item, status: "no", severity: item.severity });
      }
    });

    const rawScore = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 100;
    const score = Math.max(0, rawScore);

    let rating;
    if (score >= 90) rating = "Excellent";
    else if (score >= 75) rating = "Good";
    else if (score >= 60) rating = "Moderate Risk";
    else if (score >= 40) rating = "High Risk";
    else rating = "Critical Risk";

    // Red flag detection for industry items
    let criticalFlag = false;
    const criticalReasons = [];
    allQuestions.forEach(item => {
      if (item.severity === "Critical") {
        const answer = responses[item.id];
        if (answer === "no" || (!answer && answer !== "na")) {
          criticalFlag = true;
          criticalReasons.push(`${item.text} (${item.reg})`);
        }
      }
    });

    findings.sort((a, b) => {
      const sevOrder = { Critical: 0, Major: 1, Minor: 2 };
      return (sevOrder[a.severity] || 2) - (sevOrder[b.severity] || 2);
    });

    return { score, band: rating, criticalFlag, criticalReasons, categories: null, findings, stats };
  }

  // ═══ STRUCTURED MODE: 7-category weighted scoring (for SCORING_QUESTIONS) ═══
  const categoryResults = {};
  Object.entries(SCORING_CATEGORIES).forEach(([key, cat]) => {
    const catQuestions = allQuestions.filter(q => q.category === key);
    let earnedPoints = 0;
    let applicablePoints = 0;

    catQuestions.forEach(q => {
      const answer = responses[q.id];
      if (answer === "na" || answer === "not_applicable") return; // Excluded
      applicablePoints += q.points;
      if (answer === "yes") earnedPoints += q.points;
      else if (answer === "partial") earnedPoints += q.points * 0.5;
      // "no", "unknown", undefined = 0 points
    });

    let score = 0;
    let notApplicable = false;
    if (applicablePoints === 0) {
      notApplicable = true;
    } else {
      score = (earnedPoints / applicablePoints) * cat.weight;
    }

    categoryResults[key] = {
      name: cat.name,
      icon: cat.icon,
      weight: cat.weight,
      earnedPoints: Math.round(earnedPoints * 10) / 10,
      applicablePoints,
      score: Math.round(score * 10) / 10,
      notApplicable,
    };
  });

  // ── Apply regulatory penalty deductions ──
  if (categoryResults["regulatory"] && !categoryResults["regulatory"].notApplicable) {
    let penaltyDeduction = 0;
    const penaltiesApplied = [];
    Object.entries(REGULATORY_PENALTIES).forEach(([key, pen]) => {
      if (regulatoryPenalties[key]) {
        penaltyDeduction += pen.deduction;
        penaltiesApplied.push(pen.label);
      }
    });
    if (penaltyDeduction > 0) {
      categoryResults["regulatory"].score = Math.max(0, categoryResults["regulatory"].score - penaltyDeduction);
      categoryResults["regulatory"].penaltiesApplied = penaltiesApplied;
    }
  }

  // ── Overall score ──
  let overallScore = 0;
  Object.values(categoryResults).forEach(cat => { overallScore += cat.score; });
  overallScore = Math.min(100, Math.max(0, Math.round(overallScore)));

  // ── Rating ──
  let rating;
  if (overallScore >= 90) rating = "Excellent";
  else if (overallScore >= 75) rating = "Good";
  else if (overallScore >= 60) rating = "Moderate Risk";
  else if (overallScore >= 40) rating = "High Risk";
  else rating = "Critical Risk";

  // ── Red flag detection ──
  let criticalFlag = false;
  const criticalReasons = [];
  allQuestions.forEach(q => {
    if (q.red_flag) {
      const answer = responses[q.id];
      if (answer === "no" || answer === "unknown" || (!answer && answer !== "na")) {
        criticalFlag = true;
        criticalReasons.push(RED_FLAG_DEFINITIONS[q.red_flag] || q.red_flag);
      }
    }
  });

  // ── Findings with priority scoring ──
  const findings = [];
  allQuestions.forEach(q => {
    const answer = responses[q.id];
    if (answer === "na" || answer === "not_applicable" || answer === "yes") return;

    const severity = q.red_flag ? 3 : (q.points >= 3 ? 2 : 1);
    const likelihood = answer === "no" || answer === "unknown" ? 3 : 2; // partial = 2
    const regulatoryImpact = q.reg.includes("Best Practice") ? 1 : (q.red_flag ? 3 : 2);
    const priorityScore = severity * likelihood * regulatoryImpact;
    let priorityLevel;
    if (priorityScore >= 19) priorityLevel = "Critical";
    else if (priorityScore >= 10) priorityLevel = "High";
    else if (priorityScore >= 4) priorityLevel = "Medium";
    else priorityLevel = "Low";

    findings.push({
      id: q.id,
      text: q.text,
      reg: q.reg,
      category: SCORING_CATEGORIES[q.category]?.name || q.category,
      categoryKey: q.category,
      status: answer === "partial" ? "partial" : "no",
      severity: priorityLevel === "Critical" ? "Critical" : priorityLevel === "High" ? "Major" : "Minor",
      priorityScore,
      priorityLevel,
    });
  });

  // Sort findings by priority score descending
  findings.sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    score: overallScore,
    band: rating,
    criticalFlag,
    criticalReasons,
    categories: categoryResults,
    findings,
    stats,
  };
}

// ═══════════════════════════════════════════════════
// JOB HAZARD ANALYSIS TOOL — JHA Engine
// ═══════════════════════════════════════════════════

const RISK_SEVERITY = [
  { val: 1, label: "Negligible", desc: "No injury or minor first-aid", color: "#22c55e" },
  { val: 2, label: "Minor", desc: "First aid / minor medical treatment", color: "#84cc16" },
  { val: 3, label: "Moderate", desc: "Lost time injury / restricted duty", color: "#F59E0B" },
  { val: 4, label: "Major", desc: "Permanent disability / hospitalization", color: "#ea580c" },
  { val: 5, label: "Catastrophic", desc: "Fatality or multiple fatalities", color: "#EF4444" },
];

const RISK_LIKELIHOOD = [
  { val: 1, label: "Rare", desc: "Exceptional circumstances only", color: "#22c55e" },
  { val: 2, label: "Unlikely", desc: "Could occur but not expected", color: "#84cc16" },
  { val: 3, label: "Possible", desc: "Could occur at some point", color: "#F59E0B" },
  { val: 4, label: "Likely", desc: "Will probably occur", color: "#ea580c" },
  { val: 5, label: "Almost Certain", desc: "Expected to occur", color: "#EF4444" },
];

const CONTROL_TYPES = [
  { id: "elimination", label: "Elimination", desc: "Remove the hazard entirely", rank: 1, color: "#22c55e" },
  { id: "substitution", label: "Substitution", desc: "Replace with less hazardous alternative", rank: 2, color: "#84cc16" },
  { id: "engineering", label: "Engineering", desc: "Physical barrier, ventilation, guarding", rank: 3, color: "#F59E0B" },
  { id: "administrative", label: "Administrative", desc: "Procedures, training, signage, rotation", rank: 4, color: "#ea580c" },
  { id: "ppe", label: "PPE", desc: "Personal protective equipment", rank: 5, color: "#EF4444" },
];

function getRiskLevel(score) {
  if (score >= 16) return { level: "Critical", color: "#EF4444", bg: "#FEF2F2" };
  if (score >= 10) return { level: "High", color: "#ea580c", bg: "#FFF7ED" };
  if (score >= 5) return { level: "Medium", color: "#F59E0B", bg: "#FFFBEB" };
  return { level: "Low", color: "#22c55e", bg: "#F0FDF4" };
}

// Industry hazard suggestions
const HAZARD_LIBRARY = {
  manufacturing: ["Machine entanglement / caught-in", "Crush injury from hydraulic press", "Flying debris / projectiles", "Noise exposure above 85 dBA", "Chemical splash / inhalation", "Forklift struck-by", "Repetitive motion / ergonomic strain", "Electrical contact", "Slip/trip/fall on production floor", "Burns from hot surfaces or welding"],
  construction: ["Fall from elevation", "Struck-by falling objects", "Caught-in/between (trench collapse, equipment)", "Electrocution (overhead lines, temporary wiring)", "Silica dust inhalation", "Heat stress / heat stroke", "Crane / rigging failure", "Scaffolding collapse", "Excavation cave-in", "Lead/asbestos exposure in demolition"],
  "commercial-re": ["Slip/trip/fall on walking surfaces", "Electrical panel contact", "Asbestos exposure (pre-1981 buildings)", "Mold / indoor air quality", "Elevator/escalator entrapment", "Roof fall (maintenance access)", "Chemical exposure from cleaning agents", "Contractor-related incidents", "Fire / smoke inhalation", "Ergonomic strain (office/maintenance)"],
  healthcare: ["Needlestick / sharps injury", "Patient handling musculoskeletal injury", "Bloodborne pathogen exposure", "Workplace violence (patient/visitor)", "Chemical exposure (chemo drugs, sterilants)", "Slip/fall on wet floors", "Radiation exposure (diagnostic/therapeutic)", "Infectious disease transmission", "Latex/chemical allergy", "Ergonomic strain from repetitive tasks"],
  "government-municipal": ["Vehicle struck-by (roadway work)", "Confined space (manholes, tanks)", "Chlorine/H2S exposure (water/wastewater)", "Noise from heavy equipment", "Heat stress (outdoor work)", "Electrical contact (utility work)", "Fall from elevated surfaces", "Animal/insect bite", "Ergonomic strain (manual labor)", "Violence (public interaction, law enforcement)"],
  warehousing: ["Forklift struck-by / pedestrian collision", "Falling objects from racking", "Overexertion from manual lifting", "Dock fall (open dock doors)", "Conveyor entanglement", "Slip/trip on warehouse floor", "Battery charging hydrogen exposure", "Crushing between dock and trailer", "Repetitive motion injury", "Heat/cold stress"],
  "food-service": ["Burns (hot oil, steam, ovens)", "Knife/blade laceration", "Slip/fall on greasy floors", "Chemical exposure (cleaners, sanitizers)", "Repetitive motion (prep work)", "CO exposure from gas equipment", "Electrical contact (wet environment)", "Ergonomic strain (lifting, reaching)", "Allergen cross-contamination", "Refrigerator/freezer entrapment"],
  laboratory: ["Chemical splash/spill (corrosives, solvents)", "Fume hood failure / vapor inhalation", "Fire/explosion from flammable solvents", "Biological agent exposure (BSL-2/3)", "Radiation exposure (X-ray, isotopes)", "Sharps injury (needles, broken glass)", "Compressed gas cylinder rupture", "Cryogen burns (liquid nitrogen)", "Laser eye/skin injury", "Electrical shock from analytical equipment"],
  energy: ["Arc flash / electrical burn", "Fall from height (towers, poles, platforms)", "Confined space (vaults, tanks)", "H2S / toxic gas exposure", "High-voltage electrocution", "Fire/explosion (natural gas, fuel)", "Noise from turbines/generators", "Crane/heavy lift failure", "Pipeline pressure release", "Heat stress in power plants"],
  automotive: ["Vehicle lift collapse / crush", "Exhaust CO exposure (enclosed bay)", "Chemical burn (battery acid, brake fluid)", "Fire (flammable solvents, fuel)", "Struck-by falling vehicle components", "Noise from pneumatic tools", "Eye injury from grinding/welding", "Electrical shock (hybrid/EV systems)", "Ergonomic strain (overhead work)", "Slip/fall on oily floor"],
  "data-center": ["Arc flash at main switchgear", "Battery room hydrogen explosion", "Electrical contact (high-voltage PDUs)", "Ergonomic strain (server racking)", "Heat stress in hot aisles", "Slip/fall on raised floor tiles", "Confined space (cable vaults)", "Noise from CRAC/generators", "Halon/clean agent asphyxiation", "Diesel exhaust during generator testing"],
  aviation: ["Jet blast / engine ingestion", "Propeller/rotor strike", "Fall from aircraft surface", "Fuel fire during servicing", "Noise (engine run-up 120-140 dBA)", "FOD laceration", "Hydraulic fluid injection injury", "Confined space (fuel tanks, wheel wells)", "Composite dust inhalation", "Ground vehicle collision on ramp"],
};

function exportRiskReport(tasks, industryKey) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const industry = INDUSTRIES[industryKey];
  const allHazards = tasks.flatMap(t => t.hazards.map(h => ({ ...h, taskName: t.name })));
  const criticalCount = allHazards.filter(h => h.severity * h.likelihood >= 16).length;
  const highCount = allHazards.filter(h => { const s = h.severity * h.likelihood; return s >= 10 && s < 16; }).length;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Job Hazard Analysis Report</title>
<style>
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } .no-print{display:none;} @page{margin:0.5in;} }
  body { font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; max-width:850px; margin:0 auto; padding:32px 24px; color:#1a1a1a; line-height:1.5; }
  .header { display:flex; justify-content:space-between; padding-bottom:16px; border-bottom:3px solid #111; margin-bottom:20px; }
  h1 { font-size:20px; margin:0 0 4px; } h2 { font-size:15px; margin:20px 0 10px; padding-bottom:6px; border-bottom:2px solid #e5e7eb; }
  .matrix { display:grid; grid-template-columns:auto repeat(5,1fr); gap:2px; margin:16px 0; font-size:10px; }
  .matrix-cell { padding:6px 4px; text-align:center; border-radius:4px; font-weight:600; }
  .task-card { border:1px solid #e5e7eb; border-radius:10px; padding:16px; margin-bottom:14px; page-break-inside:avoid; }
  .hazard-row { padding:10px; border-radius:8px; margin-bottom:8px; border-left:3px solid; }
  .risk-badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; }
  .control-tag { display:inline-block; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:600; margin-right:4px; }
  table { width:100%; border-collapse:collapse; font-size:11px; margin:8px 0; }
  th,td { padding:6px 8px; border:1px solid #e5e7eb; text-align:left; }
  th { background:#f9fafb; font-weight:700; }
  .sign-block { display:flex; gap:32px; margin-top:24px; }
  .sign-line { flex:1; border-bottom:1px solid #999; padding-top:40px; font-size:10px; color:#6b7280; }
  .disclaimer { font-size:10px; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:16px; margin-top:32px; }
  .print-btn { position:fixed; bottom:20px; right:20px; padding:12px 24px; background:#111; color:#fff; border:none; border-radius:8px; font-size:14px; cursor:pointer; }
</style></head><body>
<div class="header"><div><h1>Job Hazard Analysis Report</h1><div style="color:#6b7280;font-size:12px;">${industry?.icon || ""} ${industry?.label || "General"} · Generated ${date}</div></div><div style="text-align:right;"><div style="font-size:13px;font-weight:700;">RegLens</div><div style="font-size:11px;color:#6b7280;">by Prudence EHS</div></div></div>
<div style="display:flex;gap:16px;margin-bottom:20px;">
  <div style="flex:1;padding:12px;border-radius:10px;background:#f9fafb;border:1px solid #e5e7eb;text-align:center;"><div style="font-size:24px;font-weight:800;">${tasks.length}</div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;">Tasks</div></div>
  <div style="flex:1;padding:12px;border-radius:10px;background:#f9fafb;border:1px solid #e5e7eb;text-align:center;"><div style="font-size:24px;font-weight:800;">${allHazards.length}</div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;">Hazards</div></div>
  <div style="flex:1;padding:12px;border-radius:10px;background:#FEF2F2;border:1px solid #FECACA;text-align:center;"><div style="font-size:24px;font-weight:800;color:#DC2626;">${criticalCount}</div><div style="font-size:10px;color:#DC2626;text-transform:uppercase;">Critical</div></div>
  <div style="flex:1;padding:12px;border-radius:10px;background:#FFF7ED;border:1px solid #FED7AA;text-align:center;"><div style="font-size:24px;font-weight:800;color:#ea580c;">${highCount}</div><div style="font-size:10px;color:#ea580c;text-transform:uppercase;">High</div></div>
</div>`;

  tasks.forEach(task => {
    html += `<div class="task-card"><h2 style="margin-top:0;border:none;padding:0;">${task.name}</h2>`;
    html += `<table><tr><th>Hazard</th><th>Severity</th><th>Likelihood</th><th>Risk</th><th>Controls</th><th>Type</th><th>Residual Risk</th></tr>`;
    task.hazards.forEach(h => {
      const inherent = h.severity * h.likelihood;
      const residual = (h.resSeverity || h.severity) * (h.resLikelihood || h.likelihood);
      const iRL = getRiskLevel(inherent);
      const rRL = getRiskLevel(residual);
      const ct = CONTROL_TYPES.find(c => c.id === h.controlType);
      html += `<tr>
        <td>${h.desc}</td>
        <td>${h.severity}</td><td>${h.likelihood}</td>
        <td><span class="risk-badge" style="background:${iRL.bg};color:${iRL.color};">${inherent} ${iRL.level}</span></td>
        <td style="font-size:10px;">${h.controls || "—"}</td>
        <td>${ct ? `<span class="control-tag" style="background:${ct.color}15;color:${ct.color};">${ct.label}</span>` : "—"}</td>
        <td><span class="risk-badge" style="background:${rRL.bg};color:${rRL.color};">${residual} ${rRL.level}</span></td>
      </tr>`;
    });
    html += `</table></div>`;
  });

  html += `<div class="sign-block"><div class="sign-line">Assessed By</div><div class="sign-line">Reviewed By</div><div class="sign-line">Date</div></div>`;
  html += `<div class="disclaimer"><strong>Disclaimer:</strong> This job hazard analysis was generated using RegLens by Prudence EHS. It is advisory and based on user-provided inputs. It does not constitute a formal risk analysis or guarantee workplace safety. All assessments should be reviewed by a qualified EHS professional.</div>`;
  html += `<button class="print-btn no-print" onclick="window.print()">Print / Save PDF</button></body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `Risk-Assessment-${new Date().toISOString().split("T")[0]}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Incident Report Export ───
function exportIncidentReport(report) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const sevColors = { "First Aid": "#22c55e", "Medical Treatment": "#F59E0B", "Lost Time": "#ea580c", "Hospitalization": "#DC2626", "Fatality": "#991b1b" };
  const sc = sevColors[report.severity] || "#6b7280";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Incident Report — ${report.id}</title>
<style>
  @media print { body{-webkit-print-color-adjust:exact;print-color-adjust:exact} .no-print{display:none} @page{margin:0.5in} }
  body{font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;max-width:850px;margin:0 auto;padding:32px 24px;color:#1a1a1a;line-height:1.5}
  .header{display:flex;justify-content:space-between;padding-bottom:16px;border-bottom:3px solid #111;margin-bottom:20px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
  .field{margin-bottom:10px} .field-label{font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:2px}
  .field-value{font-size:13px;color:#1a1a1a;padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;min-height:28px}
  .sev-badge{display:inline-block;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700;color:#fff}
  .why-chain{counter-reset:why} .why-item{counter-increment:why;padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:4px;font-size:12px}
  .why-item::before{content:"Why " counter(why) ": ";font-weight:700;color:#6b7280}
  .sign-block{display:flex;gap:32px;margin-top:24px} .sign-line{flex:1;border-bottom:1px solid #999;padding-top:40px;font-size:10px;color:#6b7280}
  .disclaimer{font-size:10px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:32px}
  .print-btn{position:fixed;bottom:20px;right:20px;padding:12px 24px;background:#111;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer}
</style></head><body>
<div class="header"><div><h1>Incident / Injury Report</h1><div style="color:#6b7280;font-size:12px;">Report #${report.id} · Generated ${date}</div></div><div style="text-align:right"><div style="font-size:13px;font-weight:700">RegLens</div><div style="font-size:11px;color:#6b7280">by Prudence EHS</div></div></div>
<div style="margin-bottom:16px"><span class="sev-badge" style="background:${sc}">${report.severity}</span><span style="margin-left:8px;font-size:12px;color:#6b7280;">${report.oshaRecordable ? "OSHA Recordable" : "Non-Recordable"}</span></div>

<h2>Incident Details</h2>
<div class="grid">
  <div class="field"><div class="field-label">Date of Incident</div><div class="field-value">${report.date || "—"}</div></div>
  <div class="field"><div class="field-label">Time</div><div class="field-value">${report.time || "—"}</div></div>
  <div class="field"><div class="field-label">Location</div><div class="field-value">${report.location || "—"}</div></div>
  <div class="field"><div class="field-label">Department</div><div class="field-value">${report.department || "—"}</div></div>
</div>

<h2>Injured Person</h2>
<div class="grid">
  <div class="field"><div class="field-label">Name</div><div class="field-value">${report.employeeName || "—"}</div></div>
  <div class="field"><div class="field-label">Job Title</div><div class="field-value">${report.jobTitle || "—"}</div></div>
  <div class="field"><div class="field-label">Injury Type</div><div class="field-value">${report.injuryType || "—"}</div></div>
  <div class="field"><div class="field-label">Body Part</div><div class="field-value">${report.bodyPart || "—"}</div></div>
</div>

<h2>Description</h2>
<div class="field"><div class="field-label">What happened</div><div class="field-value" style="min-height:60px">${report.description || "—"}</div></div>
<div class="field"><div class="field-label">What was the employee doing</div><div class="field-value">${report.activity || "—"}</div></div>
<div class="field"><div class="field-label">Witnesses</div><div class="field-value">${report.witnesses || "None listed"}</div></div>

<h2>Root Cause — 5 Whys Analysis</h2>
<div class="why-chain">${(report.whys || []).filter(w => w).map(w => `<div class="why-item">${w}</div>`).join("") || '<div style="font-size:12px;color:#9ca3af;">Not completed</div>'}</div>

<h2>Immediate Corrective Actions</h2>
<div class="field-value" style="min-height:40px">${report.immediateActions || "—"}</div>

<h2>Preventive Actions</h2>
<div class="field-value" style="min-height:40px">${report.preventiveActions || "—"}</div>

<div class="sign-block"><div class="sign-line">Reported By</div><div class="sign-line">Supervisor</div><div class="sign-line">Date</div></div>
<div class="disclaimer"><strong>Confidential.</strong> This incident report was generated using RegLens by Prudence EHS. It is intended for internal safety documentation purposes. It does not replace the OSHA 301 form for recordable injuries.</div>
<button class="print-btn no-print" onclick="window.print()">Print / Save PDF</button>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `Incident-Report-${report.id}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Safety Meeting Log Export ───
function exportMeetingLog(meeting) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Safety Meeting — ${meeting.date}</title>
<style>
  @media print { body{-webkit-print-color-adjust:exact;print-color-adjust:exact} .no-print{display:none} @page{margin:0.5in} }
  body{font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;max-width:850px;margin:0 auto;padding:32px 24px;color:#1a1a1a;line-height:1.5}
  .header{display:flex;justify-content:space-between;padding-bottom:16px;border-bottom:3px solid #111;margin-bottom:20px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb}
  .field-label{font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:2px}
  .field-value{font-size:13px;color:#1a1a1a;padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;min-height:28px;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;margin:8px 0} th,td{padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px} th{background:#f9fafb;font-weight:700}
  .sign-block{display:flex;gap:32px;margin-top:24px} .sign-line{flex:1;border-bottom:1px solid #999;padding-top:40px;font-size:10px;color:#6b7280}
  .print-btn{position:fixed;bottom:20px;right:20px;padding:12px 24px;background:#111;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer}
</style></head><body>
<div class="header"><div><h1>Safety Meeting / Toolbox Talk</h1><div style="color:#6b7280;font-size:12px;">${meeting.date} · ${meeting.duration || "—"} minutes</div></div><div style="text-align:right"><div style="font-size:13px;font-weight:700">RegLens</div><div style="font-size:11px;color:#6b7280">by Prudence EHS</div></div></div>

<div class="field-label">Topic</div><div class="field-value" style="font-weight:600;font-size:15px;">${meeting.topic || "—"}</div>
<div class="field-label">Presenter / Facilitator</div><div class="field-value">${meeting.presenter || "—"}</div>
<div class="field-label">Location</div><div class="field-value">${meeting.location || "—"}</div>

<h2>Discussion Points</h2>
<div class="field-value" style="min-height:60px;white-space:pre-wrap;">${meeting.points || "—"}</div>

<h2>Action Items</h2>
${(meeting.actionItems || []).length > 0 ? `<table><tr><th>Action</th><th>Assigned To</th><th>Due Date</th></tr>${meeting.actionItems.map(a => `<tr><td>${a.action}</td><td>${a.assignee || "—"}</td><td>${a.due || "—"}</td></tr>`).join("")}</table>` : '<div style="font-size:12px;color:#9ca3af;">No action items</div>'}

<h2>Attendees (${(meeting.attendees || []).length})</h2>
<table><tr><th style="width:5%">#</th><th style="width:45%">Name</th><th style="width:25%">Department</th><th style="width:25%">Signature</th></tr>
${(meeting.attendees || []).map((a, i) => `<tr><td>${i + 1}</td><td>${a}</td><td></td><td style="height:30px;"></td></tr>`).join("")}
${Array(Math.max(0, 8 - (meeting.attendees || []).length)).fill(0).map((_, i) => `<tr><td>${(meeting.attendees || []).length + i + 1}</td><td></td><td></td><td style="height:30px;"></td></tr>`).join("")}
</table>

<div class="sign-block"><div class="sign-line">Meeting Conducted By</div><div class="sign-line">Supervisor Approval</div><div class="sign-line">Date</div></div>
<button class="print-btn no-print" onclick="window.print()">Print / Save PDF</button>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `Safety-Meeting-${meeting.date || "log"}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function getAuditSections(industryKey) {
  const industry = AUDIT_SECTIONS_INDUSTRY[industryKey] || [];
  return [...AUDIT_SECTIONS_UNIVERSAL, ...industry];
}

// ─── Citation Response Tool ───
function buildCitationPrompt(citationText, industryKey, context) {
  const industry = INDUSTRIES[industryKey];
  const industryInfo = industry ? `\n\nFACILITY CONTEXT:
- Industry: ${industry.label}
- Known hazards for this industry: ${industry.hazards}
- Applicable standards: ${industry.standards}
- Approximate employees: ${context?.employees || "Not specified"}
- Operations description: ${context?.description || "Not specified"}
- Prior OSHA citations: ${context?.priorCitations === "yes-same" ? "Yes — same or similar hazard (IMPORTANT: this may affect violation classification)" : context?.priorCitations === "yes-different" ? "Yes — different hazard types" : "No prior citations reported"}
- Abatement actions already taken: ${context?.abatementStarted === "partial" ? "Some steps already taken — account for work already in progress" : context?.abatementStarted === "yes" ? "Substantially complete — focus on documentation and verification of existing actions" : "No abatement started yet"}
${context?.notes ? `- Additional notes: ${context.notes}` : ""}

IMPORTANT: Tailor all abatement steps to this specific ${industry.label} facility. Reference industry-specific equipment, processes, and workforce considerations. Do not give generic abatement advice — make it specific to ${industry.label} operations.` : "";

  return `You are a senior EHS professional with 20+ years of experience preparing OSHA citation abatement responses. You have extensive experience with informal conferences, abatement verification, and penalty reduction strategies.

A facility has received an OSHA citation. Parse the citation text below and for EACH violation item, generate a detailed technical abatement plan.${industryInfo}

CITATION TEXT:
${citationText.substring(0, 15000)}

For each violation found in the citation, provide a JSON object with these fields:

Respond with a JSON object containing:
- "meta": { "citation_type": "Serious/Willful/Repeat/Other-than-Serious/mixed", "total_proposed_penalty": number or null, "total_violations": number, "has_willful": boolean, "has_repeat": boolean, "inspection_number": string or null }
- "violations": array of objects, each containing:
  - "item_number": the citation item number (e.g., "1a", "2", "3b")
  - "standard_cited": the specific OSHA/EPA standard (e.g., "29 CFR 1910.147(c)(4)(i)")
  - "violation_type": "Serious", "Willful", "Repeat", "Other-than-Serious"
  - "description": the violation description as stated in the citation
  - "proposed_penalty": dollar amount or null
  - "abatement_date": the date OSHA requires abatement by, or null
  - "abatement_steps": array of 3-6 specific, actionable steps to abate this violation. Each step must be concrete and reference the specific deficiency described — NOT generic compliance advice. Include what to do, who should do it, what documentation to create.
  - "verification_method": how to document and prove abatement was completed (specific records, photos, certifications)
  - "estimated_timeline": realistic days to complete abatement
  - "estimated_cost": rough cost range for abatement (e.g., "$500-$2,000")
  - "root_cause": likely root cause of the violation (e.g., "No written program", "Training gap", "Equipment deficiency")
  - "recurrence_prevention": steps to prevent this violation from recurring

CRITICAL RULES:
1. Respond ONLY with valid JSON — no markdown, no backticks, no preamble
2. Abatement steps must address the SPECIFIC deficiency described in each violation — not generic advice
3. If the citation mentions specific machines, locations, employees, or conditions, the abatement plan must address those specifics
4. Include documentation requirements for each abatement step (what records to create, what photos to take)
5. Timeline must be realistic and ideally within the OSHA abatement date if one is specified
6. Do NOT advise on whether to contest the citation, negotiate penalties, or legal strategy
7. Parse ALL violation items in the citation — do not skip any`;
}

function exportCitationReport(citationResult) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const meta = citationResult.meta || {};
  const violations = citationResult.violations || [];
  const hasWillful = meta.has_willful || violations.some(v => v.violation_type === "Willful");
  const hasRepeat = meta.has_repeat || violations.some(v => v.violation_type === "Repeat");
  const typeColors = { Serious: "#dc2626", Willful: "#7c2d12", Repeat: "#9333ea", "Other-than-Serious": "#d97706" };

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Draft Abatement Plan Worksheet</title>
<style>
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } .no-print { display:none; } @page { margin:0.5in; } }
  body { font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; max-width:850px; margin:0 auto; padding:32px 24px; color:#1a1a1a; line-height:1.5; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:16px; border-bottom:3px solid #111; margin-bottom:20px; }
  h1 { font-size:20px; margin:0 0 4px; }
  h2 { font-size:15px; margin:20px 0 10px; padding-bottom:6px; border-bottom:2px solid #e5e7eb; }
  .draft { display:inline-block; padding:4px 12px; border-radius:6px; background:#FEF3C7; color:#92400E; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px; }
  .legal-warning { background:#fef2f2; border:2px solid #dc2626; border-radius:10px; padding:16px; margin-bottom:20px; }
  .legal-warning h3 { color:#dc2626; margin:0 0 8px; font-size:14px; }
  .legal-warning p { font-size:12px; color:#374151; margin:0 0 6px; line-height:1.6; }
  .willful-warning { background:#7c2d12; color:#fff; border-radius:10px; padding:16px; margin-bottom:20px; }
  .willful-warning h3 { color:#fbbf24; margin:0 0 8px; font-size:14px; }
  .willful-warning p { font-size:12px; color:#fed7aa; margin:0; line-height:1.6; }
  .summary-box { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:20px; }
  .summary-stat { padding:12px 16px; border-radius:10px; background:#f9fafb; border:1px solid #e5e7eb; text-align:center; flex:1; min-width:100px; }
  .summary-stat .num { font-size:24px; font-weight:800; }
  .summary-stat .label { font-size:10px; text-transform:uppercase; color:#6b7280; }
  .violation-card { border:1px solid #e5e7eb; border-radius:10px; padding:16px; margin-bottom:14px; page-break-inside:avoid; }
  .violation-card.serious { border-left:4px solid #dc2626; }
  .violation-card.willful { border-left:4px solid #7c2d12; background:#fffbeb; }
  .violation-card.repeat { border-left:4px solid #9333ea; }
  .violation-card.other { border-left:4px solid #d97706; }
  .vtype { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; text-transform:uppercase; color:#fff; }
  .field-label { font-size:10px; font-weight:700; text-transform:uppercase; color:#6b7280; margin-top:10px; margin-bottom:3px; }
  .field-value { font-size:12px; color:#374151; }
  .step { display:flex; gap:8px; margin-bottom:6px; font-size:12px; }
  .step-num { width:20px; height:20px; border-radius:50%; background:#f3f4f6; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#374151; flex-shrink:0; margin-top:1px; }
  .reg { font-family:monospace; font-size:11px; color:#16a34a; }
  .sign-block { display:flex; gap:32px; margin-top:24px; }
  .sign-line { flex:1; border-bottom:1px solid #999; padding-top:40px; font-size:10px; color:#6b7280; }
  .disclaimer { font-size:10px; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:16px; margin-top:32px; }
  .status-row { display:flex; gap:16px; margin-top:10px; padding-top:8px; border-top:1px solid #f3f4f6; font-size:11px; color:#6b7280; }
  .print-btn { position:fixed; bottom:20px; right:20px; padding:12px 24px; background:#111; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; }
</style></head><body>

<div class="header">
  <div>
    <div class="draft">Draft — Abatement Plan Worksheet</div>
    <h1>Citation Response & Abatement Plan</h1>
    <div style="color:#6b7280;font-size:12px;">Generated ${date}${meta.inspection_number ? ` · Inspection #${meta.inspection_number}` : ""}</div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:13px;font-weight:700;">RegLens</div>
    <div style="font-size:11px;color:#6b7280;">by Prudence EHS</div>
  </div>
</div>

<div class="legal-warning">
  <h3>⚠️ Important Legal Notice</h3>
  <p>This is a <strong>draft planning worksheet</strong> to help organize your abatement response. It is NOT a legal document, legal advice, or a formal abatement certification.</p>
  <p>This document should be reviewed by a qualified EHS professional and/or legal counsel before submission to OSHA. The employer retains sole responsibility for abatement verification and regulatory compliance.</p>
  <p>This tool does NOT advise on whether to contest the citation, negotiate penalties, request an informal conference, or any legal strategy decisions.</p>
</div>`;

  if (hasWillful || hasRepeat) {
    html += `<div class="willful-warning">
      <h3>🚨 ${hasWillful ? "Willful" : ""}${hasWillful && hasRepeat ? " & " : ""}${hasRepeat ? "Repeat" : ""} Violation${(hasWillful && hasRepeat) ? "s" : ""} Detected</h3>
      <p>${hasWillful ? "Willful violations carry penalties up to $161,323 per violation and may result in criminal referral. " : ""}${hasRepeat ? "Repeat violations indicate a prior citation for the same or similar hazard and carry significantly increased penalties. " : ""}We strongly recommend engaging legal counsel and a qualified EHS professional before responding to this citation.</p>
    </div>`;
  }

  const totalPenalty = violations.reduce((sum, v) => sum + (v.proposed_penalty || 0), 0);
  html += `<div class="summary-box">
    <div class="summary-stat"><div class="num">${violations.length}</div><div class="label">Violations</div></div>
    <div class="summary-stat"><div class="num" style="color:#dc2626;">${totalPenalty > 0 ? "$" + totalPenalty.toLocaleString() : "—"}</div><div class="label">Total Proposed Penalty</div></div>
    <div class="summary-stat"><div class="num">${violations.filter(v => v.violation_type === "Serious").length}</div><div class="label">Serious</div></div>
    ${hasWillful ? `<div class="summary-stat"><div class="num" style="color:#7c2d12;">${violations.filter(v => v.violation_type === "Willful").length}</div><div class="label">Willful</div></div>` : ""}
  </div>

  <h2>Abatement Plan by Violation</h2>`;

  violations.forEach((v, i) => {
    const cardClass = v.violation_type === "Willful" ? "willful" : v.violation_type === "Repeat" ? "repeat" : v.violation_type === "Serious" ? "serious" : "other";
    const typeColor = typeColors[v.violation_type] || "#6b7280";

    html += `<div class="violation-card ${cardClass}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
        <span style="font-size:12px;font-weight:700;color:#374151;">Item ${v.item_number || (i + 1)}</span>
        <span class="vtype" style="background:${typeColor};">${v.violation_type}</span>
        <span class="reg">${v.standard_cited}</span>
        ${v.proposed_penalty ? `<span style="font-size:11px;color:#dc2626;font-weight:600;">$${v.proposed_penalty.toLocaleString()}</span>` : ""}
      </div>

      <div class="field-label">Violation Description</div>
      <div class="field-value" style="margin-bottom:8px;">${v.description}</div>

      ${v.root_cause ? `<div class="field-label">Root Cause</div><div class="field-value">${v.root_cause}</div>` : ""}

      <div class="field-label">Abatement Steps</div>
      ${(v.abatement_steps || []).map((step, si) => `<div class="step"><div class="step-num">${si + 1}</div><div>${step}</div></div>`).join("")}

      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        <div style="flex:1;min-width:180px;">
          <div class="field-label">Verification / Documentation</div>
          <div class="field-value">${v.verification_method || "Document completion with records and photographs"}</div>
        </div>
        <div style="min-width:120px;">
          <div class="field-label">Est. Timeline</div>
          <div class="field-value">${v.estimated_timeline || "—"} days</div>
        </div>
        <div style="min-width:120px;">
          <div class="field-label">Est. Cost</div>
          <div class="field-value">${v.estimated_cost || "TBD"}</div>
        </div>
      </div>

      ${v.abatement_date ? `<div class="field-label">OSHA Abatement Deadline</div><div class="field-value" style="color:#dc2626;font-weight:600;">${v.abatement_date}</div>` : ""}

      ${v.recurrence_prevention ? `<div class="field-label">Recurrence Prevention</div><div class="field-value">${v.recurrence_prevention}</div>` : ""}

      <div class="status-row">
        <div>☐ Not Started &nbsp; ☐ In Progress &nbsp; ☐ Completed</div>
        <div>Date Completed: ___________</div>
        <div>Verified By: ___________</div>
      </div>
    </div>`;
  });

  html += `
  <div class="sign-block">
    <div class="sign-line">Prepared By</div>
    <div class="sign-line">Reviewed By</div>
    <div class="sign-line">Date</div>
  </div>

  <div class="disclaimer">
    <strong>DRAFT ABATEMENT PLAN WORKSHEET — NOT FOR DIRECT SUBMISSION</strong><br><br>
    This document was generated by AI to assist in organizing an abatement response. It does not constitute a formal abatement certification (OSHA-300 form), legal advice, or a guarantee of regulatory compliance. All abatement steps should be reviewed and validated by a qualified EHS professional and/or legal counsel before implementation or submission to OSHA.<br><br>
    <strong>This tool does not provide guidance on:</strong> contesting citations, penalty negotiation, informal conference strategy, or legal representation.<br><br>
    <strong>Scope:</strong> Technical abatement planning only — what to fix, how to fix it, and how to document it.<br><br>
    For expert review and finalization, contact Prudence EHS at <a href="mailto:info@prudencesafety.com">info@prudencesafety.com</a>.<br><br>
    <strong>Generated by:</strong> RegLens by Prudence EHS — Germantown, MD<br>
    <strong>Date:</strong> ${date}
  </div>

  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Abatement-Plan-${new Date().toISOString().split("T")[0]}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildCAPPrompt(findings, industryKey, notes) {
  const industry = INDUSTRIES[industryKey];
  const findingsText = findings.map((f, i) => {
    const note = (notes || {})[f.id];
    return `${i+1}. [${f.severity}] ${f.text} — Regulation: ${f.reg} — Status: ${f.status === "no" ? "Not in place" : "Partially in place"}${note ? ` — INSPECTOR NOTE: "${note}"` : ""}`;
  }).join("\n");

  return `You are a senior EHS professional with 20+ years of experience drafting Corrective Action Plans (CAPs) for regulatory compliance. You specialize in ${industry?.label || "general industry"} facilities.

Based on the following EHS Readiness Check findings, generate a Corrective Action Plan. Each finding needs a specific, actionable corrective action.

FINDINGS:
${findingsText}

INDUSTRY: ${industry?.label || "General"}
INDUSTRY HAZARDS: ${industry?.hazards || "Standard workplace hazards"}

IMPORTANT: Where inspector notes are provided, use them to make corrective actions MORE SPECIFIC. For example, if the note says "guardrail missing on east mezzanine, parts on order" then the corrective action should reference the east mezzanine specifically and note that parts are already being procured. Inspector notes reflect real on-the-ground conditions — incorporate them.

For each finding, provide a JSON array of objects with these fields:
- "finding": the original gap (string)
- "regulation": the applicable regulation (string)
- "severity": Critical, Major, or Minor (string)
- "corrective_action": specific, actionable step to resolve the gap — be concrete, not generic. If inspector notes mention specific locations, equipment, or conditions, reference them directly. (string)
- "responsible_party": suggested role (e.g., "Safety Manager", "Facility Manager", "Maintenance Supervisor") (string)
- "timeline": recommended completion timeframe based on severity — Critical: "Immediate (1-7 days)", Major: "Short-term (30 days)", Minor: "Standard (90 days)" (string)
- "verification": how to verify the action was completed (string)
- "resources": estimated cost range or resource needs if applicable (string)
- "priority": 1 = highest priority (integer, rank by severity then regulatory risk)

CRITICAL RULES:
1. Respond ONLY with a valid JSON array — no markdown, no backticks, no preamble
2. Corrective actions must be SPECIFIC — not "develop a program" but "draft a written respiratory protection program per 29 CFR 1910.134(c) that includes: selection criteria, medical evaluation procedures, fit testing protocol, and maintenance schedule"
3. Verification must be measurable — not "ensure compliance" but "documented training roster with signatures from all affected employees, filed in safety office"
4. Order by priority (Critical first, then Major, then Minor)
5. Every corrective action must reference the specific regulatory requirement it addresses
6. When inspector notes mention specific details (locations, equipment, people, conditions), incorporate those details into the corrective action and verification`;
}

function exportCAPReport(capData, auditResult, industryKey) {
  const industry = INDUSTRIES[industryKey];
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const bandColor = RegLensScoring.getBandColor(auditResult.band);
  const sevColors = { Critical: "#dc2626", Major: "#d97706", Minor: "#3b82f6" };
  const sevBg = { Critical: "#fef2f2", Major: "#fffbeb", Minor: "#eff6ff" };

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Draft Corrective Action Plan — ${industry?.label || "General"}</title>
<style>
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } .no-print { display:none; } @page { margin: 0.5in; } }
  body { font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; max-width:850px; margin:0 auto; padding:32px 24px; color:#1a1a1a; line-height:1.5; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; padding-bottom:16px; border-bottom:3px solid #111; }
  h1 { font-size:22px; margin:0 0 4px; }
  h2 { font-size:16px; margin:24px 0 12px; padding-bottom:6px; border-bottom:2px solid #e5e7eb; }
  .draft-badge { display:inline-block; padding:4px 12px; border-radius:6px; background:#FEF3C7; color:#92400E; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px; }
  .score-summary { display:flex; gap:16px; align-items:center; padding:16px; border-radius:12px; background:#f9fafb; border:1px solid #e5e7eb; margin-bottom:20px; }
  .score-num { font-size:36px; font-weight:800; color:${bandColor}; }
  .action-card { border:1px solid #e5e7eb; border-radius:10px; padding:16px; margin-bottom:12px; page-break-inside:avoid; }
  .action-card.critical { border-left:4px solid #dc2626; }
  .action-card.major { border-left:4px solid #d97706; }
  .action-card.minor { border-left:4px solid #3b82f6; }
  .sev { font-size:10px; font-weight:700; padding:2px 8px; border-radius:4px; text-transform:uppercase; display:inline-block; }
  .field-label { font-size:10px; font-weight:700; text-transform:uppercase; color:#6b7280; margin-top:10px; margin-bottom:2px; }
  .field-value { font-size:12px; color:#374151; }
  .reg { font-family:monospace; font-size:11px; color:#16a34a; }
  .timeline { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; }
  .timeline-immediate { background:#fef2f2; color:#dc2626; }
  .timeline-short { background:#fffbeb; color:#d97706; }
  .timeline-standard { background:#eff6ff; color:#3b82f6; }
  .disclaimer { font-size:10px; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:16px; margin-top:32px; }
  .sign-block { display:flex; gap:32px; margin-top:24px; }
  .sign-line { flex:1; border-bottom:1px solid #999; padding-top:40px; font-size:10px; color:#6b7280; }
  .print-btn { position:fixed; bottom:20px; right:20px; padding:12px 24px; background:#111; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; }
</style></head><body>

<div class="header">
  <div>
    <div class="draft-badge">Draft — For Review Only</div>
    <h1>Corrective Action Plan</h1>
    <div style="color:#6b7280; font-size:13px;">${industry?.icon || ""} ${industry?.label || "General"} — ${date}</div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:13px; font-weight:700;">RegLens</div>
    <div style="font-size:11px; color:#6b7280;">by Prudence EHS</div>
  </div>
</div>

<div class="score-summary">
  <div class="score-num">${auditResult.score}</div>
  <div>
    <div style="font-size:14px; font-weight:700;">${auditResult.band}</div>
    <div style="font-size:12px; color:#6b7280;">${capData.actions.length} corrective actions identified · ${capData.actions.filter(a => a.severity === "Critical").length} critical</div>
  </div>
</div>

<h2>Corrective Actions</h2>`;

  capData.actions.forEach((action, i) => {
    const sevClass = action.severity === "Critical" ? "critical" : action.severity === "Major" ? "major" : "minor";
    const sevBgStyle = action.severity === "Critical" ? "background:#fef2f2;color:#dc2626;" : action.severity === "Major" ? "background:#fffbeb;color:#d97706;" : "background:#eff6ff;color:#3b82f6;";
    const tlClass = action.severity === "Critical" ? "timeline-immediate" : action.severity === "Major" ? "timeline-short" : "timeline-standard";

    html += `
    <div class="action-card ${sevClass}">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
        <span style="font-size:11px; font-weight:700; color:#6b7280;">#${i + 1}</span>
        <span class="sev" style="${sevBgStyle}">${action.severity}</span>
        <span class="reg">${action.regulation}</span>
        <span class="timeline ${tlClass}">${action.timeline}</span>
      </div>
      <div style="font-size:13px; font-weight:600; margin-bottom:4px;">${action.finding}</div>

      <div class="field-label">Corrective Action</div>
      <div class="field-value">${action.corrective_action}</div>

      <div style="display:flex; gap:24px; flex-wrap:wrap;">
        <div style="flex:1; min-width:200px;">
          <div class="field-label">Responsible Party</div>
          <div class="field-value">${action.responsible_party}</div>
        </div>
        <div style="flex:1; min-width:200px;">
          <div class="field-label">Target Completion</div>
          <div class="field-value">${action.timeline}</div>
        </div>
      </div>

      <div class="field-label">Verification Criteria</div>
      <div class="field-value">${action.verification}</div>

      ${action.resources ? `<div class="field-label">Resources / Estimated Cost</div><div class="field-value">${action.resources}</div>` : ""}

      <div style="display:flex; gap:16px; margin-top:12px; padding-top:8px; border-top:1px solid #f3f4f6;">
        <div style="flex:1;"><span class="field-label">Status:</span> <span style="font-size:11px; color:#6b7280;">☐ Not Started &nbsp; ☐ In Progress &nbsp; ☐ Completed</span></div>
        <div><span class="field-label">Date Completed:</span> <span style="font-size:11px; color:#6b7280;">___________</span></div>
      </div>
    </div>`;
  });

  html += `
<h2>Summary by Priority</h2>
<table style="width:100%; border-collapse:collapse; font-size:12px;">
  <tr style="background:#f9fafb;"><th style="padding:8px; text-align:left; border-bottom:1px solid #e5e7eb;">Severity</th><th style="padding:8px; text-align:center; border-bottom:1px solid #e5e7eb;">Count</th><th style="padding:8px; text-align:left; border-bottom:1px solid #e5e7eb;">Target Timeline</th></tr>
  <tr><td style="padding:8px; border-bottom:1px solid #f3f4f6; color:#dc2626; font-weight:600;">Critical</td><td style="padding:8px; text-align:center; border-bottom:1px solid #f3f4f6;">${capData.actions.filter(a => a.severity === "Critical").length}</td><td style="padding:8px; border-bottom:1px solid #f3f4f6;">Immediate (1-7 days)</td></tr>
  <tr><td style="padding:8px; border-bottom:1px solid #f3f4f6; color:#d97706; font-weight:600;">Major</td><td style="padding:8px; text-align:center; border-bottom:1px solid #f3f4f6;">${capData.actions.filter(a => a.severity === "Major").length}</td><td style="padding:8px; border-bottom:1px solid #f3f4f6;">Short-term (30 days)</td></tr>
  <tr><td style="padding:8px; color:#3b82f6; font-weight:600;">Minor</td><td style="padding:8px; text-align:center;">${capData.actions.filter(a => a.severity === "Minor").length}</td><td style="padding:8px;">Standard (90 days)</td></tr>
</table>

<div class="sign-block">
  <div class="sign-line">Prepared By</div>
  <div class="sign-line">Reviewed By</div>
  <div class="sign-line">Date</div>
</div>

<div class="disclaimer">
  <strong>DRAFT — FOR REVIEW ONLY</strong><br><br>
  This Corrective Action Plan was generated by AI based on self-reported EHS Readiness Check responses. It is a draft document intended to serve as a starting point for developing a formal corrective action plan.
  <br><br>
  This document does not constitute a formal compliance audit, legal opinion, or certification of regulatory compliance. All corrective actions should be reviewed by a qualified EHS professional before implementation. The employer retains sole responsibility for maintaining a safe workplace and complying with all applicable OSHA, EPA, and state regulations.
  <br><br>
  For expert review and finalization of this plan, contact Prudence EHS at <a href="mailto:info@prudencesafety.com">info@prudencesafety.com</a>.
  <br><br>
  <strong>Generated by:</strong> RegLens by Prudence EHS — Germantown, MD<br>
  <strong>Date:</strong> ${date}
</div>

<button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Corrective-Action-Plan-${industry?.label?.replace(/[^a-zA-Z]/g, "-") || "General"}-${new Date().toISOString().split("T")[0]}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportAuditReport(auditResult, auditResponses, auditIndustry, auditPhotos, auditNotes) {
  const sections = getAuditSections(auditIndustry);
  const industry = INDUSTRIES[auditIndustry];
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const bandColor = RegLensScoring.getBandColor(auditResult.band);
  const statusLabel = { yes: "✅ Compliant", partial: "⚠️ Partial", no: "❌ Non-Compliant", na: "— N/A" };
  const statusColor = { yes: "#16a34a", partial: "#d97706", no: "#dc2626", na: "#6b7280" };

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>EHS Readiness Check Report — ${industry?.label || "General"}</title>
<style>
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none; } }
  body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 24px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #111; }
  .score-box { text-align: center; padding: 16px 24px; border-radius: 12px; border: 2px solid ${bandColor}; background: ${bandColor}08; margin-bottom: 20px; }
  .score-num { font-size: 48px; font-weight: 800; color: ${bandColor}; }
  .score-band { font-size: 14px; font-weight: 600; color: ${bandColor}; }
  .stats { display: flex; gap: 16px; justify-content: center; margin: 12px 0; }
  .stat { text-align: center; padding: 8px 12px; border-radius: 8px; background: #f9fafb; }
  .stat-num { font-size: 20px; font-weight: 700; }
  .stat-label { font-size: 10px; text-transform: uppercase; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
  td { padding: 8px; border-bottom: 1px solid #f3f4f6; font-size: 13px; vertical-align: top; }
  .sev { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
  .sev-critical { background: #fef2f2; color: #dc2626; }
  .sev-major { background: #fffbeb; color: #d97706; }
  .sev-minor { background: #eff6ff; color: #3b82f6; }
  .reg { font-family: monospace; font-size: 11px; color: #16a34a; }
  .gap-section { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; }
  .gap-title { font-weight: 600; font-size: 13px; margin-bottom: 2px; }
  .disclaimer { font-size: 10px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 32px; }
  .print-btn { position: fixed; bottom: 20px; right: 20px; padding: 12px 24px; background: #111; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
</style></head><body>

<div class="header">
  <div>
    <h1>EHS Readiness Check Report</h1>
    <div style="color: #6b7280; font-size: 13px;">${industry?.icon || ""} ${industry?.label || "General"} — ${date}</div>
  </div>
  <div style="text-align: right;">
    <div style="font-size: 13px; font-weight: 700;">RegLens</div>
    <div style="font-size: 11px; color: #6b7280;">by Prudence EHS</div>
  </div>
</div>

<div class="score-box">
  <div class="score-num">${auditResult.score}</div>
  <div class="score-band">${auditResult.band}</div>
  <div class="stats">
    <div class="stat"><div class="stat-num" style="color:#16a34a">${auditResult.stats.yes}</div><div class="stat-label">Compliant</div></div>
    <div class="stat"><div class="stat-num" style="color:#d97706">${auditResult.stats.partial}</div><div class="stat-label">Partial</div></div>
    <div class="stat"><div class="stat-num" style="color:#dc2626">${auditResult.stats.no}</div><div class="stat-label">Non-Compliant</div></div>
    <div class="stat"><div class="stat-num" style="color:#6b7280">${auditResult.stats.na}</div><div class="stat-label">N/A</div></div>
  </div>
</div>`;

  // Gaps summary
  if (auditResult.findings.length > 0) {
    html += `<h2>⚠️ Gaps Requiring Attention (${auditResult.findings.length})</h2>`;
    auditResult.findings.forEach(f => {
      const sevClass = f.severity === "Critical" ? "sev-critical" : f.severity === "Major" ? "sev-major" : "sev-minor";
      const photos = (auditPhotos || {})[f.id] || [];
      const photoHtml = photos.length > 0 ? `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">${photos.map(p => `<img src="${p.dataUrl}" style="width:120px;height:90px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;" />`).join("")}</div>` : "";
      html += `<div class="gap-section">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span class="sev ${sevClass}">${f.severity}</span>
          <span style="font-size:10px;color:#6b7280;">${f.status === "no" ? "NOT IN PLACE" : "PARTIALLY IN PLACE"}</span>
          ${photos.length > 0 ? `<span style="font-size:10px;color:#3b82f6;">📷 ${photos.length} photo${photos.length > 1 ? "s" : ""}</span>` : ""}
        </div>
        <div class="gap-title">${f.text}</div>
        <div class="reg">${f.reg}</div>
        ${photoHtml}
      </div>`;
    });
  }

  // Full section-by-section breakdown
  html += `<h2>📋 Complete Audit Results</h2>`;
  sections.forEach(sec => {
    html += `<h2>${sec.icon} ${sec.title}</h2><table><tr><th style="width:35%">Item</th><th>Regulation</th><th>Severity</th><th>Status</th><th>Notes</th><th>Evidence</th></tr>`;
    sec.items.forEach(item => {
      const answer = auditResponses[item.id] || "—";
      const label = statusLabel[answer] || "— Not answered";
      const color = statusColor[answer] || "#6b7280";
      const sevClass = item.severity === "Critical" ? "sev-critical" : item.severity === "Major" ? "sev-major" : "sev-minor";
      const photos = (auditPhotos || {})[item.id] || [];
      const photoCell = photos.length > 0 ? photos.map(p => `<img src="${p.dataUrl}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb;margin:2px;" />`).join("") : `<span style="color:#d1d5db;font-size:11px;">—</span>`;
      const noteText = (auditNotes || {})[item.id] || "";
      html += `<tr>
        <td>${item.text}</td>
        <td class="reg">${item.reg}</td>
        <td><span class="sev ${sevClass}">${item.severity}</span></td>
        <td style="color:${color};font-weight:600;font-size:12px;white-space:nowrap;">${label}</td>
        <td style="font-size:11px;color:#374151;max-width:150px;">${noteText || '<span style="color:#d1d5db;">—</span>'}</td>
        <td style="min-width:70px;">${photoCell}</td>
      </tr>`;
    });
    html += `</table>`;
  });

  html += `
<div class="disclaimer">
  <strong>Disclaimer:</strong> This EHS Readiness Check report is based on self-reported responses and is advisory in nature. 
  It does not constitute a formal compliance audit, legal opinion, or certification of regulatory compliance. 
  The employer retains sole responsibility for maintaining a safe workplace and complying with all applicable 
  OSHA, EPA, and state regulations. For a comprehensive compliance evaluation, contact a qualified safety professional.
  <br><br>
  <strong>Prepared by:</strong> RegLens by Prudence EHS — Germantown, MD
  <br><strong>Report Date:</strong> ${date}
</div>

<button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `EHS-Readiness-${industry?.label?.replace(/[^a-zA-Z]/g, "-") || "General"}-${new Date().toISOString().split("T")[0]}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Program-Industry Context Matrix ───
const PROGRAM_SCOPE = { "safety-plan": "broad", eap: "broad", "fire-prevention": "broad", "injury-illness": "moderate", sds: "narrow", respiratory: "narrow", spcc: "narrow", loto: "narrow", electrical: "narrow", "fall-protection": "narrow", bbp: "narrow", hearing: "narrow", "radiation-safety": "narrow", "confined-space": "narrow" };

const PROGRAM_INDUSTRY_CONTEXT = {
  hearing: { manufacturing: "Noise sources: stamping presses, grinding, pneumatic tools, CNC machines, compressors. Typical 85-105 dBA. Dual protection often needed in stamping areas.", construction: "Noise sources: jackhammers, concrete saws, pile drivers, pneumatic nailers, heavy equipment. Intermittent, task-dependent exposures.", "commercial-re": "Generally low risk. Mechanical rooms with HVAC, generators may need monitoring for maintenance staff.", healthcare: "MRI acoustic noise, dental high-speed drills, central sterilization ultrasonic cleaners, ambulance sirens.", "government-municipal": "Public works equipment (mowers, leaf blowers, chainsaws), water/wastewater pumps, firing ranges.", warehousing: "Conveyors, packaging equipment, forklifts, dock operations. Typically moderate 80-90 dBA sustained.", "food-service": "Kitchen ventilation hoods, dishwashers, blenders, food processors. Generally low risk.", laboratory: "Sonicators, centrifuges, vacuum pumps, fume hood blowers, autoclaves. Typically moderate 75-85 dBA sustained. High-frequency noise from ultrasonic equipment often overlooked.", energy: "Turbines, generators, transformers, compressor stations, drilling equipment. Often exceeds 90 dBA.", automotive: "Pneumatic impact wrenches, air compressors, grinding/buffing, engine dynos. Typical 85-95 dBA.", aviation: "Ramp operations 95-115 dBA, engine run-ups 120-140 dBA, APU 90-100 dBA, riveting 100-115 dBA, ground power units 85-95 dBA. Double hearing protection mandatory for engine run areas. Intermittent high-intensity exposures complicate TWA calculations.", "data-center": "CRAC/CRAH units sustained 75-85 dBA on data floor, backup generators 95-105 dBA during testing, UPS rooms 80-90 dBA. Continuous low-frequency noise creates cumulative exposure risk for facility staff." },
  respiratory: { manufacturing: "Welding fumes, paint overspray (isocyanates), grinding dust, chemical vapors, oil mist from machining.", construction: "Crystalline silica (concrete cutting), asbestos in demolition, lead paint, welding fumes, wood dust.", "commercial-re": "Mold remediation, asbestos in older buildings, paint fumes during renovation, chemical cleaning agents.", healthcare: "Infectious aerosols (TB, COVID), anesthetic gases, formaldehyde, ethylene oxide, hazardous drugs (chemo).", "government-municipal": "Chlorine at water plants, H2S in wastewater, dust during road work, asbestos in older buildings.", warehousing: "Forklift exhaust in enclosed spaces, dust from packaging, chemical vapors from damaged goods.", "food-service": "Flour dust (baker's asthma), cooking smoke, cleaning chemical fumes, CO from gas equipment.", laboratory: "Chemical fumes and vapors (organic solvents, acids, formaldehyde), particulates from weighing powders, biological aerosols, anesthetic gases in animal research, nanomaterial handling. Fume hood is primary engineering control — respiratory protection for hood failures and field sampling.", energy: "H2S in oil/gas, natural gas leaks, welding fumes, confined space atmospheres.", automotive: "Brake dust (possible asbestos), paint booth isocyanates, welding fumes, exhaust CO, solvent vapors.", aviation: "Composite dust (carbon fiber, fiberglass) during sanding/drilling, chromated primer fumes (hexavalent chromium), paint stripping compounds (methylene chloride alternatives), fuel vapor during tank entry, de-icing fluid mist, solvent vapors from parts cleaning. Fuel tank entry requires supplied-air respirators.", "data-center": "Battery room hydrogen gas and sulfuric acid mist, diesel exhaust during generator testing, halon/clean agent discharge residue, dust from construction in active facilities, soldering fumes during equipment installation." },
  loto: { manufacturing: "Energy: electrical (motors, panels), hydraulic (presses), pneumatic (cylinders), mechanical (flywheels, conveyors), thermal (ovens), gravitational. Machine-specific procedures essential.", construction: "Energy: electrical (temporary power), hydraulic (excavators), pneumatic (nail guns), mechanical (cranes). Multi-employer coordination critical.", "commercial-re": "Energy: electrical (HVAC, elevators, panels), hydraulic (elevators), mechanical (escalators). Contractor LOTO coordination during buildouts.", healthcare: "Energy: electrical (medical equipment, autoclaves), pneumatic (medical gas), hydraulic (lifts), radiation. Patient safety during equipment lockout.", "government-municipal": "Energy: electrical (water pumps, traffic systems), mechanical (treatment equipment), hydraulic (heavy equipment). Multiple facility types need different procedures.", warehousing: "Energy: electrical (conveyors, chargers, dock levelers), mechanical (conveyors, balers), hydraulic (dock plates). Conveyor lockout most commonly deficient.", energy: "High-voltage electrical, hydraulic (turbines), pneumatic, stored energy (capacitors). Clearance procedures and live-dead-live testing critical.", automotive: "Energy: electrical (vehicle batteries, lifts), hydraulic (lifts, brake systems), pneumatic (air tools), gravitational (vehicles on lifts). Vehicle vs shop equipment procedures differ.", laboratory: "Energy: electrical (analytical instruments, autoclaves, ovens, UV lamps), thermal (ovens, furnaces, autoclaves), pressure (compressed gas systems, autoclaves, vacuum lines), chemical (reactive chemicals that must be neutralized before equipment servicing). Autoclave LOTO is frequently deficient — maintenance requires full depressurization and cool-down verification.", aviation: "Energy: electrical (aircraft electrical systems, ground power units), hydraulic (flight controls, landing gear — stored pressure up to 3000 PSI), pneumatic (bleed air systems), gravitational (flight control surfaces, landing gear doors, cargo doors), chemical (fuel systems, oxygen systems). Aircraft-specific lockout procedures must reference OEM maintenance manuals. Multiple energy sources per system common.", "data-center": "Energy: electrical (high-voltage switchgear, PDUs, UPS, redundant A+B feeds), stored energy (UPS batteries, capacitor banks), mechanical (cooling fans, pumps). Redundant power architecture makes isolation extremely complex — dual-feed lockout procedures critical. Upstream/downstream coordination required." },
  sds: { manufacturing: "Common chemicals: cutting fluids, solvents (acetone, toluene, MEK), adhesives, welding gases, paints, lubricants, acids. Secondary container labeling on production floor frequently deficient.", construction: "Portland cement, curing compounds, adhesives, sealants, paints, diesel fuel, hydraulic fluid. Multi-employer communication to subcontractors critical.", "commercial-re": "Cleaning chemicals, HVAC refrigerants, pesticides, paint/coatings. Tenant notification of building-wide chemical use often overlooked.", healthcare: "Disinfectants (glutaraldehyde, peracetic acid), hazardous drugs (chemo), formaldehyde, ethylene oxide, lab reagents. Hazardous drug handling is growing OSHA focus.", "government-municipal": "Water treatment chemicals (chlorine, fluoride), wastewater chemicals, road materials, parks pesticides, custodial chemicals across multiple facilities.", warehousing: "Battery acid (forklift charging), cleaning chemicals, fuel/lubricants, shipped hazardous materials. Spill response for unknown damaged containers is unique challenge.", automotive: "Motor oils, transmission fluids, brake fluid, antifreeze, solvents, paint/primer, battery acid, refrigerants, gasoline/diesel. High variety in small quantities.", laboratory: "Extremely high chemical diversity — hundreds of SDSs typical. Includes corrosives (HCl, H2SO4, NaOH), flammable solvents (acetone, ethanol, hexane), carcinogens (formaldehyde, benzene, chloroform), oxidizers, cryogens (liquid nitrogen), and compressed gases. Chemical Hygiene Plan must reference SDS access procedures. Peroxide-forming chemicals require special tracking.", aviation: "Jet-A and AVGAS fuels, hydraulic fluids (Skydrol — phosphate ester based, causes severe skin/eye burns), de-icing/anti-icing fluids (propylene/ethylene glycol), chromated primers and paints (hexavalent chromium), sealants (polysulfide, silicone), composite resins and hardeners, oxygen system cleaning solvents, turbine engine oil. High chemical diversity across maintenance operations.", "data-center": "Battery electrolyte (sulfuric acid), diesel fuel for generators, HVAC refrigerants (R-410A, R-134a), cleaning solvents for electronics, halon/clean agent suppression chemicals (FM-200, Novec 1230). Contractor chemical coordination critical during construction phases." },
  "fall-protection": { manufacturing: "Fall hazards: mezzanine edges, loading docks, elevated platforms, fixed ladders to rooftops, crane access, tank/vessel access. Guardrail integrity commonly deficient.", construction: "Leading edges, floor openings, scaffolds, steel erection, roofing, ladders, aerial lifts, excavation edges. Competent person per subcontractor often missing.", "commercial-re": "Rooftop HVAC maintenance, window washing, atrium/skylight work, parking garage edges, dock edges. Roof anchor inspection for contractor use frequently overlooked.", energy: "Pole climbing, transmission towers, wind turbines, substation equipment. 100% tie-off policies and rescue from height critical.", warehousing: "Loading dock edges (4+ ft), mezzanines, elevated racking maintenance, fixed ladders. Dock door protection when trailer absent is specific requirement." },
  electrical: { manufacturing: "Motor control centers, VFDs, industrial panels (480V/277V), machine cabinets. Arc flash energy varies significantly — equipment-specific labeling essential.", construction: "Temporary power, GFCI requirements, overhead power line proximity, wet conditions. Assured grounding conductor program required as GFCI alternative.", healthcare: "Emergency power, medical circuits, isolated power in wet locations, UPS systems, high-voltage imaging. NFPA 99 healthcare-specific electrical requirements.", energy: "Generation voltages (4kV-500kV+), substation equipment, distribution lines, capacitor banks, battery storage. OSHA 1910.269 specialized requirements.", automotive: "Vehicle batteries, hybrid/EV high-voltage (up to 800V), welder connections, chargers. EV electrical safety is emerging hazard requiring specific training.", laboratory: "Analytical instruments (HPLC, GC-MS, mass spectrometers) with high-voltage power supplies, autoclaves, ovens, centrifuges. Wet environments increase shock risk. GFCI required near sinks and wet areas. X-ray equipment electrical safety. Laser power supplies.", aviation: "Aircraft electrical systems (28VDC, 115VAC/400Hz), ground power units (115/200VAC), hangar power distribution, battery shops (lead-acid and lithium), avionics test equipment. Arc flash risk at main hangar distribution panels. Ground power connection/disconnection procedures critical.", "data-center": "Main switchgear (4kV-15kV), automatic transfer switches, UPS systems (480V), power distribution units (208V-480V), busway systems, battery strings (48V-400V DC). Arc flash incident energy at main switchboards can exceed 40 cal/cm2. Redundant feeds create re-energization risk during LOTO. NFPA 70E compliance is critical — equipment-specific labeling, PPE categories, and energized work permits for live troubleshooting." },
  bbp: { healthcare: "Needlesticks, surgical sharps, splash exposure, specimen handling, patient fluid contact, laundry, medical waste. Frontline input on safer sharps required annually.", "government-municipal": "First responder blood contact, corrections incidents, needle finds in parks, animal control bites. Incidental vs routine exposure classification often incomplete.", laboratory: "BSL-2/3 work with human blood, tissue, and cell lines. Sharps from needles, scalpels, broken glassware. Animal research bite/scratch exposure. Routine exposure classification for lab personnel working with human-derived materials.", manufacturing: "First aid response to lacerations and machine injuries. Designated first aid providers are primary exposure group." },
  "injury-illness": { manufacturing: "High recordable rates from lacerations, crush injuries, MSD from repetitive assembly, and chemical exposures.", construction: "Multi-employer recordkeeping responsibilities often confused. Falls, electrocutions, struck-by, and caught-in (Fatal Four).", "commercial-re": "Slips, trips, and falls are the dominant injury type. Contractor injury recordkeeping responsibility must be clearly defined.", healthcare: "High-volume: needlesticks, patient-handling MSDs, workplace violence. Sharps injuries require both OSHA 301 and separate sharps injury log.", "government-municipal": "State-plan states have separate recordkeeping rules for public sector employers.", warehousing: "High injury frequency. Forklift incidents, overexertion, and struck-by are top types.", "food-service": "Cuts, burns, slips, and overexertion frequently misclassified as first-aid only.", laboratory: "Chemical splashes and burns, glassware lacerations, needle sticks, ergonomic injuries from repetitive pipetting and microscope work, slip/fall on wet lab floors. Exposure incidents (chemical inhalation, skin contact with carcinogens) require medical evaluation and documentation.", energy: "Low-frequency, high-severity. Fatalities trigger mandatory 8-hour/24-hour OSHA notifications.", automotive: "Lacerations, MSD from overhead work, and chemical burns are top types. Small shops often unaware of 1904 applicability.", aviation: "Struck-by (aircraft, vehicles, equipment in movement areas), falls from aircraft surfaces and maintenance stands, MSD from awkward postures inside fuselage, hearing loss from chronic noise exposure, chemical burns from hydraulic fluid contact, FOD injuries (lacerations from debris). Multi-employer sites with airlines, ground handlers, and maintenance contractors complicate recordkeeping.", "data-center": "Ergonomic injuries from server lifting and racking (40-80 lb units repeatedly), electrical contact incidents, slip/fall on raised floor tiles, heat stress in hot aisles, contractor injuries during construction/expansion phases. Multi-employer site — staffing agency and contractor injury recordkeeping responsibilities must be clearly defined." },
  spcc: { manufacturing: "Hydraulic oil systems, lubricant bulk storage, waste oil, machining coolant tanks, transformer oil, diesel for generators/forklifts.", "commercial-re": "Generator diesel tanks, transformer oil in vaults, hydraulic elevator fluid.", energy: "Transformer oil (large volumes at substations), turbine lubricants, diesel backup generation, PCB-containing legacy equipment.", aviation: "Jet fuel storage (above-ground and underground tanks — often 50,000-500,000+ gallon aggregate), AVGAS, hydraulic fluid, de-icing fluid, waste oil. Airport SPCC plans must address fueling operations, hangar floor drains, stormwater, and vehicle maintenance. FAA and EPA jurisdiction overlap on airport fuel storage.", laboratory: "Flammable solvent storage (acetone, hexane, ethanol — often aggregate volumes exceed SPCC thresholds), vacuum pump oil, hydraulic press oil, backup generator fuel. Many labs underestimate aggregate oil storage and fail to evaluate SPCC applicability.", "data-center": "Diesel fuel storage for backup generators (often 10,000-50,000+ gallons aggregate across multiple day tanks and bulk storage), transformer oil, UPS battery electrolyte. Many data centers exceed the 1,320-gallon SPCC threshold. Generator fuel delivery and secondary containment around day tanks frequently deficient." },
};

// ─── Review Templates (upgraded prompts — NO score generation) ───
function buildReviewPrompt(type, label) {
  return `You are a Certified Safety Professional (CSP) conducting a compliance review of a ${label} for a B2B client. You have deep expertise in OSHA 29 CFR 1910 (General Industry), 1926 (Construction), EPA regulations, ANSI, NFPA, and ACGIH standards.

RULES — follow these exactly:
- Never invent regulations. Only cite regulations that actually exist.
- Every finding MUST cite a specific regulatory section (e.g., 29 CFR 1910.134(c)(1)).
- Label each finding as either "Regulatory Requirement" or "Best Practice".
- Do NOT produce a score. Scoring is applied separately by the system.
- Include 3-8 findings and 2-4 strengths based on actual document content.
- Respond ONLY with valid JSON. No markdown, no backticks, no text outside the JSON.

Return this exact JSON structure:
{"summary":"2-sentence assessment","findings":[{"id":"F-001","severity":"Critical","title":"Finding title","description":"What is wrong","regulation":"29 CFR xxxx.xxx(x)","requirement_type":"Regulatory Requirement","recommendation":"How to fix it"}],"strengths":["Strength 1","Strength 2"],"documentType":"${label}"}

Severity definitions:
- Critical: Missing required elements, regulatory non-compliance creating serious safety risk
- Major: Significant gaps in implementation or documentation
- Minor: Small issues, clarity gaps, or best practice improvements`;
}

const REVIEW_TEMPLATES = {
  "safety-plan": { label: "Safety & Health Plan", icon: "🦺", desc: "OSHA general industry & construction" },
  "injury-illness": { label: "Injury & Illness Reporting", icon: "🩹", desc: "OSHA 1904 recordkeeping & reporting" },
  sds: { label: "SDS / HazCom", icon: "☣️", desc: "Hazard communication compliance" },
  respiratory: { label: "Respiratory Protection", icon: "😷", desc: "29 CFR 1910.134 compliance" },
  spcc: { label: "SPCC Plan", icon: "🛢️", desc: "EPA spill prevention review" },
  loto: { label: "Lockout/Tagout", icon: "🔒", desc: "Energy control compliance" },
  electrical: { label: "Electrical Safety", icon: "⚡", desc: "NFPA 70E / arc flash compliance" },
  "fall-protection": { label: "Fall Protection Plan", icon: "🧗", desc: "#1 most cited OSHA standard" },
  eap: { label: "Emergency Action Plan", icon: "🚨", desc: "Required for all employers" },
  bbp: { label: "Bloodborne Pathogens", icon: "🩸", desc: "Exposure control for healthcare" },
  hearing: { label: "Hearing Conservation", icon: "🔊", desc: "Noise exposure program" },
  "fire-prevention": { label: "Fire Prevention Plan", icon: "🔥", desc: "NFPA fire safety compliance" },
  "radiation-safety": { label: "Radiation Safety", icon: "☢️", desc: "NRC/state ionizing & non-ionizing radiation" },
  "confined-space": { label: "Confined Space", icon: "🕳️", desc: "Permit-required confined space entry program" },
};

// ─── Demo Documents (unchanged) ───
const DEMO_DOCS = {
  "safety-plan": `ACME Manufacturing Safety & Health Plan - Revision 3\nEffective Date: January 2024\n\n1. Purpose: This plan establishes safety procedures for ACME Manufacturing facility operations.\n2. Scope: Applies to all employees and contractors at the main production facility.\n3. Responsibilities: Management shall provide safe working conditions. Employees shall follow all safety rules.\n4. Hazard Assessment: Annual workplace inspections will be conducted. No specific methodology defined for hazard assessment frequency or documentation requirements.\n5. Personal Protective Equipment: Safety glasses required in production areas. Hard hats required in warehouse. No PPE hazard assessment has been completed per OSHA requirements.\n6. Emergency Action Plan: Fire extinguishers located throughout facility. Evacuation routes posted. No designated assembly points identified. Emergency drills conducted "periodically."\n7. Training: New hire orientation includes safety overview. Annual refresher training planned but no specific curriculum or documentation process established.\n8. Recordkeeping: Injury reports filed with HR department. OSHA 300 log maintained by safety coordinator.\n9. Machine Guarding: Equipment guards shall not be removed during operation. No specific LOTO procedures referenced.\n10. Fall Protection: Employees working above 4 feet shall use appropriate fall protection. No written fall protection plan or competent person designated.\n11. Confined Space: Permit-required confined spaces have been identified in the boiler room. Entry procedures to be developed.\n12. Electrical Safety: Only qualified persons shall work on electrical equipment. No arc flash assessment referenced.`,
  "injury-illness": `Injury and Illness Recordkeeping Program - ACME Industries\nEffective Date: March 2022 | Last Review: March 2022\n\n1. Purpose: This program establishes procedures for recording and reporting work-related injuries and illnesses.\n2. Scope: Applies to all ACME facilities with 10 or more employees.\n3. Responsible Persons: Safety Coordinator maintains the OSHA 300 log. HR Director signs the OSHA 300A summary. No alternate designated.\n4. OSHA 300 Log: Maintained on paper. Entries completed within 30 days of receiving information. Three years of logs on file. Current year log not reviewed for accuracy since January.\n5. OSHA 300A Summary: Completed annually. Signed by Safety Coordinator (not a company executive). Posted in break room.\n6. OSHA 301 Incident Reports: Workers' compensation first report used in lieu of OSHA 301. Forms completed within 2 weeks of incident.\n7. Recordability Determination: Supervisor makes initial determination. No documented criteria or flowchart used. No second-level review process.\n8. Reporting to OSHA: "Serious injuries reported to OSHA as required." No written procedure for fatality (8-hour) or severe injury (24-hour) notification. No designated person to make OSHA notifications.\n9. Electronic Submission: Not addressed in program. Facility has 320 employees.\n10. Employee Access: "Employees may request injury records through HR." Response timeframe not defined.\n11. Near-Miss Reporting: Encouraged verbally by supervisors. No formal near-miss report form or tracking system.\n12. Contractor Injuries: "Contractors responsible for their own recordkeeping." No process to determine which employer records shared-workforce injuries.\n13. First Aid List: References a first aid list from 2019. Not reviewed or updated since.\n14. Privacy Concerns: "Privacy cases handled per OSHA requirements." No specific procedure documented.`,
  sds: `ACME Chemical Inventory & HazCom Program Summary\n\nWritten Program: Yes, last updated 2021\nProgram Administrator: Safety Coordinator (position currently vacant)\n\nChemical Inventory:\n- Acetone (CAS 67-64-1) - SDS on file, last updated 2019\n- Toluene (CAS 108-88-3) - SDS on file, last updated 2020\n- Isopropyl Alcohol (CAS 67-63-0) - SDS missing\n- Hydrochloric Acid 37% (CAS 7647-01-0) - SDS on file, last updated 2018\n- Various cleaning products - "manufacturer labels sufficient"\n\nLabeling: Containers use original manufacturer labels. No secondary container labeling system in place. Transfer containers unlabeled.\nTraining: Initial training at hire. No annual refresher documented.\nSDS Access: Binder in break room and supervisor office. No electronic access. Night shift access not verified.\nContractor Communication: Verbal notification of hazards. No written process.`,
  respiratory: `Respiratory Protection Program - Draft\nFacility: ACME Processing Plant\n\n1. Program Overview: Respirators are used in the paint booth and welding areas.\n2. Respirator Selection: N95 filtering facepieces used for dust. Half-face APR with OV cartridges used in paint booth. Selection based on supervisor judgment.\n3. Medical Evaluations: Employees complete a questionnaire. PLHCP review not documented for all users.\n4. Fit Testing: Initial fit tests conducted at hire. Protocol not specified. Annual fit testing not consistently performed.\n5. Training: Employees shown how to don/doff respirators during orientation. Annual retraining not documented.\n6. Maintenance: Employees responsible for cleaning their own respirators. No inspection schedule.\n7. Program Evaluation: No formal evaluation process established. No air monitoring data referenced.\n8. Voluntary Use: Some employees wear dust masks voluntarily. Appendix D not distributed.`,
  spcc: `Spill Prevention, Control, and Countermeasure Plan\nFacility: ACME Industrial Campus\n\nTotal Oil Storage: 15,000 gallons (3 ASTs)\n\n1. Management Approval: Plan signed by facility manager. PE certification expired 2022. Last plan review: 2021.\n2. Facility Description: Industrial campus, 12 acres, adjacent to Mill Creek (navigable waterway 200ft from nearest tank).\n3. Secondary Containment: Diesel ASTs have concrete dike. Used oil tank - earthen berm, condition unknown.\n4. Inspections: Monthly visual inspections. Logs maintained inconsistently.\n5. Personnel Training: Annual spill response training. Last conducted 18 months ago.\n6. Discharge Prevention: Overfill alarms on diesel tanks. No overfill protection on used oil tank.\n7. Countermeasures: Spill kits located near each tank. Inventory not maintained.\n8. Amendments: Plan not amended despite addition of 500-gallon transformer oil unit last year.`,
  loto: `Energy Control Program - ACME Manufacturing\n\n1. Purpose: Prevent unexpected startup during maintenance.\n2. Scope: All maintenance activities on production equipment.\n3. Authorized Employees: Maintenance department. No specific list.\n4. Procedures: General procedure only. "Turn off, apply lock, verify." No machine-specific procedures.\n5. Devices: Padlocks issued. No tagout devices.\n6. Verification: "Verify de-energized before work." No specific method.\n7. Training: Covered at orientation. No refresher. No affected employee training documented.\n8. Periodic Inspection: "As needed." No annual inspection.\n9. Energy Sources: Electrical only. Hydraulic, pneumatic, gravitational not addressed.\n10. Contractors: "Will be informed." No written procedure.`,
  electrical: `Electrical Safety Program - ACME Facilities\n\n1. Purpose: Ensure safe work around electrical equipment.\n2. Qualified Persons: Licensed electricians. No formal qualified vs unqualified designation.\n3. Training: Journeyman certification. No NFPA 70E training. Non-electrical employees not trained on boundaries.\n4. Arc Flash: "Assessment to be scheduled." No incident energy analysis. No labels. PPE not based on hazard analysis.\n5. Energized Work: "Should be avoided." No formal permit process.\n6. PPE: Voltage-rated gloves. No arc-rated clothing. No arc-rated face shields.\n7. Equipment: Panels in good condition. Some directories incomplete.\n8. GFCIs: Required on construction. Office areas not assessed.\n9. Emergency: "Call 911." No AED locations. No CPR-trained responders designated.`,
  "fall-protection": `Fall Protection Program - ACME Construction\n\n1. Policy: All above 6 feet shall be protected.\n2. Competent Person: "Site supervisor responsible." No specific person designated.\n3. Equipment: Harnesses and 6-ft lanyards. No SRLs. No inspection log.\n4. Anchorage: "Use appropriate anchorage." None identified or rated.\n5. Training: "At hire." No curriculum. No annual refresher.\n6. Rescue: "Call 911." No rescue plan. No rescue equipment.\n7. Holes: Plywood covers. No labeling. No guardrail specs.\n8. Leading Edge: "Use caution near edges." No specific procedures.\n9. Roofing: Roof access via ladder. No rooftop anchorage. Parapet not assessed.`,
  eap: `Emergency Action Plan - ACME Office Building\nLast Updated: 2022\n\n1. Purpose: Emergency procedures for 3-floor, 150-employee building.\n2. Coordinator: John Smith, Facilities. No alternate.\n3. Reporting: Call 911. Notify front desk.\n4. Evacuation: Exit via nearest stairwell.\n5. Assembly: "Gather outside." No specific point.\n6. Accountability: "Supervisors account for team." No formal process.\n7. Alarm: Pull stations on each floor. No tone descriptions.\n8. Floor Plans: At elevator lobbies only.\n9. Drills: "Annually." Last drill: 14 months ago.\n10. Severe Weather: "Move to interior rooms." No designated shelters.\n11. Active Threat: Not addressed.\n12. Visitors: No provisions.\n13. Disabilities: No procedures for upper floors.`,
  bbp: `Bloodborne Pathogen Exposure Control Plan - ACME Healthcare Clinic\n\n1. Purpose: Minimize BBP exposure for clinic staff.\n2. Exposure Determination: Nurses/physicians Category 1. Janitorial not assessed.\n3. Universal Precautions: Good policy statement.\n4. Engineering Controls: Sharps containers in rooms. Fill monitoring not evaluated. Self-sheathing needles available but not mandated.\n5. PPE: Gloves and face shields available. No gown assessment.\n6. Hep B: Offered at hire. 3 new hires not yet offered (3 weeks).\n7. Post-Exposure: "Report to supervisor." No written protocol.\n8. Training: Annual. 85% complete. 15% overdue.\n9. Sharps Log: Maintained. Last 3 entries incomplete.\n10. Housekeeping: "Clean with bleach." No concentration documented.\n11. Annual Review: Last review 2023. No 2024 review.`,
  hearing: `Hearing Conservation Program - ACME Stamping Plant\n\n1. Monitoring: Area monitoring 2022. Stamping: 94 dBA. Assembly: 82 dBA. No personal dosimetry.\n2. Audiometric Testing: Baselines for current employees. Annual by clinic. No audiologist STS review.\n3. Hearing Protection: Foam earplugs NRR 29. One type only. No dual protection evaluation for 94 dBA.\n4. Training: "At hire." No annual refresher documented.\n5. Engineering Controls: No evaluation documented.\n6. Records: Monitoring on file. Audiometric at clinic only.\n7. STS Follow-up: No written procedure.\n8. New Employees: 3 hired in 6 months. Baselines not completed.`,
  "fire-prevention": `Fire Prevention Plan - ACME Office Park (3 Buildings)\n\n1. Fire Hazards: Electrical panels, kitchens, paper storage, chemical closet.\n2. Ignition Sources: No smoking policy. Electrical maintained.\n3. Suppression: Wet sprinklers. Last inspection 2 years ago (overdue).\n4. Extinguishers: ABC type. Monthly logs have 3-month gaps.\n5. Alarm: Addressable system. Last inspection unknown.\n6. Hot Work: "Supervisor approval." No formal permit.\n7. Housekeeping: Trash daily. Recycling accumulation undefined.\n8. Training: "Info given to tenants." No documentation. No extinguisher training.\n9. Responsible Persons: Maintenance team. No names.\n10. Flammable Storage: Paint/solvents in closet. No cabinet. No inventory.\n11. Cooking: Microwave/toaster. No suppression hood.`,
  "radiation-safety": `Radiation Safety Program — Regional Medical Center\n\n1. Purpose: Ensure safe use of ionizing radiation in diagnostic imaging and nuclear medicine.\n2. RSO: Dr. James Chen, Radiology Department Chair. Appointed 2021. No formal RSO training documentation on file.\n3. License: NRC Byproduct Material License #XX-XXXXX-XX. Expires 2027. Authorized for Tc-99m, I-131, and diagnostic X-ray.\n4. ALARA Policy: "Doses shall be kept as low as reasonably achievable." No specific dose investigation levels defined. No annual ALARA review documented.\n5. Personnel Monitoring: Whole-body badges issued to radiology staff. Three interventional cardiology nurses not badged. No extremity monitoring for fluoroscopy operators. Badge exchange quarterly.\n6. Radiation Surveys: Monthly surveys of storage areas. Survey meter (Ludlum 14C) last calibrated 18 months ago. Wipe tests for contamination performed "when needed."\n7. Posting: Caution Radiation Area signs at CT and fluoro rooms. Nuclear medicine hot lab posted. Two portable X-ray storage closets not posted. NRC Form 3 not displayed.\n8. Waste: Decay-in-storage for short-lived isotopes. Tc-99m waste held 10 half-lives. I-131 therapy patient waste protocol "follow standard procedure" — no written SOP.\n9. Training: Annual radiation safety training for authorized users. New hire orientation covers badge wearing. No documented training for nursing staff who handle nuclear medicine patients.\n10. Emergency Procedures: "In case of spill, contact RSO." No written spill procedures. No contamination response kit locations identified. No procedure for patient with therapeutic dose who expires.\n11. Instrument QA: Dose calibrator tested daily for constancy. Annual linearity and geometry testing by medical physicist. Survey meter daily battery check only.\n12. Sealed Sources: Brachytherapy sources inventoried semi-annually. One Cs-137 calibration source — last leak test 8 months ago (6 months required).`,
  "confined-space": `Permit-Required Confined Space Entry Program — ACME Water Treatment Facility\n\n1. Purpose: Establish procedures for safe entry into permit-required confined spaces at the facility.\n2. Scope: Applies to all employees who enter or support confined space entry operations. Covers tanks, vaults, wet wells, digesters, and below-grade pits.\n3. Space Inventory: Facility has identified 14 confined spaces. 11 are permit-required. 3 are non-permit. No inventory map. Last assessment 2020.\n4. Entry Procedures: "Obtain permit from supervisor." Permit form exists but missing fields for hot work, lockout verification, and communication method. Permit duration listed as "until job is complete" — no maximum time specified.\n5. Atmospheric Testing: 4-gas monitors available (O2, LEL, CO, H2S). Calibration records show 2 of 3 monitors overdue for bump test. Pre-entry testing required. No requirement documented for continuous monitoring during entry.\n6. Ventilation: Portable blowers available. No procedures for when ventilation is required vs. optional. No specification for air changes or flow rate.\n7. Attendant Duties: "Attendant must remain at opening." No written prohibition against attendant performing other duties. No communication procedures between entrant and attendant documented. Attendant-to-entrant ratio not specified for multiple entrants.\n8. Rescue: "Call 911 for rescue." No on-site rescue team. No non-entry rescue equipment (tripod/winch) documented. No rescue drill conducted. No verification that local fire department is capable of permit-space rescue.\n9. Training: Initial training documented for 8 of 12 affected employees. No refresher training schedule. No training for attendants specifically. No documentation of authorized entrant vs. entry supervisor designations.\n10. Entry Supervisor: "Shift supervisor authorizes entry." No documented verification that entry supervisors understand their responsibilities under 1910.146(d)(1). No cancellation criteria documented.\n11. Contractors: "Contractors must follow our program." No host employer/contractor coordination procedures. No information exchange documented for multi-employer entries.\n12. Program Review: Last annual review 2021. No review conducted after a near-miss event in digester #3 (H2S alarm, August 2023).\n13. Signage: "Danger — Confined Space" signs on 9 of 11 permit spaces. Two wet well access points not posted.\n14. LOTO Integration: Entry permit references LOTO but no cross-reference to specific energy control procedures for each space. No verification step on permit for LOTO confirmation.`,
};

// ─── Keyword Validation ───
const DOC_KEYWORDS = {
  "safety-plan": ["safety plan","hazard assessment","ppe","emergency action","osha 300","machine guarding","fall protection","confined space","recordkeeping","safety program"],
  "injury-illness": ["osha 300","300a","osha 301","recordkeeping","work-related","recordable","days away","restricted work","first aid","fatality","severe injury","incident report","near-miss","injury log","illness log","1904"],
  sds: ["hazcom","hazard communication","sds","safety data sheet","chemical inventory","ghs","labeling","cas ","1910.1200","secondary container"],
  respiratory: ["respiratory","respirator","fit test","n95","half-face","facepiece","1910.134","plhcp","medical evaluation","appendix d"],
  spcc: ["spcc","spill prevention","oil storage","secondary containment","ast ","petroleum","40 cfr 112","countermeasure","pe certification","navigable water"],
  loto: ["lockout","tagout","loto","energy control","hazardous energy","1910.147","de-energized","authorized employee","isolation"],
  electrical: ["electrical safety","arc flash","nfpa 70e","qualified person","energized work","incident energy","approach boundary","voltage","arc-rated"],
  "fall-protection": ["fall protection","fall arrest","harness","lanyard","anchorage","guardrail","leading edge","1926.501","competent person"],
  eap: ["emergency action plan","evacuation","assembly point","fire alarm","emergency coordinator","drill","shelter in place","1910.38"],
  bbp: ["bloodborne","pathogen","exposure control","sharps","hepatitis","hep b","biohazard","1910.1030","universal precaution"],
  hearing: ["hearing conservation","audiometric","audiogram","noise","dba","dosimetry","1910.95","earplug","hearing protection"],
  "fire-prevention": ["fire prevention","fire extinguisher","sprinkler","hot work","flammable","combustible","fire hazard","1910.39","nfpa"],
  "radiation-safety": ["radiation","radioactive","ionizing","dosimetry","dosimeter","RSO","radiation safety officer","10 CFR 20","NRC","x-ray","isotope","sealed source","byproduct material","ALARA","rem","mrem","sievert","becquerel","curie","survey meter","contamination"],
  "confined-space": ["confined space","permit-required","PRCS","permit space","entry permit","atmospheric testing","4-gas","attendant","entrant","entry supervisor","1910.146","rescue","tripod","retrieval","winch","manhole","tank entry","vault","wet well","oxygen deficient","LEL","engulfment","ventilation","continuous monitoring","bump test","space inventory"],
};

// ─── Fallback Results (used when API is unavailable; scored deterministically) ───
const FALLBACK_RESULTS = {
  "safety-plan": { summary: "The Safety & Health Plan has significant compliance gaps including missing LOTO procedures and incomplete hazard assessments.", findings: [{ id: "F-001", severity: "Critical", title: "No LOTO Procedures", description: "No lockout/tagout energy control procedures referenced despite machinery on site.", regulation: "29 CFR 1910.147", requirement_type: "Regulatory Requirement", recommendation: "Develop machine-specific LOTO procedures for all equipment with hazardous energy." }, { id: "F-002", severity: "Critical", title: "Incomplete Hazard Assessment", description: "No documented hazard assessment methodology per the PPE standard.", regulation: "29 CFR 1910.132(d)", requirement_type: "Regulatory Requirement", recommendation: "Conduct comprehensive workplace hazard assessment and document findings." }, { id: "F-003", severity: "Major", title: "Missing Fall Protection Plan", description: "No written fall protection plan or competent person designated for work above 4 feet.", regulation: "29 CFR 1926.502", requirement_type: "Regulatory Requirement", recommendation: "Develop written plan and designate a competent person." }, { id: "F-004", severity: "Major", title: "Vague Emergency Procedures", description: "Drills conducted 'periodically' with no defined schedule or assembly points.", regulation: "29 CFR 1910.38(d)", requirement_type: "Regulatory Requirement", recommendation: "Define specific assembly points and establish minimum annual drill frequency." }, { id: "F-005", severity: "Minor", title: "Training Documentation Gaps", description: "No specific curriculum or documentation sign-off process for safety training.", regulation: "29 CFR 1910.132(f)", requirement_type: "Regulatory Requirement", recommendation: "Create standardized training curriculum with attendance records." }], strengths: ["OSHA 300 log maintained", "PPE requirements defined for specific areas", "Confined space areas identified"] },
  "injury-illness": { summary: "The Injury & Illness Recordkeeping Program has critical gaps in OSHA notification procedures, electronic submission compliance, and recordability determination.", findings: [{ id: "F-001", severity: "Critical", title: "No Fatality/Severe Injury Notification Procedure", description: "No written procedure for 8-hour fatality or 24-hour severe injury reporting. No designated person.", regulation: "29 CFR 1904.39", requirement_type: "Regulatory Requirement", recommendation: "Develop written procedure with designated caller and OSHA contact numbers." }, { id: "F-002", severity: "Critical", title: "Electronic Submission Not Addressed", description: "Facility has 320 employees but does not address OSHA 300A electronic submission.", regulation: "29 CFR 1904.41", requirement_type: "Regulatory Requirement", recommendation: "Register on OSHA ITA and submit 300A data annually by March 2." }, { id: "F-003", severity: "Critical", title: "300A Signed by Non-Executive", description: "Safety Coordinator signs the 300A. OSHA requires a company executive.", regulation: "29 CFR 1904.32(b)(3)", requirement_type: "Regulatory Requirement", recommendation: "Designate a qualifying executive to certify the annual 300A summary." }, { id: "F-004", severity: "Major", title: "OSHA 301 Substitute Not Equivalent", description: "WC first report used in lieu of OSHA 301 but may not capture all required fields. Completed in 2 weeks, not 7 days.", regulation: "29 CFR 1904.29(b)(4)", requirement_type: "Regulatory Requirement", recommendation: "Verify WC form equivalency and establish 7-day completion requirement." }, { id: "F-005", severity: "Major", title: "No Recordability Determination Process", description: "Supervisors make recordability decisions without documented criteria or second-level review.", regulation: "29 CFR 1904.7", requirement_type: "Regulatory Requirement", recommendation: "Develop recordability decision flowchart with Safety Coordinator review." }, { id: "F-006", severity: "Minor", title: "Outdated First Aid List", description: "First aid list from 2019 has not been reviewed or updated.", regulation: "29 CFR 1904.7(a)", requirement_type: "Regulatory Requirement", recommendation: "Review and update first aid list annually." }], strengths: ["OSHA 300 log maintained with 3 years retention", "300A posted annually", "10-employee threshold correctly identified"] },
  sds: { summary: "The HazCom program has critical deficiencies including missing SDSs, no secondary labeling, and inadequate training.", findings: [{ id: "F-001", severity: "Critical", title: "Missing SDS", description: "Isopropyl Alcohol has no SDS on file.", regulation: "29 CFR 1910.1200(g)", requirement_type: "Regulatory Requirement", recommendation: "Obtain current SDS immediately." }, { id: "F-002", severity: "Critical", title: "No Secondary Labeling", description: "Transfer containers completely unlabeled.", regulation: "29 CFR 1910.1200(f)", requirement_type: "Regulatory Requirement", recommendation: "Implement GHS-compliant secondary labeling system." }, { id: "F-003", severity: "Major", title: "Outdated SDSs", description: "Multiple SDSs are 5+ years old.", regulation: "29 CFR 1910.1200(g)(5)", requirement_type: "Regulatory Requirement", recommendation: "Request updated SDSs from manufacturers." }, { id: "F-004", severity: "Major", title: "Night Shift Access", description: "SDS binder locked in supervisor office after 5 PM.", regulation: "29 CFR 1910.1200(g)(8)", requirement_type: "Regulatory Requirement", recommendation: "Establish 24/7 electronic SDS access." }, { id: "F-005", severity: "Major", title: "Vacant Administrator", description: "Safety Coordinator position vacant — no program administrator.", regulation: "29 CFR 1910.1200(e)", requirement_type: "Regulatory Requirement", recommendation: "Designate interim program administrator immediately." }], strengths: ["Written program exists", "Chemical inventory has CAS numbers"] },
  respiratory: { summary: "The Respiratory Protection Program has gaps in medical evaluations, fit testing, and voluntary use compliance.", findings: [{ id: "F-001", severity: "Critical", title: "No Air Monitoring Data", description: "Respirator selection based on supervisor judgment, not exposure assessment data.", regulation: "29 CFR 1910.134(d)(1)", requirement_type: "Regulatory Requirement", recommendation: "Conduct exposure assessment to determine respirator selection." }, { id: "F-002", severity: "Critical", title: "Appendix D Missing", description: "Voluntary users not given mandatory Appendix D information.", regulation: "29 CFR 1910.134(c)(2)", requirement_type: "Regulatory Requirement", recommendation: "Distribute Appendix D to all voluntary respirator users." }, { id: "F-003", severity: "Major", title: "Inconsistent Fit Testing", description: "Annual fit testing not consistently performed.", regulation: "29 CFR 1910.134(f)", requirement_type: "Regulatory Requirement", recommendation: "Establish annual fit test schedule and tracking." }, { id: "F-004", severity: "Major", title: "Incomplete Medical Evaluations", description: "PLHCP review not documented for all respirator users.", regulation: "29 CFR 1910.134(e)", requirement_type: "Regulatory Requirement", recommendation: "Ensure documented PLHCP clearance for every respirator user." }, { id: "F-005", severity: "Minor", title: "No Maintenance Schedule", description: "No formal inspection or cleaning schedule for respirators.", regulation: "29 CFR 1910.134(h)", requirement_type: "Regulatory Requirement", recommendation: "Develop written maintenance and inspection procedures." }], strengths: ["Written program framework exists", "Appropriate respirator types selected for identified tasks"] },
  spcc: { summary: "The SPCC Plan has expired PE certification and unamended facility changes.", findings: [{ id: "F-001", severity: "Critical", title: "Expired PE Certification", description: "PE certification expired in 2022.", regulation: "40 CFR 112.3(d)", requirement_type: "Regulatory Requirement", recommendation: "Obtain PE recertification immediately." }, { id: "F-002", severity: "Critical", title: "Unamended Plan", description: "New 500-gal transformer oil unit added without plan amendment.", regulation: "40 CFR 112.5(a)", requirement_type: "Regulatory Requirement", recommendation: "Amend plan within 6 months of facility changes." }, { id: "F-003", severity: "Major", title: "Unknown Containment Condition", description: "Earthen berm condition for used oil tank is unknown.", regulation: "40 CFR 112.7(c)", requirement_type: "Regulatory Requirement", recommendation: "Conduct containment integrity assessment." }, { id: "F-004", severity: "Major", title: "Training Overdue", description: "Last spill response training conducted 18 months ago.", regulation: "40 CFR 112.7(f)", requirement_type: "Regulatory Requirement", recommendation: "Conduct annual spill response training." }, { id: "F-005", severity: "Minor", title: "Inconsistent Inspection Logs", description: "Monthly inspection logs have gaps.", regulation: "40 CFR 112.8(c)(6)", requirement_type: "Regulatory Requirement", recommendation: "Implement standardized inspection checklist." }], strengths: ["Overfill alarms on diesel tanks", "Spill kits staged near tanks", "Waterway proximity documented"] },
  loto: { summary: "The LOTO program lacks machine-specific procedures and has critical gaps in energy source identification.", findings: [{ id: "F-001", severity: "Critical", title: "No Machine-Specific Procedures", description: "Only a general procedure exists — no equipment-specific energy control procedures.", regulation: "29 CFR 1910.147(c)(4)", requirement_type: "Regulatory Requirement", recommendation: "Develop individual procedures for each machine with hazardous energy." }, { id: "F-002", severity: "Critical", title: "Incomplete Energy Source Identification", description: "Only electrical energy addressed. Hydraulic, pneumatic, gravitational sources not identified.", regulation: "29 CFR 1910.147(c)(4)(i)", requirement_type: "Regulatory Requirement", recommendation: "Survey all energy types for each piece of equipment." }, { id: "F-003", severity: "Major", title: "No Periodic Inspections", description: "Inspections conducted 'as needed' — not the required annual frequency.", regulation: "29 CFR 1910.147(c)(6)", requirement_type: "Regulatory Requirement", recommendation: "Establish annual periodic inspection by authorized employee." }, { id: "F-004", severity: "Major", title: "No Affected Employee Training", description: "Only authorized employees trained. Affected employees not trained.", regulation: "29 CFR 1910.147(c)(7)(i)", requirement_type: "Regulatory Requirement", recommendation: "Train all affected employees on energy control program." }, { id: "F-005", severity: "Minor", title: "No Contractor Coordination Procedure", description: "Only verbal notification — no written contractor coordination.", regulation: "29 CFR 1910.147(f)(2)", requirement_type: "Regulatory Requirement", recommendation: "Develop written contractor coordination procedure." }], strengths: ["Written program exists", "Padlocks issued to maintenance staff"] },
  electrical: { summary: "No arc flash assessment and missing NFPA 70E elements create serious electrical safety gaps.", findings: [{ id: "F-001", severity: "Critical", title: "No Arc Flash Assessment", description: "No incident energy analysis performed and no equipment labeling.", regulation: "NFPA 70E Article 130.5", requirement_type: "Regulatory Requirement", recommendation: "Commission arc flash study and label all equipment." }, { id: "F-002", severity: "Critical", title: "No Energized Work Permit Process", description: "No formal permit system for energized electrical work.", regulation: "NFPA 70E Article 130.2", requirement_type: "Regulatory Requirement", recommendation: "Develop energized work permit system." }, { id: "F-003", severity: "Major", title: "No Arc-Rated PPE", description: "PPE selection not based on incident energy analysis.", regulation: "NFPA 70E Article 130.7", requirement_type: "Regulatory Requirement", recommendation: "Select PPE based on incident energy levels from arc flash study." }, { id: "F-004", severity: "Major", title: "No Qualified Person Designation", description: "No formal process to designate qualified vs unqualified electrical workers.", regulation: "29 CFR 1910.332(b)", requirement_type: "Regulatory Requirement", recommendation: "Establish formal qualification criteria and training documentation." }, { id: "F-005", severity: "Minor", title: "No Emergency Response Plan", description: "No AED locations identified and no CPR-trained responders designated.", regulation: "NFPA 70E Article 110.2", requirement_type: "Best Practice", recommendation: "Designate CPR/AED-trained responders for electrical work areas." }], strengths: ["Licensed electricians on staff", "Equipment in good condition"] },
  "fall-protection": { summary: "No competent person designated and no rescue plan — both critical fall protection requirements.", findings: [{ id: "F-001", severity: "Critical", title: "No Competent Person Designated", description: "No specific person formally designated or trained as competent person.", regulation: "29 CFR 1926.502(d)(8)", requirement_type: "Regulatory Requirement", recommendation: "Designate and train a competent person for fall protection." }, { id: "F-002", severity: "Critical", title: "No Rescue Plan", description: "Only 'Call 911' — no site-specific rescue procedures or equipment.", regulation: "29 CFR 1926.502(d)(20)", requirement_type: "Regulatory Requirement", recommendation: "Develop prompt rescue plan for each work area where fall arrest is used." }, { id: "F-003", severity: "Major", title: "Anchorages Not Rated", description: "No anchor points identified or load-rated to 5,000 lbs.", regulation: "29 CFR 1926.502(d)(15)", requirement_type: "Regulatory Requirement", recommendation: "Identify and verify all anchorage points meet 5,000 lb capacity." }, { id: "F-004", severity: "Major", title: "No Equipment Inspection Program", description: "No inspection log or pre-use inspection schedule for fall protection equipment.", regulation: "29 CFR 1926.502(d)(21)", requirement_type: "Regulatory Requirement", recommendation: "Implement documented pre-use and annual inspection program." }, { id: "F-005", severity: "Minor", title: "No Annual Refresher Training", description: "Training conducted at hire only — no annual retraining.", regulation: "29 CFR 1926.503(a)", requirement_type: "Regulatory Requirement", recommendation: "Establish annual fall protection retraining program." }], strengths: ["6-foot trigger height correctly referenced", "Full body harnesses available on site"] },
  eap: { summary: "No specific assembly points, no accountability process, and active threat procedures are missing.", findings: [{ id: "F-001", severity: "Critical", title: "No Assembly Points", description: "Plan says 'gather outside' with no specific designated locations.", regulation: "29 CFR 1910.38(c)(3)", requirement_type: "Regulatory Requirement", recommendation: "Designate specific assembly areas with maps and signage." }, { id: "F-002", severity: "Critical", title: "Active Threat Not Addressed", description: "No active shooter or hostile intruder procedures.", regulation: "DHS Active Shooter Guidelines", requirement_type: "Best Practice", recommendation: "Develop Run-Hide-Fight protocol with training." }, { id: "F-003", severity: "Major", title: "No Employee Accountability Process", description: "No headcount or check-in procedure after evacuation.", regulation: "29 CFR 1910.38(c)(4)", requirement_type: "Regulatory Requirement", recommendation: "Implement accountability system with floor wardens." }, { id: "F-004", severity: "Major", title: "Drill Overdue", description: "Last evacuation drill conducted 14 months ago.", regulation: "29 CFR 1910.38(d)", requirement_type: "Regulatory Requirement", recommendation: "Conduct evacuation drill immediately and establish annual schedule." }, { id: "F-005", severity: "Minor", title: "No Alternate Coordinator", description: "Single emergency coordinator with no designated backup.", regulation: "29 CFR 1910.38(c)(5)", requirement_type: "Best Practice", recommendation: "Designate an alternate emergency coordinator." }], strengths: ["Coordinator designated by name", "Pull stations on every floor", "Stairwell evacuation routes established"] },
  bbp: { summary: "Good foundation but critical gaps in vaccination timing and post-exposure protocols.", findings: [{ id: "F-001", severity: "Critical", title: "Vaccination Delay", description: "3 new hires not offered Hepatitis B vaccination within the required 10 working days.", regulation: "29 CFR 1910.1030(f)(2)", requirement_type: "Regulatory Requirement", recommendation: "Offer Hep B vaccination within 10 working days of initial assignment." }, { id: "F-002", severity: "Critical", title: "No Post-Exposure Protocol", description: "Only 'report to supervisor' documented — no clinical evaluation pathway.", regulation: "29 CFR 1910.1030(f)(3)", requirement_type: "Regulatory Requirement", recommendation: "Develop written post-exposure evaluation and follow-up procedure." }, { id: "F-003", severity: "Major", title: "Training Incomplete", description: "15% of staff are overdue for annual BBP training.", regulation: "29 CFR 1910.1030(g)(2)", requirement_type: "Regulatory Requirement", recommendation: "Achieve 100% training completion and maintain documentation." }, { id: "F-004", severity: "Major", title: "Incomplete Sharps Injury Log", description: "Last 3 entries missing required device type information.", regulation: "29 CFR 1910.1030(h)(5)", requirement_type: "Regulatory Requirement", recommendation: "Complete all required fields in the sharps injury log." }, { id: "F-005", severity: "Minor", title: "No Annual Plan Review", description: "Exposure Control Plan not reviewed in current year.", regulation: "29 CFR 1910.1030(c)(1)(iv)", requirement_type: "Regulatory Requirement", recommendation: "Conduct and document annual plan review." }], strengths: ["Universal precautions clearly stated", "Sharps containers in exam rooms", "Annual training program established"] },
  hearing: { summary: "Noise monitoring data exists but critical gaps in audiometric follow-up and engineering controls evaluation.", findings: [{ id: "F-001", severity: "Critical", title: "No STS Follow-Up Procedure", description: "No procedure for standard threshold shift notification within 21 days.", regulation: "29 CFR 1910.95(g)(8)", requirement_type: "Regulatory Requirement", recommendation: "Develop STS protocol with 21-day written notification requirement." }, { id: "F-002", severity: "Critical", title: "Incomplete Baselines", description: "3 employees hired 6 months ago still without baseline audiograms.", regulation: "29 CFR 1910.95(g)(5)", requirement_type: "Regulatory Requirement", recommendation: "Complete baseline audiograms within 6 months of first exposure at or above action level." }, { id: "F-003", severity: "Major", title: "No Dual Protection Evaluation", description: "94 dBA area with single hearing protection only — no dual protection assessment.", regulation: "29 CFR 1910.95(i)(3)", requirement_type: "Regulatory Requirement", recommendation: "Evaluate need for dual hearing protection in areas exceeding 100 dBA TWA with single protection." }, { id: "F-004", severity: "Major", title: "No Engineering Controls Evaluation", description: "No documented evaluation of feasible engineering or administrative noise controls.", regulation: "29 CFR 1910.95(b)(1)", requirement_type: "Regulatory Requirement", recommendation: "Evaluate and document feasible engineering controls for noise reduction." }, { id: "F-005", severity: "Minor", title: "Limited HPD Options", description: "Only foam earplugs available — no variety of hearing protection types offered.", regulation: "29 CFR 1910.95(i)(3)", requirement_type: "Regulatory Requirement", recommendation: "Offer a variety of suitable hearing protector types." }], strengths: ["Noise monitoring conducted and documented", "Annual audiometric testing program in place", "Hearing protection provided in high-noise areas"] },
  "fire-prevention": { summary: "Overdue sprinkler inspection and no designated responsible persons are critical deficiencies.", findings: [{ id: "F-001", severity: "Critical", title: "Sprinkler Inspection Overdue", description: "Last sprinkler system inspection was 2 years ago — exceeds annual requirement.", regulation: "NFPA 25", requirement_type: "Regulatory Requirement", recommendation: "Schedule immediate sprinkler inspection and establish annual schedule." }, { id: "F-002", severity: "Critical", title: "No Responsible Persons Designated", description: "No names or titles assigned for fire prevention responsibilities.", regulation: "29 CFR 1910.39(b)", requirement_type: "Regulatory Requirement", recommendation: "Designate responsible persons by name and title." }, { id: "F-003", severity: "Major", title: "No Hot Work Permit System", description: "Only verbal supervisor approval — no formal written permit.", regulation: "29 CFR 1910.252(a)", requirement_type: "Regulatory Requirement", recommendation: "Develop and implement hot work permit system." }, { id: "F-004", severity: "Major", title: "Improper Flammable Storage", description: "Paint and solvents stored without approved flammable storage cabinet.", regulation: "29 CFR 1910.106(d)", requirement_type: "Regulatory Requirement", recommendation: "Install NFPA-approved flammable storage cabinet and maintain inventory." }, { id: "F-005", severity: "Minor", title: "No Extinguisher Training", description: "No documented hands-on fire extinguisher training for employees.", regulation: "29 CFR 1910.157(g)", requirement_type: "Regulatory Requirement", recommendation: "Provide annual hands-on extinguisher training with documentation." }], strengths: ["Fire extinguishers on each floor", "No smoking policy enforced", "Addressable fire alarm system installed"] },
  "radiation-safety": { summary: "The Radiation Safety Program lacks a qualified RSO, has incomplete dosimetry records, and no emergency procedures for radiation incidents.", findings: [{ id: "F-001", severity: "Critical", title: "RSO Qualifications Not Documented", description: "Radiation Safety Officer listed but no documentation of training, experience, or board certification.", regulation: "10 CFR 20.1101 / NRC License Condition", requirement_type: "Regulatory Requirement", recommendation: "Document RSO qualifications including formal training, relevant experience, and any board certifications. Ensure RSO meets NRC or Agreement State requirements." }, { id: "F-002", severity: "Critical", title: "Incomplete Personnel Dosimetry", description: "Three radiation workers not issued dosimetry badges. No monitoring for extremity doses during fluoroscopy procedures.", regulation: "10 CFR 20.1502", requirement_type: "Regulatory Requirement", recommendation: "Issue whole-body and extremity dosimeters to all individuals likely to exceed 10% of applicable dose limits. Maintain records per 10 CFR 20.2106." }, { id: "F-003", severity: "Critical", title: "No Radiation Emergency Procedures", description: "No written procedures for spill response, contamination events, or overexposure incidents.", regulation: "10 CFR 20.1101(b) / 10 CFR 20.2202", requirement_type: "Regulatory Requirement", recommendation: "Develop written emergency procedures covering spill containment, personnel decontamination, area surveys, notification requirements, and overexposure reporting." }, { id: "F-004", severity: "Major", title: "Survey Instrument Calibration Overdue", description: "Geiger-Mueller survey meter last calibrated 18 months ago — annual calibration required.", regulation: "10 CFR 20.1501 / License Condition", requirement_type: "Regulatory Requirement", recommendation: "Send instruments for calibration immediately and establish annual calibration schedule with NVLAP-accredited laboratory." }, { id: "F-005", severity: "Major", title: "Posting and Labeling Deficiencies", description: "Radiation area signs missing from two storage locations. NRC Form 3 not posted.", regulation: "10 CFR 20.1902 / 10 CFR 19.11", requirement_type: "Regulatory Requirement", recommendation: "Post caution signs at all radiation and radioactive material areas. Post NRC Form 3 or equivalent Agreement State notice." }, { id: "F-006", severity: "Minor", title: "ALARA Review Not Documented", description: "No documented annual ALARA program review or dose trend analysis.", regulation: "10 CFR 20.1101(b)", requirement_type: "Regulatory Requirement", recommendation: "Conduct and document annual ALARA review including dose trends, procedural improvements, and engineering control assessments." }], strengths: ["Radioactive material license current", "Waste disposal through licensed broker", "Annual training conducted for authorized users"] },
  "confined-space": { summary: "The confined space program has critical rescue and atmospheric monitoring deficiencies that could result in entrant fatalities.", findings: [{ id: "F-001", severity: "Critical", title: "No Rescue Capability", description: "Program relies solely on 911 with no on-site rescue team, no non-entry rescue equipment (tripod/winch), and no verification that the local fire department can perform permit-space rescue.", regulation: "29 CFR 1910.146(d)(9)", requirement_type: "Regulatory Requirement", recommendation: "Establish rescue capability: either train an on-site rescue team with annual practice drills, or obtain written verification from the local fire department that they are equipped and trained for permit-space rescue. Procure non-entry retrieval system (tripod and mechanical winch) for all vertical entries." }, { id: "F-002", severity: "Critical", title: "No Continuous Atmospheric Monitoring", description: "Program requires pre-entry testing but does not require continuous monitoring during entry. Atmospheric conditions can change rapidly in permit-required spaces.", regulation: "29 CFR 1910.146(d)(5)(ii)", requirement_type: "Regulatory Requirement", recommendation: "Require continuous atmospheric monitoring for all permit-required confined space entries. Ensure monitors are calibrated per manufacturer specifications and bump-tested before each use." }, { id: "F-003", severity: "Critical", title: "Instrument Calibration Overdue", description: "2 of 3 four-gas monitors are overdue for bump testing. Unreliable atmospheric readings put entrants at risk of exposure to IDLH atmospheres.", regulation: "29 CFR 1910.146(c)(5)(ii)(C)", requirement_type: "Regulatory Requirement", recommendation: "Immediately bump-test all monitors. Establish daily pre-use bump test protocol per manufacturer instructions. Maintain calibration records." }, { id: "F-004", severity: "Major", title: "Attendant Duties Not Defined", description: "No written prohibition against attendant performing other tasks. No communication procedures between entrant and attendant. No attendant-to-entrant ratio for multiple-entrant entries.", regulation: "29 CFR 1910.146(d)(6)", requirement_type: "Regulatory Requirement", recommendation: "Document attendant duties per 1910.146(d)(6): maintain accurate count of entrants, remain outside space at all times, communicate with entrants continuously, order evacuation when conditions warrant, and never perform duties that interfere with primary attendant responsibilities." }, { id: "F-005", severity: "Major", title: "Incomplete Training Records", description: "Only 8 of 12 affected employees have documented initial training. No refresher training schedule. No role-specific training for attendants and entry supervisors.", regulation: "29 CFR 1910.146(g)", requirement_type: "Regulatory Requirement", recommendation: "Train all affected employees before initial assignment. Establish role-based training (authorized entrant, attendant, entry supervisor) with documented competency verification. Schedule refresher training when procedures change or deficiencies are observed." }, { id: "F-006", severity: "Major", title: "No Program Review After Near-Miss", description: "Annual review last conducted in 2021. No review performed after H2S alarm near-miss event in August 2023.", regulation: "29 CFR 1910.146(d)(14)", requirement_type: "Regulatory Requirement", recommendation: "Conduct immediate program review incorporating lessons from the 2023 near-miss. Establish annual review schedule and require review within 30 days of any entry-related incident or near-miss." }, { id: "F-007", severity: "Minor", title: "Incomplete Space Signage", description: "2 of 11 permit-required spaces (wet well access points) lack Danger — Confined Space signage.", regulation: "29 CFR 1910.146(c)(2)", requirement_type: "Regulatory Requirement", recommendation: "Post 'DANGER — PERMIT-REQUIRED CONFINED SPACE — DO NOT ENTER' signs at all permit-space entry points." }], strengths: ["Space inventory completed for all 14 spaces", "Four-gas monitors available for atmospheric testing", "Entry permit system established"] },
};

function getIndustryContext(programType, industryKey) {
  const scope = PROGRAM_SCOPE[programType] || "narrow";
  const industry = INDUSTRIES[industryKey];
  if (!industry) return "";
  if (scope === "broad") {
    return `\n\nINDUSTRY CONTEXT: This document is for a ${industry.label} facility.\n\nLAYER 1 — UNIVERSAL REQUIREMENTS: Every employer must comply with these baseline OSHA requirements. Flag any that are missing or inadequate: written safety program, hazard assessment methodology (29 CFR 1910.132(d)), PPE program, Emergency Action Plan (29 CFR 1910.38), HazCom written program (29 CFR 1910.1200), Fire Prevention Plan (29 CFR 1910.39), training documentation, recordkeeping (OSHA 300), first aid availability, walking/working surfaces. Do NOT skip universal requirement gaps.\n\nLAYER 2 — INDUSTRY-SPECIFIC: Additional hazards to check for ${industry.label}: ${industry.hazards}. Standards: ${industry.standards}.\n\nScoring: Universal gaps = Critical/Major. Industry-specific gaps = Major/Minor unless imminent danger.`;
  }
  const programContext = PROGRAM_INDUSTRY_CONTEXT[programType];
  const specificContext = programContext?.[industryKey];
  if (specificContext) {
    return `\n\nINDUSTRY CONTEXT FOR ${industry.label.toUpperCase()} — ${REVIEW_TEMPLATES[programType]?.label?.toUpperCase()}:\n${specificContext}\n\nIMPORTANT: Only flag findings relevant to this specific program type. Do NOT flag hazards belonging to other program types.`;
  }
  return `\n\nINDUSTRY: This document is for a ${industry.label} facility. Focus strictly on how ${REVIEW_TEMPLATES[programType]?.label} requirements apply within this industry.`;
}

function localValidate(text, type) {
  const lower = text.toLowerCase();
  const keywords = DOC_KEYWORDS[type] || [];
  const matches = keywords.filter((kw) => lower.includes(kw));
  const score = Math.round((matches.length / Math.max(keywords.length, 1)) * 100);
  let bestAlt = null, bestAltScore = 0;
  for (const [key, kws] of Object.entries(DOC_KEYWORDS)) {
    if (key === type) continue;
    const altMatches = kws.filter((kw) => lower.includes(kw));
    const altScore = Math.round((altMatches.length / Math.max(kws.length, 1)) * 100);
    if (altScore > bestAltScore) { bestAltScore = altScore; bestAlt = key; }
  }
  const allEhsKw = Object.values(DOC_KEYWORDS).flat();
  const isEhs = allEhsKw.filter((kw) => lower.includes(kw)).length >= 2;
  if (!isEhs) return { valid: false, confidence: 5, explanation: "This document does not appear to contain EHS or safety compliance content.", suggestedType: "Not an EHS document" };
  if (score < 20 && bestAltScore > score + 15) return { valid: false, confidence: score, explanation: `This appears to be a ${REVIEW_TEMPLATES[bestAlt]?.label} rather than a ${REVIEW_TEMPLATES[type].label}.`, suggestedType: REVIEW_TEMPLATES[bestAlt]?.label };
  if (score < 15) return { valid: false, confidence: score, explanation: `Very few keywords for a ${REVIEW_TEMPLATES[type].label} were found.`, suggestedType: bestAlt && bestAltScore > 25 ? REVIEW_TEMPLATES[bestAlt]?.label : "Not an EHS document" };
  if (score < 35) return { valid: true, confidence: score, explanation: "Some relevant content detected but the match is weak.", suggestedType: REVIEW_TEMPLATES[type].label, warning: true };
  return { valid: true, confidence: Math.min(score + 20, 98), explanation: "Document matches expected type.", suggestedType: REVIEW_TEMPLATES[type].label };
}

// ─── App ───
export default function RegLensApp() {
  const { isDesktop, isStandalone } = useMediaQuery()
  if (isDesktop && !isStandalone) return <LandingPage isDesktop={true} />

  const [tab, setTab] = useState("dashboard");

  // Theme — persists in localStorage
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("rl_theme") || "dark"; } catch { return "dark"; }
  });
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("rl_theme", next); } catch {}
  };
  const t = theme === "light" ? {
    bg: "#F5F5F7", card: "#FFFFFF", cardFlat: "#FFFFFF", text: "#1a1a1a", textSecondary: "#6b7280", textTertiary: "#9ca3af",
    border: "#E5E7EB", borderSubtle: "#F3F4F6", inputBg: "#F9FAFB", inputBorder: "#D1D5DB",
    navBg: "#FFFFFF", navBorder: "#E5E7EB", green: "#16a34a", greenBg: "#f0fdf4", greenBorder: "#bbf7d0",
    overlay: "rgba(0,0,0,0.5)", modalBg: "#FFFFFF", shimmer1: "#F3F4F6", shimmer2: "#E5E7EB",
    scoreBg: "linear-gradient(160deg, #FFFFFF, #F9FAFB)", headerBg: "#FFFFFF",
  } : {
    bg: "#000", card: "#1C1C1E", cardFlat: "#1C1C1E", text: "#fff", textSecondary: "#8E8E93", textTertiary: "#555",
    border: "#2A2A2E", borderSubtle: "#222", inputBg: "#111", inputBorder: "#2A2A2E",
    navBg: "#1C1C1E", navBorder: "#2A2A2E", green: "#34C759", greenBg: "#34C75915", greenBorder: "#34C75930",
    overlay: "rgba(0,0,0,0.85)", modalBg: "#1C1C1E", shimmer1: "#1C1C1E", shimmer2: "#2A2A2E",
    scoreBg: "linear-gradient(160deg, #1C1C1E, #222)", headerBg: "transparent",
  };
  const [selectedType, setSelectedType] = useState(null);
  const [selectedIndustry, setSelectedIndustry] = useState(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [procStage, setProcStage] = useState(0);
  const [result, setResult] = useState(null);
  const [scoreResult, setScoreResult] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [viewingSub, setViewingSub] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [expandedFinding, setExpandedFinding] = useState(null);
  const [validation, setValidation] = useState(null);
  const [parseWarnings, setParseWarnings] = useState([]);
  const [showBooking, setShowBooking] = useState(false);

  // Splash screen — shows scanning logo on first load
  const [showSplash, setShowSplash] = useState(() => {
    try { return !sessionStorage.getItem("rl_splashed"); } catch { return true; }
  });
  React.useEffect(() => {
    if (showSplash) {
      const timer = setTimeout(() => {
        setShowSplash(false);
        try { sessionStorage.setItem("rl_splashed", "1"); } catch {}
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, [showSplash]);

  // Onboarding — progressive disclosure system

  // ─── Online/Offline state ───
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);
  const [syncPending, setSyncPending] = useState(false);

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      setShowOfflineBanner(false);
      // Flush sync queue when back online
      flushSyncQueue();
    };
    const goOffline = () => {
      setIsOnline(false);
      setShowOfflineBanner(true);
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Listen for SW sync requests
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener("message", (e) => {
        if (e.data?.type === "SYNC_REQUESTED") flushSyncQueue();
      });
    }

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Sync queue — queues Supabase writes made while offline
  function getSyncQueue() {
    try { return JSON.parse(localStorage.getItem("rl_sync_queue")) || []; } catch { return []; }
  }
  function addToSyncQueue(action) {
    const queue = getSyncQueue();
    queue.push({ ...action, queuedAt: new Date().toISOString() });
    localStorage.setItem("rl_sync_queue", JSON.stringify(queue));
    setSyncPending(true);
  }
  async function flushSyncQueue() {
    if (!supabase.isConfigured) return;
    const queue = getSyncQueue();
    if (queue.length === 0) return;
    setSyncPending(true);
    const failed = [];
    for (const item of queue) {
      try {
        if (item.action === "createReview") await supabase.createReview(item.data);
        else if (item.action === "createAudit") await supabase.createAudit(item.data);
        else if (item.action === "createClient") await supabase.createClient(item.data);
      } catch {
        failed.push(item);
      }
    }
    localStorage.setItem("rl_sync_queue", JSON.stringify(failed));
    setSyncPending(failed.length > 0);
  }

  // Onboarding — progressive disclosure system (continued)
  const [onboarding, setOnboarding] = useState(() => {
    try { return JSON.parse(localStorage.getItem("rl_onboarding")) || {}; } catch { return {}; }
  });
  const markSeen = (key) => {
    setOnboarding(prev => {
      const next = { ...prev, [key]: true };
      try { localStorage.setItem("rl_onboarding", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const hasSeen = (key) => onboarding[key] === true;
  // Achievement toast
  const [achievementToast, setAchievementToast] = useState(null);
  const showAchievement = (title, desc) => {
    setAchievementToast({ title, desc });
    setTimeout(() => setAchievementToast(null), 4000);
  };

  // Admin mode — bypasses payment gates for testing
  const [adminMode, setAdminMode] = useState(() => {
    try { return localStorage.getItem("rl_admin") === "active"; } catch { return false; }
  });
  const [adminTaps, setAdminTaps] = useState(0);
  const ADMIN_CODE = "prudence2025";
  const [showAdminInput, setShowAdminInput] = useState(false);
  const [adminCodeValue, setAdminCodeValue] = useState("");
  const activateAdmin = () => {
    setAdminCodeValue("");
    setShowAdminInput(true);
  };
  const submitAdminCode = () => {
    if (adminCodeValue === ADMIN_CODE) {
      setAdminMode(true);
      try { localStorage.setItem("rl_admin", "active"); } catch {}
      setShowAdminInput(false);
      setAdminCodeValue("");
    } else {
      setAdminCodeValue("");
    }
  };
  const deactivateAdmin = () => {
    setAdminMode(false);
    try { localStorage.removeItem("rl_admin"); } catch {}
    setAdminTaps(0);
  };
  const [emailModal, setEmailModal] = useState(null); // { type: "review"|"readiness"|"cap"|"citation", data: {} }
  // Audit state
  const [auditIndustry, setAuditIndustry] = useState(null);
  const [auditSection, setAuditSection] = useState(0);
  const [auditResponses, setAuditResponses] = useState({});
  const [auditResult, setAuditResult] = useState(null);
  const [auditSubmissions, setAuditSubmissions] = useState([]);
  // Photos: { [itemId]: [{ dataUrl: string, timestamp: string }] }
  const [auditPhotos, setAuditPhotos] = useState({});
  // Notes: { [itemId]: string }
  const [auditNotes, setAuditNotes] = useState({});
  const [capData, setCapData] = useState(null); // { actions: [...], generatedAt, industry }
  // CAP action tracking: { [actionIndex]: { assignee, dueDate, status } }
  const [capTracking, setCapTracking] = useState({});
  const updateCapTracking = (idx, field, value) => {
    setCapTracking(prev => ({ ...prev, [idx]: { ...(prev[idx] || {}), [field]: value } }));
  };

  // Custom checklist items per industry: { [industryKey]: [{ id, text, reg, severity }] }
  const [customItems, setCustomItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("rl_custom_items")) || {}; } catch { return {}; }
  });
  const saveCustomItems = (items) => { setCustomItems(items); try { localStorage.setItem("rl_custom_items", JSON.stringify(items)); } catch {} };

  // Guided tour
  const [tourStep, setTourStep] = useState(-1); // -1 = not active
  const TOUR_STEPS = [
    { title: "Run Your First Review", desc: "Upload any safety program and get a scored gap analysis against OSHA/EPA standards in minutes. Your first 3 reviews are free.", target: "primary-actions" },
    { title: "Readiness Checks & Field Tools", desc: "Walk through facility checklists with photos, generate corrective action plans, respond to citations — all free, unlimited.", target: "primary-actions" },
    { title: "Track & Export Everything", desc: "Every review, score trend, and report is saved here. Export PDFs, email results, or book an expert consultation.", target: "recent-activity" },
  ];
  const startTour = () => { setTab("dashboard"); setTourStep(0); };
  const nextTour = () => { if (tourStep < TOUR_STEPS.length - 1) setTourStep(tourStep + 1); else setTourStep(-1); };
  const endTour = () => setTourStep(-1);
  const [capLoading, setCapLoading] = useState(false);

  // Auto-save readiness check progress (must be after all audit state declarations)
  const saveCheckpointRef = React.useRef(null);
  React.useEffect(() => {
    if (auditIndustry && Object.keys(auditResponses).length > 0 && !auditResult) {
      clearTimeout(saveCheckpointRef.current);
      saveCheckpointRef.current = setTimeout(() => {
        try {
          localStorage.setItem("rl_checkpoint", JSON.stringify({
            industry: auditIndustry, section: auditSection, responses: auditResponses,
            notes: auditNotes, savedAt: new Date().toISOString(),
          }));
        } catch {}
      }, 1000);
    }
  }, [auditResponses, auditSection, auditNotes, auditIndustry, auditResult]);
  const clearCheckpoint = () => { try { localStorage.removeItem("rl_checkpoint"); } catch {} };
  const getCheckpoint = () => { try { return JSON.parse(localStorage.getItem("rl_checkpoint")); } catch { return null; } };

  // Citation Response Tool
  const [citationText, setCitationText] = useState("");
  const [citationResult, setCitationResult] = useState(null);
  const [citationLoading, setCitationLoading] = useState(false);
  const [citationPaid, setCitationPaid] = useState(false);
  const [citationIndustry, setCitationIndustry] = useState(null);
  const [citationContext, setCitationContext] = useState({ employees: "", description: "", priorCitations: "no", abatementStarted: "no", notes: "" });

  // Job Hazard Analysis Tool state
  const [riskIndustry, setRiskIndustry] = useState(null);
  const [riskTasks, setRiskTasks] = useState([]); // [{ id, name, hazards: [{ id, desc, severity, likelihood, controls, controlType, resSeverity, resLikelihood, notes }] }]
  const [riskCurrentTask, setRiskCurrentTask] = useState(null); // task id being edited
  const [riskSuggestLoading, setRiskSuggestLoading] = useState(false);

  // Incident Report state — persists in localStorage
  const [incidentReports, setIncidentReports] = useState(() => {
    try { return JSON.parse(localStorage.getItem("rl_incidents")) || []; } catch { return []; }
  });
  const saveIncidents = (reports) => { setIncidentReports(reports); try { localStorage.setItem("rl_incidents", JSON.stringify(reports)); } catch {} };
  const [incidentDraft, setIncidentDraft] = useState(null); // current report being filled

  // Safety Meeting Log state — persists in localStorage
  const [meetingLogs, setMeetingLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("rl_meetings")) || []; } catch { return []; }
  });
  const saveMeetings = (logs) => { setMeetingLogs(logs); try { localStorage.setItem("rl_meetings", JSON.stringify(logs)); } catch {} };
  const [meetingDraft, setMeetingDraft] = useState(null);

  // Free tier tracking — 3 free compliance reviews, readiness checks are always free
  const FREE_REVIEW_LIMIT = 3;
  const getFreeUsage = () => {
    try { return JSON.parse(localStorage.getItem("rl_free_usage")) || { reviews: 0 }; }
    catch { return { reviews: 0 }; }
  };
  const setFreeUsage = (usage) => localStorage.setItem("rl_free_usage", JSON.stringify(usage));

  const canRunReview = () => {
    if (adminMode) return true;
    if (user && (user.review_credits || 0) > 0) return true;
    const usage = getFreeUsage();
    return usage.reviews < FREE_REVIEW_LIMIT;
  };
  const consumeReviewCredit = () => {
    if (adminMode) return; // Don't consume credits in admin mode
    if (user && (user.review_credits || 0) > 0) {
      if (supabase.isConfigured && user.access_token) {
        supabase.decrementCredit(user.access_token, "review_credits");
      }
      setUser(prev => ({ ...prev, review_credits: Math.max(0, (prev.review_credits || 0) - 1) }));
    } else {
      const usage = getFreeUsage();
      setFreeUsage({ ...usage, reviews: usage.reviews + 1 });
    }
  };
  // Client & DB state
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", industry: "", contact_email: "", contact_phone: "", notes: "" });
  const [dbReady, setDbReady] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState("all");
  // Auth state
  const [user, setUser] = useState(null); // { id, email, full_name, company_name, review_credits }
  const [authScreen, setAuthScreen] = useState(null); // null | "login" | "signup"
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const fileRef = useRef(null);

  // ─── Load data from Supabase on mount ───
  useEffect(() => {
    async function loadData() {
      if (!supabase.isConfigured) {
        setDataLoading(false);
        return;
      }
      try {
        // Restore session
        const session = supabase.getSession();
        if (session?.access_token) {
          const profile = await supabase.getProfile(session.access_token);
          if (profile) {
            setUser({ ...profile, access_token: session.access_token });
          } else {
            // Session expired
            supabase.signOut();
          }
        }

        const [clientsData, reviewsData, auditsData] = await Promise.all([
          supabase.getClients(),
          supabase.getReviews(),
          supabase.getAudits(),
        ]);
        if (clientsData) setClients(clientsData);
        if (reviewsData) {
          setSubmissions(reviewsData.map(r => ({
            id: r.review_ref, dbId: r.id, type: r.program_type, label: r.program_label,
            icon: REVIEW_TEMPLATES[r.program_type]?.icon || "📄",
            industry: r.industry, industryLabel: r.industry_label,
            date: new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            score: r.score, band: r.band, findingsCount: (r.findings || []).length,
            status: r.status, result: { summary: r.summary, findings: r.findings, strengths: r.strengths, score: r.score, documentType: r.program_label, _source: r.source },
            scoreResult: r.score_result, clientId: r.client_id,
          })));
        }
        if (auditsData) {
          setAuditSubmissions(auditsData.map(a => ({
            id: a.audit_ref, dbId: a.id, industry: a.industry, industryLabel: a.industry_label,
            icon: INDUSTRIES[a.industry]?.icon || "📝",
            date: new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            score: a.score, band: a.band, stats: a.stats, findingsCount: a.findings_count,
            clientId: a.client_id,
          })));
        }
        setDbReady(true);
      } catch (e) {
        console.error("Failed to load data:", e);
      }
      setDataLoading(false);
    }
    loadData();
  }, []);

  // ═══ CONFIGURATION: Replace with your actual Calendly URL ═══
  const CALENDLY_URL = "https://calendly.com/prudencesafety";
  // Consultation tiers shown when score < 70
  const CONSULT_OPTIONS = [
    { id: "findings-review", label: "Findings Walkthrough", duration: "30 min", price: "$149", desc: "Review your findings with an EHS expert and get a prioritized remediation roadmap.", icon: "📋" },
    { id: "compliance-strategy", label: "Compliance Strategy", duration: "60 min", price: "$299", desc: "Deep-dive into your program gaps with a corrective action plan and timeline.", icon: "🎯" },
    { id: "program-rewrite", label: "Program Rewrite Consult", duration: "90 min", price: "$499", desc: "Work directly with an EHS expert to rewrite non-compliant sections of your program.", icon: "✍️" },
  ];

  const stages = ["Reading your document…", "Checking against OSHA standards…", "Scanning EPA regulations…", "Identifying compliance gaps…", "Verifying citations…", "Scoring findings by severity…", "Calculating your score…"];

  // Detect environment: deployed Vercel (has /api/claude.js) vs artifact sandbox (direct API)
  const API_BASE = typeof window !== "undefined" && window.location.hostname.includes("vercel.app")
    ? "" // relative path — uses /api/claude.js on same domain
    : null; // null = try direct Anthropic API (works in Claude artifacts)

  async function callAI(messages, maxTokens = 4000) {
    // Try 1: Vercel proxy (works on deployed app)
    if (API_BASE !== null) {
      const res = await fetch("/api/claude.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages }),
      });
      if (res.ok) return await res.json();
      // If proxy fails, fall through to direct
    }

    // Try 2: Direct Anthropic API (works in Claude artifact sandbox)
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `API returned HTTP ${res.status}`);
    }
    return await res.json();
  }

  async function runReview(text, type) {
    supabase.trackEvent("review_started", { program_type: type, industry: selectedIndustry });
    setProcessing(true);
    setValidation(null);
    setParseWarnings([]);
    setTab("review");
    setProcStage(0);
    const iv = setInterval(() => setProcStage((s) => Math.min(s + 1, 6)), 1800);
    setProcStage(1);
    try {
      const prompt = buildReviewPrompt(type, REVIEW_TEMPLATES[type].label);
      const industryCtx = selectedIndustry ? getIndustryContext(type, selectedIndustry) : "";
      const truncNote = text.length > 12000 ? "\n\n[Document truncated — first 12,000 characters reviewed]" : "";
      const userMsg = `${prompt}${industryCtx}\n\nDOCUMENT TEXT:\n${text.substring(0, 12000)}${truncNote}`;

      const data = await callAI([{ role: "user", content: userMsg }]);
      if (data.error) throw new Error(data.error.message || data.error);
      const raw = data.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      clearInterval(iv);
      const parsed = parseReviewResponse(raw);
      if (parsed.warnings.length > 0) setParseWarnings(parsed.warnings);
      if (parsed.error) throw new Error(parsed.error);
      finishReview({ ...parsed.data, _source: "api" }, type);
    } catch (err) {
      clearInterval(iv);
      console.error("RegLens API error — falling back to demo results:", err.message);

      // Queue the review for retry when API recovers
      addToReviewQueue({
        text: text.substring(0, 12000),
        type,
        industry: selectedIndustry,
        clientId: selectedClient?.id || null,
      });

      const fb = FALLBACK_RESULTS[type];
      if (fb) {
        finishReview({ ...fb, documentType: REVIEW_TEMPLATES[type].label, _source: "fallback", _error: err.message, _queued: true }, type);
      } else {
        finishReview({
          summary: "The AI review could not be completed. Error: " + err.message,
          findings: [], strengths: [], documentType: REVIEW_TEMPLATES[type].label,
          _source: "error", _error: err.message, _queued: true
        }, type);
      }
    }
  }

  async function finishReview(parsed, type) {
    const sr = RegLensScoring.computeScore(parsed.findings || []);
    setScoreResult(sr);
    setResult({ ...parsed, score: sr.score });
    const refId = `PR-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const sub = {
      id: refId,
      type, label: REVIEW_TEMPLATES[type].label, icon: REVIEW_TEMPLATES[type].icon,
      industry: selectedIndustry, industryLabel: INDUSTRIES[selectedIndustry]?.label || "General",
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: sr.score, band: sr.band, findingsCount: (parsed.findings || []).length,
      status: "pending", result: { ...parsed, score: sr.score }, scoreResult: sr,
      clientId: selectedClient?.id || null,
    };
    setSubmissions((prev) => [sub, ...prev]);
    setProcessing(false);

    supabase.trackEvent("review_completed", { program_type: type, industry: selectedIndustry, score: sr.score, band: sr.band, findings_count: (parsed.findings || []).length });

    // Achievement — first compliance review
    if (!hasSeen("ach_review")) {
      markSeen("ach_review");
      setTimeout(() => showAchievement("First Review Complete!", "Download the PDF or email it to your team. Your score breakdown shows exactly how to improve."), 800);
    }

    // Consume review credit
    consumeReviewCredit();

    // Persist to Supabase (or queue for sync if offline)
    if (supabase.isConfigured) {
      const dbRow = {
        review_ref: refId,
        client_id: selectedClient?.id || null,
        program_type: type,
        program_label: REVIEW_TEMPLATES[type].label,
        industry: selectedIndustry,
        industry_label: INDUSTRIES[selectedIndustry]?.label || "General",
        score: sr.score,
        band: sr.band,
        summary: parsed.summary || "",
        findings: parsed.findings || [],
        strengths: parsed.strengths || [],
        score_result: sr,
        source: parsed._source || "api",
        status: "pending",
      };
      if (navigator.onLine) {
        const result = await supabase.createReview(dbRow);
        if (result?.[0]?.id) {
          sub.dbId = result[0].id;
          setSubmissions((prev) => prev.map(s => s.id === refId ? { ...s, dbId: result[0].id } : s));
        }
      } else {
        addToSyncQueue({ action: "createReview", data: dbRow });
      }
    }
  }

  async function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f || !selectedType) return;

    // Check credits before processing
    if (!canRunReview()) {
      if (!user) setAuthScreen("signup");
      else setShowPricing(true);
      return;
    }

    const ext = f.name.split(".").pop()?.toLowerCase();

    // TXT files: read directly in browser
    if (ext === "txt") {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result;
        const val = localValidate(text, selectedType);
        if (!val.valid) {
          setValidation({ ...val, text, type: selectedType });
          setTab("validation-error");
        } else {
          runReview(text, selectedType);
        }
      };
      reader.readAsText(f);
      return;
    }

    // PDF/DOCX: try server-side parsing first, fall back to browser readAsText
    if (ext === "pdf" || ext === "docx") {
      try {
        const formData = new FormData();
        formData.append("file", f);

        const res = await fetch("/api/parse-document", { method: "POST", body: formData });
        const data = await res.json();

        if (!res.ok) {
          alert(data.error || "Failed to parse document");
          return;
        }

        const text = data.text;
        if (data.wasTruncated) {
          console.warn(`Document truncated from ~${data.tokenCount} tokens to 12,000`);
        }

        const val = localValidate(text, selectedType);
        if (!val.valid) {
          setValidation({ ...val, text, type: selectedType });
          setTab("validation-error");
        } else {
          runReview(text, selectedType);
        }
      } catch (fetchErr) {
        // Server-side parsing unavailable (e.g., running in artifact sandbox)
        // Fall back to readAsText — works for text-based content, garbled for binary
        console.warn("Server-side parsing unavailable, falling back to browser text read:", fetchErr.message);
        const reader = new FileReader();
        reader.onload = (ev) => {
          const text = ev.target.result;
          if (ext === "pdf" && text.includes("%PDF")) {
            alert("PDF parsing requires the server. Please deploy to Vercel with /api/parse-document.js, or upload a .txt version of this document.");
            return;
          }
          const val = localValidate(text, selectedType);
          if (!val.valid) {
            setValidation({ ...val, text, type: selectedType });
            setTab("validation-error");
          } else {
            runReview(text, selectedType);
          }
        };
        reader.readAsText(f);
      }
      return;
    }

    alert("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
  }

  const renderIcon = (icon, size = 28) => <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>{icon}</span>;
  const sevColor = { Critical: "#EF4444", Major: "#F59E0B", Minor: "#3B82F6" };
  const sevBg = { Critical: theme === "dark" ? "#2A1215" : "#FEF2F2", Major: theme === "dark" ? "#2A2010" : "#FFFBEB", Minor: theme === "dark" ? "#101C2E" : "#EFF6FF" };
  const card = { background: t.card, borderRadius: "16px", padding: "16px", marginBottom: "12px" };
  const cardFlat = { background: t.cardFlat, borderRadius: "14px", padding: "14px 16px", marginBottom: "4px" };

  // ─── Score Ring Component ───
  function ScoreRing({ score, band, size = 120 }) {
    const strokeWidth = 8;
    const r = (size - strokeWidth) / 2;
    const circ = 2 * Math.PI * r;
    const off = circ - (score / 100) * circ;
    const color = RegLensScoring.getBandColor(band || RegLensScoring.getBand(score));
    const [displayScore, setDisplayScore] = React.useState(0);
    const [showBand, setShowBand] = React.useState(false);
    const animRef = React.useRef(null);

    React.useEffect(() => {
      setDisplayScore(0);
      setShowBand(false);
      const duration = 1200;
      const start = performance.now();
      const animate = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayScore(Math.round(eased * score));
        if (progress < 1) {
          animRef.current = requestAnimationFrame(animate);
        } else {
          setShowBand(true);
        }
      };
      animRef.current = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animRef.current);
    }, [score]);

    return (
      <div style={{ position: "relative", width: `${size}px`, height: `${size}px`, margin: "0 auto" }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={t.border} strokeWidth={strokeWidth} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22, 1, 0.36, 1)", filter: `drop-shadow(0 0 6px ${color}40)` }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: `${size * 0.32}px`, fontWeight: 800, color, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-1px" }}>{displayScore}</span>
          <span style={{ fontSize: "11px", color: t.textSecondary, marginTop: "3px", fontWeight: 600, opacity: showBand ? 1 : 0, transition: "opacity 0.4s ease 0.1s" }}>{band || RegLensScoring.getBand(score)}</span>
        </div>
      </div>
    );
  }

  // ─── Finding Card Component ───
  function FindingCard({ finding, index, expanded, onToggle }) {
    const sev = finding.severity || "Major";
    const isReg = (finding.requirement_type || "").includes("Regulatory");
    const borderColors = { Critical: "#EF4444", Major: "#F59E0B", Minor: "#3B82F6" };
    return (
      <button onClick={onToggle} style={{ ...cardFlat, width: "100%", borderLeft: `3px solid ${borderColors[sev]}`, border: `1px solid ${sevColor[sev]}20`, borderLeftWidth: "3px", borderLeftColor: borderColors[sev], cursor: "pointer", textAlign: "left", transition: "box-shadow 0.2s ease, transform 0.15s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, flexWrap: "wrap" }}>
            <div style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: 700, background: sevBg[sev], color: sevColor[sev], border: `1px solid ${sevColor[sev]}30`, textTransform: "uppercase", letterSpacing: "0.3px" }}>{sev}</div>
            <div style={{ padding: "2px 7px", borderRadius: "6px", fontSize: "9px", fontWeight: 600, background: isReg ? "#34C75912" : "#3B82F612", color: isReg ? "#34C759" : "#60A5FA", border: `1px solid ${isReg ? "#34C75925" : "#3B82F625"}`, letterSpacing: "0.2px" }}>{isReg ? "REGULATORY" : "BEST PRACTICE"}</div>
            <span style={{ fontSize: "14px", fontWeight: 600, color: t.text }}>{finding.title}</span>
          </div>
          <span style={{ fontSize: "16px", color: t.textTertiary, transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)", flexShrink: 0 }}>▾</span>
        </div>
        {expanded && (
          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${t.border}`, animation: "rlFadeIn 0.2s ease-out" }}>
            <div style={{ fontSize: "13px", color: t.textSecondary, lineHeight: 1.6, marginBottom: "10px" }}>{finding.description}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
              <div style={{ display: "inline-block", padding: "3px 10px", borderRadius: "6px", background: theme === "dark" ? "#1A2A1E" : "#F0FDF4", border: `1px solid ${theme === "dark" ? "#34C75930" : "#bbf7d0"}`, fontSize: "12px", color: t.green, fontWeight: 500, fontFamily: "monospace" }}>{finding.regulation}</div>
              {finding.citation_verified && <span style={{ fontSize: "10px", color: t.green, fontWeight: 600 }}>✓ Verified</span>}
              {finding.citation_unverified && <span style={{ fontSize: "10px", color: "#F59E0B", fontWeight: 600 }}>⚠ Unverified</span>}
              {finding.citation_title && <span style={{ fontSize: "10px", color: t.textSecondary }}>({finding.citation_title})</span>}
            </div>
            <div style={{ background: t.inputBg, borderRadius: "8px", padding: "10px 12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Recommendation</div>
              <div style={{ fontSize: "13px", color: t.green, lineHeight: 1.5 }}>{finding.recommendation}</div>
            </div>
          </div>
        )}
      </button>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif", paddingBottom: "calc(100px + env(safe-area-inset-bottom, 0px))" }}>

      {/* Responsive + PWA styles */}
      <style>{`
        @viewport { width: device-width; }
        :root {
          --rl-shimmer1: ${t.shimmer1};
          --rl-shimmer2: ${t.shimmer2};
        }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; overscroll-behavior: none; -webkit-text-size-adjust: 100%; }
        input, textarea, select, button { font-size: 16px; }
        
        .rl-container { max-width: 430px; margin: 0 auto; }
        .rl-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .rl-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .rl-bottom-nav { max-width: 430px; padding-bottom: calc(28px + env(safe-area-inset-bottom, 0px)); }
        
        @media (min-width: 600px) {
          .rl-container { max-width: 600px; }
          .rl-grid-2 { grid-template-columns: 1fr 1fr 1fr; }
          .rl-grid-3 { grid-template-columns: repeat(4, 1fr); }
          .rl-bottom-nav { max-width: 600px; }
        }
        @media (min-width: 768px) {
          .rl-container { max-width: 720px; padding: 0 20px; }
          .rl-bottom-nav { max-width: 720px; }
        }
        @media (min-width: 900px) {
          .rl-container { max-width: 800px; padding: 0 24px; }
          .rl-grid-2 { grid-template-columns: repeat(3, 1fr); }
          .rl-grid-3 { grid-template-columns: repeat(5, 1fr); }
          .rl-bottom-nav { max-width: 800px; }
        }
        @media (min-width: 1024px) {
          .rl-container { max-width: 900px; padding: 0 32px; }
          .rl-bottom-nav { max-width: 900px; }
        }
        @media (min-width: 1200px) {
          .rl-container { max-width: 960px; }
          .rl-grid-2 { grid-template-columns: repeat(4, 1fr); }
        }
        
        @media (display-mode: standalone) {
          body { padding-top: 0; }
        }
        
        html { scroll-behavior: smooth; }
        
        @media print {
          .rl-bottom-nav, .no-print { display: none !important; }
          body { background: #fff; color: #000; }
        }

        /* ─── Micro-interactions ─── */

        /* Tap scale — gives buttons a "press" feel */
        .rl-tap { transition: transform 0.12s ease, opacity 0.12s ease; }
        .rl-tap:active { transform: scale(0.97); opacity: 0.85; }

        /* Card hover/press — subtle lift and glow */
        .rl-card-interactive {
          transition: transform 0.15s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .rl-card-interactive:active {
          transform: scale(0.985);
        }
        @media (hover: hover) {
          .rl-card-interactive:hover {
            border-color: #34C75940 !important;
            box-shadow: 0 0 20px rgba(52, 199, 89, 0.06);
          }
        }

        /* Fade-in for content appearing */
        .rl-fade-in {
          animation: rlFadeIn 0.35s ease-out both;
        }
        @keyframes rlFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Offline pulse dot */
        @keyframes rl-pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* Staggered fade for lists */
        .rl-stagger > * {
          animation: rlFadeIn 0.3s ease-out both;
        }
        .rl-stagger > *:nth-child(1) { animation-delay: 0.03s; }
        .rl-stagger > *:nth-child(2) { animation-delay: 0.06s; }
        .rl-stagger > *:nth-child(3) { animation-delay: 0.09s; }
        .rl-stagger > *:nth-child(4) { animation-delay: 0.12s; }
        .rl-stagger > *:nth-child(5) { animation-delay: 0.15s; }
        .rl-stagger > *:nth-child(6) { animation-delay: 0.18s; }
        .rl-stagger > *:nth-child(7) { animation-delay: 0.21s; }
        .rl-stagger > *:nth-child(8) { animation-delay: 0.24s; }
        .rl-stagger > *:nth-child(n+9) { animation-delay: 0.27s; }

        /* Slide-up for modals */
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        /* Spin for loading */
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Pulse for processing indicators */
        @keyframes rlPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .rl-pulse { animation: rlPulse 1.5s ease-in-out infinite; }

        /* Shimmer loading skeleton */
        .rl-shimmer {
          background: linear-gradient(90deg, var(--rl-shimmer1) 25%, var(--rl-shimmer2) 50%, var(--rl-shimmer1) 75%);
          background-size: 200% 100%;
          animation: rlShimmer 1.5s ease-in-out infinite;
          border-radius: 8px;
        }
        @keyframes rlShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Score ring count-up — drives the animated stroke */
        @keyframes rlScoreReveal {
          from { stroke-dashoffset: var(--rl-circ); }
          to { stroke-dashoffset: var(--rl-offset); }
        }

        /* Bottom nav icon bounce on tap */
        .rl-nav-item { transition: transform 0.15s ease; }
        .rl-nav-item:active { transform: scale(0.9) translateY(-2px); }

        /* Green glow on primary buttons */
        .rl-glow {
          box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.3);
          transition: box-shadow 0.2s ease;
        }
        @media (hover: hover) {
          .rl-glow:hover {
            box-shadow: 0 4px 20px rgba(52, 199, 89, 0.25);
          }
        }

        /* Smooth number transition for score */
        .rl-score-num {
          font-variant-numeric: tabular-nums;
          transition: color 0.3s ease;
        }

        /* Toggle/selection pop */
        .rl-pop {
          transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.15s ease, background 0.15s ease;
        }
        .rl-pop:active { transform: scale(0.93); }

        /* Card interactive — lift on hover, press on tap */
        .rl-card-interactive {
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .rl-card-interactive:active { transform: scale(0.97); }
        @media (hover: hover) {
          .rl-card-interactive:hover { 
            transform: translateY(-1px);
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
          }
        }

        /* Tap feedback for all tappable elements */
        .rl-tap {
          transition: transform 0.12s ease, opacity 0.12s ease;
        }
        .rl-tap:active { transform: scale(0.96); opacity: 0.85; }

        /* Subtle page transition */
        .rl-page {
          animation: rlPageIn 0.25s ease-out;
        }
        @keyframes rlPageIn {
          from { opacity: 0; transform: translateX(8px); }
          to { opacity: 1; transform: translateX(0); }
        }

        /* Smooth stat counter */
        .rl-stat-pill {
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .rl-stat-pill:active { transform: scale(0.95); }

        /* Logo scan animation — plays once on app load */
        .rl-logo-scan {
          animation: rlLogoScan 1.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
          transform-origin: 60% 60%;
        }
        @keyframes rlLogoScan {
          0% { transform: translateX(-6px) rotate(-12deg); opacity: 0.3; }
          20% { transform: translateX(4px) rotate(6deg); opacity: 0.7; }
          40% { transform: translateX(-3px) rotate(-4deg); opacity: 0.9; }
          60% { transform: translateX(2px) rotate(2deg); opacity: 1; }
          80% { transform: translateX(-1px) rotate(-1deg); }
          100% { transform: translateX(0) rotate(0deg); opacity: 1; }
        }

        /* Splash screen animations */
        .rl-splash-lens {
          animation: rlSplashScan 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
          transform-origin: 44% 44%;
          filter: drop-shadow(0 0 12px rgba(52, 199, 89, 0.3));
        }
        @keyframes rlSplashScan {
          0% { transform: translateX(-20px) rotate(-20deg) scale(0.8); opacity: 0; }
          25% { transform: translateX(12px) rotate(8deg) scale(1.05); opacity: 0.8; }
          50% { transform: translateX(-6px) rotate(-5deg) scale(1); opacity: 1; }
          75% { transform: translateX(3px) rotate(2deg) scale(1); }
          100% { transform: translateX(0) rotate(0deg) scale(1); opacity: 1; }
        }
        .rl-splash-line1 { animation: rlSplashLine 0.3s ease-out 0.5s both; }
        .rl-splash-line2 { animation: rlSplashLine 0.3s ease-out 0.7s both; }
        .rl-splash-line3 { animation: rlSplashLine 0.3s ease-out 0.9s both; }
        .rl-splash-check { animation: rlSplashCheck 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 1.1s both; }
        @keyframes rlSplashLine {
          from { stroke-dasharray: 30; stroke-dashoffset: 30; }
          to { stroke-dasharray: 30; stroke-dashoffset: 0; }
        }
        @keyframes rlSplashCheck {
          from { stroke-dasharray: 20; stroke-dashoffset: 20; opacity: 0; }
          to { stroke-dasharray: 20; stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes rlSplashOut {
          to { opacity: 0; pointer-events: none; }
        }
      `}</style>

      {/* ══════ SPLASH SCREEN ══════ */}
      {showSplash && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "rlSplashOut 0.4s ease-in 1.8s forwards" }}>
          <svg width="72" height="72" viewBox="0 0 120 120" className="rl-splash-lens">
            <circle cx="52" cy="52" r="34" fill="none" stroke="#34C759" strokeWidth="4"/>
            <line x1="36" y1="40" x2="62" y2="40" stroke="#34C759" strokeWidth="3" strokeLinecap="round" opacity="0.7" className="rl-splash-line1"/>
            <line x1="36" y1="50" x2="68" y2="50" stroke="#34C759" strokeWidth="3" strokeLinecap="round" opacity="0.5" className="rl-splash-line2"/>
            <line x1="36" y1="60" x2="56" y2="60" stroke="#34C759" strokeWidth="3" strokeLinecap="round" opacity="0.3" className="rl-splash-line3"/>
            <polyline points="64,48 67,52 74,42" fill="none" stroke="#34C759" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="rl-splash-check"/>
            <line x1="76" y1="76" x2="106" y2="106" stroke="#34C759" strokeWidth="6" strokeLinecap="round"/>
          </svg>
          <div style={{ marginTop: "16px", fontSize: "22px", fontWeight: 700, color: t.text, opacity: 0, animation: "rlFadeIn 0.4s ease-out 0.6s forwards" }}>
            Reg<span style={{ color: t.green }}>Lens</span>
          </div>
          <div style={{ marginTop: "4px", fontSize: "10px", color: t.textSecondary, opacity: 0, animation: "rlFadeIn 0.3s ease-out 0.9s forwards" }}>
            by Prudence EHS
          </div>
          <div style={{ marginTop: "2px", fontSize: "7px", color: t.textTertiary, opacity: 0, animation: "rlFadeIn 0.3s ease-out 1.1s forwards", letterSpacing: "0.3px" }}>
            Built by a Certified Safety Professional
          </div>
        </div>
      )}

      {/* ══════ TOP BAR ══════ */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: theme === "dark" ? "rgba(0,0,0,0.88)" : "rgba(245,245,247,0.88)", backdropFilter: "blur(20px) saturate(1.8)", WebkitBackdropFilter: "blur(20px) saturate(1.8)", borderBottom: `1px solid ${t.border}`, paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 50, padding: "0 16px", maxWidth: 430, margin: "0 auto" }}>
          <button className="rl-tap" onClick={() => setTab("dashboard")} style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <svg width="26" height="26" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
              <circle cx="52" cy="52" r="34" fill="none" stroke={t.green} strokeWidth="4"/>
              <line x1="36" y1="40" x2="62" y2="40" stroke={t.green} strokeWidth="3" strokeLinecap="round" opacity="0.7"/>
              <line x1="36" y1="50" x2="68" y2="50" stroke={t.green} strokeWidth="3" strokeLinecap="round" opacity="0.5"/>
              <line x1="36" y1="60" x2="56" y2="60" stroke={t.green} strokeWidth="3" strokeLinecap="round" opacity="0.3"/>
              <polyline points="64,48 67,52 74,42" fill="none" stroke={t.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="76" y1="76" x2="106" y2="106" stroke={t.green} strokeWidth="6" strokeLinecap="round"/>
            </svg>
            <div>
              <div style={{ fontSize: "17px", fontWeight: 700, color: t.text, letterSpacing: "-0.3px", lineHeight: 1.1 }}>
                Reg<span style={{ color: t.green }}>Lens</span>
                {adminMode && <span style={{ fontSize: "7px", fontWeight: 700, color: "#F59E0B", marginLeft: "5px", padding: "1px 4px", borderRadius: "3px", background: "#F59E0B15", border: "1px solid #F59E0B30", verticalAlign: "middle" }}>ADMIN</span>}
              </div>
              <div style={{ fontSize: "9px", color: t.textSecondary, cursor: "default" }} onClick={(e) => {
                e.stopPropagation();
                const next = adminTaps + 1;
                setAdminTaps(next);
                if (next >= 5 && !adminMode) { activateAdmin(); setAdminTaps(0); }
                setTimeout(() => setAdminTaps(0), 3000);
              }}>by Prudence EHS</div>
            </div>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${t.green}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: t.green }}>{(user.full_name || user.email || "U").charAt(0).toUpperCase()}</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "11px", color: t.text, fontWeight: 600, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.full_name?.split(" ")[0] || "User"}</div>
                  <div style={{ fontSize: "8px", color: t.textSecondary }}>{user.review_credits || 0} credits</div>
                </div>
              </div>
            ) : (
              <button onClick={() => setAuthScreen("login")} style={{ padding: "6px 12px", borderRadius: "8px", border: `1px solid ${t.green}40`, background: "transparent", color: t.green, fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Sign in</button>
            )}
          </div>
        </div>
      </header>
      <div style={{ height: "calc(50px + env(safe-area-inset-top, 0px))" }} />{/* header spacer */}

      <div className="rl-container">

      {/* ══════ OFFLINE BANNER ══════ */}
      {!isOnline && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "8px 16px", margin: "0 16px 8px",
          borderRadius: "10px",
          background: theme === "dark" ? "#2A1F00" : "#FEF3C7",
          border: `1px solid ${theme === "dark" ? "#F59E0B30" : "#FDE68A"}`,
          animation: "rl-fade-in 0.3s ease-out",
        }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F59E0B", flexShrink: 0, animation: "rl-pulse-dot 2s ease-in-out infinite" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: theme === "dark" ? "#FCD34D" : "#92400E" }}>You're offline</div>
            <div style={{ fontSize: "10px", color: theme === "dark" ? "#F59E0B" : "#B45309", lineHeight: 1.4 }}>
              Readiness checks, reports, and saved data still work. Reviews and syncing need a connection.
            </div>
          </div>
          <button onClick={() => setShowOfflineBanner(false)} style={{ background: "none", border: "none", color: theme === "dark" ? "#F59E0B" : "#92400E", fontSize: "14px", cursor: "pointer", padding: "4px", flexShrink: 0 }}>✕</button>
        </div>
      )}
      {syncPending && isOnline && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "8px 16px", margin: "0 16px 8px",
          borderRadius: "10px",
          background: theme === "dark" ? "#0D1F12" : "#F0FDF4",
          border: `1px solid ${theme === "dark" ? "#34C75930" : "#bbf7d0"}`,
        }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.green, flexShrink: 0 }} />
          <div style={{ fontSize: "11px", color: t.green }}>Syncing offline changes...</div>
        </div>
      )}

      {/* ══════ AUTH SCREENS ══════ */}
      {authScreen && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ textAlign: "center", marginBottom: "32px", marginTop: "40px" }}>
            <svg width="64" height="64" viewBox="0 0 120 120" style={{ margin: "0 auto 12px", display: "block" }}>
              <circle cx="52" cy="52" r="34" fill="#34C759" opacity="0.1"/>
              <circle cx="52" cy="52" r="34" fill="none" stroke="#34C759" strokeWidth="3.5"/>
              <line x1="36" y1="40" x2="62" y2="40" stroke={theme === "dark" ? "#fff" : "#374151"} strokeWidth="2.5" strokeLinecap="round" opacity={theme === "dark" ? 0.6 : 0.5}/>
              <line x1="36" y1="50" x2="68" y2="50" stroke={theme === "dark" ? "#fff" : "#374151"} strokeWidth="2.5" strokeLinecap="round" opacity={theme === "dark" ? 0.45 : 0.35}/>
              <line x1="36" y1="60" x2="56" y2="60" stroke={theme === "dark" ? "#fff" : "#374151"} strokeWidth="2.5" strokeLinecap="round" opacity={theme === "dark" ? 0.3 : 0.25}/>
              <polyline points="64,48 67,52 74,42" fill="none" stroke="#34C759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="76" y1="76" x2="106" y2="106" stroke="#34C759" strokeWidth="5" strokeLinecap="round"/>
            </svg>
            <div style={{ fontSize: "28px", fontWeight: 700 }}>Reg<span style={{ color: t.green }}>Lens</span></div>
            <div style={{ fontSize: "13px", color: t.textSecondary, marginTop: "4px" }}>{authScreen === "login" ? "Sign in to your account" : "Create your account"}</div>
          </div>

          {authError && (
            <div style={{ padding: "10px 14px", borderRadius: "10px", marginBottom: "12px", background: "#2A1215", border: `1px solid ${theme === "dark" ? "#EF444430" : "#FECACA"}`, fontSize: "12px", color: "#EF4444" }}>{authError}</div>
          )}

          <form onSubmit={async (e) => {
            e.preventDefault();
            setAuthError("");
            setAuthLoading(true);
            const form = new FormData(e.target);
            const email = form.get("email");
            const password = form.get("password");

            if (authScreen === "signup") {
              const fullName = form.get("fullName");
              const company = form.get("company");
              const res = await supabase.signUp(email, password, fullName, company);
              if (res.error) { setAuthError(res.error); setAuthLoading(false); return; }
              if (res.session) {
                supabase.setSession(res.session);
                const profile = await supabase.getProfile(res.session.access_token);
                setUser({ ...profile, access_token: res.session.access_token });
                supabase.trackEvent("signup_completed", {});
                setAuthScreen(null);
              } else {
                setAuthError("Check your email to confirm your account, then log in.");
                setAuthScreen("login");
              }
            } else {
              const res = await supabase.signIn(email, password);
              if (res.error) { setAuthError(res.error); setAuthLoading(false); return; }
              supabase.setSession(res.session);
              const profile = await supabase.getProfile(res.session.access_token);
              setUser({ ...profile, access_token: res.session.access_token });
              supabase.trackEvent("login_completed", {});
              setAuthScreen(null);
            }
            setAuthLoading(false);
          }} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {authScreen === "signup" && (
              <>
                <input name="fullName" placeholder="Full Name" required style={{ padding: "14px 16px", borderRadius: "12px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "15px", outline: "none" }} />
                <input name="company" placeholder="Company Name (optional)" style={{ padding: "14px 16px", borderRadius: "12px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "15px", outline: "none" }} />
              </>
            )}
            <input name="email" type="email" placeholder="Email" required style={{ padding: "14px 16px", borderRadius: "12px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "15px", outline: "none" }} />
            <input name="password" type="password" placeholder="Password" required minLength={8} style={{ padding: "14px 16px", borderRadius: "12px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "15px", outline: "none" }} />
            {authScreen === "signup" && (
              <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "12px", color: t.textSecondary, lineHeight: 1.5, cursor: "pointer", padding: "4px 0" }}>
                <input type="checkbox" name="tosAccepted" required style={{ marginTop: "3px", accentColor: t.green, flexShrink: 0 }} />
                <span>I agree to the <span onClick={(e) => { e.preventDefault(); setAuthScreen(null); setTab("tos"); }} style={{ color: t.green, textDecoration: "underline", cursor: "pointer" }}>Terms of Service</span> and <span onClick={(e) => { e.preventDefault(); setAuthScreen(null); setTab("privacy"); }} style={{ color: t.green, textDecoration: "underline", cursor: "pointer" }}>Privacy Policy</span></span>
              </label>
            )}
            <button type="submit" disabled={authLoading} style={{ padding: "15px", borderRadius: "12px", border: "none", background: authLoading ? "#2C2C2E" : "#34C759", color: authLoading ? "#555" : "#000", fontSize: "16px", fontWeight: 700, cursor: authLoading ? "wait" : "pointer" }}>
              {authLoading ? "Please wait…" : authScreen === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: "16px" }}>
            {authScreen === "login" ? (
              <button onClick={() => { setAuthScreen("signup"); setAuthError(""); }} style={{ background: "none", border: "none", color: t.green, fontSize: "14px", cursor: "pointer" }}>
                Don't have an account? <strong>Sign up</strong>
              </button>
            ) : (
              <button onClick={() => { setAuthScreen("login"); setAuthError(""); }} style={{ background: "none", border: "none", color: t.green, fontSize: "14px", cursor: "pointer" }}>
                Already have an account? <strong>Sign in</strong>
              </button>
            )}
          </div>

          <div style={{ textAlign: "center", marginTop: "12px" }}>
            <button onClick={() => setAuthScreen(null)} style={{ background: "none", border: "none", color: t.textTertiary, fontSize: "13px", cursor: "pointer" }}>
              Continue without saving — your reviews won't be stored
            </button>
          </div>
        </div>
      )}

      {/* ══════ EMAIL MODAL ══════ */}
      {emailModal && (() => {
        const em = buildEmailContent(emailModal.type, emailModal.data);
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 260, background: t.overlay, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={(e) => { if (e.target === e.currentTarget) setEmailModal(null); }}>
            <div className="rl-container" style={{ background: t.modalBg, borderRadius: "20px 20px 0 0", padding: "20px 16px", paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))", maxHeight: "80vh", overflowY: "auto", animation: "slideUp 0.3s ease-out" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: t.textTertiary, margin: "0 auto 14px" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div style={{ fontSize: "18px", fontWeight: 700, color: t.text }}>Email Report</div>
                <button onClick={() => setEmailModal(null)} style={{ width: "28px", height: "28px", borderRadius: "50%", background: t.card, border: `1px solid ${t.border}`, color: t.textSecondary, fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>

              <div style={{ fontSize: "12px", color: t.textSecondary, marginBottom: "14px", lineHeight: 1.5 }}>
                This will open your email app with the report details pre-filled. Download and attach the exported file before sending.
              </div>

              {/* Recipient */}
              <div style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: t.textSecondary, marginBottom: "4px" }}>To</div>
                <input
                  id="emailTo"
                  type="email"
                  placeholder="recipient@company.com"
                  style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "15px", outline: "none", fontFamily: "inherit" }}
                />
              </div>

              {/* Preview */}
              <div style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: t.textSecondary, marginBottom: "4px" }}>Subject</div>
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, fontSize: "12px", color: t.text }}>{em.subject}</div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: t.textSecondary, marginBottom: "4px" }}>Message preview</div>
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, fontSize: "10px", color: t.textSecondary, lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: "120px", overflowY: "auto" }}>{em.body}</div>
              </div>

              {/* Send button */}
              <button
                className="rl-tap rl-glow"
                onClick={() => {
                  const to = document.getElementById("emailTo")?.value || "";
                  const subject = encodeURIComponent(em.subject);
                  const body = encodeURIComponent(em.body);
                  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
                  setEmailModal(null);
                }}
                style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "none", background: t.green, color: theme === "dark" ? "#000" : "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                ✉️ Open Email App
              </button>

              <div style={{ textAlign: "center", marginTop: "8px", fontSize: "10px", color: t.textTertiary }}>
                Remember to attach the downloaded report file
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════ GUIDED TOUR ══════ */}
      {tourStep >= 0 && tourStep < TOUR_STEPS.length && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: "120px" }} onClick={endTour}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "90%", maxWidth: "360px", padding: "20px", borderRadius: "16px", background: theme === "dark" ? "#1C1C1E" : "#FFFFFF", border: `1px solid ${t.border}`, boxShadow: "0 8px 40px rgba(0,0,0,0.3)", animation: "rlFadeIn 0.25s ease-out" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: `${t.green}20`, border: `1.5px solid ${t.green}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800, color: t.green }}>{tourStep + 1}</div>
                <span style={{ fontSize: "14px", fontWeight: 700, color: t.text }}>{TOUR_STEPS[tourStep].title}</span>
              </div>
              <button onClick={endTour} style={{ background: "none", border: "none", color: t.textTertiary, fontSize: "16px", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ fontSize: "12px", color: t.textSecondary, lineHeight: 1.6, marginBottom: "14px" }}>{TOUR_STEPS[tourStep].desc}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "4px" }}>
                {TOUR_STEPS.map((_, i) => (
                  <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: i === tourStep ? t.green : i < tourStep ? `${t.green}60` : t.border, transition: "background 0.2s" }} />
                ))}
              </div>
              <button onClick={nextTour} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: t.green, color: theme === "dark" ? "#000" : "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                {tourStep < TOUR_STEPS.length - 1 ? "Next" : "Done"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ ACHIEVEMENT TOAST ══════ */}
      {achievementToast && (
        <div style={{ position: "fixed", top: "60px", left: "50%", transform: "translateX(-50%)", zIndex: 300, width: "90%", maxWidth: "360px", padding: "14px 18px", borderRadius: "16px", background: theme === "dark" ? "#1A2A1A" : "#F0FDF4", border: `1.5px solid ${theme === "dark" ? "#34C75940" : "#bbf7d0"}`, boxShadow: "0 8px 30px rgba(0,0,0,0.2)", animation: "slideDown 0.3s ease-out", display: "flex", alignItems: "center", gap: "12px" }} onClick={() => setAchievementToast(null)}>
          <div style={{ fontSize: "28px", flexShrink: 0 }}>🎯</div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: t.green }}>{achievementToast.title}</div>
            <div style={{ fontSize: "11px", color: t.textSecondary, lineHeight: 1.4 }}>{achievementToast.desc}</div>
          </div>
        </div>
      )}
      <style>{`@keyframes slideDown { from { opacity:0; transform:translateX(-50%) translateY(-20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>

      {/* ══════ ADMIN CODE MODAL ══════ */}
      {showAdminInput && (
        <div style={{ position: "fixed", inset: 0, zIndex: 270, background: t.overlay, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }} onClick={(e) => { if (e.target === e.currentTarget) setShowAdminInput(false); }}>
          <div style={{ background: t.modalBg, borderRadius: "20px", padding: "24px", width: "100%", maxWidth: "320px", animation: "slideUp 0.3s ease-out" }}>
            <div style={{ fontSize: "18px", fontWeight: 700, color: t.text, marginBottom: "4px" }}>🔐 Admin Mode</div>
            <div style={{ fontSize: "12px", color: t.textSecondary, marginBottom: "16px" }}>Enter the admin code to bypass payment gates for testing.</div>
            <input
              type="password"
              value={adminCodeValue}
              onChange={(e) => setAdminCodeValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitAdminCode(); }}
              placeholder="Enter code"
              autoFocus
              style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "16px", outline: "none", fontFamily: "inherit", marginBottom: "12px", textAlign: "center", letterSpacing: "2px" }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setShowAdminInput(false)} style={{ flex: 1, padding: "13px", borderRadius: "12px", background: t.card, border: `1px solid ${t.border}`, color: t.textSecondary, fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={submitAdminCode} style={{ flex: 1, padding: "13px", borderRadius: "12px", background: "#F59E0B", border: "none", color: theme === "dark" ? "#000" : "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Activate</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ PRICING MODAL ══════ */}
      {showPricing && (
        <div style={{ position: "fixed", inset: 0, zIndex: 250, background: t.overlay, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 0 }} onClick={(e) => { if (e.target === e.currentTarget) setShowPricing(false); }}>
          <div className="rl-container" style={{ background: t.modalBg, borderRadius: "20px 20px 0 0", padding: "20px 16px", paddingBottom: "calc(100px + env(safe-area-inset-bottom, 0px))", maxHeight: "85vh", overflowY: "auto", animation: "slideUp 0.3s ease-out", WebkitOverflowScrolling: "touch" }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "#555", margin: "0 auto 16px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>Compliance Reviews</div>
              <button onClick={() => setShowPricing(false)} style={{ width: "28px", height: "28px", borderRadius: "50%", background: t.card, border: "none", color: t.textSecondary, fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            <div style={{ fontSize: "13px", color: t.textSecondary, marginBottom: "10px" }}>AI-powered document analysis. Credits never expire.</div>
            <div style={{ padding: "10px 14px", borderRadius: "10px", marginBottom: "16px", background: theme === "dark" ? "#1C1215" : "#FEF2F2", border: `1px solid ${theme === "dark" ? "#EF444420" : "#FECACA"}`, display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "18px", flexShrink: 0 }}>⚠️</span>
              <div style={{ fontSize: "11px", color: theme === "dark" ? "#FCA5A5" : "#DC2626", lineHeight: 1.5 }}>
                The average OSHA serious violation penalty is <strong>$16,131</strong>. One review could catch the gap that saves you 300x the cost.
              </div>
            </div>

            {[
              { tier: 1, name: "Single Review", price: "$49", reviews: 1, perReview: "$49", desc: "Try one compliance review on your document", savings: null },
              { tier: 2, name: "5 Reviews", price: "$199", reviews: 5, perReview: "$39.80", desc: "Best for consultants reviewing client programs", savings: "Save 19%", popular: true },
              { tier: 3, name: "15 Reviews", price: "$499", reviews: 15, perReview: "$33.27", desc: "Full program suite — review every EHS program", savings: "Save 32%" },
            ].map((plan) => (
              <button key={plan.tier} className="rl-card-interactive" onClick={async () => {
                if (!user) { setShowPricing(false); setAuthScreen("signup"); return; }
                supabase.trackEvent("checkout_started", { tier: plan.tier, plan: plan.name });
                try {
                  const res = await fetch("/api/checkout", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tier: plan.tier, userId: user.id, userEmail: user.email }),
                  });
                  const data = await res.json();
                  if (data.url) window.location.href = data.url;
                } catch (err) {
                  alert("Payment setup failed. Please try again.");
                }
              }} style={{
                width: "100%", background: t.inputBg, border: plan.popular ? `1.5px solid ${t.green}` : `1.5px solid ${t.border}`,
                borderRadius: "14px", padding: "16px", marginBottom: "10px", cursor: "pointer", textAlign: "left",
                position: "relative",
              }}>
                {plan.popular && <div style={{ position: "absolute", top: "-8px", right: "16px", padding: "2px 10px", borderRadius: "10px", background: t.green, color: theme === "dark" ? "#000" : "#fff", fontSize: "10px", fontWeight: 700 }}>BEST VALUE</div>}
                {plan.savings && !plan.popular && <div style={{ position: "absolute", top: "-8px", right: "16px", padding: "2px 10px", borderRadius: "10px", background: "#3B82F6", color: t.text, fontSize: "10px", fontWeight: 700 }}>{plan.savings}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "16px", fontWeight: 700, color: t.text }}>{plan.name}</span>
                  <span style={{ fontSize: "18px", fontWeight: 700, color: t.green }}>{plan.price}</span>
                </div>
                <div style={{ fontSize: "12px", color: t.textSecondary, marginBottom: "8px" }}>{plan.desc}</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "6px", background: "#3B82F615", color: "#60A5FA", border: "1px solid #3B82F620" }}>{plan.reviews} {plan.reviews === 1 ? "review" : "reviews"}</span>
                  <span style={{ fontSize: "10px", color: t.textTertiary }}>{plan.perReview}/review</span>
                </div>
              </button>
            ))}

            {/* Free features note */}
            <div style={{ ...card, background: t.inputBg, border: `1px solid ${t.border}`, marginTop: "4px", padding: "12px 14px" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: t.textSecondary, marginBottom: "6px" }}>Always free — no credits needed</div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {["EHS Readiness Check", "Corrective Action Plan", "Report Export", "Photo Documentation"].map(f => (
                  <span key={f} style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "6px", background: `${t.green}08`, color: t.green, border: `1px solid ${t.green}20` }}>✓ {f}</span>
                ))}
              </div>
            </div>

            <div style={{ textAlign: "center", marginTop: "10px", fontSize: "11px", color: t.textTertiary }}>Secure payments by Stripe · Credits applied instantly</div>
          </div>
        </div>
      )}

      {/* ══════ DASHBOARD ══════ */}
      {tab === "dashboard" && (
        <div style={{ padding: "0 16px" }} className="rl-fade-in">

          {/* ── Personalized Greeting ── */}
          {(() => {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
            const name = user?.full_name?.split(" ")[0];
            // Score trends
            const lastReviewScore = submissions.length > 0 ? submissions[0].score : null;
            const prevReviewScore = submissions.length > 1 ? submissions[1].score : null;
            const lastAuditScore = auditSubmissions.length > 0 ? auditSubmissions[0].score : null;
            const prevAuditScore = auditSubmissions.length > 1 ? auditSubmissions[1].score : null;
            const hasHistory = submissions.length > 0 || auditSubmissions.length > 0;

            return (
              <div style={{ marginBottom: "14px", padding: "0 2px" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color: t.text, lineHeight: 1.2 }}>
                  {greeting}{name ? `, ${name}` : ""} 👋
                </div>
                {hasHistory && (
                  <div style={{ display: "flex", gap: "12px", marginTop: "8px", flexWrap: "wrap" }}>
                    {lastReviewScore !== null && (
                      <div style={{ fontSize: "12px", color: t.textSecondary }}>
                        Last review: <span style={{ fontWeight: 700, color: RegLensScoring.getBandColor(RegLensScoring.getBand(lastReviewScore)) }}>{lastReviewScore}</span>
                        {prevReviewScore !== null && (() => {
                          const delta = lastReviewScore - prevReviewScore;
                          if (delta === 0) return null;
                          return <span style={{ marginLeft: "4px", fontSize: "11px", fontWeight: 700, color: delta > 0 ? "#22c55e" : "#EF4444" }}>{delta > 0 ? "↑" : "↓"}{Math.abs(delta)}</span>;
                        })()}
                      </div>
                    )}
                    {lastAuditScore !== null && (
                      <div style={{ fontSize: "12px", color: t.textSecondary }}>
                        Readiness: <span style={{ fontWeight: 700, color: RegLensScoring.getBandColor(RegLensScoring.getBand(lastAuditScore)) }}>{lastAuditScore}</span>
                        {prevAuditScore !== null && (() => {
                          const delta = lastAuditScore - prevAuditScore;
                          if (delta === 0) return null;
                          return <span style={{ marginLeft: "4px", fontSize: "11px", fontWeight: 700, color: delta > 0 ? "#22c55e" : "#EF4444" }}>{delta > 0 ? "↑" : "↓"}{Math.abs(delta)}</span>;
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Quick Resume (unfinished readiness check) ── */}
          {(() => {
            const cp = getCheckpoint();
            if (!cp || !cp.industry || auditResult) return null;
            const answered = Object.keys(cp.responses || {}).length;
            const ind = INDUSTRIES[cp.industry];
            const savedAgo = (() => {
              const diff = Date.now() - new Date(cp.savedAt).getTime();
              if (diff < 3600000) return `${Math.round(diff / 60000)} min ago`;
              if (diff < 86400000) return `${Math.round(diff / 3600000)} hours ago`;
              return `${Math.round(diff / 86400000)} days ago`;
            })();
            return (
              <div style={{ ...card, border: `1px solid ${theme === "dark" ? "#F59E0B30" : "#FDE68A"}`, background: theme === "dark" ? "linear-gradient(145deg, #2A201008, #1C1C1E)" : "linear-gradient(145deg, #FFFBEB08, #FFFFFF)", display: "flex", alignItems: "center", gap: "12px" }} className="rl-fade-in">
                <div style={{ fontSize: "28px", flexShrink: 0 }}>📋</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: t.text }}>Continue Readiness Check</div>
                  <div style={{ fontSize: "10px", color: t.textSecondary }}>{ind?.icon} {ind?.label} · {answered} items answered · saved {savedAgo}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <button className="rl-tap" onClick={() => {
                    setAuditIndustry(cp.industry);
                    setAuditResponses(cp.responses || {});
                    setAuditNotes(cp.notes || {});
                    setAuditSection(cp.section || 0);
                    setAuditResult(null);
                    setTab("audit");
                  }} style={{ padding: "6px 12px", borderRadius: "6px", background: t.green, border: "none", color: theme === "dark" ? "#000" : "#fff", fontSize: "10px", fontWeight: 700, cursor: "pointer" }}>Resume</button>
                  <button onClick={() => clearCheckpoint()} style={{ padding: "4px 8px", borderRadius: "4px", background: "none", border: "none", color: t.textTertiary, fontSize: "8px", cursor: "pointer" }}>Discard</button>
                </div>
              </div>
            );
          })()}

          {/* ── Primary Actions — clear hierarchy ── */}
          <button className="rl-tap rl-glow" onClick={() => { setSelectedType(null); setTab("upload"); }} style={{ width: "100%", padding: "20px 16px", borderRadius: "16px", background: theme === "dark" ? "linear-gradient(145deg, #1A2A1A, #1C1C1E)" : "linear-gradient(145deg, #F0FDF4, #FFFFFF)", border: `1.5px solid ${theme === "dark" ? "#34C75940" : "#bbf7d0"}`, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "14px", marginBottom: "10px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <rect x="4" y="2" width="12" height="16" rx="2" stroke={t.green} strokeWidth="1.5" opacity="0.5"/>
              <rect x="8" y="6" width="12" height="16" rx="2" stroke={t.green} strokeWidth="1.5"/>
              <path d="M12 12h4M12 15h3" stroke={t.green} strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="18" cy="8" r="3" fill={t.green} opacity="0.8"/><path d="M16.5 8l1 1 2-2" stroke={theme === "dark" ? "#000" : "#fff"} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: t.text }}>Run Compliance Review</div>
              <div style={{ fontSize: "11px", color: t.textSecondary, marginTop: "2px" }}>Upload a safety program for AI-powered gap analysis</div>
            </div>
            <span style={{ color: t.green, fontSize: "18px" }}>›</span>
          </button>

          <button className="rl-tap" onClick={() => setTab("audit")} style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", background: theme === "dark" ? "linear-gradient(145deg, #101C2E, #1C1C1E)" : "linear-gradient(145deg, #EFF6FF, #FFFFFF)", border: `1px solid ${theme === "dark" ? "#3B82F630" : "#BFDBFE"}`, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <rect x="4" y="3" width="16" height="18" rx="2" stroke="#3B82F6" strokeWidth="1.5"/>
              <path d="M9 9h6M9 13h4" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
              <rect x="8" y="8" width="2" height="2" rx="0.5" fill="#3B82F6"/><rect x="8" y="12" width="2" height="2" rx="0.5" fill="#3B82F6" opacity="0.6"/>
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: t.text }}>Start Readiness Check</div>
              <div style={{ fontSize: "10px", color: t.textSecondary }}>Guided facility checklist with photos</div>
            </div>
            <span style={{ color: "#3B82F6", fontSize: "16px" }}>›</span>
          </button>

          {/* ── Latest Scores (most recent review + audit side by side) ── */}
          {(submissions.length > 0 || auditSubmissions.length > 0) && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "8px", padding: "0 4px" }}>Latest Scores</div>
              <div style={{ display: "flex", gap: "10px" }}>
                {submissions.length > 0 && (() => {
                  const latest = (clientFilter === "all" ? submissions : submissions.filter(s => s.clientId === clientFilter))[0];
                  if (!latest) return null;
                  return (
                    <button key="lr" className="rl-card-interactive" onClick={() => { setResult(latest.result); setScoreResult(latest.scoreResult); setViewingSub(latest); setTab("report"); }} style={{ flex: 1, ...card, marginBottom: 0, border: `1px solid ${t.border}`, cursor: "pointer", textAlign: "center", padding: "16px 12px" }}>
                      <div style={{ fontSize: "32px", fontWeight: 700, color: RegLensScoring.getBandColor(latest.band) }} className="rl-score-num">{latest.score}</div>
                      <div style={{ fontSize: "10px", color: RegLensScoring.getBandColor(latest.band), fontWeight: 600, marginBottom: "6px" }}>{latest.band}</div>
                      <div style={{ fontSize: "11px", color: t.textSecondary, fontWeight: 500 }}>{latest.label}</div>
                      <div style={{ fontSize: "9px", color: t.textTertiary, marginTop: "2px" }}>{latest.date}</div>
                    </button>
                  );
                })()}
                {auditSubmissions.length > 0 && (() => {
                  const latest = auditSubmissions[0];
                  return (
                    <div key="la" style={{ flex: 1, ...card, marginBottom: 0, border: `1px solid ${t.border}`, textAlign: "center", padding: "16px 12px" }}>
                      <div style={{ fontSize: "32px", fontWeight: 700, color: RegLensScoring.getBandColor(latest.band) }} className="rl-score-num">{latest.score}</div>
                      <div style={{ fontSize: "10px", color: RegLensScoring.getBandColor(latest.band), fontWeight: 600, marginBottom: "6px" }}>{latest.band}</div>
                      <div style={{ fontSize: "11px", color: t.textSecondary, fontWeight: 500 }}>Readiness Check</div>
                      <div style={{ fontSize: "9px", color: t.textTertiary, marginTop: "2px" }}>{latest.industryLabel} · {latest.date}</div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── Score Trends ── */}
          {(submissions.length >= 2 || auditSubmissions.length >= 2) && (
            <div style={{ ...card, border: `1px solid ${t.border}`, marginBottom: "16px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px" }}>Score Trends</div>
              {(() => {
                const reviewScores = submissions.slice(0, 8).map(s => ({ score: s.score, label: s.date })).reverse();
                const auditScores = auditSubmissions.slice(0, 8).map(s => ({ score: s.score, label: s.date })).reverse();
                const hasReviews = reviewScores.length >= 2;
                const hasAudits = auditScores.length >= 2;
                const chartH = 80, chartW = 280;
                const renderLine = (scores, color) => {
                  if (scores.length < 2) return null;
                  const stepX = chartW / (scores.length - 1);
                  const pts = scores.map((s, i) => ({ x: i * stepX, y: chartH - (s.score / 100) * chartH }));
                  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
                  return (
                    <g>
                      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
                      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={color} stroke={theme === "dark" ? "#1C1C1E" : "#fff"} strokeWidth="1.5" />)}
                    </g>
                  );
                };
                return (
                  <div>
                    <svg width="100%" viewBox={`-10 -10 ${chartW + 20} ${chartH + 20}`} style={{ overflow: "visible" }}>
                      {[0, 25, 50, 75, 100].map(v => {
                        const y = chartH - (v / 100) * chartH;
                        return <g key={v}><line x1="0" y1={y} x2={chartW} y2={y} stroke={t.border} strokeWidth="0.5" strokeDasharray={v === 0 || v === 100 ? "none" : "3,3"} /><text x="-8" y={y + 3} fill={t.textTertiary} fontSize="7" textAnchor="end">{v}</text></g>;
                      })}
                      {hasReviews && renderLine(reviewScores, t.green)}
                      {hasAudits && renderLine(auditScores, "#3B82F6")}
                    </svg>
                    <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginTop: "6px" }}>
                      {hasReviews && <div style={{ display: "flex", alignItems: "center", gap: "4px" }}><div style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.green }} /><span style={{ fontSize: "9px", color: t.textSecondary }}>Reviews</span></div>}
                      {hasAudits && <div style={{ display: "flex", alignItems: "center", gap: "4px" }}><div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3B82F6" }} /><span style={{ fontSize: "9px", color: t.textSecondary }}>Readiness</span></div>}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Inline Metrics (from Analytics) ── */}
          {(submissions.length > 0 || auditSubmissions.length > 0) && (
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              {[
                { label: "Reviews", value: submissions.length, color: t.green },
                { label: "Avg Score", value: submissions.length > 0 ? Math.round(submissions.reduce((a, s) => a + s.score, 0) / submissions.length) : "—", color: submissions.length > 0 ? (() => { const avg = Math.round(submissions.reduce((a, s) => a + s.score, 0) / submissions.length); return RegLensScoring.getBandColor(RegLensScoring.getBand(avg)); })() : t.textTertiary },
                { label: "Checks", value: auditSubmissions.length, color: "#3B82F6" },
              ].map((m, i) => (
                <div key={i} style={{ flex: 1, padding: "10px 8px", borderRadius: "12px", background: t.card, border: `1px solid ${t.border}`, textAlign: "center" }}>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: m.color }}>{m.value}</div>
                  <div style={{ fontSize: "9px", color: t.textSecondary, fontWeight: 500, textTransform: "uppercase" }}>{m.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Recent Activity ── */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", padding: "0 4px" }}>
              <span style={{ fontSize: "18px", fontWeight: 700 }}>Recent Activity</span>
            </div>
            {submissions.length === 0 && auditSubmissions.length === 0 ? (
              <div style={{ ...card, textAlign: "center", padding: "28px 16px", border: `1px solid ${t.border}` }}>
                <div style={{ fontSize: "32px", marginBottom: "8px", opacity: 0.3 }}>📋</div>
                <div style={{ fontSize: "14px", color: t.text, fontWeight: 600 }}>Your activity will appear here</div>
                <div style={{ fontSize: "12px", color: t.textSecondary, marginTop: "4px", lineHeight: 1.5 }}>Run a compliance review or readiness check to see your scores, findings, and history.</div>
              </div>
            ) : (
              <div className="rl-stagger">
                {(clientFilter === "all" ? submissions : submissions.filter(s => s.clientId === clientFilter)).slice(0, 4).map((sub) => (
                  <button key={sub.id} className="rl-card-interactive" onClick={() => { setResult(sub.result); setScoreResult(sub.scoreResult); setViewingSub(sub); setTab("report"); }} style={{ ...cardFlat, width: "100%", border: `1px solid ${t.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div>{renderIcon(sub.icon, 24)}</div>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: t.text }}>{sub.label}</div>
                        <div style={{ fontSize: "11px", color: t.textSecondary }}>{sub.industryLabel} · {sub.date}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: RegLensScoring.getBandColor(sub.band) }}>{sub.score}</div>
                      <div style={{ fontSize: "9px", color: t.textSecondary }}>{sub.band}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Program Types ── */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", padding: "0 4px" }}>
              <span style={{ fontSize: "18px", fontWeight: 700 }}>All Program Types</span>
              <span style={{ fontSize: "12px", color: t.textSecondary }}>{Object.keys(REVIEW_TEMPLATES).length} programs</span>
            </div>
            <div className="rl-grid-2 rl-stagger">
              {Object.entries(REVIEW_TEMPLATES).map(([key, val]) => (
                <button key={key} className="rl-card-interactive" onClick={() => { setSelectedType(key); setTab("upload"); }} style={{ ...card, marginBottom: 0, border: `1px solid ${t.border}`, cursor: "pointer", textAlign: "left", padding: "16px 14px" }}>
                  <div style={{ marginBottom: "8px" }}>{renderIcon(val.icon, 24)}</div>
                  <div style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.3, marginBottom: "3px" }}>{val.label}</div>
                  <div style={{ fontSize: "11px", color: t.textSecondary, lineHeight: 1.3 }}>{val.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Client Filter (compact, only when DB connected) ── */}
          {supabase.isConfigured && clients.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", padding: "0 4px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: t.textSecondary }}>Filter by Client</span>
                <button onClick={() => setShowClientForm(true)} style={{ padding: "3px 10px", borderRadius: "8px", border: `1px solid ${theme === "dark" ? "#34C75930" : "#bbf7d0"}`, background: "transparent", color: t.green, fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>+ Add</button>
              </div>
              <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px" }}>
                <button className="rl-pop" onClick={() => { setClientFilter("all"); setSelectedClient(null); }} style={{
                  padding: "6px 12px", borderRadius: "8px", whiteSpace: "nowrap", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                  border: clientFilter === "all" ? "1px solid #34C759" : "1px solid #2A2A2E",
                  background: clientFilter === "all" ? "#34C75915" : "#111",
                  color: clientFilter === "all" ? "#34C759" : "#8E8E93",
                }}>All</button>
                {clients.map(c => (
                  <button key={c.id} className="rl-pop" onClick={() => { setClientFilter(c.id); setSelectedClient(c); }} style={{
                    padding: "6px 12px", borderRadius: "8px", whiteSpace: "nowrap", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                    border: clientFilter === c.id ? "1px solid #34C759" : "1px solid #2A2A2E",
                    background: clientFilter === c.id ? "#34C75915" : "#111",
                    color: clientFilter === c.id ? "#34C759" : "#8E8E93",
                  }}>{c.name}</button>
                ))}
              </div>
            </div>
          )}

          {/* ── Connection Status (minimal) ── */}
          {!supabase.isConfigured && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 4px", marginBottom: "8px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#F59E0B" }} />
              <span style={{ fontSize: "10px", color: "#F59E0B" }}>Local mode — data won't persist across sessions</span>
            </div>
          )}

          {/* ── Soft upgrade CTA (only shows after user has used free tier) ── */}
          {submissions.length >= 1 && !user && (
            <div style={{ ...card, border: "1px solid #34C75920", background: theme === "dark" ? "linear-gradient(145deg, #1A2A1A08, #1C1C1E)" : "linear-gradient(145deg, #F0FDF408, #FFFFFF)", marginTop: "8px", textAlign: "center", padding: "20px 16px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: t.text, marginBottom: "4px" }}>Save your review results</div>
              <div style={{ fontSize: "12px", color: t.textSecondary, lineHeight: 1.5, marginBottom: "14px" }}>Create a free account to save reports, track score trends, and access your reviews across devices.</div>
              <button className="rl-tap rl-glow" onClick={() => setAuthScreen("signup")} style={{ width: "100%", padding: "13px", borderRadius: "12px", border: "none", background: t.green, color: theme === "dark" ? "#000" : "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>Create Free Account</button>
            </div>
          )}
          {user && (user.review_credits || 0) === 0 && submissions.length >= 1 && (
            <div style={{ ...card, border: "1px solid #34C75920", background: theme === "dark" ? "linear-gradient(145deg, #1A2A1A08, #1C1C1E)" : "linear-gradient(145deg, #F0FDF408, #FFFFFF)", marginTop: "8px", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#34C75912", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>📄</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: t.text }}>Need more reviews?</div>
                  <div style={{ fontSize: "11px", color: t.textSecondary, marginTop: "2px" }}>Run compliance reviews on your other EHS programs.</div>
                </div>
                <button className="rl-tap" onClick={() => setShowPricing(true)} style={{ padding: "8px 16px", borderRadius: "10px", border: "1px solid #34C759", background: "transparent", color: t.green, fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>View Plans</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════ UPLOAD ══════ */}
      {tab === "upload" && !selectedType && (
        <div style={{ padding: "0 16px" }} className="rl-fade-in">
          <button onClick={() => setTab("dashboard")} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "16px" }}>‹ Dashboard</button>
          <div style={{ textAlign: "center", marginBottom: "16px" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginBottom: "8px" }}><rect x="4" y="2" width="12" height="16" rx="2" stroke={t.green} strokeWidth="1.5" opacity="0.5"/><rect x="8" y="6" width="12" height="16" rx="2" stroke={t.green} strokeWidth="1.5"/><path d="M12 12h4M12 15h3" stroke={t.green} strokeWidth="1.5" strokeLinecap="round"/><circle cx="18" cy="8" r="3" fill={t.green} opacity="0.8"/><path d="M16.5 8l1 1 2-2" stroke={theme === "dark" ? "#000" : "#fff"} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <h2 style={{ fontSize: "22px", fontWeight: 700, color: t.text, margin: "0 0 4px" }}>Compliance Review</h2>
            <p style={{ fontSize: "13px", color: t.textSecondary, margin: 0 }}>Select the program type you want reviewed</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {Object.entries(REVIEW_TEMPLATES).map(([key, tmpl]) => (
              <button key={key} className="rl-card-interactive" onClick={() => setSelectedType(key)} style={{ ...cardFlat, border: `1px solid ${t.border}`, cursor: "pointer", textAlign: "center", padding: "14px 8px" }}>
                <div style={{ fontSize: "24px", marginBottom: "4px" }}>{tmpl.icon}</div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: t.text }}>{tmpl.label}</div>
                <div style={{ fontSize: "9px", color: t.textSecondary, marginTop: "2px" }}>{tmpl.desc}</div>
              </button>
            ))}
          </div>

          {/* Social proof — credibility at the decision point */}
          <div style={{ marginTop: "16px", padding: "14px 16px", borderRadius: "12px", background: theme === "dark" ? "#0D1F1208" : "#F0FDF408", border: `1px solid ${theme === "dark" ? "#34C75915" : "#bbf7d040"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: `${t.green}15`, border: `1.5px solid ${t.green}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6v6c0 5.5 3.4 10.3 8 12 4.6-1.7 8-6.5 8-12V6l-8-4z" stroke={t.green} strokeWidth="2" fill={`${t.green}15`}/><path d="M9 12l2 2 4-4" stroke={t.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: t.text }}>Built by a Certified Safety Professional</div>
                <div style={{ fontSize: "9px", color: t.textSecondary }}>13+ years of EHS experience across federal, healthcare, and industrial settings</div>
              </div>
            </div>
            <div id="rl-testimonial-slot" style={{ fontSize: "11px", color: t.textSecondary, fontStyle: "italic", lineHeight: 1.5, paddingLeft: "42px" }}>
              "Every review is scored by a transparent, deterministic engine — the same inputs always produce the same score."
            </div>
          </div>
        </div>
      )}
      {tab === "upload" && selectedType && (
        <div style={{ padding: "0 16px" }}>
          <button onClick={() => { setSelectedType(null); setSelectedIndustry(null); setConsentChecked(false); }} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "16px" }}>‹ Change Program</button>
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <div style={{ marginBottom: "8px" }}>{renderIcon(REVIEW_TEMPLATES[selectedType].icon, 48)}</div>
            <h2 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 4px" }}>{REVIEW_TEMPLATES[selectedType].label}</h2>
            <p style={{ fontSize: "14px", color: t.textSecondary, margin: 0 }}>{REVIEW_TEMPLATES[selectedType].desc}</p>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px", padding: "0 4px" }}>Select Your Industry</div>
            <div className="rl-grid-3">
              {Object.entries(INDUSTRIES).map(([key, ind]) => (
                <button key={key} onClick={() => setSelectedIndustry(key)} style={{ padding: "12px 8px", borderRadius: "12px", textAlign: "center", border: selectedIndustry === key ? `1.5px solid ${t.green}` : `1.5px solid ${t.border}`, background: selectedIndustry === key ? `${t.green}12` : t.card, cursor: "pointer" }}>
                  <div style={{ fontSize: "22px", marginBottom: "4px" }}>{ind.icon}</div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: selectedIndustry === key ? t.green : t.textSecondary, lineHeight: 1.3 }}>{ind.label}</div>
                </button>
              ))}
            </div>
          </div>

          {selectedIndustry && INDUSTRIES[selectedIndustry] && (
            <div style={{ padding: "12px 14px", borderRadius: "12px", marginBottom: "16px", background: "#34C75908", border: "1px solid #34C75920" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: t.green, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "6px" }}>
                {PROGRAM_SCOPE[selectedType] === "broad" ? "Industry Hazards We'll Check" : `${REVIEW_TEMPLATES[selectedType]?.label} Focus for ${INDUSTRIES[selectedIndustry].label}`}
              </div>
              <div style={{ fontSize: "12px", color: t.textSecondary, lineHeight: 1.6 }}>
                {PROGRAM_SCOPE[selectedType] === "broad" ? INDUSTRIES[selectedIndustry].hazards : PROGRAM_INDUSTRY_CONTEXT[selectedType]?.[selectedIndustry] || `Review will focus strictly on ${REVIEW_TEMPLATES[selectedType]?.label} requirements as they apply within the ${INDUSTRIES[selectedIndustry].label} industry.`}
              </div>
            </div>
          )}

          {selectedIndustry ? (
            <>
              {/* Disclaimer banner */}
              <div style={{ padding: "12px 14px", borderRadius: "12px", marginBottom: "12px", background: t.card, border: "1px solid #F59E0B30", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <span style={{ fontSize: "14px", flexShrink: 0, marginTop: "1px" }}>⚠️</span>
                <div style={{ fontSize: "10px", color: t.textSecondary, lineHeight: 1.6 }}>
                  <strong style={{ color: "#F59E0B" }}>Disclaimer:</strong> RegLens provides AI-assisted analysis to support your EHS compliance efforts. It does not guarantee regulatory compliance, does not constitute legal advice, and is not a substitute for consultation with a qualified safety or legal professional. Findings labeled "Best Practice" are advisory, not regulatory requirements.
                </div>
              </div>

              <div onClick={() => setConsentChecked(!consentChecked)} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "14px", borderRadius: "12px", marginBottom: "16px", background: consentChecked ? (theme === "dark" ? "#34C75908" : "#F0FDF4") : t.card, border: `1px solid ${consentChecked ? t.green : t.border}`, cursor: "pointer" }}>
                <div style={{ width: "20px", height: "20px", borderRadius: "4px", flexShrink: 0, marginTop: "1px", border: `2px solid ${consentChecked ? t.green : t.textTertiary}`, background: consentChecked ? t.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: theme === "dark" ? "#000" : "#fff", fontWeight: 700 }}>{consentChecked ? "✓" : ""}</div>
                <div style={{ fontSize: "11px", color: t.text, lineHeight: 1.5 }}>
                  I understand that this review is <span style={{ color: t.green, fontWeight: 600 }}>advisory only</span> and does not guarantee regulatory compliance or workplace safety.
                </div>
              </div>

              <div onClick={() => consentChecked && fileRef.current?.click()} style={{ ...card, border: `2px dashed ${t.border}`, textAlign: "center", padding: "36px 16px", cursor: consentChecked ? "pointer" : "not-allowed", opacity: consentChecked ? 1 : 0.4 }}
                onMouseOver={(e) => { if (consentChecked) { e.currentTarget.style.borderColor = t.green; e.currentTarget.style.background = theme === "dark" ? "#1A2A1E" : "#F0FDF4"; } }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = theme === "dark" ? "#333" : "#E5E7EB"; e.currentTarget.style.background = t.card; }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: "10px", opacity: 0.5 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke={t.textSecondary} strokeWidth="1.5"/><path d="M14 2v6h6" stroke={t.textSecondary} strokeWidth="1.5" strokeLinecap="round"/><path d="M12 12v6M9 15l3-3 3 3" stroke={t.textSecondary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "4px" }}>Tap to upload your document</div>
                <div style={{ fontSize: "13px", color: t.textSecondary }}>PDF, DOCX, or TXT · Max 10MB</div>
                <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" onChange={handleFile} style={{ display: "none" }} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "20px 0" }}>
                <div style={{ flex: 1, height: "1px", background: "#333" }} />
                <span style={{ fontSize: "12px", color: t.textTertiary, fontWeight: 500 }}>OR</span>
                <div style={{ flex: 1, height: "1px", background: "#333" }} />
              </div>

              {canRunReview() ? (
                <button className="rl-tap rl-glow" onClick={() => consentChecked && runReview(DEMO_DOCS[selectedType], selectedType)} disabled={!consentChecked} style={{ width: "100%", padding: "16px", borderRadius: "14px", border: "none", background: consentChecked ? t.green : t.inputBg, color: consentChecked ? (theme === "dark" ? "#000" : "#fff") : t.textTertiary, fontSize: "16px", fontWeight: 700, cursor: consentChecked ? "pointer" : "not-allowed" }}>
                  {consentChecked ? `Run Demo Compliance Review — ${INDUSTRIES[selectedIndustry].label}` : "Check the box above to continue"}
                </button>
              ) : (
                <div style={{ ...card, border: "1px solid #F59E0B25", textAlign: "center", padding: "20px 16px" }}>
                  <div style={{ fontSize: "24px", marginBottom: "8px" }}>📄</div>
                  <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>Free reviews used</div>
                  <div style={{ fontSize: "12px", color: t.textSecondary, lineHeight: 1.5, marginBottom: "14px" }}>
                    {!user ? "Create an account and purchase credits to keep reviewing your EHS programs." : "Purchase credits to continue reviewing EHS programs."}
                  </div>
                  <button className="rl-tap rl-glow" onClick={() => !user ? setAuthScreen("signup") : setShowPricing(true)} style={{ width: "100%", padding: "13px", borderRadius: "12px", border: "none", background: t.green, color: theme === "dark" ? "#000" : "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>
                    {!user ? "Create Free Account" : "View Plans"}
                  </button>
                  {!user && (
                    <button onClick={() => setShowPricing(true)} style={{ width: "100%", padding: "10px", marginTop: "8px", borderRadius: "12px", border: `1px solid ${t.border}`, background: "transparent", color: t.textSecondary, fontSize: "12px", cursor: "pointer" }}>
                      Already have an account? View Plans
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: "24px 16px", textAlign: "center" }}>
              <div style={{ fontSize: "14px", color: t.textTertiary }}>Select your industry above to continue</div>
            </div>
          )}
        </div>
      )}

      {/* ══════ VALIDATION ERROR ══════ */}
      {tab === "validation-error" && validation && (
        <div style={{ padding: "40px 20px" }}>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <div style={{ width: "80px", height: "80px", borderRadius: "50%", margin: "0 auto 16px", background: theme === "dark" ? "#2A1215" : "#FEF2F2", border: "2px solid #EF444440", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "36px" }}>⚠️</div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px", color: "#EF4444" }}>Document Mismatch</h2>
            <p style={{ fontSize: "14px", color: t.textSecondary, margin: 0, lineHeight: 1.5 }}>This doesn't appear to be a <span style={{ color: t.text, fontWeight: 600 }}>{REVIEW_TEMPLATES[validation.type]?.label}</span></p>
          </div>
          <div style={{ background: t.card, borderRadius: "16px", padding: "20px", border: `1px solid ${t.border}`, marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <span style={{ fontSize: "12px", color: t.textSecondary, fontWeight: 500, textTransform: "uppercase" }}>Validation Result</span>
              <div style={{ padding: "4px 10px", borderRadius: "12px", background: "#2A1215", border: `1px solid ${theme === "dark" ? "#EF444430" : "#FECACA"}`, fontSize: "12px", fontWeight: 700, color: "#EF4444" }}>{validation.confidence}% match</div>
            </div>
            <div style={{ fontSize: "14px", color: t.textSecondary, lineHeight: 1.6, marginBottom: "14px" }}>{validation.explanation}</div>
            {validation.suggestedType && validation.suggestedType !== "Not an EHS document" && (
              <div style={{ padding: "12px", borderRadius: "10px", background: "#34C75910", border: "1px solid #34C75925" }}>
                <div style={{ fontSize: "11px", color: t.textSecondary, fontWeight: 500, marginBottom: "4px", textTransform: "uppercase" }}>This looks like</div>
                <div style={{ fontSize: "15px", fontWeight: 600, color: t.green }}>{validation.suggestedType}</div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {validation.suggestedType && validation.suggestedType !== "Not an EHS document" && (() => {
              const matchedKey = Object.entries(REVIEW_TEMPLATES).find(([, v]) => v.label.toLowerCase().includes(validation.suggestedType.toLowerCase().split(" ")[0]));
              return matchedKey ? (
                <button onClick={() => { setSelectedType(matchedKey[0]); setValidation(null); runReview(validation.text, matchedKey[0]); }} style={{ width: "100%", padding: "16px", borderRadius: "14px", border: "none", background: t.green, color: theme === "dark" ? "#000" : "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>
                  Review as {matchedKey[1].label} instead
                </button>
              ) : null;
            })()}
            <button onClick={() => { setValidation(null); runReview(validation.text, validation.type); }} style={{ width: "100%", padding: "16px", borderRadius: "14px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "15px", fontWeight: 600, cursor: "pointer" }}>
              Review anyway as {REVIEW_TEMPLATES[validation.type]?.label}
            </button>
            <button onClick={() => { setValidation(null); setTab("upload"); }} style={{ width: "100%", padding: "16px", borderRadius: "14px", background: "transparent", border: `1px solid ${t.border}`, color: t.textSecondary, fontSize: "15px", fontWeight: 500, cursor: "pointer" }}>
              Upload a different document
            </button>
          </div>
        </div>
      )}

      {/* ══════ PROCESSING ══════ */}
      {tab === "review" && processing && (
        <div style={{ padding: "20px 24px", textAlign: "center" }}>
          <div style={{ position: "relative", width: "100px", height: "100px", margin: "0 auto 28px" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `3px solid ${t.border}` }} />
            <div style={{ position: "absolute", inset: "4px", borderRadius: "50%", border: `2px solid ${t.green}40`, animation: "spin 2s linear infinite" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px" }}>{selectedType && REVIEW_TEMPLATES[selectedType] ? renderIcon(REVIEW_TEMPLATES[selectedType].icon, 32) : "📄"}</div>
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px", color: t.text }}>Analyzing Your Program</h2>
          <p style={{ fontSize: "12px", color: t.textTertiary, marginBottom: "28px" }}>AI is reviewing your document against federal regulations</p>
          <div style={{ textAlign: "left", maxWidth: "280px", margin: "0 auto" }}>
            {stages.map((s, i) => {
              const isComplete = i < procStage;
              const isCurrent = i === procStage;
              const isPending = i > procStage;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", opacity: isPending ? 0.25 : 1, transition: "opacity 0.5s ease", animation: isCurrent ? "rlPulse 1.5s ease-in-out infinite" : "none" }}>
                  <div style={{ width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0, background: isComplete ? t.green : isCurrent ? `${t.green}25` : t.inputBg, border: `2px solid ${isComplete || isCurrent ? t.green : t.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: isComplete ? (theme === "dark" ? "#000" : "#fff") : t.green, fontWeight: 700, transition: "all 0.4s ease" }}>
                    {isComplete ? "✓" : ""}
                  </div>
                  <span style={{ fontSize: "13px", color: isCurrent ? t.text : t.textSecondary, fontWeight: isCurrent ? 600 : 400, transition: "color 0.3s ease" }}>{s}</span>
                </div>
              );
            })}
          </div>
          {/* Skeleton preview */}
          <div style={{ marginTop: "28px", maxWidth: "280px", marginLeft: "auto", marginRight: "auto" }}>
            <div className="rl-shimmer" style={{ height: "14px", width: "60%", marginBottom: "10px" }} />
            <div className="rl-shimmer" style={{ height: "10px", width: "90%", marginBottom: "6px" }} />
            <div className="rl-shimmer" style={{ height: "10px", width: "75%", marginBottom: "6px" }} />
            <div className="rl-shimmer" style={{ height: "10px", width: "85%", marginBottom: "16px" }} />
            <div className="rl-shimmer" style={{ height: "60px", width: "100%", borderRadius: "12px", marginBottom: "8px" }} />
            <div className="rl-shimmer" style={{ height: "60px", width: "100%", borderRadius: "12px" }} />
          </div>
        </div>
      )}

      {/* ══════ REPORT ══════ */}
      {tab === "report" && result && !processing && (
        <div style={{ padding: "0 16px" }}>
          <button onClick={() => { setTab("dashboard"); setResult(null); setScoreResult(null); setViewingSub(null); setExpandedFinding(null); setValidation(null); setParseWarnings([]); }} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "16px" }}>‹ Dashboard</button>

          {result._source === "error" && (
            <div style={{ padding: "12px 14px", borderRadius: "12px", marginBottom: "12px", background: "#2A1215", border: `1px solid ${theme === "dark" ? "#EF444430" : "#FECACA"}`, display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <span style={{ fontSize: "16px", flexShrink: 0 }}>⚠️</span>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#EF4444", marginBottom: "2px" }}>Review could not be completed</div>
                <div style={{ fontSize: "11px", color: t.textSecondary, lineHeight: 1.5 }}>{result._error}</div>
              </div>
            </div>
          )}

          {result._source === "fallback" && (
            <div style={{ padding: "12px 14px", borderRadius: "12px", marginBottom: "12px", background: theme === "dark" ? "#2A2010" : "#FFFBEB", border: theme === "dark" ? "1px solid #F59E0B30" : "1px solid #FDE68A" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px" }}>
                <span style={{ fontSize: "16px", flexShrink: 0 }}>⚠️</span>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#F59E0B", marginBottom: "2px" }}>Demo results — live AI unavailable</div>
                  <div style={{ fontSize: "11px", color: t.textSecondary, lineHeight: 1.5 }}>This report shows sample findings for this program type — not an analysis of your specific document.</div>
                </div>
              </div>
              {result._queued && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "8px", background: "#3B82F610", border: "1px solid #3B82F620" }}>
                  <span style={{ fontSize: "12px" }}>📋</span>
                  <div style={{ flex: 1, fontSize: "11px", color: "#60A5FA" }}>Your review has been queued and will run when the AI service recovers.</div>
                  <button className="rl-tap" onClick={async () => {
                    const queue = getReviewQueue();
                    if (queue.length > 0) {
                      const latest = queue[queue.length - 1];
                      setSelectedType(latest.type);
                      if (latest.industry) setSelectedIndustry(latest.industry);
                      removeFromReviewQueue(latest.queuedAt);
                      runReview(latest.text, latest.type);
                    }
                  }} style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #3B82F6", background: "transparent", color: "#3B82F6", fontSize: "11px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>Retry Now</button>
                </div>
              )}
            </div>
          )}

          {/* Disclaimer on report */}
          <div style={{ padding: "10px 14px", borderRadius: "10px", marginBottom: "12px", background: t.card, border: "1px solid #F59E0B20", display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <span style={{ fontSize: "12px", flexShrink: 0, marginTop: "1px" }}>⚠️</span>
            <div style={{ fontSize: "9px", color: t.textSecondary, lineHeight: 1.5 }}>
              <strong style={{ color: "#F59E0B" }}>Disclaimer:</strong> This review is advisory only. Findings labeled "Best Practice" are not regulatory requirements. No critical gaps identified does not mean the document is compliant.
            </div>
          </div>

          {/* Score card with deterministic scoring */}
          <div style={{ ...card, textAlign: "center", background: t.scoreBg }}>
            <div style={{ fontSize: "12px", color: t.textSecondary, fontWeight: 500, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px" }}>Compliance Score</div>
            <ScoreRing score={result.score} band={scoreResult?.band} size={120} />

            {/* First-time tooltip */}
            {!hasSeen("tip_score") && (
              <div style={{ margin: "8px auto 0", padding: "8px 12px", borderRadius: "8px", background: theme === "dark" ? "#101C2E" : "#EFF6FF", border: `1px solid ${theme === "dark" ? "#3B82F625" : "#BFDBFE"}`, maxWidth: "280px", textAlign: "center" }} className="rl-fade-in">
                <div style={{ fontSize: "10px", color: "#60A5FA", lineHeight: 1.5 }}>This score is calculated by a <strong>deterministic rules engine</strong> — not AI. Same findings always produce the same score. Tap "Score Breakdown" below to see every deduction.</div>
                <button onClick={() => markSeen("tip_score")} style={{ background: "none", border: "none", color: "#3B82F6", fontSize: "10px", fontWeight: 600, cursor: "pointer", marginTop: "4px" }}>Got it</button>
              </div>
            )}
            <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "10px", marginBottom: "4px" }}>{result.documentType}</div>
            {(viewingSub?.industryLabel || (selectedIndustry && INDUSTRIES[selectedIndustry])) && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "12px", marginBottom: "8px", background: "#34C75910", border: "1px solid #34C75920", fontSize: "11px", fontWeight: 600, color: t.green }}>
                {INDUSTRIES[viewingSub?.industry || selectedIndustry]?.icon} {viewingSub?.industryLabel || INDUSTRIES[selectedIndustry]?.label}
              </div>
            )}
            <div style={{ fontSize: "13px", color: t.textSecondary, lineHeight: 1.5, padding: "0 8px" }}>{result.summary}</div>

            {/* Scoring breakdown */}
            {scoreResult && scoreResult.deductions.total > 0 && (
              <div style={{ marginTop: "12px", padding: "10px", borderRadius: "10px", background: t.inputBg, textAlign: "left" }}>
                <div style={{ fontSize: "10px", color: t.textTertiary, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Score Breakdown</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: t.textSecondary, padding: "2px 0" }}>
                  <span>Starting score</span><span style={{ color: t.text }}>100</span>
                </div>
                {scoreResult.deductions.critical > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#EF4444", padding: "2px 0" }}><span>Critical deductions</span><span>-{scoreResult.deductions.critical}</span></div>}
                {scoreResult.deductions.major > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#F59E0B", padding: "2px 0" }}><span>Major deductions</span><span>-{scoreResult.deductions.major}</span></div>}
                {scoreResult.deductions.minor > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#3B82F6", padding: "2px 0" }}><span>Minor deductions</span><span>-{scoreResult.deductions.minor}</span></div>}
                {scoreResult.caps_applied.length > 0 && scoreResult.caps_applied.map((cap, i) => (
                  <div key={i} style={{ fontSize: "10px", color: "#F59E0B", padding: "2px 0", fontStyle: "italic" }}>↳ {cap}</div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700, color: RegLensScoring.getBandColor(scoreResult.band), padding: "4px 0 0", borderTop: "1px solid #222", marginTop: "4px" }}>
                  <span>Final score</span><span>{result.score} ({scoreResult.band})</span>
                </div>
              </div>
            )}
          </div>

          {/* Severity counts */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            {["Critical", "Major", "Minor"].map((sev) => {
              const count = (result.findings || []).filter((f) => f.severity === sev).length;
              return (
                <div key={sev} style={{ flex: 1, ...cardFlat, textAlign: "center", background: sevBg[sev], border: `1px solid ${sevColor[sev]}25` }}>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: sevColor[sev] }}>{count}</div>
                  <div style={{ fontSize: "11px", color: sevColor[sev], opacity: 0.8, fontWeight: 500 }}>{sev}</div>
                </div>
              );
            })}
          </div>

          {/* ── Expert Consultation CTA — shown on all review results ── */}
          {result._source !== "error" && (() => {
            const isUrgent = result.score < 70;
            const critCount = (result.findings || []).filter(f => f.severity === "Critical").length;
            const majorCount = (result.findings || []).filter(f => f.severity === "Major").length;
            return (
            <div style={{
              ...card,
              background: isUrgent
                ? (theme === "dark" ? "linear-gradient(135deg, #1a0a0a, #2A1215)" : "linear-gradient(135deg, #FEF2F2, #FFF1F2)")
                : (theme === "dark" ? "linear-gradient(135deg, #0a1a14, #122A1E)" : "linear-gradient(135deg, #F0FDF4, #ECFDF5)"),
              border: isUrgent ? "1px solid #EF444435" : `1px solid ${t.green}25`,
              padding: "20px",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: "-30px", right: "-30px", width: "100px", height: "100px", borderRadius: "50%", background: isUrgent ? "radial-gradient(circle, #EF444415, transparent)" : `radial-gradient(circle, ${t.green}15, transparent)`, pointerEvents: "none" }} />

              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", position: "relative", zIndex: 1 }}>
                <div style={{
                  width: "48px", height: "48px", borderRadius: "14px",
                  background: isUrgent ? "linear-gradient(135deg, #EF444420, #F59E0B15)" : `linear-gradient(135deg, ${t.green}20, #3B82F615)`,
                  border: `1px solid ${isUrgent ? (theme === "dark" ? "#EF444430" : "#FECACA") : t.green + "30"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "22px", flexShrink: 0,
                }}>{isUrgent ? "🛡️" : "💬"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: t.text, marginBottom: "4px" }}>
                    {isUrgent ? "This document needs attention" : "Need help with these findings?"}
                  </div>
                  <div style={{ fontSize: "13px", color: t.textSecondary, lineHeight: 1.5, marginBottom: "4px" }}>
                    {isUrgent
                      ? <>Your score of <span style={{ color: "#EF4444", fontWeight: 700 }}>{result.score}</span> indicates {result.score < 60 ? " significant compliance risk. " : " gaps that could surface in an audit. "}An EHS expert can help you build a prioritized remediation plan.</>
                      : <>A CSP-certified expert can walk you through your {critCount + majorCount > 0 ? `${critCount + majorCount} findings` : "results"} and help you build a remediation roadmap.</>
                    }
                  </div>
                  {(critCount + majorCount) > 0 && (
                    <div style={{ fontSize: "11px", color: t.textSecondary, marginBottom: "14px" }}>
                      {critCount} critical + {majorCount} major findings
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setShowBooking(true)}
                style={{
                  width: "100%", padding: "14px", borderRadius: "12px",
                  border: "none", cursor: "pointer",
                  background: isUrgent ? "linear-gradient(135deg, #EF4444, #DC2626)" : `linear-gradient(135deg, ${t.green}, #15803d)`,
                  color: "#fff", fontSize: "15px", fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  position: "relative", zIndex: 1,
                }}
              >
                <span>📅</span> Book an Expert Consultation
              </button>
              <div style={{ textAlign: "center", marginTop: "8px", fontSize: "11px", color: t.textSecondary, position: "relative", zIndex: 1 }}>
                30-min sessions from $149 · Expert EHS consultation
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "10px", position: "relative", zIndex: 1 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6v6c0 5.5 3.4 10.3 8 12 4.6-1.7 8-6.5 8-12V6l-8-4z" stroke={t.green} strokeWidth="2" fill={`${t.green}15`}/><path d="M9 12l2 2 4-4" stroke={t.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span style={{ fontSize: "9px", color: t.textSecondary }}>CSP-certified · 13+ years federal & private sector EHS experience</span>
              </div>
            </div>
            );
          })()}

          {/* Findings */}
          <div style={{ padding: "0 4px", marginBottom: "8px", marginTop: "16px" }}><span style={{ fontSize: "22px", fontWeight: 700 }}>Findings</span></div>

          {/* First-time findings tooltip */}
          {!hasSeen("tip_findings") && (result.findings || []).length > 0 && (
            <div style={{ padding: "10px 12px", borderRadius: "10px", marginBottom: "10px", background: theme === "dark" ? "#101C2E" : "#EFF6FF", border: `1px solid ${theme === "dark" ? "#3B82F625" : "#BFDBFE"}`, display: "flex", alignItems: "flex-start", gap: "8px" }} className="rl-fade-in">
              <span style={{ fontSize: "14px", flexShrink: 0 }}>💡</span>
              <div>
                <div style={{ fontSize: "10px", color: "#60A5FA", lineHeight: 1.5 }}>
                  <strong>Tap any finding</strong> to expand it and see the full regulation, recommendation, and citation verification status. Findings marked <strong style={{ color: "#EF4444" }}>Regulatory</strong> are based on specific legal requirements. <strong style={{ color: "#3B82F6" }}>Best Practice</strong> items are professional recommendations.
                </div>
                <button onClick={() => markSeen("tip_findings")} style={{ background: "none", border: "none", color: "#3B82F6", fontSize: "10px", fontWeight: 600, cursor: "pointer", marginTop: "4px", padding: 0 }}>Got it</button>
              </div>
            </div>
          )}
          {(result.findings || []).length > 0 ? (
            (result.findings || []).map((f, i) => (
              <FindingCard key={i} finding={f} index={i} expanded={expandedFinding === i} onToggle={() => setExpandedFinding(expandedFinding === i ? null : i)} />
            ))
          ) : (
            <div style={{ ...card, textAlign: "center", padding: "24px 16px", background: theme === "dark" ? "#0D1F12" : "#F0FDF4", border: `1px solid ${theme === "dark" ? "#34C75920" : "#bbf7d0"}` }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>✓</div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: t.green }}>No critical gaps were identified</div>
              <div style={{ fontSize: "12px", color: t.textSecondary, marginTop: "4px" }}>This does not guarantee full regulatory compliance.</div>
            </div>
          )}

          {/* Strengths */}
          {(result.strengths || []).length > 0 && (
            <>
              <div style={{ padding: "0 4px", marginBottom: "8px", marginTop: "16px" }}><span style={{ fontSize: "22px", fontWeight: 700 }}>Strengths</span></div>
              <div style={{ ...card, background: theme === "dark" ? "#0D1F12" : "#F0FDF4", border: `1px solid ${theme === "dark" ? "#34C75920" : "#bbf7d0"}` }}>
                {result.strengths.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: "8px", padding: "8px 0", fontSize: "13px", color: t.green, lineHeight: 1.5, borderBottom: i < result.strengths.length - 1 ? `1px solid ${t.border}` : "none" }}>
                    <span>✓</span><span>{s}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Reviewed by */}
          <div style={{ ...card, textAlign: "center", background: t.scoreBg, border: `1px solid ${t.border}`, marginTop: "8px" }}>
            <svg width="40" height="40" viewBox="0 0 120 120" style={{ margin: "0 auto 8px", display: "block" }}>
              <circle cx="52" cy="52" r="34" fill="#34C759" opacity="0.08"/>
              <circle cx="52" cy="52" r="34" fill="none" stroke="#34C759" strokeWidth="3"/>
              <line x1="36" y1="40" x2="62" y2="40" stroke={theme === "dark" ? "#fff" : "#374151"} strokeWidth="2.5" strokeLinecap="round" opacity={theme === "dark" ? 0.6 : 0.5}/>
              <line x1="36" y1="50" x2="68" y2="50" stroke={theme === "dark" ? "#fff" : "#374151"} strokeWidth="2.5" strokeLinecap="round" opacity={theme === "dark" ? 0.45 : 0.35}/>
              <line x1="36" y1="60" x2="56" y2="60" stroke={theme === "dark" ? "#fff" : "#374151"} strokeWidth="2.5" strokeLinecap="round" opacity={theme === "dark" ? 0.3 : 0.25}/>
              <polyline points="64,48 67,52 74,42" fill="none" stroke="#34C759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="76" y1="76" x2="106" y2="106" stroke="#34C759" strokeWidth="5" strokeLinecap="round"/>
            </svg>
            <div style={{ fontSize: "11px", color: t.textSecondary, fontWeight: 500, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "4px" }}>Reviewed By</div>
            <div style={{ fontSize: "16px", fontWeight: 700 }}>Prudence EHS</div>
            <div style={{ fontSize: "12px", color: t.textSecondary, marginTop: "2px" }}>RegLens by Prudence EHS</div>
            <div style={{ fontSize: "12px", color: viewingSub?.status === "approved" ? "#34C759" : "#F59E0B", marginTop: "8px", fontWeight: 600 }}>
              {viewingSub?.status === "approved" ? "✓ Expert Reviewed & Approved" : "⏳ Pending Expert Review"}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button onClick={() => { setTab("dashboard"); setResult(null); setScoreResult(null); setExpandedFinding(null); }} style={{ flex: 1, padding: "15px", borderRadius: "14px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "15px", fontWeight: 600, cursor: "pointer" }}>Start New Review</button>
            <button onClick={() => generateReviewPDF(result, scoreResult, viewingSub?.industryLabel || INDUSTRIES[selectedIndustry]?.label)} style={{ flex: 1, padding: "15px", borderRadius: "14px", background: t.green, border: "none", color: theme === "dark" ? "#000" : "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>Download Report</button>
            <button className="rl-tap" onClick={() => setEmailModal({ type: "review", data: { programType: result?.documentType || REVIEW_TEMPLATES[selectedType]?.label, industry: INDUSTRIES[selectedIndustry]?.label, score: scoreResult?.score, band: scoreResult?.band, findingsCount: (result?.findings || []).length, summary: result?.summary } })} style={{ padding: "15px", borderRadius: "14px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "15px", cursor: "pointer" }}>✉️</button>
          </div>
        </div>
      )}

      {/* Documents tab removed — content folded into dashboard Recent Activity */}

      {/* Admin tab removed — content folded into Tools tab */}

      {/* Analytics tab removed — metrics folded into dashboard */}

      {/* ══════ TOOLS ══════ */}
      {tab === "tools" && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ padding: "0 4px", marginBottom: "16px" }}><span style={{ fontSize: "28px", fontWeight: 700, color: t.text }}>Tools</span></div>

          {/* ── Field Tools Grid ── */}
          <div style={{ fontSize: "11px", fontWeight: 600, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px", padding: "0 4px" }}>Field Tools</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
            <button className="rl-tap rl-card-interactive" onClick={() => setTab("citation")} style={{ padding: "16px 14px", borderRadius: "14px", background: theme === "dark" ? "linear-gradient(145deg, #2A1215, #1C1C1E)" : "linear-gradient(145deg, #FEF2F2, #FFFFFF)", border: `1px solid ${theme === "dark" ? "#EF444430" : "#FECACA"}`, cursor: "pointer", textAlign: "left" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginBottom: "8px" }}>
                <path d="M12 2L4 6v6c0 5.5 3.4 10.3 8 12 4.6-1.7 8-6.5 8-12V6l-8-4z" stroke="#EF4444" strokeWidth="1.5" fill="#EF444410"/>
                <path d="M9 12l2 2 4-4" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ fontSize: "13px", fontWeight: 700, color: t.text, marginBottom: "2px" }}>Citation Response</div>
              <div style={{ fontSize: "9px", color: t.textSecondary }}>OSHA/EPA abatement plan</div>
              <div style={{ marginTop: "6px", padding: "2px 6px", borderRadius: "4px", background: "#EF444415", border: "1px solid #EF444425", fontSize: "9px", fontWeight: 700, color: "#EF4444", display: "inline-block" }}>$149</div>
            </button>
            <button className="rl-tap" onClick={() => setTab("risk")} style={{ padding: "16px 14px", borderRadius: "14px", background: t.card, border: `1px solid ${t.border}`, cursor: "pointer", textAlign: "left" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginBottom: "8px" }}>
                <path d="M12 2L2 22h20L12 2z" stroke="#F59E0B" strokeWidth="1.5" fill="#F59E0B10"/>
                <path d="M12 10v4M12 17h.01" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <div style={{ fontSize: "13px", fontWeight: 700, color: t.text, marginBottom: "2px" }}>Job Hazard Analysis</div>
              <div style={{ fontSize: "9px", color: t.textSecondary }}>5x5 risk matrix</div>
              <div style={{ marginTop: "6px", padding: "2px 6px", borderRadius: "4px", background: `${t.green}10`, border: `1px solid ${t.green}20`, fontSize: "9px", fontWeight: 600, color: t.green, display: "inline-block" }}>Free</div>
            </button>
            <button className="rl-tap" onClick={() => { setIncidentDraft({ id: `IR-${Date.now().toString(36).toUpperCase().slice(-6)}`, date: new Date().toISOString().split("T")[0], time: "", location: "", department: "", employeeName: "", jobTitle: "", severity: "First Aid", injuryType: "", bodyPart: "", description: "", activity: "", witnesses: "", whys: ["", "", "", "", ""], immediateActions: "", preventiveActions: "", oshaRecordable: false }); setTab("incident"); }} style={{ padding: "16px 14px", borderRadius: "14px", background: t.card, border: `1px solid ${t.border}`, cursor: "pointer", textAlign: "left" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginBottom: "8px" }}>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#ea580c" strokeWidth="1.5" fill="#ea580c08"/>
                <path d="M14 2v6h6" stroke="#ea580c" strokeWidth="1.5" strokeLinecap="round"/><path d="M9 15h6M9 18h4" stroke="#ea580c" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
              </svg>
              <div style={{ fontSize: "13px", fontWeight: 700, color: t.text, marginBottom: "2px" }}>Incident Report</div>
              <div style={{ fontSize: "9px", color: t.textSecondary }}>OSHA 301-aligned</div>
              {incidentReports.length > 0 && <div style={{ fontSize: "8px", color: t.textTertiary, marginTop: "4px" }}>{incidentReports.length} filed</div>}
            </button>
            <button className="rl-tap" onClick={() => { setMeetingDraft({ date: new Date().toISOString().split("T")[0], topic: "", presenter: "", location: "", duration: "", points: "", attendees: [], actionItems: [] }); setTab("meeting"); }} style={{ padding: "16px 14px", borderRadius: "14px", background: t.card, border: `1px solid ${t.border}`, cursor: "pointer", textAlign: "left" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginBottom: "8px" }}>
                <circle cx="9" cy="7" r="3" stroke="#0EA5E9" strokeWidth="1.5" fill="#0EA5E910"/>
                <circle cx="16" cy="9" r="2.5" stroke="#0EA5E9" strokeWidth="1.2" opacity="0.5"/>
                <path d="M2 21v-1a5 5 0 015-5h4a5 5 0 015 5v1" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <div style={{ fontSize: "13px", fontWeight: 700, color: t.text, marginBottom: "2px" }}>Meeting Log</div>
              <div style={{ fontSize: "9px", color: t.textSecondary }}>Toolbox talks</div>
              {meetingLogs.length > 0 && <div style={{ fontSize: "8px", color: t.textTertiary, marginTop: "4px" }}>{meetingLogs.length} logged</div>}
            </button>
          </div>

          {/* ── Account ── */}
          {user ? (
            <div style={{ ...card, display: "flex", alignItems: "center", gap: "14px", border: `1px solid ${t.border}` }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#34C75920", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: 700, color: t.green }}>
                {(user.full_name || user.email || "U").charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "17px", fontWeight: 700 }}>{user.full_name || "Account"}</div>
                <div style={{ fontSize: "12px", color: t.textSecondary }}>{user.email}</div>
                <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                  <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "6px", background: "#3B82F615", color: "#60A5FA", border: "1px solid #3B82F620" }}>{user.review_credits || 0} review credits</span>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => setAuthScreen("login")} style={{ ...card, display: "flex", alignItems: "center", gap: "14px", border: `1px solid ${theme === "dark" ? "#34C75930" : "#bbf7d0"}`, width: "100%", cursor: "pointer", background: "#34C75908" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: t.card, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", color: t.textSecondary }}>👤</div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: "16px", fontWeight: 700, color: t.green }}>Sign in</div>
                <div style={{ fontSize: "12px", color: t.textSecondary }}>Save your reviews and purchase credits</div>
              </div>
            </button>
          )}

          {/* ── Settings ── */}
          <div style={{ fontSize: "11px", fontWeight: 600, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginTop: "20px", marginBottom: "10px", padding: "0 4px" }}>Settings</div>
          {[
            { icon: "📖", label: "How to Use RegLens", action: () => setTab("guide") },
            { icon: "👀", label: "Take a Tour", action: () => startTour() },
            { icon: theme === "dark" ? "☀️" : "🌙", label: theme === "dark" ? "Light Mode" : "Dark Mode", action: toggleTheme },
            { icon: "💳", label: "Buy Review Credits", action: () => setShowPricing(true) },
            { icon: "📅", label: "Book Expert Consultation", action: () => setShowBooking(true) },
          ].map((item, i) => (
            <div key={i} className="rl-card-interactive" onClick={item.action} style={{ ...cardFlat, display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${t.border}`, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "18px" }}>{item.icon}</span>
                <span style={{ fontSize: "15px", fontWeight: 500, color: t.text }}>{item.label}</span>
              </div>
              <span style={{ color: t.textTertiary, fontSize: "16px" }}>›</span>
            </div>
          ))}

          {/* ── Admin (conditional) ── */}
          {adminMode && (
            <>
              <div style={{ fontSize: "11px", fontWeight: 600, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginTop: "20px", marginBottom: "10px", padding: "0 4px" }}>Admin Queue</div>
              {submissions.filter(s => s.status !== "approved").length === 0 ? (
                <div style={{ ...card, textAlign: "center", padding: "24px 16px", border: `1px solid ${t.border}` }}>
                  <div style={{ fontSize: "13px", color: t.textSecondary }}>No pending reviews</div>
                </div>
              ) : submissions.filter(s => s.status !== "approved").map((sub) => (
                <div key={sub.id} style={{ ...card, border: `1px solid ${t.border}`, marginBottom: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 600 }}>{sub.label}</div>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: RegLensScoring.getBandColor(sub.band) }}>{sub.score}</div>
                  </div>
                  <div style={{ fontSize: "11px", color: t.textSecondary, marginBottom: "8px" }}>{sub.industryLabel} · {sub.date} · {sub.id}</div>
                  <button onClick={() => { setResult(sub.result); setScoreResult(sub.scoreResult); setViewingSub(sub); setTab("report"); }} style={{ padding: "8px 14px", borderRadius: "8px", border: `1px solid ${t.border}`, background: "transparent", color: t.textSecondary, fontSize: "12px", cursor: "pointer", marginRight: "8px" }}>View Report</button>
                  <button onClick={() => setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, status: "approved" } : s))} style={{ padding: "8px 14px", borderRadius: "8px", border: "none", background: t.green, color: theme === "dark" ? "#000" : "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Approve</button>
                </div>
              ))}
            </>
          )}

          {/* ── Footer ── */}
          <div style={{ marginTop: "20px" }}>
            {[
              ...(adminMode ? [{ icon: "🔓", label: "Deactivate Admin Mode", action: deactivateAdmin }] : [{ icon: "🔐", label: "Admin Mode", action: activateAdmin }]),
              { icon: "📄", label: "Terms of Service", action: () => setTab("tos") },
              { icon: "📧", label: "Support" },
              { icon: "🔒", label: "Privacy Policy", action: () => setTab("privacy") },
              ...(user ? [{ icon: "🚪", label: "Sign Out", action: () => { supabase.signOut(); setUser(null); setTab("dashboard"); }, danger: true }] : []),
            ].map((item, i) => (
              <div key={i} className="rl-card-interactive" onClick={item.action || undefined} style={{ ...cardFlat, display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${t.border}`, cursor: item.action ? "pointer" : "default" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "18px" }}>{item.icon}</span>
                  <span style={{ fontSize: "15px", fontWeight: 500, color: item.danger ? "#EF4444" : t.text }}>{item.label}</span>
                </div>
                <span style={{ color: t.textTertiary, fontSize: "16px" }}>›</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: "20px", paddingBottom: "20px" }}>
            <div style={{ fontSize: "12px", color: t.textTertiary, cursor: "default" }} onClick={() => {
              const next = adminTaps + 1;
              setAdminTaps(next);
              if (next >= 5 && !adminMode) { activateAdmin(); setAdminTaps(0); }
              setTimeout(() => setAdminTaps(0), 3000);
            }}>RegLens v2.0</div>
            <div style={{ fontSize: "11px", color: t.textTertiary, marginTop: "2px" }}>© 2026 Prudence EHS · Germantown, MD</div>
          </div>
        </div>
      )}

      {/* ══════ HOW TO USE GUIDE ══════ */}
      {tab === "guide" && (() => {
        const guideSteps = [
          {
            section: "Welcome to RegLens",
            icon: "👋",
            color: "#34C759",
            intro: "RegLens helps you understand how your safety programs and facility practices measure up against federal EHS regulations. Here's how to get the most out of it.",
            steps: [],
          },
          {
            section: "Compliance Review",
            icon: "📄",
            color: "#3B82F6",
            intro: "Upload a written EHS program and get an AI-powered analysis of compliance gaps.",
            steps: [
              { title: "Choose your program type", desc: "Select the type of program you're submitting — for example, Respiratory Protection, Lockout/Tagout, or Emergency Action Plan." },
              { title: "Select your industry", desc: "This helps the review focus on hazards and regulations specific to your operations." },
              { title: "Upload your document", desc: "Upload a .TXT, .PDF, or .DOCX file of your written program. Or tap 'Run Demo' to see how a sample review looks." },
              { title: "Read your report", desc: "You'll receive a compliance score, a list of findings ranked by severity (Critical, Major, Minor), and specific recommendations for each gap. Every finding includes the regulation it's based on." },
              { title: "Understand the score", desc: "Scores range from 0–100. Tap the score card to see exactly how it was calculated. Higher severity findings have a bigger impact on your score." },
            ],
          },
          {
            section: "EHS Readiness Check",
            icon: "📝",
            color: "#F59E0B",
            intro: "Walk through a guided checklist to assess your facility's EHS compliance — no document upload needed.",
            steps: [
              { title: "Select your industry", desc: "The checklist adapts to your industry. You'll get universal EHS items that apply to every workplace, plus sections specific to your industry's hazards." },
              { title: "Answer each item", desc: "For each checklist item, select Yes (in place), Partial (partially in place), No (not in place), or N/A (doesn't apply to your facility)." },
              { title: "Use quick-fill if needed", desc: "At the top of each section, you can mark all items at once — then go back and adjust individual answers." },
              { title: "Add photos", desc: "Tap the 📷 icon on any item to photograph the condition at your facility. Photos are included in your exported report." },
              { title: "View your Readiness Score", desc: "After completing all sections, you'll see a score based on your responses, along with a list of every gap identified." },
              { title: "Export your report", desc: "Tap 'Export Report' to download a complete report with your score, all responses, gaps, and photos. You can print it or save it as a PDF from your browser." },
            ],
          },
          {
            section: "Expert Consultation",
            icon: "📅",
            color: "#EF4444",
            intro: "If your score falls below 70, you'll see an option to book a consultation with an EHS expert.",
            steps: [
              { title: "When you'll see it", desc: "A consultation option appears automatically in your report when the score indicates significant compliance gaps." },
              { title: "Choose a consultation type", desc: "Options range from a 30-minute findings walkthrough to a 90-minute program rewrite session. Pick the level of support that fits your needs." },
              { title: "Book anytime", desc: "You can also book a consultation anytime from the Menu — you don't need a low score to reach out." },
            ],
          },
          {
            section: "Understanding Your Results",
            icon: "📊",
            color: "#8B5CF6",
            intro: "Here's what the labels in your reports mean.",
            steps: [
              { title: "Critical findings", desc: "Missing required elements or conditions that pose a serious safety risk. These have the biggest impact on your score and should be addressed first." },
              { title: "Major findings", desc: "Significant gaps in documentation or implementation. Important to fix, but less urgent than critical items." },
              { title: "Minor findings", desc: "Small issues, clarity gaps, or improvements that would strengthen your program." },
              { title: "Regulatory vs Best Practice", desc: "Findings marked REGULATORY are based on specific OSHA, EPA, or other legal requirements. Findings marked BEST PRACTICE are professional recommendations — valuable but not legally required." },
              { title: "Score bands", desc: "90–100 = Excellent · 75–89 = Good · 60–74 = Moderate Risk · 40–59 = High Risk · Below 40 = Critical Risk" },
              { title: "Red flag overrides", desc: "Certain critical deficiencies (missing EAP, missing HazCom, no incident reporting, open OSHA citation) trigger a red flag regardless of your overall score. These require immediate attention." },
            ],
          },
          {
            section: "Scoring Methodology",
            icon: "🎯",
            color: "#F59E0B",
            intro: "Our platform uses a deterministic compliance scoring engine built on fixed, transparent rules. Every response is evaluated consistently, producing repeatable audit scores, category-level risk ratings, and prioritized corrective actions businesses can trust.",
            steps: [
              { title: "7 weighted categories", desc: "Written Programs (20 pts), Training (20 pts), Inspections (15 pts), Hazard Controls & PPE (15 pts), Incident Management (10 pts), Regulatory Compliance (10 pts), Recordkeeping (10 pts). Total: 100 points." },
              { title: "Deterministic — not AI-judged", desc: "Scores are computed by a fixed rules engine, not by the AI. The same answers always produce the same score. No randomness, no inference, no guessing." },
              { title: "How points are calculated", desc: "Each checklist item has a fixed point value. Yes = 100% of points, Partial = 50%, No = 0%. Items marked N/A are excluded from the denominator so they don't penalize your score." },
              { title: "Category formula", desc: "Category score = (earned points ÷ applicable points) × category weight. If all items in a category are N/A, the category is marked Not Applicable." },
              { title: "Priority scoring for findings", desc: "Each deficiency is scored: severity × likelihood × regulatory impact. This produces a priority level (Critical, High, Medium, Low) that determines remediation order in your Corrective Action Plan." },
              { title: "Regulatory penalty deductions", desc: "Open serious citations (-2 pts), repeat citation history (-3 pts), and failure-to-abate notices (-4 pts) are deducted directly from the Regulatory category." },
            ],
          },
          {
            section: "Frequently Asked Questions",
            icon: "❓",
            color: "#34C759",
            steps: [
              { title: "Is this a substitute for a professional audit?", desc: "No. RegLens provides AI-assisted analysis to help you identify potential gaps. It does not replace a formal compliance audit or legal consultation." },
              { title: "What file types can I upload?", desc: "Text files (.txt) work everywhere. PDF and DOCX files require the deployed version with server-side parsing." },
              { title: "How is my score calculated?", desc: "Scores are calculated by a deterministic rules engine — not by the AI. Your responses are evaluated across 7 weighted categories totaling 100 points. Each item has a fixed point value, and the same answers always produce the same score. The full breakdown by category is visible in every report." },
              { title: "Is my data saved?", desc: "If the database indicator shows 'Database connected,' your reviews and readiness checks are saved and will be here when you come back. Otherwise, data is only available during your current session." },
              { title: "Can I share my report?", desc: "Yes — use the Export or Download button to create a file you can email, print, or save to your records." },
            ],
          },
        ];

        return (
          <div style={{ padding: "0 16px" }}>
            <button onClick={() => setTab("tools")} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "16px" }}>‹ Tools</button>

            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginBottom: "8px" }}><path d="M2 4h6a4 4 0 014 4v12a3 3 0 00-3-3H2V4z" stroke={t.green} strokeWidth="1.5" fill={`${t.green}10`}/><path d="M22 4h-6a4 4 0 00-4 4v12a3 3 0 013-3h7V4z" stroke={t.green} strokeWidth="1.5" fill={`${t.green}08`}/></svg>
              <h2 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 4px" }}>How to Use RegLens</h2>
              <p style={{ fontSize: "14px", color: t.textSecondary, margin: 0 }}>Everything you need to know to get started.</p>
            </div>

            {guideSteps.map((section, si) => (
              <div key={si} style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: section.intro ? "6px" : "10px", padding: "0 4px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: `${section.color}15`, border: `1px solid ${section.color}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>{section.icon}</div>
                  <span style={{ fontSize: "18px", fontWeight: 700 }}>{section.section}</span>
                </div>
                {section.intro && (
                  <div style={{ fontSize: "13px", color: t.textSecondary, lineHeight: 1.6, padding: "0 4px", marginBottom: "10px" }}>{section.intro}</div>
                )}
                {section.steps.map((step, i) => (
                  <div key={i} style={{ ...cardFlat, border: `1px solid ${t.border}`, marginBottom: "6px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: t.text, marginBottom: "4px" }}>{step.title}</div>
                    <div style={{ fontSize: "12px", color: t.textSecondary, lineHeight: 1.6 }}>{step.desc}</div>
                  </div>
                ))}
              </div>
            ))}

            <div style={{ ...card, textAlign: "center", border: `1px solid ${t.border}`, marginTop: "12px" }}>
              <div style={{ fontSize: "13px", color: t.textSecondary, lineHeight: 1.6 }}>
                Have a question? Reach us at{" "}
                <a href="mailto:info@prudencesafety.com" style={{ color: t.green, textDecoration: "none", fontWeight: 600 }}>info@prudencesafety.com</a>
              </div>
            </div>

            <div style={{ height: "20px" }} />
          </div>
        );
      })()}

      {/* ══════ CITATION RESPONSE ══════ */}
      {tab === "citation" && !citationResult && (
        <div style={{ padding: "0 16px" }} className="rl-fade-in">
          <button onClick={() => { setTab("dashboard"); setCitationText(""); setCitationPaid(false); setCitationIndustry(null); setCitationContext({ employees: "", description: "", priorCitations: "no", abatementStarted: "no", notes: "" }); }} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "16px" }}>‹ Back</button>

          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginBottom: "8px" }}><path d="M12 2L4 6v6c0 5.5 3.4 10.3 8 12 4.6-1.7 8-6.5 8-12V6l-8-4z" stroke="#EF4444" strokeWidth="1.5" fill="#EF444415"/><path d="M9 12l2 2 4-4" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <h2 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 4px" }}>Citation Response</h2>
            <p style={{ fontSize: "14px", color: t.textSecondary, margin: 0 }}>Upload an OSHA or EPA citation to generate a draft abatement plan</p>
          </div>

          {/* Scope notice */}
          <div style={{ ...card, border: "1px solid #3B82F625", background: theme === "dark" ? "#101C2E" : "#EFF6FF", padding: "14px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#60A5FA", marginBottom: "6px" }}>What this tool does</div>
            <div style={{ fontSize: "11px", color: t.textSecondary, lineHeight: 1.6 }}>
              Parses each violation in your citation and generates specific abatement steps, timelines, documentation requirements, and cost estimates. Exports as a printable Draft Abatement Plan Worksheet.
            </div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#EF4444", marginTop: "10px", marginBottom: "4px" }}>What this tool does NOT do</div>
            <div style={{ fontSize: "11px", color: t.textSecondary, lineHeight: 1.6 }}>
              Does not advise on contesting citations, penalty negotiation, informal conference strategy, or any legal decisions. For legal guidance, consult an attorney.
            </div>
          </div>

          {/* Text input */}
          <div style={{ marginTop: "16px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "8px" }}>Paste your citation text</div>
            <textarea
              value={citationText}
              onChange={(e) => setCitationText(e.target.value)}
              placeholder={"Paste the text from your OSHA citation here...\n\nInclude all violation items, standards cited, descriptions, proposed penalties, and abatement dates.\n\nYou can copy/paste from the PDF or type the key details."}
              rows={10}
              style={{ width: "100%", padding: "14px", borderRadius: "12px", background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, fontSize: "14px", lineHeight: 1.6, resize: "vertical", outline: "none", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
              <span style={{ fontSize: "10px", color: t.textTertiary }}>{citationText.length > 0 ? `${citationText.length.toLocaleString()} characters` : "Supports text from OSHA-2 forms, citation letters, and EPA NOVs"}</span>
              {citationText.length > 100 && <span style={{ fontSize: "10px", color: t.green }}>✓ Ready</span>}
            </div>
          </div>

          {/* Price + consent + generate */}
          {citationText.length > 100 && (
            <div style={{ marginTop: "16px" }} className="rl-fade-in">

              {/* Industry selector */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "8px" }}>Your industry</div>
                <div className="rl-grid-3">
                  {Object.entries(INDUSTRIES).map(([key, ind]) => (
                    <button key={key} className="rl-pop" onClick={() => setCitationIndustry(key)} style={{ padding: "10px 6px", borderRadius: "10px", textAlign: "center", border: citationIndustry === key ? `1.5px solid ${t.green}` : `1.5px solid ${t.border}`, background: citationIndustry === key ? `${t.green}12` : t.card, cursor: "pointer" }}>
                      <div style={{ fontSize: "18px", marginBottom: "2px" }}>{ind.icon}</div>
                      <div style={{ fontSize: "10px", fontWeight: 600, color: citationIndustry === key ? "#34C759" : "#8E8E93" }}>{ind.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Facility context questions */}
              {citationIndustry && (
                <div style={{ marginBottom: "16px" }} className="rl-fade-in">
                  <div style={{ fontSize: "12px", fontWeight: 600, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px" }}>Tell us about your facility</div>

                  <div style={{ ...cardFlat, border: `1px solid ${t.border}` }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: t.text, marginBottom: "4px" }}>Approximate number of employees</div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {["1-25", "26-100", "101-250", "251-500", "500+"].map(opt => (
                        <button key={opt} className="rl-pop" onClick={() => setCitationContext(prev => ({ ...prev, employees: opt }))} style={{
                          padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                          border: citationContext.employees === opt ? "1px solid #34C759" : "1px solid #2A2A2E",
                          background: citationContext.employees === opt ? "#34C75915" : "#111",
                          color: citationContext.employees === opt ? "#34C759" : "#8E8E93",
                        }}>{opt}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{ ...cardFlat, border: `1px solid ${t.border}` }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: t.text, marginBottom: "4px" }}>Brief description of operations</div>
                    <input
                      value={citationContext.description}
                      onChange={(e) => setCitationContext(prev => ({ ...prev, description: e.target.value }))}
                      placeholder={`e.g., ${INDUSTRIES[citationIndustry]?.label} facility with...`}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, fontSize: "13px", outline: "none" }}
                    />
                  </div>

                  <div style={{ ...cardFlat, border: `1px solid ${t.border}` }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: t.text, marginBottom: "6px" }}>Have you received prior OSHA citations?</div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[{ val: "no", label: "No" }, { val: "yes-same", label: "Yes — same hazard" }, { val: "yes-different", label: "Yes — different hazard" }].map(opt => (
                        <button key={opt.val} className="rl-pop" onClick={() => setCitationContext(prev => ({ ...prev, priorCitations: opt.val }))} style={{
                          flex: 1, padding: "8px 6px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                          border: citationContext.priorCitations === opt.val ? "1px solid #34C759" : "1px solid #2A2A2E",
                          background: citationContext.priorCitations === opt.val ? "#34C75915" : "#111",
                          color: citationContext.priorCitations === opt.val ? "#34C759" : "#8E8E93",
                        }}>{opt.label}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{ ...cardFlat, border: `1px solid ${t.border}` }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: t.text, marginBottom: "6px" }}>Have you started any abatement actions?</div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[{ val: "no", label: "Not yet" }, { val: "partial", label: "Some steps taken" }, { val: "yes", label: "Substantially complete" }].map(opt => (
                        <button key={opt.val} className="rl-pop" onClick={() => setCitationContext(prev => ({ ...prev, abatementStarted: opt.val }))} style={{
                          flex: 1, padding: "8px 6px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                          border: citationContext.abatementStarted === opt.val ? "1px solid #34C759" : "1px solid #2A2A2E",
                          background: citationContext.abatementStarted === opt.val ? "#34C75915" : "#111",
                          color: citationContext.abatementStarted === opt.val ? "#34C759" : "#8E8E93",
                        }}>{opt.label}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{ ...cardFlat, border: `1px solid ${t.border}` }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: t.text, marginBottom: "4px" }}>Anything else the expert should know? <span style={{ fontWeight: 400, color: t.textTertiary }}>(optional)</span></div>
                    <textarea
                      value={citationContext.notes}
                      onChange={(e) => setCitationContext(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="e.g., We have an informal conference scheduled, specific equipment involved, union workforce, etc."
                      rows={3}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, fontSize: "13px", outline: "none", resize: "vertical", fontFamily: "inherit" }}
                    />
                  </div>
                </div>
              )}

              <div style={{ ...card, border: `1px solid ${t.border}`, padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: 700 }}>Draft Abatement Plan</div>
                    <div style={{ fontSize: "12px", color: t.textSecondary }}>AI-generated technical abatement worksheet</div>
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: t.green }}>$149</div>
                </div>

                <div style={{ fontSize: "10px", color: t.textSecondary, lineHeight: 1.6, marginBottom: "12px", padding: "10px 12px", background: t.inputBg, borderRadius: "8px" }}>
                  By proceeding, I understand that this generates a <strong style={{ color: "#F59E0B" }}>draft planning worksheet only</strong> — not a legal document, formal abatement certification, or legal advice. I understand this tool does not advise on contesting citations, penalty negotiation, or legal strategy. All output should be reviewed by a qualified EHS professional and/or attorney before submission to OSHA.
                </div>

                <button
                  className="rl-tap rl-glow"
                  onClick={async () => {
                    setCitationLoading(true);
                    try {
                      // Payment gate — redirect to Stripe for $149
                      if (!citationPaid && !adminMode) {
                        if (!user) { setCitationLoading(false); setTab("citation"); setAuthScreen("signup"); return; }
                        try {
                          const res = await fetch("/api/checkout", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ tier: 4, userId: user.id, userEmail: user.email }),
                          });
                          const data = await res.json();
                          if (data.url) { window.location.href = data.url; return; }
                        } catch {
                          // If Stripe not configured, allow in demo mode
                          console.log("Stripe not configured — allowing in demo mode");
                        }
                        setCitationPaid(true);
                      }

                      // Generate abatement plan
                      const prompt = buildCitationPrompt(citationText, citationIndustry, citationContext);
                      let responseText = "";
                      try {
                        const res = await fetch("/api/claude", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ prompt, max_tokens: 6000 }),
                        });
                        const data = await res.json();
                        responseText = data.content?.[0]?.text || data.text || data.result || "";
                      } catch {
                        const res = await fetch("https://api.anthropic.com/v1/messages", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
                        });
                        const data = await res.json();
                        responseText = data.content?.[0]?.text || "";
                      }

                      const cleaned = responseText.replace(/```json\s*/g, "").replace(/```/g, "").trim();
                      const parsed = JSON.parse(cleaned);

                      if (parsed.violations && parsed.violations.length > 0) {
                        // Validate citations against registry
                        parsed.violations.forEach(v => {
                          if (v.standard_cited) {
                            const cv = validateCitation(v.standard_cited);
                            v.citation_verified = cv.verified;
                            v.citation_title = cv.title || null;
                          }
                        });
                        setCitationResult(parsed);
                      } else {
                        alert("Could not parse violations from the citation text. Please ensure you've pasted the complete citation including violation descriptions and standards cited.");
                      }
                    } catch (err) {
                      console.error("Citation analysis error:", err);
                      alert("Analysis failed: " + err.message + ". Please try again.");
                    }
                    setCitationLoading(false);
                  }}
                  style={{
                    width: "100%", padding: "15px", borderRadius: "12px", border: "none",
                    background: citationLoading ? "#2C2C2E" : !citationIndustry ? "#2C2C2E" : "linear-gradient(135deg, #EF4444, #DC2626)",
                    color: citationLoading || !citationIndustry ? "#555" : "#fff", fontSize: "15px", fontWeight: 700,
                    cursor: citationLoading || !citationIndustry ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  }}
                  disabled={citationLoading || !citationIndustry}>
                  {citationLoading ? (
                    <><span className="rl-pulse">⚙️</span> Analyzing citation...</>
                  ) : !citationIndustry ? (
                    <>Select your industry above to continue</>
                  ) : (
                    <>⚖️ Generate Abatement Plan — $149</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Citation Results */}
      {tab === "citation" && citationResult && (
        <div style={{ padding: "0 16px" }} className="rl-fade-in">
          <button onClick={() => { setCitationResult(null); setCitationText(""); setCitationPaid(false); setCitationIndustry(null); setCitationContext({ employees: "", description: "", priorCitations: "no", abatementStarted: "no", notes: "" }); setTab("dashboard"); }} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "16px" }}>‹ Dashboard</button>

          {/* Willful/Repeat warning */}
          {(citationResult.meta?.has_willful || citationResult.violations?.some(v => v.violation_type === "Willful")) && (
            <div style={{ padding: "14px", borderRadius: "12px", marginBottom: "12px", background: theme === "dark" ? "#7c2d12" : "#FEF2F2", border: theme === "dark" ? "1px solid #92400E" : "2px solid #DC2626" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: theme === "dark" ? "#fbbf24" : "#DC2626", marginBottom: "4px" }}>🚨 Willful Violation Detected</div>
              <div style={{ fontSize: "12px", color: theme === "dark" ? "#fed7aa" : "#7c2d12", lineHeight: 1.6 }}>
                This citation includes a Willful violation, which carries penalties up to $161,323 per violation and may result in criminal referral. We strongly recommend engaging legal counsel and a qualified EHS professional before responding.
              </div>
            </div>
          )}
          {(citationResult.meta?.has_repeat || citationResult.violations?.some(v => v.violation_type === "Repeat")) && !(citationResult.meta?.has_willful) && (
            <div style={{ padding: "14px", borderRadius: "12px", marginBottom: "12px", background: theme === "dark" ? "#2A1530" : "#FAF5FF", border: theme === "dark" ? "1px solid #9333ea30" : "1px solid #E9D5FF" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#c084fc", marginBottom: "4px" }}>⚠️ Repeat Violation Detected</div>
              <div style={{ fontSize: "12px", color: t.textSecondary, lineHeight: 1.6 }}>
                This citation includes a Repeat violation, indicating a prior citation for the same or similar hazard. Penalties are significantly increased. Professional review strongly recommended.
              </div>
            </div>
          )}

          {/* Legal disclaimer */}
          <div style={{ padding: "10px 14px", borderRadius: "10px", marginBottom: "12px", background: t.card, border: "1px solid #EF444420", display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <span style={{ fontSize: "12px", flexShrink: 0, marginTop: "1px" }}>⚠️</span>
            <div style={{ fontSize: "9px", color: t.textSecondary, lineHeight: 1.5 }}>
              <strong style={{ color: "#EF4444" }}>Draft only.</strong> This abatement plan worksheet is AI-generated and must be reviewed by a qualified professional before use. Not legal advice.
            </div>
          </div>

          {/* Summary stats */}
          <div style={{ ...card, textAlign: "center", background: t.scoreBg }}>
            <div style={{ fontSize: "12px", color: t.textSecondary, fontWeight: 500, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px" }}>Citation Summary</div>
            <div style={{ fontSize: "42px", fontWeight: 700, color: "#EF4444" }}>{citationResult.violations?.length || 0}</div>
            <div style={{ fontSize: "14px", color: t.textSecondary, marginBottom: "10px" }}>Violations Analyzed</div>
            <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
              {(() => {
                const vs = citationResult.violations || [];
                const types = { Serious: "#EF4444", Willful: "#7c2d12", Repeat: "#9333ea", "Other-than-Serious": "#F59E0B" };
                return Object.entries(types).map(([type, color]) => {
                  const count = vs.filter(v => v.violation_type === type).length;
                  if (count === 0) return null;
                  return (
                    <div key={type} style={{ padding: "6px 10px", borderRadius: "8px", background: `${color}15`, border: `1px solid ${color}30` }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color }}>{count}</span>
                      <span style={{ fontSize: "10px", color, marginLeft: "4px" }}>{type}</span>
                    </div>
                  );
                });
              })()}
            </div>
            {(() => {
              const totalPenalty = (citationResult.violations || []).reduce((s, v) => s + (v.proposed_penalty || 0), 0);
              return totalPenalty > 0 ? (
                <div style={{ marginTop: "10px", fontSize: "18px", fontWeight: 700, color: "#EF4444" }}>
                  ${totalPenalty.toLocaleString()} <span style={{ fontSize: "11px", color: t.textSecondary, fontWeight: 500 }}>total proposed penalty</span>
                </div>
              ) : null;
            })()}
          </div>

          {/* Violation cards */}
          <div style={{ marginTop: "16px" }}>
            <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px", padding: "0 4px" }}>Abatement Plan</div>
            {(citationResult.violations || []).map((v, i) => {
              const typeColors = { Serious: "#EF4444", Willful: "#92400E", Repeat: "#9333ea", "Other-than-Serious": "#F59E0B" };
              const tc = typeColors[v.violation_type] || "#8E8E93";
              return (
                <div key={i} style={{ ...card, borderLeft: `3px solid ${tc}`, border: `1px solid ${tc}25`, borderLeftWidth: "3px", borderLeftColor: tc }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: t.textTertiary }}>Item {v.item_number || (i + 1)}</span>
                    <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: tc, color: t.text, textTransform: "uppercase" }}>{v.violation_type}</span>
                    <span style={{ fontSize: "10px", color: t.green, fontFamily: "monospace" }}>{v.standard_cited}</span>
                    {v.citation_verified && <span style={{ fontSize: "9px", color: t.green }}>✓</span>}
                    {v.proposed_penalty > 0 && <span style={{ fontSize: "10px", color: "#EF4444", fontWeight: 600 }}>${v.proposed_penalty.toLocaleString()}</span>}
                  </div>

                  <div style={{ fontSize: "12px", color: t.textSecondary, lineHeight: 1.5, marginBottom: "10px" }}>{v.description}</div>

                  {v.root_cause && (
                    <div style={{ marginBottom: "8px" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", marginBottom: "2px" }}>Root Cause</div>
                      <div style={{ fontSize: "11px", color: t.textSecondary }}>{v.root_cause}</div>
                    </div>
                  )}

                  <div style={{ fontSize: "9px", fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", marginBottom: "4px" }}>Abatement Steps</div>
                  {(v.abatement_steps || []).map((step, si) => (
                    <div key={si} style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
                      <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: t.card, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 700, color: t.textSecondary, flexShrink: 0, marginTop: "1px" }}>{si + 1}</div>
                      <div style={{ fontSize: "11px", color: t.textSecondary, lineHeight: 1.5 }}>{step}</div>
                    </div>
                  ))}

                  <div style={{ display: "flex", gap: "12px", marginTop: "8px", flexWrap: "wrap", fontSize: "10px" }}>
                    {v.estimated_timeline && <div><span style={{ color: t.textTertiary }}>Timeline:</span> <span style={{ color: t.textSecondary }}>{v.estimated_timeline} days</span></div>}
                    {v.estimated_cost && <div><span style={{ color: t.textTertiary }}>Est. Cost:</span> <span style={{ color: t.textSecondary }}>{v.estimated_cost}</span></div>}
                    {v.abatement_date && <div><span style={{ color: t.textTertiary }}>OSHA Deadline:</span> <span style={{ color: "#EF4444", fontWeight: 600 }}>{v.abatement_date}</span></div>}
                  </div>

                  {v.verification_method && (
                    <div style={{ marginTop: "6px" }}>
                      <span style={{ fontSize: "9px", color: t.textTertiary }}>Verification: </span>
                      <span style={{ fontSize: "10px", color: "#6b7280" }}>{v.verification_method}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button className="rl-tap" onClick={() => exportCitationReport(citationResult)} style={{ flex: 1, padding: "15px", borderRadius: "14px", background: "linear-gradient(135deg, #EF4444, #DC2626)", border: "none", color: "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>
              Export Plan
            </button>
            <button className="rl-tap" onClick={() => setEmailModal({ type: "citation", data: { violationCount: (citationResult.violations || []).length, penalty: (() => { const tp = (citationResult.violations || []).reduce((s,v) => s + (v.proposed_penalty || 0), 0); return tp > 0 ? "$" + tp.toLocaleString() : "Not specified"; })() } })} style={{ padding: "15px", borderRadius: "14px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "15px", cursor: "pointer" }}>✉️</button>
          </div>

          {/* Expert consultation CTA */}
          <div style={{ ...card, marginTop: "12px", border: `1px solid ${theme === "dark" ? "#34C75930" : "#bbf7d0"}`, background: theme === "dark" ? "linear-gradient(135deg, #1A2A1A08, #1C1C1E)" : "linear-gradient(135deg, #F0FDF408, #FFFFFF)", textAlign: "center", padding: "20px 16px" }}>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>Need help preparing your response?</div>
            <div style={{ fontSize: "12px", color: t.textSecondary, lineHeight: 1.5, marginBottom: "14px" }}>An EHS expert can review your abatement plan, help prepare for an informal conference, and ensure your documentation meets OSHA requirements.</div>
            <button className="rl-tap rl-glow" onClick={() => setShowBooking(true)} style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: t.green, color: theme === "dark" ? "#000" : "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>
              📅 Book Expert Consultation
            </button>
            <div style={{ fontSize: "10px", color: t.textTertiary, marginTop: "6px" }}>30-min sessions from $149 · Your abatement plan is shared with the expert before the call</div>
          </div>

          <button onClick={() => { setCitationResult(null); setCitationText(""); setCitationPaid(false); setCitationIndustry(null); setCitationContext({ employees: "", description: "", priorCitations: "no", abatementStarted: "no", notes: "" }); }} style={{ width: "100%", padding: "13px", borderRadius: "14px", background: t.card, border: `1px solid ${t.border}`, color: t.textSecondary, fontSize: "14px", fontWeight: 600, cursor: "pointer", marginTop: "8px" }}>
            Analyze Another Citation
          </button>
        </div>
      )}

      {/* ══════ RISK ASSESSMENT ══════ */}
      {tab === "risk" && (
        <div style={{ padding: "0 16px" }} className="rl-fade-in">
          <button onClick={() => { setTab("dashboard"); }} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "16px" }}>‹ Dashboard</button>

          {/* Step 1: Industry selection */}
          {!riskIndustry && (
            <div>
              <div style={{ textAlign: "center", marginBottom: "16px" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginBottom: "8px" }}><path d="M12 2L2 22h20L12 2z" stroke="#F59E0B" strokeWidth="1.5" fill="#F59E0B15"/><path d="M12 10v4M12 17h.01" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round"/></svg>
                <h2 style={{ fontSize: "22px", fontWeight: 700, color: t.text, margin: "0 0 4px" }}>Job Hazard Analysis</h2>
                <p style={{ fontSize: "13px", color: t.textSecondary, margin: 0 }}>Job Hazard Analysis with 5×5 risk matrix</p>
              </div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "8px" }}>Select your industry</div>
              <div className="rl-grid-3">
                {Object.entries(INDUSTRIES).map(([key, ind]) => (
                  <button key={key} className="rl-pop" onClick={() => setRiskIndustry(key)} style={{ padding: "12px 6px", borderRadius: "10px", textAlign: "center", border: `1.5px solid ${t.border}`, background: t.card, cursor: "pointer" }}>
                    <div style={{ fontSize: "20px", marginBottom: "2px" }}>{ind.icon}</div>
                    <div style={{ fontSize: "10px", fontWeight: 600, color: t.textSecondary }}>{ind.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Task management & hazard entry */}
          {riskIndustry && !riskCurrentTask && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <div>
                  <div style={{ fontSize: "18px", fontWeight: 700, color: t.text }}>{INDUSTRIES[riskIndustry]?.icon} Job Hazard Analysis</div>
                  <div style={{ fontSize: "11px", color: t.textSecondary }}>{INDUSTRIES[riskIndustry]?.label} · {riskTasks.length} task{riskTasks.length !== 1 ? "s" : ""}</div>
                </div>
                <button onClick={() => setRiskIndustry(null)} style={{ background: "none", border: "none", color: t.textSecondary, fontSize: "11px", cursor: "pointer" }}>Change</button>
              </div>

              {/* Add task */}
              <div style={{ ...card, border: `1px solid ${t.green}30`, display: "flex", gap: "8px" }}>
                <input id="newTaskName" placeholder="Enter job task (e.g., Operating hydraulic press)" style={{ flex: 1, padding: "10px 12px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "13px", outline: "none", fontFamily: "inherit" }}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { const name = e.target.value.trim(); setRiskTasks(prev => [...prev, { id: `task-${Date.now()}`, name, hazards: [] }]); e.target.value = ""; }}}
                />
                <button onClick={() => { const el = document.getElementById("newTaskName"); if (el?.value.trim()) { setRiskTasks(prev => [...prev, { id: `task-${Date.now()}`, name: el.value.trim(), hazards: [] }]); el.value = ""; }}} style={{ padding: "10px 16px", borderRadius: "8px", background: t.green, border: "none", color: theme === "dark" ? "#000" : "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>+ Add</button>
              </div>

              {/* Task list */}
              {riskTasks.map((task) => {
                const totalHazards = task.hazards.length;
                const criticals = task.hazards.filter(h => h.severity * h.likelihood >= 16).length;
                const highs = task.hazards.filter(h => { const s = h.severity * h.likelihood; return s >= 10 && s < 16; }).length;
                return (
                  <div key={task.id} className="rl-card-interactive" onClick={() => setRiskCurrentTask(task.id)} style={{ ...cardFlat, border: `1px solid ${t.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: t.text }}>{task.name}</div>
                      <div style={{ fontSize: "10px", color: t.textSecondary, marginTop: "2px" }}>
                        {totalHazards === 0 ? "No hazards identified — tap to add" : `${totalHazards} hazard${totalHazards !== 1 ? "s" : ""}${criticals > 0 ? ` · ${criticals} critical` : ""}${highs > 0 ? ` · ${highs} high` : ""}`}
                      </div>
                    </div>
                    <span style={{ color: t.textTertiary }}>›</span>
                  </div>
                );
              })}

              {/* Results & export */}
              {riskTasks.length > 0 && riskTasks.some(t => t.hazards.length > 0) && (
                <div style={{ marginTop: "16px" }}>
                  {/* Summary */}
                  {(() => {
                    const all = riskTasks.flatMap(t => t.hazards);
                    const byLevel = { Critical: all.filter(h => h.severity * h.likelihood >= 16).length, High: all.filter(h => { const s = h.severity * h.likelihood; return s >= 10 && s < 16; }).length, Medium: all.filter(h => { const s = h.severity * h.likelihood; return s >= 5 && s < 10; }).length, Low: all.filter(h => h.severity * h.likelihood < 5).length };
                    return (
                      <div style={{ ...card, textAlign: "center", background: t.scoreBg }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Risk Summary</div>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
                          {[["Critical", "#EF4444"], ["High", "#ea580c"], ["Medium", "#F59E0B"], ["Low", "#22c55e"]].map(([lev, col]) => (
                            <div key={lev} style={{ padding: "8px 12px", borderRadius: "8px", background: `${col}10`, border: `1px solid ${col}20` }}>
                              <div style={{ fontSize: "18px", fontWeight: 800, color: col }}>{byLevel[lev]}</div>
                              <div style={{ fontSize: "9px", color: col }}>{lev}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="rl-tap" onClick={() => exportRiskReport(riskTasks, riskIndustry)} style={{ flex: 1, padding: "14px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #8B5CF6, #7C3AED)", color: "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>Export Risk Report</button>
                    <button className="rl-tap" onClick={() => setEmailModal({ type: "review", data: { programType: "Job Hazard Analysis", industry: INDUSTRIES[riskIndustry]?.label, score: "N/A", band: "N/A", findingsCount: riskTasks.flatMap(t => t.hazards).length, summary: `Job hazard analysis for ${INDUSTRIES[riskIndustry]?.label} with ${riskTasks.length} tasks and ${riskTasks.flatMap(t => t.hazards).length} hazards identified.` } })} style={{ padding: "14px", borderRadius: "12px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "14px", cursor: "pointer" }}>✉️</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Hazard entry for a specific task */}
          {riskIndustry && riskCurrentTask && (() => {
            const task = riskTasks.find(t => t.id === riskCurrentTask);
            if (!task) return null;

            const addHazard = (desc) => {
              setRiskTasks(prev => prev.map(t => t.id === task.id ? { ...t, hazards: [...t.hazards, { id: `h-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, desc, severity: 3, likelihood: 3, controls: "", controlType: "engineering", resSeverity: 2, resLikelihood: 2, notes: "" }] } : t));
            };
            const updateHazard = (hId, field, value) => {
              setRiskTasks(prev => prev.map(t => t.id === task.id ? { ...t, hazards: t.hazards.map(h => h.id === hId ? { ...h, [field]: value } : h) } : t));
            };
            const removeHazard = (hId) => {
              setRiskTasks(prev => prev.map(t => t.id === task.id ? { ...t, hazards: t.hazards.filter(h => h.id !== hId) } : t));
            };

            return (
              <div>
                <button onClick={() => setRiskCurrentTask(null)} style={{ background: "none", border: "none", color: t.green, fontSize: "13px", fontWeight: 500, cursor: "pointer", marginBottom: "12px" }}>‹ All Tasks</button>
                <div style={{ fontSize: "16px", fontWeight: 700, color: t.text, marginBottom: "4px" }}>{task.name}</div>
                <div style={{ fontSize: "11px", color: t.textSecondary, marginBottom: "12px" }}>{task.hazards.length} hazard{task.hazards.length !== 1 ? "s" : ""} identified</div>

                {/* Suggest hazards from library */}
                {HAZARD_LIBRARY[riskIndustry] && task.hazards.length === 0 && (
                  <div style={{ ...card, border: `1px solid ${theme === "dark" ? "#3B82F625" : "#BFDBFE"}`, background: theme === "dark" ? "#101C2E" : "#EFF6FF" }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "#60A5FA", marginBottom: "8px" }}>Suggested hazards for {INDUSTRIES[riskIndustry]?.label}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {HAZARD_LIBRARY[riskIndustry].map((h, i) => (
                        <button key={i} className="rl-pop" onClick={() => addHazard(h)} style={{ padding: "5px 10px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>+ {h}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add custom hazard */}
                <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
                  <input id="newHazard" placeholder="Add a hazard..." style={{ flex: 1, padding: "10px 12px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "12px", outline: "none", fontFamily: "inherit" }}
                    onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { addHazard(e.target.value.trim()); e.target.value = ""; }}} />
                  <button onClick={() => { const el = document.getElementById("newHazard"); if (el?.value.trim()) { addHazard(el.value.trim()); el.value = ""; }}} style={{ padding: "10px 14px", borderRadius: "8px", background: t.green, border: "none", color: theme === "dark" ? "#000" : "#fff", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>+ Add</button>
                </div>

                {/* Hazard cards */}
                {task.hazards.map((h) => {
                  const inherent = h.severity * h.likelihood;
                  const residual = (h.resSeverity || h.severity) * (h.resLikelihood || h.likelihood);
                  const iRL = getRiskLevel(inherent);
                  const rRL = getRiskLevel(residual);

                  return (
                    <div key={h.id} style={{ ...card, borderLeft: `3px solid ${iRL.color}`, border: `1px solid ${t.border}`, borderLeftWidth: "3px", borderLeftColor: iRL.color }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: t.text, flex: 1 }}>{h.desc}</div>
                        <button onClick={() => removeHazard(h.id)} style={{ background: "none", border: "none", color: t.textTertiary, fontSize: "14px", cursor: "pointer", padding: "0 4px" }}>✕</button>
                      </div>

                      {/* Inherent risk */}
                      <div style={{ fontSize: "9px", fontWeight: 700, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Inherent Risk (before controls)</div>
                      <div style={{ display: "flex", gap: "6px", marginBottom: "6px", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: "9px", color: t.textSecondary, minWidth: "46px" }}>Severity</div>
                        {RISK_SEVERITY.map(s => (
                          <button key={s.val} onClick={() => updateHazard(h.id, "severity", s.val)} style={{ width: "28px", height: "28px", borderRadius: "6px", border: h.severity === s.val ? `2px solid ${s.color}` : `1px solid ${t.border}`, background: h.severity === s.val ? `${s.color}20` : t.inputBg, color: h.severity === s.val ? s.color : t.textTertiary, fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{s.val}</button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: "6px", marginBottom: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: "9px", color: t.textSecondary, minWidth: "46px" }}>Likelihood</div>
                        {RISK_LIKELIHOOD.map(l => (
                          <button key={l.val} onClick={() => updateHazard(h.id, "likelihood", l.val)} style={{ width: "28px", height: "28px", borderRadius: "6px", border: h.likelihood === l.val ? `2px solid ${l.color}` : `1px solid ${t.border}`, background: h.likelihood === l.val ? `${l.color}20` : t.inputBg, color: h.likelihood === l.val ? l.color : t.textTertiary, fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l.val}</button>
                        ))}
                        <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "6px", background: iRL.bg, color: iRL.color, marginLeft: "auto" }}>{inherent} {iRL.level}</span>
                      </div>

                      {/* Controls */}
                      <div style={{ fontSize: "9px", fontWeight: 700, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Controls (Hierarchy)</div>
                      <div style={{ display: "flex", gap: "3px", marginBottom: "6px", flexWrap: "wrap" }}>
                        {CONTROL_TYPES.map(ct => (
                          <button key={ct.id} onClick={() => updateHazard(h.id, "controlType", ct.id)} style={{ padding: "4px 8px", borderRadius: "6px", border: h.controlType === ct.id ? `1.5px solid ${ct.color}` : `1px solid ${t.border}`, background: h.controlType === ct.id ? `${ct.color}15` : t.inputBg, color: h.controlType === ct.id ? ct.color : t.textTertiary, fontSize: "8px", fontWeight: 600, cursor: "pointer" }}>{ct.label}</button>
                        ))}
                      </div>
                      <input value={h.controls} onChange={(e) => updateHazard(h.id, "controls", e.target.value)} placeholder="Describe control measures..." style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "11px", outline: "none", fontFamily: "inherit", marginBottom: "8px" }} />

                      {/* Residual risk */}
                      <div style={{ fontSize: "9px", fontWeight: 700, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Residual Risk (after controls)</div>
                      <div style={{ display: "flex", gap: "6px", marginBottom: "6px", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: "9px", color: t.textSecondary, minWidth: "46px" }}>Severity</div>
                        {RISK_SEVERITY.map(s => (
                          <button key={s.val} onClick={() => updateHazard(h.id, "resSeverity", s.val)} style={{ width: "28px", height: "28px", borderRadius: "6px", border: (h.resSeverity || h.severity) === s.val ? `2px solid ${s.color}` : `1px solid ${t.border}`, background: (h.resSeverity || h.severity) === s.val ? `${s.color}20` : t.inputBg, color: (h.resSeverity || h.severity) === s.val ? s.color : t.textTertiary, fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{s.val}</button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: "9px", color: t.textSecondary, minWidth: "46px" }}>Likelihood</div>
                        {RISK_LIKELIHOOD.map(l => (
                          <button key={l.val} onClick={() => updateHazard(h.id, "resLikelihood", l.val)} style={{ width: "28px", height: "28px", borderRadius: "6px", border: (h.resLikelihood || h.likelihood) === l.val ? `2px solid ${l.color}` : `1px solid ${t.border}`, background: (h.resLikelihood || h.likelihood) === l.val ? `${l.color}20` : t.inputBg, color: (h.resLikelihood || h.likelihood) === l.val ? l.color : t.textTertiary, fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l.val}</button>
                        ))}
                        <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "6px", background: rRL.bg, color: rRL.color, marginLeft: "auto" }}>{residual} {rRL.level}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Suggested hazards if some already exist */}
                {HAZARD_LIBRARY[riskIndustry] && task.hazards.length > 0 && (
                  <details style={{ marginTop: "8px" }}>
                    <summary style={{ fontSize: "11px", color: t.green, cursor: "pointer", fontWeight: 600 }}>+ Add from suggested hazards</summary>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                      {HAZARD_LIBRARY[riskIndustry].filter(h => !task.hazards.some(th => th.desc === h)).map((h, i) => (
                        <button key={i} className="rl-pop" onClick={() => addHazard(h)} style={{ padding: "4px 8px", borderRadius: "6px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "9px", cursor: "pointer", fontFamily: "inherit" }}>+ {h}</button>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ══════ INCIDENT REPORT ══════ */}
      {tab === "incident" && incidentDraft && (() => {
        const d = incidentDraft;
        const upd = (field, val) => setIncidentDraft(prev => ({ ...prev, [field]: val }));
        const updWhy = (idx, val) => { const w = [...d.whys]; w[idx] = val; upd("whys", w); };

        const INJURY_TYPES = ["Laceration/Cut", "Contusion/Bruise", "Sprain/Strain", "Fracture", "Burn (thermal)", "Burn (chemical)", "Eye injury", "Puncture", "Amputation", "Inhalation", "Skin contact/rash", "Hearing injury", "Electrical shock", "Crush injury", "Other"];
        const BODY_PARTS = ["Head", "Eye(s)", "Face", "Neck", "Shoulder", "Arm/Elbow", "Wrist", "Hand/Fingers", "Chest", "Back (upper)", "Back (lower)", "Abdomen", "Hip", "Leg/Knee", "Ankle", "Foot/Toes", "Multiple", "Other"];
        const SEVERITIES = ["First Aid", "Medical Treatment", "Lost Time", "Hospitalization", "Fatality"];
        const sevColors = { "First Aid": "#22c55e", "Medical Treatment": "#F59E0B", "Lost Time": "#ea580c", "Hospitalization": "#DC2626", "Fatality": "#991b1b" };

        return (
          <div style={{ padding: "0 16px" }} className="rl-fade-in">
            <button onClick={() => { setTab("dashboard"); setIncidentDraft(null); }} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "12px" }}>‹ Dashboard</button>

            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ marginBottom: "4px" }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#ea580c" strokeWidth="1.5" fill="#ea580c08"/><path d="M14 2v6h6" stroke="#ea580c" strokeWidth="1.5" strokeLinecap="round"/><path d="M9 15h6M9 18h4" stroke="#ea580c" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/></svg>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: t.text, margin: "0 0 2px" }}>Incident Report</h2>
              <p style={{ fontSize: "11px", color: t.textSecondary, margin: 0 }}>OSHA 301-aligned · Report #{d.id}</p>
            </div>

            {/* Severity selector */}
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Classification</div>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {SEVERITIES.map(s => (
                  <button key={s} onClick={() => upd("severity", s)} style={{ padding: "6px 10px", borderRadius: "8px", border: d.severity === s ? `1.5px solid ${sevColors[s]}` : `1px solid ${t.border}`, background: d.severity === s ? `${sevColors[s]}15` : t.inputBg, color: d.severity === s ? sevColors[s] : t.textSecondary, fontSize: "10px", fontWeight: 600, cursor: "pointer" }}>{s}</button>
                ))}
              </div>
              <div style={{ marginTop: "6px" }}>
                <button onClick={() => upd("oshaRecordable", !d.oshaRecordable)} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <div style={{ width: "18px", height: "18px", borderRadius: "4px", border: `2px solid ${d.oshaRecordable ? "#EF4444" : t.textTertiary}`, background: d.oshaRecordable ? "#EF4444" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#fff" }}>{d.oshaRecordable ? "✓" : ""}</div>
                  <span style={{ fontSize: "11px", color: t.text }}>OSHA Recordable</span>
                </button>
              </div>
            </div>

            {/* Date, Time, Location, Department */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
              {[["date", "Date", "date"], ["time", "Time", "time"], ["location", "Location", "text"], ["department", "Department", "text"]].map(([field, label, type]) => (
                <div key={field}>
                  <div style={{ fontSize: "10px", fontWeight: 600, color: t.textSecondary, marginBottom: "3px" }}>{label}</div>
                  <input type={type} value={d[field]} onChange={(e) => upd(field, e.target.value)} style={{ width: "100%", padding: "10px 10px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "13px", outline: "none", fontFamily: "inherit" }} />
                </div>
              ))}
            </div>

            {/* Employee info */}
            <div style={{ fontSize: "10px", fontWeight: 700, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Injured Person</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
              {[["employeeName", "Name"], ["jobTitle", "Job Title"]].map(([field, label]) => (
                <div key={field}>
                  <div style={{ fontSize: "10px", fontWeight: 600, color: t.textSecondary, marginBottom: "3px" }}>{label}</div>
                  <input value={d[field]} onChange={(e) => upd(field, e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "13px", outline: "none", fontFamily: "inherit" }} />
                </div>
              ))}
            </div>

            {/* Injury Type & Body Part — tappable chips */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, color: t.textSecondary, marginBottom: "4px" }}>Injury Type</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {INJURY_TYPES.map(it => (
                  <button key={it} onClick={() => upd("injuryType", it)} style={{ padding: "5px 9px", borderRadius: "6px", border: d.injuryType === it ? `1.5px solid ${t.green}` : `1px solid ${t.border}`, background: d.injuryType === it ? `${t.green}15` : t.inputBg, color: d.injuryType === it ? t.green : t.textSecondary, fontSize: "9px", fontWeight: 600, cursor: "pointer" }}>{it}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, color: t.textSecondary, marginBottom: "4px" }}>Body Part Affected</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {BODY_PARTS.map(bp => (
                  <button key={bp} onClick={() => upd("bodyPart", bp)} style={{ padding: "5px 9px", borderRadius: "6px", border: d.bodyPart === bp ? `1.5px solid ${t.green}` : `1px solid ${t.border}`, background: d.bodyPart === bp ? `${t.green}15` : t.inputBg, color: d.bodyPart === bp ? t.green : t.textSecondary, fontSize: "9px", fontWeight: 600, cursor: "pointer" }}>{bp}</button>
                ))}
              </div>
            </div>

            {/* Description fields */}
            {[["description", "What happened? (describe the incident)", 3], ["activity", "What was the employee doing at the time?", 2], ["witnesses", "Witnesses (names)", 1]].map(([field, label, rows]) => (
              <div key={field} style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "10px", fontWeight: 600, color: t.textSecondary, marginBottom: "3px" }}>{label}</div>
                <textarea value={d[field]} onChange={(e) => upd(field, e.target.value)} rows={rows} style={{ width: "100%", padding: "10px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "13px", outline: "none", resize: "vertical", fontFamily: "inherit" }} />
              </div>
            ))}

            {/* 5 Whys */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Root Cause — 5 Whys</div>
              {d.whys.map((w, i) => (
                <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "4px", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: t.textTertiary, minWidth: "18px" }}>#{i + 1}</span>
                  <input value={w} onChange={(e) => updWhy(i, e.target.value)} placeholder={i === 0 ? "Why did this happen?" : `Why? (based on answer ${i})`} style={{ flex: 1, padding: "8px 10px", borderRadius: "6px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "12px", outline: "none", fontFamily: "inherit" }} />
                </div>
              ))}
            </div>

            {/* Corrective actions */}
            {[["immediateActions", "Immediate Corrective Actions", 2], ["preventiveActions", "Preventive Actions (to prevent recurrence)", 2]].map(([field, label, rows]) => (
              <div key={field} style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "10px", fontWeight: 600, color: t.textSecondary, marginBottom: "3px" }}>{label}</div>
                <textarea value={d[field]} onChange={(e) => upd(field, e.target.value)} rows={rows} style={{ width: "100%", padding: "10px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "13px", outline: "none", resize: "vertical", fontFamily: "inherit" }} />
              </div>
            ))}

            {/* Submit */}
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button onClick={() => { saveIncidents([d, ...incidentReports]); if (!hasSeen("ach_incident")) { markSeen("ach_incident"); setTimeout(() => showAchievement("Incident Report Filed!", "You can export it as a PDF or find it on your dashboard anytime."), 500); } setIncidentDraft(null); setTab("dashboard"); }} style={{ flex: 1, padding: "15px", borderRadius: "12px", border: "none", background: t.green, color: theme === "dark" ? "#000" : "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>Save Report</button>
              <button onClick={() => { saveIncidents([d, ...incidentReports]); exportIncidentReport(d); }} style={{ padding: "15px", borderRadius: "12px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "15px", cursor: "pointer" }}>💾 Export</button>
            </div>
          </div>
        );
      })()}

      {/* ══════ SAFETY MEETING LOG ══════ */}
      {tab === "meeting" && meetingDraft && (() => {
        const m = meetingDraft;
        const upd = (field, val) => setMeetingDraft(prev => ({ ...prev, [field]: val }));

        const TOPICS = ["Slip, Trip & Fall Prevention", "Fire Safety & Extinguisher Use", "PPE Awareness & Proper Use", "Lockout/Tagout Procedures", "Hazard Communication & SDSs", "Emergency Evacuation Procedures", "Ergonomics & Lifting Safety", "Electrical Safety Basics", "Confined Space Awareness", "Heat/Cold Stress Prevention", "Bloodborne Pathogens", "Forklift Safety", "Ladder Safety", "Machine Guarding", "Near-Miss Reporting", "Housekeeping Standards"];

        return (
          <div style={{ padding: "0 16px" }} className="rl-fade-in">
            <button onClick={() => { setTab("dashboard"); setMeetingDraft(null); }} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "12px" }}>‹ Dashboard</button>

            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ marginBottom: "4px" }}><circle cx="9" cy="7" r="3" stroke="#0EA5E9" strokeWidth="1.5" fill="#0EA5E915"/><circle cx="16" cy="9" r="2.5" stroke="#0EA5E9" strokeWidth="1.2" opacity="0.5"/><path d="M2 21v-1a5 5 0 015-5h4a5 5 0 015 5v1" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: t.text, margin: "0 0 2px" }}>Safety Meeting Log</h2>
              <p style={{ fontSize: "11px", color: t.textSecondary, margin: 0 }}>Toolbox talk documentation & sign-in</p>
            </div>

            {/* Date, Duration, Presenter, Location */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
              <div><div style={{ fontSize: "10px", fontWeight: 600, color: t.textSecondary, marginBottom: "3px" }}>Date</div><input type="date" value={m.date} onChange={(e) => upd("date", e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "13px", outline: "none", fontFamily: "inherit" }} /></div>
              <div><div style={{ fontSize: "10px", fontWeight: 600, color: t.textSecondary, marginBottom: "3px" }}>Duration (min)</div><input type="number" value={m.duration} onChange={(e) => upd("duration", e.target.value)} placeholder="15" style={{ width: "100%", padding: "10px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "13px", outline: "none", fontFamily: "inherit" }} /></div>
              <div><div style={{ fontSize: "10px", fontWeight: 600, color: t.textSecondary, marginBottom: "3px" }}>Presenter</div><input value={m.presenter} onChange={(e) => upd("presenter", e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "13px", outline: "none", fontFamily: "inherit" }} /></div>
              <div><div style={{ fontSize: "10px", fontWeight: 600, color: t.textSecondary, marginBottom: "3px" }}>Location</div><input value={m.location} onChange={(e) => upd("location", e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "13px", outline: "none", fontFamily: "inherit" }} /></div>
            </div>

            {/* Topic — presets + custom */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Topic</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
                {TOPICS.map(top => (
                  <button key={top} onClick={() => upd("topic", top)} style={{ padding: "5px 9px", borderRadius: "6px", border: m.topic === top ? `1.5px solid ${t.green}` : `1px solid ${t.border}`, background: m.topic === top ? `${t.green}15` : t.inputBg, color: m.topic === top ? t.green : t.textSecondary, fontSize: "9px", fontWeight: 600, cursor: "pointer" }}>{top}</button>
                ))}
              </div>
              <input value={m.topic} onChange={(e) => upd("topic", e.target.value)} placeholder="Or type a custom topic..." style={{ width: "100%", padding: "10px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "13px", outline: "none", fontFamily: "inherit" }} />
            </div>

            {/* Discussion points */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, color: t.textSecondary, marginBottom: "3px" }}>Discussion Points / Key Messages</div>
              <textarea value={m.points} onChange={(e) => upd("points", e.target.value)} rows={3} placeholder="What was discussed..." style={{ width: "100%", padding: "10px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "13px", outline: "none", resize: "vertical", fontFamily: "inherit" }} />
            </div>

            {/* Attendees */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Attendees ({m.attendees.length})</div>
              <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                <input id="newAttendee" placeholder="Add attendee name" onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { upd("attendees", [...m.attendees, e.target.value.trim()]); e.target.value = ""; }}} style={{ flex: 1, padding: "10px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "12px", outline: "none", fontFamily: "inherit" }} />
                <button onClick={() => { const el = document.getElementById("newAttendee"); if (el?.value.trim()) { upd("attendees", [...m.attendees, el.value.trim()]); el.value = ""; }}} style={{ padding: "10px 14px", borderRadius: "8px", background: t.green, border: "none", color: theme === "dark" ? "#000" : "#fff", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>+</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {m.attendees.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", background: t.inputBg, border: `1px solid ${t.border}`, fontSize: "10px", color: t.text }}>
                    {a}
                    <button onClick={() => upd("attendees", m.attendees.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: t.textTertiary, cursor: "pointer", fontSize: "10px", padding: "0 2px" }}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Action items */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Action Items</div>
              {m.actionItems.map((ai, i) => (
                <div key={i} style={{ display: "flex", gap: "4px", marginBottom: "4px", alignItems: "center" }}>
                  <input value={ai.action} onChange={(e) => { const items = [...m.actionItems]; items[i].action = e.target.value; upd("actionItems", items); }} placeholder="Action..." style={{ flex: 2, padding: "8px", borderRadius: "6px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "11px", outline: "none", fontFamily: "inherit" }} />
                  <input value={ai.assignee} onChange={(e) => { const items = [...m.actionItems]; items[i].assignee = e.target.value; upd("actionItems", items); }} placeholder="Who" style={{ flex: 1, padding: "8px", borderRadius: "6px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "11px", outline: "none", fontFamily: "inherit" }} />
                  <button onClick={() => upd("actionItems", m.actionItems.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: t.textTertiary, cursor: "pointer", fontSize: "12px" }}>✕</button>
                </div>
              ))}
              <button onClick={() => upd("actionItems", [...m.actionItems, { action: "", assignee: "", due: "" }])} style={{ fontSize: "11px", color: t.green, background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: "4px 0" }}>+ Add action item</button>
            </div>

            {/* Submit */}
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button onClick={() => { saveMeetings([m, ...meetingLogs]); setMeetingDraft(null); setTab("dashboard"); }} style={{ flex: 1, padding: "15px", borderRadius: "12px", border: "none", background: t.green, color: theme === "dark" ? "#000" : "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>Save Meeting Log</button>
              <button onClick={() => { saveMeetings([m, ...meetingLogs]); exportMeetingLog(m); }} style={{ padding: "15px", borderRadius: "12px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "15px", cursor: "pointer" }}>💾 Export</button>
            </div>
          </div>
        );
      })()}

      {/* ══════ TERMS OF SERVICE ══════ */}
      {tab === "tos" && (
        <div style={{ padding: "0 16px" }} className="rl-fade-in">
          <button onClick={() => setTab("tools")} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "16px" }}>‹ Tools</button>
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: t.green, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>RegLens by Prudence EHS</div>
            <h2 style={{ fontSize: "24px", fontWeight: 700, color: t.text, margin: "0 0 4px" }}>Terms of Service</h2>
            <p style={{ fontSize: "12px", color: t.textSecondary, margin: 0 }}>Effective Date: April 2, 2026</p>
          </div>

          {[
            { title: "1. Acceptance of Terms", body: "By accessing or using RegLens (the \"Platform\"), operated by Prudence Safety & Environmental Consulting, LLC (\"Prudence EHS\"), you agree to be bound by these Terms of Service. If you do not agree to these Terms, you may not access or use the Platform." },
            { title: "2. Description of Service", body: "RegLens is an AI-assisted EHS compliance analysis platform providing: AI-powered compliance document review, EHS readiness assessment checklists, AI-generated corrective action plans, citation response and draft abatement plan generation, report export and email delivery, and expert EHS consultation booking." },
            { title: "3. Advisory Nature — Critical Disclaimer", body: "ALL OUTPUTS GENERATED BY REGLENS ARE ADVISORY ONLY. The Platform does not guarantee regulatory compliance, does not constitute legal advice, and is not a substitute for consultation with a qualified safety professional, industrial hygienist, or attorney. Compliance reviews identify potential gaps based on AI analysis — they do not certify compliance. Readiness check scores are based on user-provided responses — they do not represent an official audit. Corrective action plans must be reviewed by a qualified professional before implementation. Citation response outputs are Draft Abatement Plan Worksheets — not formal abatement certifications or legal advice. THE USER RETAINS SOLE RESPONSIBILITY for all workplace safety decisions, regulatory compliance, and submissions to any regulatory agency.", important: true },
            { title: "4. Intellectual Property Rights", body: "The Platform, including its source code, algorithms, scoring methodology, AI prompt architecture, industry context matrix, citation verification registry, user interface design, and all associated documentation, is the exclusive property of Prudence Safety & Environmental Consulting, LLC. You may not: reverse engineer, decompile, or disassemble the Platform; scrape or systematically extract data to build a competing product; copy or reproduce the Platform's methodology; sublicense or distribute access without written authorization; or use automated means to access the Platform." },
            { title: "5. Trade Secrets", body: "The AI prompt architecture, deterministic scoring engine, industry context matrix, citation verification registry, and corrective action generation methodology constitute trade secrets of Prudence EHS. Unauthorized disclosure or use may result in civil liability under the Defend Trade Secrets Act (18 U.S.C. § 1836) and the Maryland Uniform Trade Secrets Act (Md. Code, Com. Law § 11-1201 et seq.)." },
            { title: "6. Payment Terms", body: "Compliance Reviews: $49 (1 review), $199 (5 reviews), $499 (15 reviews). Citation Response: $149 per citation. Expert Consultation: $149-$499. Readiness Checks and Corrective Action Plans are free. Payments processed by Stripe. Credits are non-refundable once applied. If a technical error prevents delivery, we will re-process or issue a credit." },
            { title: "7. User Responsibilities", body: "You agree to: provide accurate information; maintain account credential confidentiality; use the Platform only for lawful EHS compliance purposes; not upload malicious code; not generate fraudulent compliance documentation; review all AI outputs with professional judgment before acting; and not represent AI outputs as certified professional work unless reviewed by a qualified professional." },
            { title: "8. Data Handling and Privacy", body: "Uploaded documents are processed in memory and are not stored on our servers. Only analysis results (findings, scores, summaries) are retained in your account. Document text is transmitted to Anthropic's Claude API for analysis using their commercial API, which does not use your data for model training. Account data is stored with row-level security in Supabase." },
            { title: "9. Limitation of Liability", body: "TO THE MAXIMUM EXTENT PERMITTED BY LAW, PRUDENCE EHS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, including OSHA citations or penalties, regulatory non-compliance, business losses, workplace injuries, or reliance on AI-generated recommendations. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.", important: true },
            { title: "10. Indemnification", body: "You agree to indemnify and hold harmless Prudence EHS from any claims, damages, or expenses arising from your use of the Platform, violation of these Terms, reliance on outputs without professional review, or any regulatory action related to your use of the Platform's outputs." },
            { title: "11. Willful and Repeat Violation Warnings", body: "The Citation Response tool detects Willful and Repeat violation classifications and displays warnings recommending legal counsel. These warnings are informational and do not constitute legal advice." },
            { title: "12. Third-Party Services", body: "The Platform integrates with Anthropic (AI analysis), Stripe (payments), Supabase (database), and Calendly (scheduling). Prudence EHS is not responsible for third-party service availability or security." },
            { title: "13. Termination", body: "We may suspend or terminate your access at any time with or without cause. Upon termination, Sections 3, 4, 5, 9, 10, and 14 survive." },
            { title: "14. Governing Law", body: "These Terms are governed by the laws of the State of Maryland. Disputes shall be resolved through binding arbitration in Montgomery County, Maryland. You waive the right to a jury trial or class action." },
            { title: "15. Modifications", body: "We may modify these Terms at any time. Material changes will be communicated through the Platform or by email. Continued use constitutes acceptance." },
            { title: "16. Contact", body: "Prudence Safety & Environmental Consulting, LLC — Germantown, MD — info@prudencesafety.com — prudencesafety.com" },
          ].map((section, i) => (
            <div key={i} style={{ ...card, border: section.important ? `1px solid #F59E0B30` : `1px solid ${t.border}`, background: section.important ? (theme === "dark" ? "#2A201008" : "#FFFBEB08") : t.card }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: t.text, marginBottom: "6px" }}>{section.title}</div>
              <div style={{ fontSize: "11px", color: t.textSecondary, lineHeight: 1.7 }}>{section.body}</div>
            </div>
          ))}

          <div style={{ textAlign: "center", padding: "16px 0 24px" }}>
            <div style={{ fontSize: "10px", color: t.textTertiary }}>© 2026 Prudence Safety & Environmental Consulting, LLC</div>
            <div style={{ fontSize: "10px", color: t.textTertiary, marginTop: "2px" }}>All rights reserved.</div>
          </div>
        </div>
      )}

      {/* ══════ PRIVACY POLICY ══════ */}
      {tab === "privacy" && (
        <div style={{ padding: "0 16px" }} className="rl-fade-in">
          <button onClick={() => setTab("tools")} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "16px" }}>‹ Tools</button>
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: t.green, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>RegLens by Prudence EHS</div>
            <h2 style={{ fontSize: "24px", fontWeight: 700, color: t.text, margin: "0 0 4px" }}>Privacy Policy</h2>
            <p style={{ fontSize: "12px", color: t.textSecondary, margin: 0 }}>Effective Date: April 7, 2026</p>
          </div>

          {[
            { title: "1. Information We Collect", body: "Account Information: When you create an account, we collect your full name, email address, and optionally your company name. These are used to identify your account and deliver services.\n\nCompliance Data: When you run reviews or readiness checks, we store the analysis results (scores, findings, summaries) in your account. Uploaded documents are processed in memory and are NOT stored on our servers — only the analysis output is retained.\n\nUsage Data: We collect anonymous usage events (such as which features you use, scores generated, and industry selections) to improve RegLens. No personally identifiable information is included in usage events." },
            { title: "2. How We Use Your Data", body: "We use your data to:\n• Deliver compliance review results and readiness check scores\n• Save your review history and reports for your reference\n• Process payments for review credits and consultations\n• Improve the platform based on anonymous usage patterns\n• Communicate important service updates" },
            { title: "3. Analytics", body: "RegLens uses lightweight, first-party analytics stored in our own database. We do NOT use Google Analytics, tracking pixels, cookies, browser fingerprinting, or any third-party analytics service.\n\nWhat we track: Feature usage (which tools are used), review completion rates, score distributions by industry, and conversion events. All analytics events are anonymous — they include a random session ID that resets when you close the app, not your personal identity.\n\nYou can request that we stop collecting usage data for your account by emailing info@prudencesafety.com." },
            { title: "4. Third-Party Services", body: "RegLens integrates with the following services, each with their own privacy policies:\n\n• Anthropic (Claude API): Your document text is sent to Anthropic's commercial API for AI analysis. Anthropic's commercial API does not use your data for model training.\n• Stripe: Payment processing. We do not store your credit card details — Stripe handles this securely.\n• Supabase: Our database and authentication provider. Data is stored with row-level security.\n• Calendly: Used for booking expert consultations. Only accessed when you choose to book." },
            { title: "5. Data Retention & Deletion", body: "Your account data, review results, and readiness check history are retained until you request deletion. Analytics events are stored indefinitely in anonymized form (no PII).\n\nTo request deletion of your account and all associated data, email info@prudencesafety.com. We will process deletion requests within 30 days." },
            { title: "6. Your Rights", body: "You have the right to:\n• Request a copy of all data associated with your account\n• Request deletion of your account and all stored data\n• Opt out of anonymous usage analytics\n• Update or correct your account information\n\nFor any of these requests, contact info@prudencesafety.com." },
            { title: "7. Data Security", body: "We protect your data using:\n• Row-level security in our database (users can only access their own data)\n• Encrypted connections (HTTPS/TLS) for all data transmission\n• Bearer token authentication for API requests\n• No local storage of sensitive credentials beyond session tokens" },
            { title: "8. Children's Privacy", body: "RegLens is designed for EHS professionals and is not intended for use by individuals under 18 years of age. We do not knowingly collect data from children." },
            { title: "9. Changes to This Policy", body: "We may update this Privacy Policy from time to time. Material changes will be communicated through the Platform or by email. Continued use of RegLens after changes constitutes acceptance of the updated policy." },
            { title: "10. Contact", body: "Prudence Safety & Environmental Consulting, LLC\nGermantown, MD\ninfo@prudencesafety.com\nprudencesafety.com" },
          ].map((section, i) => (
            <div key={i} style={{ ...card, border: `1px solid ${t.border}` }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: t.text, marginBottom: "6px" }}>{section.title}</div>
              <div style={{ fontSize: "11px", color: t.textSecondary, lineHeight: 1.7, whiteSpace: "pre-line" }}>{section.body}</div>
            </div>
          ))}

          <div style={{ textAlign: "center", padding: "16px 0 24px" }}>
            <div style={{ fontSize: "10px", color: t.textTertiary }}>© 2026 Prudence Safety & Environmental Consulting, LLC</div>
            <div style={{ fontSize: "10px", color: t.textTertiary, marginTop: "2px" }}>All rights reserved.</div>
          </div>
        </div>
      )}

      {/* ══════ EHS READINESS CHECK ══════ */}
      {tab === "audit" && !auditResult && !auditIndustry && (
        <div style={{ padding: "0 16px" }}>
          <button onClick={() => setTab("dashboard")} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "16px" }}>‹ Back</button>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginBottom: "8px" }}><rect x="4" y="3" width="16" height="18" rx="2" stroke="#3B82F6" strokeWidth="1.5"/><path d="M9 9h6M9 13h4" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/><rect x="8" y="8" width="2" height="2" rx="0.5" fill="#3B82F6"/><rect x="8" y="12" width="2" height="2" rx="0.5" fill="#3B82F6" opacity="0.6"/><rect x="8" y="16" width="2" height="2" rx="0.5" fill="#3B82F6" opacity="0.3"/></svg>
            <h2 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 4px" }}>EHS Readiness Check</h2>
            <p style={{ fontSize: "14px", color: t.textSecondary, margin: 0, lineHeight: 1.5 }}>Evaluate your facility's EHS compliance with a guided checklist tailored to your industry.</p>
          </div>
          <div style={{ fontSize: "12px", fontWeight: 600, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px", padding: "0 4px" }}>Select Your Industry</div>
          <div className="rl-grid-2">
            {Object.entries(INDUSTRIES).map(([key, ind]) => {
              const sectionCount = getAuditSections(key).length;
              const itemCount = getAuditSections(key).reduce((a, s) => a + s.items.length, 0);
              return (
                <button key={key} onClick={() => { setAuditIndustry(key); setAuditSection(0); setAuditResponses({}); setAuditPhotos({}); setAuditNotes({}); setAuditResult(null); }} style={{ ...card, marginBottom: 0, border: `1px solid ${t.border}`, cursor: "pointer", textAlign: "left", padding: "16px 14px" }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = "#34C759"; e.currentTarget.style.background = "#2C2C2E"; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = "#2A2A2E"; e.currentTarget.style.background = "#1C1C1E"; }}>
                  <div style={{ fontSize: "28px", marginBottom: "8px" }}>{ind.icon}</div>
                  <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>{ind.label}</div>
                  <div style={{ fontSize: "11px", color: t.textSecondary }}>{sectionCount} sections · {itemCount} items</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════ AUDIT — CHECKLIST ══════ */}
      {tab === "audit" && auditIndustry && !auditResult && (() => {
        const sections = getAuditSections(auditIndustry);
        const currentSec = sections[auditSection];
        const totalItems = sections.reduce((a, s) => a + s.items.length, 0);
        const answeredItems = Object.keys(auditResponses).length;
        const progress = totalItems > 0 ? Math.round((answeredItems / totalItems) * 100) : 0;
        return (
          <div style={{ padding: "0 16px" }}>
            <button onClick={() => { if (auditSection > 0) setAuditSection(auditSection - 1); else setAuditIndustry(null); }} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "12px" }}>
              ‹ {auditSection > 0 ? "Previous Section" : "Back"}
            </button>

            {/* Progress */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "11px", color: t.textSecondary, fontWeight: 500 }}>
                  {INDUSTRIES[auditIndustry]?.icon} {INDUSTRIES[auditIndustry]?.label} — Section {auditSection + 1} of {sections.length}
                </span>
                <span style={{ fontSize: "11px", color: t.green, fontWeight: 600 }}>{progress}%</span>
              </div>
              <div style={{ height: "4px", borderRadius: "2px", background: t.card }}>
                <div style={{ height: "100%", borderRadius: "2px", background: "#34C759", width: `${progress}%`, transition: "width 0.3s" }} />
              </div>
            </div>

            {/* Section progress */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "12px", alignItems: "center" }}>
              {sections.map((sec, si) => (
                <button key={si} onClick={() => setAuditSection(si)} style={{
                  flex: 1, height: "4px", borderRadius: "2px", border: "none", cursor: "pointer", padding: 0,
                  background: si === auditSection ? "#34C759" : si < auditSection ? "#34C75960" : "#2A2A2E",
                }} title={sec.title} />
              ))}
            </div>
            <div style={{ fontSize: "11px", color: t.textSecondary, marginBottom: "8px", textAlign: "center" }}>
              Section {auditSection + 1} of {sections.length}
            </div>

            {/* Section header */}
            <div style={{ ...card, display: "flex", alignItems: "center", gap: "12px", border: `1px solid ${t.border}` }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: t.card, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px" }}>{currentSec.icon}</div>
              <div>
                <div style={{ fontSize: "16px", fontWeight: 700 }}>{currentSec.title}</div>
                <div style={{ fontSize: "12px", color: t.textSecondary }}>{currentSec.items.length} items</div>
              </div>
            </div>

            {/* Quick-fill for this section */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
              {[
                { val: "yes", label: "All Yes", color: "#34C759" },
                { val: "partial", label: "All Partial", color: "#F59E0B" },
                { val: "no", label: "All No", color: "#EF4444" },
                { val: "na", label: "All N/A", color: t.textSecondary },
              ].map((opt) => {
                const allMatch = currentSec.items.every(i => auditResponses[i.id] === opt.val);
                return (
                  <button key={opt.val} onClick={() => {
                    setAuditResponses(prev => {
                      const updated = { ...prev };
                      currentSec.items.forEach(i => { updated[i.id] = opt.val; });
                      return updated;
                    });
                  }} style={{
                    padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                    border: allMatch ? `1.5px solid ${opt.color}` : `1.5px solid ${t.border}`,
                    background: allMatch ? `${opt.color}15` : t.inputBg,
                    color: allMatch ? opt.color : "#555",
                  }}>{opt.label}</button>
                );
              })}
              <button onClick={() => {
                setAuditResponses(prev => {
                  const updated = { ...prev };
                  currentSec.items.forEach(i => { delete updated[i.id]; });
                  return updated;
                });
              }} style={{
                padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
                border: `1.5px solid ${t.border}`, background: t.inputBg, color: t.textTertiary, marginLeft: "auto",
              }}>Clear</button>
            </div>

            {/* Checklist items */}
            {currentSec.items.map((item) => {
              const answer = auditResponses[item.id];
              const photos = auditPhotos[item.id] || [];
              const sevColors = { Critical: "#EF4444", Major: "#F59E0B", Minor: "#3B82F6" };
              return (
                <div key={item.id} style={{ ...cardFlat, border: `1px solid ${answer === "no" ? "#EF444425" : answer === "partial" ? "#F59E0B25" : answer === "yes" ? "#34C75925" : "#2A2A2E"}` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: `${sevColors[item.severity]}15`, color: sevColors[item.severity], textTransform: "uppercase", marginTop: "2px", flexShrink: 0 }}>{item.severity}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: t.text, lineHeight: 1.4, marginBottom: "4px" }}>{item.text}</div>
                      <div style={{ fontSize: "10px", color: t.textSecondary, fontFamily: "monospace" }}>{item.reg}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px", marginBottom: photos.length > 0 ? "10px" : "0" }}>
                    {[
                      { val: "yes", label: "Yes", color: "#34C759" },
                      { val: "partial", label: "Partial", color: "#F59E0B" },
                      { val: "no", label: "No", color: "#EF4444" },
                      { val: "na", label: "N/A", color: t.textSecondary },
                    ].map((opt) => (
                      <button key={opt.val} className="rl-pop" onClick={() => setAuditResponses(prev => ({ ...prev, [item.id]: opt.val }))} style={{
                        flex: 1, padding: "8px 4px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                        border: answer === opt.val ? `1.5px solid ${opt.color}` : `1.5px solid ${t.border}`,
                        background: answer === opt.val ? `${opt.color}15` : t.inputBg,
                        color: answer === opt.val ? opt.color : "#555",
                      }}>{opt.label}</button>
                    ))}
                    {/* Photo button */}
                    <button onClick={() => document.getElementById(`photo-${item.id}`)?.click()} style={{
                      padding: "8px 10px", borderRadius: "8px", fontSize: "14px", cursor: "pointer",
                      border: photos.length > 0 ? "1.5px solid #3B82F6" : "1.5px solid #2A2A2E",
                      background: photos.length > 0 ? "#3B82F615" : "#111",
                      color: photos.length > 0 ? "#3B82F6" : "#555",
                      position: "relative",
                    }}>
                      📷
                      {photos.length > 0 && <span style={{ position: "absolute", top: "-4px", right: "-4px", width: "16px", height: "16px", borderRadius: "50%", background: "#3B82F6", color: t.text, fontSize: "9px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{photos.length}</span>}
                    </button>
                    <input
                      id={`photo-${item.id}`}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        files.forEach(file => {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setAuditPhotos(prev => ({
                              ...prev,
                              [item.id]: [...(prev[item.id] || []), {
                                dataUrl: ev.target.result,
                                timestamp: new Date().toLocaleTimeString(),
                                name: file.name,
                              }]
                            }));
                          };
                          reader.readAsDataURL(file);
                        });
                        e.target.value = "";
                      }}
                    />
                  </div>
                  {/* Photo thumbnails */}
                  {photos.length > 0 && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {photos.map((photo, pi) => (
                        <div key={pi} style={{ position: "relative", width: "56px", height: "56px", borderRadius: "8px", overflow: "hidden", border: `1px solid ${t.border}` }}>
                          <img src={photo.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <button onClick={(e) => {
                            e.stopPropagation();
                            setAuditPhotos(prev => ({
                              ...prev,
                              [item.id]: prev[item.id].filter((_, idx) => idx !== pi)
                            }));
                          }} style={{
                            position: "absolute", top: "2px", right: "2px",
                            width: "16px", height: "16px", borderRadius: "50%",
                            background: "rgba(0,0,0,0.7)", border: "none", color: "#fff",
                            fontSize: "10px", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>✕</button>
                          <div style={{ position: "absolute", bottom: "0", left: "0", right: "0", background: "rgba(0,0,0,0.6)", fontSize: "7px", color: t.text, textAlign: "center", padding: "1px" }}>{photo.timestamp}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Notes */}
                  <div style={{ marginTop: (photos.length > 0 || auditNotes[item.id]) ? "8px" : "6px" }}>
                    {auditNotes[item.id] !== undefined ? (
                      <textarea
                        value={auditNotes[item.id] || ""}
                        onChange={(e) => setAuditNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                        placeholder="Add inspection notes..."
                        rows={2}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, fontSize: "12px", lineHeight: 1.5, resize: "vertical", outline: "none", fontFamily: "inherit" }}
                      />
                    ) : (
                      <button onClick={() => setAuditNotes(prev => ({ ...prev, [item.id]: "" }))} style={{
                        background: "none", border: "none", padding: "2px 0", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: "4px",
                        fontSize: "11px", color: t.textTertiary,
                      }}>
                        <span>📝</span> Add note
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add custom checklist item */}
            <details style={{ marginTop: "8px", marginBottom: "8px" }}>
              <summary style={{ fontSize: "11px", color: t.green, cursor: "pointer", fontWeight: 600, padding: "8px 0" }}>+ Add a custom checklist item to this section</summary>
              <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                <input id="customItemText" placeholder="Item description..." style={{ flex: 2, minWidth: "150px", padding: "8px 10px", borderRadius: "6px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "11px", outline: "none", fontFamily: "inherit" }} />
                <input id="customItemReg" placeholder="Regulation (optional)" style={{ flex: 1, minWidth: "100px", padding: "8px 10px", borderRadius: "6px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "11px", outline: "none", fontFamily: "inherit" }} />
                <select id="customItemSev" defaultValue="Major" style={{ padding: "8px", borderRadius: "6px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "11px", fontFamily: "inherit" }}>
                  <option value="Critical">Critical</option>
                  <option value="Major">Major</option>
                  <option value="Minor">Minor</option>
                </select>
                <button onClick={() => {
                  const textEl = document.getElementById("customItemText");
                  const regEl = document.getElementById("customItemReg");
                  const sevEl = document.getElementById("customItemSev");
                  if (!textEl?.value.trim()) return;
                  const newItem = {
                    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
                    text: textEl.value.trim(),
                    reg: regEl?.value.trim() || "Site-Specific",
                    severity: sevEl?.value || "Major",
                    sectionId: currentSec.id,
                    custom: true,
                  };
                  const key = auditIndustry || "_universal";
                  const updated = { ...customItems, [key]: [...(customItems[key] || []), newItem] };
                  saveCustomItems(updated);
                  textEl.value = ""; regEl.value = "";
                }} style={{ padding: "8px 14px", borderRadius: "6px", background: t.green, border: "none", color: theme === "dark" ? "#000" : "#fff", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>Add</button>
              </div>
            </details>

            {/* Show custom items for this section */}
            {(customItems[auditIndustry] || []).filter(ci => ci.sectionId === currentSec.id).map(ci => (
              <div key={ci.id} style={{ ...cardFlat, border: `1px dashed ${t.border}`, display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 5px", borderRadius: "3px", background: `${t.green}15`, color: t.green }}>CUSTOM</span>
                    <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: `${sevColors[ci.severity]}15`, color: sevColors[ci.severity], textTransform: "uppercase" }}>{ci.severity}</span>
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: t.text, lineHeight: 1.4, marginBottom: "4px" }}>{ci.text}</div>
                  <div style={{ fontSize: "10px", color: t.textSecondary, fontFamily: "monospace" }}>{ci.reg}</div>
                  {/* Response buttons for custom item */}
                  <div style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
                    {[{ val: "yes", label: "Yes", color: "#34C759" }, { val: "partial", label: "Partial", color: "#F59E0B" }, { val: "no", label: "No", color: "#EF4444" }, { val: "na", label: "N/A", color: t.textSecondary }].map(opt => (
                      <button key={opt.val} onClick={() => setAuditResponses(prev => ({ ...prev, [ci.id]: opt.val }))} style={{ padding: "5px 10px", borderRadius: "6px", border: auditResponses[ci.id] === opt.val ? `1.5px solid ${opt.color}` : `1px solid ${t.border}`, background: auditResponses[ci.id] === opt.val ? `${opt.color}15` : t.inputBg, color: auditResponses[ci.id] === opt.val ? opt.color : t.textTertiary, fontSize: "10px", fontWeight: 600, cursor: "pointer" }}>{opt.label}</button>
                    ))}
                  </div>
                </div>
                <button onClick={() => {
                  const key = auditIndustry || "_universal";
                  const updated = { ...customItems, [key]: (customItems[key] || []).filter(c => c.id !== ci.id) };
                  saveCustomItems(updated);
                }} style={{ background: "none", border: "none", color: t.textTertiary, fontSize: "12px", cursor: "pointer", padding: "2px", flexShrink: 0 }}>✕</button>
              </div>
            ))}

            {/* Navigation */}
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              {auditSection > 0 && (
                <button onClick={() => setAuditSection(auditSection - 1)} style={{ padding: "15px 20px", borderRadius: "14px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "15px", fontWeight: 600, cursor: "pointer" }}>
                  ← Back
                </button>
              )}
              {auditSection < sections.length - 1 ? (
                <button onClick={() => setAuditSection(auditSection + 1)} style={{ flex: 1, padding: "15px", borderRadius: "14px", background: t.green, border: "none", color: theme === "dark" ? "#000" : "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>
                  Next Section →
                </button>
              ) : (
                <button onClick={() => {
                  const allItems = [...sections.flatMap(s => s.items), ...(customItems[auditIndustry] || [])];
                  const result = computeAuditScore(allItems, auditResponses);
                  setAuditResult(result);
                  clearCheckpoint();
                  const refId = `AUD-${Date.now().toString(36).toUpperCase().slice(-6)}`;
                  const sub = {
                    id: refId,
                    industry: auditIndustry, industryLabel: INDUSTRIES[auditIndustry]?.label,
                    icon: INDUSTRIES[auditIndustry]?.icon,
                    date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                    score: result.score, band: result.band, stats: result.stats, findingsCount: result.findings.length,
                    clientId: selectedClient?.id || null,
                  };
                  setAuditSubmissions(prev => [sub, ...prev]);

                  supabase.trackEvent("readiness_completed", { industry: auditIndustry, score: result.score, band: result.band, findings_count: result.findings.length });

                  // Achievement — first readiness check
                  if (!hasSeen("ach_readiness")) {
                    markSeen("ach_readiness");
                    setTimeout(() => showAchievement("Readiness Check Complete!", "Export your report or generate a Corrective Action Plan from your findings."), 800);
                  }

                  // Consume readiness credit

                  // Persist to Supabase (or queue for sync if offline)
                  if (supabase.isConfigured) {
                    (async () => {
                      const dbRow = {
                        audit_ref: refId,
                        client_id: selectedClient?.id || null,
                        industry: auditIndustry,
                        industry_label: INDUSTRIES[auditIndustry]?.label || "",
                        score: result.score,
                        band: result.band,
                        stats: result.stats,
                        findings: result.findings,
                        responses: auditResponses,
                        findings_count: result.findings.length,
                      };
                      if (!navigator.onLine) {
                        addToSyncQueue({ action: "createAudit", data: dbRow });
                        return;
                      }
                      const auditRows = await supabase.createAudit(dbRow);
                      const auditDbId = auditRows?.[0]?.id;

                      // Upload photos to storage
                      if (auditDbId) {
                        for (const [itemId, photos] of Object.entries(auditPhotos)) {
                          for (const photo of photos) {
                            try {
                              // Convert dataUrl to blob
                              const resp = await fetch(photo.dataUrl);
                              const blob = await resp.blob();
                              const ext = blob.type.includes("png") ? "png" : "jpg";
                              const path = `${auditDbId}/${itemId}/${Date.now()}.${ext}`;
                              const publicUrl = await supabase.uploadPhoto(path, blob);
                              if (publicUrl) {
                                await supabase.createPhotoRecord({
                                  audit_id: auditDbId,
                                  item_id: itemId,
                                  storage_path: publicUrl,
                                  original_name: photo.name || "",
                                  timestamp: photo.timestamp || "",
                                });
                              }
                            } catch (e) { console.error("Photo upload failed:", e); }
                          }
                        }
                      }
                    })();
                  }
                }} style={{ flex: 1, padding: "15px", borderRadius: "14px", background: t.green, border: "none", color: theme === "dark" ? "#000" : "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>
                  See My Readiness Score ✓
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ══════ AUDIT — RESULTS ══════ */}
      {tab === "audit" && auditResult && (
        <div style={{ padding: "0 16px" }}>
          <button onClick={() => { setAuditResult(null); setAuditIndustry(null); setAuditSection(0); setAuditResponses({}); setAuditPhotos({}); setAuditNotes({}); clearCheckpoint(); }} style={{ background: "none", border: "none", color: t.green, fontSize: "15px", fontWeight: 500, cursor: "pointer", padding: "0 4px", marginBottom: "16px" }}>‹ New Readiness Check</button>

          {/* Disclaimer */}
          <div style={{ padding: "10px 14px", borderRadius: "10px", marginBottom: "12px", background: t.card, border: "1px solid #F59E0B20", display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <span style={{ fontSize: "12px", flexShrink: 0, marginTop: "1px" }}>⚠️</span>
            <div style={{ fontSize: "9px", color: t.textSecondary, lineHeight: 1.5 }}>
              <strong style={{ color: "#F59E0B" }}>Disclaimer:</strong> This readiness check is advisory only and based on your self-reported responses. It does not constitute a formal compliance audit or legal opinion.
            </div>
          </div>

          {/* Score */}
          <div style={{ ...card, textAlign: "center", background: t.scoreBg }}>
            <div style={{ fontSize: "12px", color: t.textSecondary, fontWeight: 500, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px" }}>Readiness Score</div>
            <ScoreRing score={auditResult.score} band={auditResult.band} size={120} />
            <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "10px", marginBottom: "4px" }}>
              {INDUSTRIES[auditIndustry]?.icon} {INDUSTRIES[auditIndustry]?.label}
            </div>
            <div style={{ fontSize: "13px", color: t.textSecondary }}>EHS Readiness Check</div>

            {/* Stats */}
            <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginTop: "12px", flexWrap: "wrap" }}>
              {[
                { label: "Compliant", val: auditResult.stats.yes, color: "#34C759" },
                { label: "Partial", val: auditResult.stats.partial, color: "#F59E0B" },
                { label: "Non-Compliant", val: auditResult.stats.no, color: "#EF4444" },
                { label: "N/A", val: auditResult.stats.na, color: t.textSecondary },
              ].map((s, i) => (
                <div key={s.label} className="rl-stat-pill" style={{ padding: "6px 10px", borderRadius: "8px", background: `${s.color}10`, border: `1px solid ${s.color}20`, animation: `rlFadeIn 0.3s ease-out ${0.6 + i * 0.1}s both` }}>
                  <span style={{ fontSize: "16px", fontWeight: 700, color: s.color }}>{s.val}</span>
                  <span style={{ fontSize: "10px", color: s.color, marginLeft: "4px" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Critical Flag Warning */}
          {auditResult.criticalFlag && (
            <div style={{ padding: "14px", borderRadius: "12px", marginBottom: "12px", background: theme === "dark" ? "#2A1215" : "#FEF2F2", border: theme === "dark" ? "1px solid #EF444430" : "2px solid #DC2626" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#EF4444", marginBottom: "6px" }}>🚩 Critical Compliance Flags</div>
              <div style={{ fontSize: "11px", color: t.textSecondary, marginBottom: "8px" }}>The following critical deficiencies were detected regardless of overall score:</div>
              {auditResult.criticalReasons.map((reason, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ color: "#EF4444", fontSize: "10px", flexShrink: 0, marginTop: "2px" }}>⚠</span>
                  <span style={{ fontSize: "11px", color: t.text, lineHeight: 1.4 }}>{reason}</span>
                </div>
              ))}
            </div>
          )}

          {/* Category Breakdown */}
          {auditResult.categories && (
            <div style={{ ...card, border: `1px solid ${t.border}` }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px" }}>Category Breakdown</div>
              {Object.entries(auditResult.categories).map(([key, cat]) => {
                const pct = cat.notApplicable ? null : cat.weight > 0 ? Math.round((cat.score / cat.weight) * 100) : 0;
                const barColor = pct === null ? t.textTertiary : pct >= 80 ? "#34C759" : pct >= 60 ? "#F59E0B" : "#EF4444";
                return (
                  <div key={key} style={{ marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: t.text }}>{cat.icon} {cat.name}</span>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: cat.notApplicable ? t.textTertiary : barColor }}>
                        {cat.notApplicable ? "N/A" : `${cat.score}/${cat.weight}`}
                      </span>
                    </div>
                    <div style={{ height: "4px", borderRadius: "2px", background: t.inputBg }}>
                      <div style={{ height: "100%", borderRadius: "2px", background: barColor, width: cat.notApplicable ? "0%" : `${pct}%`, transition: "width 0.5s ease" }} />
                    </div>
                    {cat.penaltiesApplied && cat.penaltiesApplied.length > 0 && (
                      <div style={{ fontSize: "9px", color: "#EF4444", marginTop: "2px" }}>Penalty deductions: {cat.penaltiesApplied.join(", ")}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Expert Consultation CTA for score < 70 */}
          {auditResult.score < 70 && (
            <div style={{
              ...card, background: theme === "dark" ? "linear-gradient(135deg, #1a0a0a, #2A1215)" : "linear-gradient(135deg, #FEF2F2, #FFF1F2)",
              border: "1px solid #EF444435", padding: "20px", position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: "-30px", right: "-30px", width: "100px", height: "100px", borderRadius: "50%", background: "radial-gradient(circle, #EF444415, transparent)", pointerEvents: "none" }} />
              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", position: "relative", zIndex: 1 }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #EF444420, #F59E0B15)", border: `1px solid ${theme === "dark" ? "#EF444430" : "#FECACA"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0 }}>🛡️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: t.text, marginBottom: "4px" }}>Your facility needs attention</div>
                  <div style={{ fontSize: "13px", color: t.textSecondary, lineHeight: 1.5, marginBottom: "4px" }}>
                    A score of <span style={{ color: "#EF4444", fontWeight: 700 }}>{auditResult.score}</span> indicates
                    {auditResult.score < 60 ? " significant compliance gaps across multiple areas." : " several areas that could trigger OSHA citations."}
                  </div>
                  <div style={{ fontSize: "11px", color: t.textSecondary }}>
                    {auditResult.findings.filter(f => f.severity === "Critical").length} critical + {auditResult.findings.filter(f => f.severity === "Major").length} major gaps identified
                  </div>
                </div>
              </div>
              <button onClick={() => setShowBooking(true)} style={{
                width: "100%", padding: "14px", borderRadius: "12px", border: "none", cursor: "pointer", marginTop: "14px",
                background: "linear-gradient(135deg, #EF4444, #DC2626)", color: "#fff", fontSize: "15px", fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", position: "relative", zIndex: 1,
              }}>
                <span>📅</span> Book an Expert Consultation
              </button>
              <div style={{ textAlign: "center", marginTop: "8px", fontSize: "11px", color: t.textSecondary, position: "relative", zIndex: 1 }}>
                30-min sessions from $149 · Expert EHS consultation
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "10px", position: "relative", zIndex: 1 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6v6c0 5.5 3.4 10.3 8 12 4.6-1.7 8-6.5 8-12V6l-8-4z" stroke={t.green} strokeWidth="2" fill={`${t.green}15`}/><path d="M9 12l2 2 4-4" stroke={t.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span style={{ fontSize: "9px", color: t.textSecondary }}>CSP-certified · 13+ years federal & private sector EHS experience</span>
              </div>
            </div>
          )}

          {/* Findings from audit */}
          {auditResult.findings.length > 0 && (
            <>
              <div style={{ padding: "0 4px", marginBottom: "8px", marginTop: "16px" }}>
                <span style={{ fontSize: "22px", fontWeight: 700 }}>Gaps Identified ({auditResult.findings.length})</span>
              </div>
              {auditResult.findings.map((f, i) => {
                const sevC = { Critical: "#EF4444", Major: "#F59E0B", Minor: "#3B82F6" };
                const sevBgC = { Critical: theme === "dark" ? "#2A1215" : "#FEF2F2", Major: theme === "dark" ? "#2A2010" : "#FFFBEB", Minor: theme === "dark" ? "#101C2E" : "#EFF6FF" };
                return (
                  <div key={i} style={{ ...cardFlat, borderLeft: `3px solid ${sevC[f.severity]}`, border: `1px solid ${sevC[f.severity]}20`, borderLeftWidth: "3px", borderLeftColor: sevC[f.severity] }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px", background: sevBgC[f.severity], color: sevC[f.severity], textTransform: "uppercase" }}>{f.severity}</span>
                      <span style={{ fontSize: "9px", fontWeight: 600, padding: "2px 7px", borderRadius: "6px", background: f.status === "no" ? "#EF444412" : "#F59E0B12", color: f.status === "no" ? "#EF4444" : "#F59E0B" }}>{f.status === "no" ? "NOT IN PLACE" : "PARTIALLY IN PLACE"}</span>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: t.text, lineHeight: 1.4, marginBottom: "4px" }}>{f.text}</div>
                    <div style={{ fontSize: "11px", color: t.green, fontFamily: "monospace" }}>{f.reg}</div>
                  </div>
                );
              })}
            </>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
            <button onClick={() => { setAuditResult(null); setAuditIndustry(null); setAuditSection(0); setAuditResponses({}); setAuditPhotos({}); setAuditNotes({}); clearCheckpoint(); setCapData(null); }} style={{ flex: 1, minWidth: "120px", padding: "15px", borderRadius: "14px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "15px", fontWeight: 600, cursor: "pointer" }}>Start New Check</button>
            <button onClick={() => exportAuditReport(auditResult, auditResponses, auditIndustry, auditPhotos, auditNotes)} style={{ flex: 1, minWidth: "120px", padding: "15px", borderRadius: "14px", background: t.green, border: "none", color: theme === "dark" ? "#000" : "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>Download Report</button>
            <button className="rl-tap" onClick={() => setEmailModal({ type: "readiness", data: { industry: INDUSTRIES[auditIndustry]?.label, score: auditResult.score, band: auditResult.band, yes: auditResult.stats?.yes || 0, partial: auditResult.stats?.partial || 0, no: auditResult.stats?.no || 0, na: auditResult.stats?.na || 0, gaps: auditResult.findings?.length || 0 } })} style={{ padding: "15px", borderRadius: "14px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "15px", cursor: "pointer" }}>✉️</button>
          </div>

          {/* ── Corrective Action Plan ── */}
          {auditResult.findings.length > 0 && (
            <div style={{ marginTop: "20px" }}>
              <div style={{ ...card, border: "1px solid #3B82F625", background: theme === "dark" ? "linear-gradient(160deg, #101C2E, #1C1C1E)" : "linear-gradient(160deg, #EFF6FF, #FFFFFF)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "24px" }}>📋</span>
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 700 }}>Draft Corrective Action Plan</div>
                    <div style={{ fontSize: "12px", color: t.textSecondary }}>AI-generated remediation roadmap based on your gaps</div>
                  </div>
                </div>
                {!capData ? (
                  <>
                    <div style={{ fontSize: "11px", color: t.textSecondary, lineHeight: 1.6, marginBottom: "12px" }}>
                      Get a prioritized action plan with specific corrective actions, responsible parties, timelines, and verification criteria for each gap identified in your readiness check.
                    </div>
                    {/* Gate: first CAP free, subsequent require free account */}
                    {(() => {
                      const capCount = (() => { try { return parseInt(localStorage.getItem("rl_cap_count") || "0"); } catch { return 0; } })();
                      const needsAccount = capCount >= 1 && !user && !adminMode;

                      if (needsAccount) {
                        return (
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "12px", color: t.text, fontWeight: 600, marginBottom: "4px" }}>Create a free account to generate more CAPs</div>
                            <div style={{ fontSize: "11px", color: t.textSecondary, marginBottom: "12px", lineHeight: 1.5 }}>Your first corrective action plan was free. Sign up to generate unlimited CAPs — still free, no credit card needed.</div>
                            <button className="rl-tap rl-glow" onClick={() => setAuthScreen("signup")} style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: t.green, color: theme === "dark" ? "#000" : "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>
                              Create Free Account
                            </button>
                          </div>
                        );
                      }

                      return (
                        <>
                    <button
                      disabled={capLoading}
                      onClick={async () => {
                        setCapLoading(true);
                        // Track CAP usage
                        try { const c = parseInt(localStorage.getItem("rl_cap_count") || "0"); localStorage.setItem("rl_cap_count", String(c + 1)); } catch {}
                        try {
                          const prompt = buildCAPPrompt(auditResult.findings, auditIndustry, auditNotes);
                          let responseText = "";

                          // Try API proxy first, fallback to direct
                          try {
                            const res = await fetch("/api/claude", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ prompt, max_tokens: 4000 }),
                            });
                            const data = await res.json();
                            responseText = data.content?.[0]?.text || data.text || data.result || "";
                          } catch {
                            // Fallback to direct API (for artifact sandbox)
                            const res = await fetch("https://api.anthropic.com/v1/messages", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                model: "claude-sonnet-4-20250514",
                                max_tokens: 4000,
                                messages: [{ role: "user", content: prompt }],
                              }),
                            });
                            const data = await res.json();
                            responseText = data.content?.[0]?.text || "";
                          }

                          // Parse JSON response
                          const cleaned = responseText.replace(/```json\s*/g, "").replace(/```/g, "").trim();
                          const actions = JSON.parse(cleaned);

                          if (Array.isArray(actions) && actions.length > 0) {
                            setCapData({ actions, generatedAt: new Date().toISOString(), industry: auditIndustry });
                          } else {
                            alert("Could not generate corrective actions. Please try again.");
                          }
                        } catch (err) {
                          console.error("CAP generation error:", err);
                          // Fallback — generate from findings directly
                          const fallbackActions = auditResult.findings.map((f, i) => ({
                            finding: f.text,
                            regulation: f.reg,
                            severity: f.severity,
                            corrective_action: `Address this ${f.severity.toLowerCase()} gap by implementing controls to meet ${f.reg} requirements. Develop a written procedure, train affected employees, and document compliance.`,
                            responsible_party: f.severity === "Critical" ? "Safety Manager" : "Facility Manager",
                            timeline: f.severity === "Critical" ? "Immediate (1-7 days)" : f.severity === "Major" ? "Short-term (30 days)" : "Standard (90 days)",
                            verification: `Documented evidence of corrective action completion, including written procedures, training records, and physical verification of controls in place.`,
                            resources: "To be determined based on scope",
                            priority: i + 1,
                          }));
                          setCapData({ actions: fallbackActions, generatedAt: new Date().toISOString(), industry: auditIndustry, isFallback: true });
                        }
                        setCapLoading(false);
                      }}
                      style={{
                        width: "100%", padding: "14px", borderRadius: "12px", border: "none", cursor: capLoading ? "wait" : "pointer",
                        background: capLoading ? "#2C2C2E" : "linear-gradient(135deg, #3B82F6, #2563EB)",
                        color: capLoading ? "#555" : "#fff", fontSize: "15px", fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                      }}>
                      {capLoading ? (
                        <>
                          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</span>
                          Generating corrective actions…
                        </>
                      ) : (
                        <>📋 Get My Corrective Action Plan — Free</>
                      )}
                    </button>
                    <div style={{ textAlign: "center", marginTop: "6px", fontSize: "10px", color: t.textTertiary }}>
                      {user ? "Unlimited CAPs with your account" : "First CAP free · Create account for unlimited"}
                    </div>
                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    {/* CAP Generated — show summary and actions */}
                    {capData.isFallback && (
                      <div style={{ padding: "8px 12px", borderRadius: "8px", marginBottom: "12px", background: theme === "dark" ? "#2A2010" : "#FFFBEB", border: theme === "dark" ? "1px solid #F59E0B20" : "1px solid #FDE68A", fontSize: "11px", color: "#F59E0B" }}>
                        ⚠️ AI was unavailable. Showing template corrective actions — review and customize for your facility.
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                      <div style={{ padding: "6px 10px", borderRadius: "8px", background: "#EF444410", border: "1px solid #EF444420" }}>
                        <span style={{ fontSize: "14px", fontWeight: 700, color: "#EF4444" }}>{capData.actions.filter(a => a.severity === "Critical").length}</span>
                        <span style={{ fontSize: "10px", color: "#EF4444", marginLeft: "4px" }}>Critical</span>
                      </div>
                      <div style={{ padding: "6px 10px", borderRadius: "8px", background: "#F59E0B10", border: "1px solid #F59E0B20" }}>
                        <span style={{ fontSize: "14px", fontWeight: 700, color: "#F59E0B" }}>{capData.actions.filter(a => a.severity === "Major").length}</span>
                        <span style={{ fontSize: "10px", color: "#F59E0B", marginLeft: "4px" }}>Major</span>
                      </div>
                      <div style={{ padding: "6px 10px", borderRadius: "8px", background: "#3B82F610", border: "1px solid #3B82F620" }}>
                        <span style={{ fontSize: "14px", fontWeight: 700, color: "#3B82F6" }}>{capData.actions.filter(a => a.severity === "Minor").length}</span>
                        <span style={{ fontSize: "10px", color: "#3B82F6", marginLeft: "4px" }}>Minor</span>
                      </div>
                    </div>

                    {/* Individual actions */}
                    {capData.actions.map((action, i) => {
                      const sevC = { Critical: "#EF4444", Major: "#F59E0B", Minor: "#3B82F6" };
                      const sevBg = { Critical: theme === "dark" ? "#2A1215" : "#FEF2F2", Major: theme === "dark" ? "#2A2010" : "#FFFBEB", Minor: theme === "dark" ? "#101C2E" : "#EFF6FF" };
                      const track = capTracking[i] || {};
                      const statusColors = { open: "#EF4444", "in-progress": "#F59E0B", complete: "#22c55e" };
                      return (
                        <div key={i} style={{ ...cardFlat, borderLeft: `3px solid ${sevC[action.severity]}`, marginBottom: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "10px", fontWeight: 700, color: t.textTertiary }}>#{i + 1}</span>
                            <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: sevBg[action.severity], color: sevC[action.severity], textTransform: "uppercase" }}>{action.severity}</span>
                            <span style={{ fontSize: "9px", color: t.green, fontFamily: "monospace" }}>{action.regulation}</span>
                          </div>
                          <div style={{ fontSize: "12px", fontWeight: 600, color: t.text, marginBottom: "6px" }}>{action.finding}</div>
                          <div style={{ fontSize: "11px", color: t.textSecondary, lineHeight: 1.5, marginBottom: "8px" }}>{action.corrective_action}</div>

                          {/* Tracking fields */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "6px" }}>
                            <div>
                              <div style={{ fontSize: "8px", fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", marginBottom: "2px" }}>Assigned To</div>
                              <input value={track.assignee || ""} onChange={(e) => updateCapTracking(i, "assignee", e.target.value)} placeholder={action.responsible_party || "Name..."} style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "11px", outline: "none", fontFamily: "inherit" }} />
                            </div>
                            <div>
                              <div style={{ fontSize: "8px", fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", marginBottom: "2px" }}>Due Date</div>
                              <input type="date" value={track.dueDate || ""} onChange={(e) => updateCapTracking(i, "dueDate", e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, fontSize: "11px", outline: "none", fontFamily: "inherit" }} />
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "8px", fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", marginBottom: "3px" }}>Status</div>
                            <div style={{ display: "flex", gap: "4px" }}>
                              {[{ val: "open", label: "Open" }, { val: "in-progress", label: "In Progress" }, { val: "complete", label: "Complete" }].map(s => (
                                <button key={s.val} onClick={() => updateCapTracking(i, "status", s.val)} style={{ flex: 1, padding: "5px 4px", borderRadius: "6px", border: (track.status || "open") === s.val ? `1.5px solid ${statusColors[s.val]}` : `1px solid ${t.border}`, background: (track.status || "open") === s.val ? `${statusColors[s.val]}15` : t.inputBg, color: (track.status || "open") === s.val ? statusColors[s.val] : t.textTertiary, fontSize: "9px", fontWeight: 600, cursor: "pointer" }}>{s.label}</button>
                              ))}
                            </div>
                          </div>

                          <div style={{ fontSize: "10px", color: t.textTertiary, marginTop: "6px" }}>
                            <span>Verify:</span> <span style={{ color: "#6b7280" }}>{action.verification}</span>
                          </div>
                        </div>
                      );
                    })}

                    {/* CAP action buttons */}
                    <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                      <button onClick={() => exportCAPReport(capData, auditResult, auditIndustry)} style={{ flex: 1, padding: "14px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #3B82F6, #2563EB)", color: "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>
                        Export CAP
                      </button>
                      <button className="rl-tap" onClick={() => setEmailModal({ type: "cap", data: { industry: INDUSTRIES[auditIndustry]?.label, actionCount: capData.actions?.length || 0, critical: capData.actions?.filter(a => a.severity === "Critical").length || 0, major: capData.actions?.filter(a => a.severity === "Major").length || 0, minor: capData.actions?.filter(a => a.severity === "Minor").length || 0 } })} style={{ padding: "14px", borderRadius: "12px", background: t.card, border: `1px solid ${t.border}`, color: t.text, fontSize: "14px", cursor: "pointer" }}>✉️</button>
                      <button onClick={() => setCapData(null)} style={{ padding: "14px 16px", borderRadius: "12px", background: t.card, border: `1px solid ${t.border}`, color: t.textSecondary, fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
                        Redo
                      </button>
                    </div>

                    {/* Expert review CTA */}
                    <button onClick={() => setShowBooking(true)} style={{ width: "100%", padding: "12px", borderRadius: "12px", border: `1px solid ${theme === "dark" ? "#34C75930" : "#bbf7d0"}`, background: "#34C75908", color: t.green, fontSize: "13px", fontWeight: 600, cursor: "pointer", marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      📅 Have an EHS expert review & finalize this plan
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════ ADD CLIENT MODAL ══════ */}
      {showClientForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: t.overlay, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowClientForm(false); }}>
          <div style={{ width: "100%", maxWidth: "600px", background: t.modalBg, borderRadius: "20px 20px 0 0", padding: "20px 16px 40px", animation: "slideUp 0.3s ease-out" }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "#555", margin: "0 auto 16px" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>Add Client</div>
              <button onClick={() => setShowClientForm(false)} style={{ width: "32px", height: "32px", borderRadius: "50%", background: t.card, border: "none", color: t.textSecondary, fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {[
              { key: "name", label: "Client / Company Name", required: true },
              { key: "industry", label: "Industry", type: "select" },
              { key: "contact_email", label: "Contact Email" },
              { key: "contact_phone", label: "Contact Phone" },
              { key: "notes", label: "Notes", multiline: true },
            ].map((field) => (
              <div key={field.key} style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>
                  {field.label}{field.required && <span style={{ color: "#EF4444" }}> *</span>}
                </label>
                {field.type === "select" ? (
                  <select value={newClient[field.key]} onChange={(e) => setNewClient(prev => ({ ...prev, [field.key]: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, fontSize: "14px", fontFamily: "inherit", appearance: "none" }}>
                    <option value="">Select industry…</option>
                    {Object.entries(INDUSTRIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                ) : field.multiline ? (
                  <textarea value={newClient[field.key]} onChange={(e) => setNewClient(prev => ({ ...prev, [field.key]: e.target.value }))} rows={2}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, fontSize: "14px", fontFamily: "inherit", resize: "none", boxSizing: "border-box" }} />
                ) : (
                  <input value={newClient[field.key]} onChange={(e) => setNewClient(prev => ({ ...prev, [field.key]: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, fontSize: "14px", fontFamily: "inherit", boxSizing: "border-box" }} />
                )}
              </div>
            ))}

            <button onClick={async () => {
              if (!newClient.name.trim()) return;
              if (supabase.isConfigured) {
                const result = await supabase.createClient({ name: newClient.name.trim(), industry: newClient.industry || "general", contact_email: newClient.contact_email || null, contact_phone: newClient.contact_phone || null, notes: newClient.notes || null });
                if (result?.[0]) {
                  setClients(prev => [...prev, result[0]].sort((a, b) => a.name.localeCompare(b.name)));
                  setSelectedClient(result[0]);
                  setClientFilter(result[0].id);
                }
              } else {
                const localClient = { id: `local-${Date.now()}`, name: newClient.name.trim(), industry: newClient.industry || "general" };
                setClients(prev => [...prev, localClient]);
                setSelectedClient(localClient);
                setClientFilter(localClient.id);
              }
              setNewClient({ name: "", industry: "", contact_email: "", contact_phone: "", notes: "" });
              setShowClientForm(false);
            }} style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: newClient.name.trim() ? "#34C759" : "#2C2C2E", color: newClient.name.trim() ? "#000" : "#555", fontSize: "15px", fontWeight: 700, cursor: newClient.name.trim() ? "pointer" : "not-allowed", marginTop: "4px" }}>
              Save Client
            </button>
          </div>
          <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
        </div>
      )}

      {/* ══════ BOOKING MODAL ══════ */}
      {showBooking && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: t.overlay,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowBooking(false); }}>
          <div style={{
            width: "100%", maxWidth: "430px",
            background: t.card,
            borderRadius: "20px 20px 0 0",
            padding: "20px 16px 40px",
            maxHeight: "90vh",
            overflowY: "auto",
            animation: "slideUp 0.3s ease-out",
          }}>
            {/* Handle bar */}
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "#555", margin: "0 auto 16px" }} />

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <div style={{ fontSize: "20px", fontWeight: 700 }}>Book a Consultation</div>
                <div style={{ fontSize: "13px", color: t.textSecondary, marginTop: "2px" }}>with an EHS expert</div>
              </div>
              <button onClick={() => setShowBooking(false)} style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: "#2C2C2E", border: "none", color: t.textSecondary,
                fontSize: "16px", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>✕</button>
            </div>

            {/* Score context */}
            {result && result.score < 70 && (
              <div style={{
                padding: "12px 14px", borderRadius: "12px", marginBottom: "16px",
                background: theme === "dark" ? "#2A1215" : "#FEF2F2", border: theme === "dark" ? "1px solid #EF444425" : "1px solid #FECACA",
                display: "flex", alignItems: "center", gap: "12px",
              }}>
                <div style={{
                  width: "44px", height: "44px", borderRadius: "12px",
                  background: `${RegLensScoring.getBandColor(scoreResult?.band)}15`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: "20px", fontWeight: 700, color: RegLensScoring.getBandColor(scoreResult?.band) }}>{result.score}</span>
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: t.text }}>{result.documentType}</div>
                  <div style={{ fontSize: "11px", color: "#EF4444" }}>
                    {scoreResult?.band} — {(result.findings || []).filter(f => f.severity === "Critical").length} critical, {(result.findings || []).filter(f => f.severity === "Major").length} major findings
                  </div>
                </div>
              </div>
            )}

            {/* Consultation options */}
            <div style={{ fontSize: "11px", fontWeight: 600, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px", padding: "0 4px" }}>Select a Consultation Type</div>

            {CONSULT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  // Build Calendly URL with pre-filled context
                  const params = new URLSearchParams();
                  params.set("name", "");
                  params.set("a1", result?.documentType || "");
                  params.set("a2", `Score: ${result?.score || "N/A"} | ${(result?.findings || []).length} findings`);
                  const url = `${CALENDLY_URL}/${opt.id}?${params.toString()}`;
                  window.open(url, "_blank");
                }}
                style={{
                  width: "100%",
                  background: "#111",
                  border: `1px solid ${t.border}`,
                  borderRadius: "14px",
                  padding: "16px",
                  marginBottom: "10px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.2s, background 0.2s",
                }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = "#34C759"; e.currentTarget.style.background = "#1A2A1E"; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = "#2A2A2E"; e.currentTarget.style.background = "#111"; }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                  <div style={{
                    width: "44px", height: "44px", borderRadius: "12px",
                    background: "#2C2C2E", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "20px", flexShrink: 0,
                  }}>{opt.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 600, color: t.text }}>{opt.label}</span>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: t.green }}>{opt.price}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: t.textSecondary, lineHeight: 1.5, marginBottom: "6px" }}>{opt.desc}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "10px", color: t.textSecondary, padding: "2px 8px", borderRadius: "6px", background: t.card }}>⏱ {opt.duration}</span>
                      <span style={{ fontSize: "10px", color: t.textSecondary, padding: "2px 8px", borderRadius: "6px", background: t.card }}>📹 Video or Phone</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}

            {/* What to expect */}
            <div style={{
              marginTop: "8px", padding: "14px", borderRadius: "12px",
              background: t.card, border: `1px solid ${t.border}`,
            }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: t.textSecondary, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px" }}>What to Expect</div>
              {[
                "Your review findings are shared with the expert before the call",
                "Prioritized remediation roadmap based on your specific findings",
                "Written follow-up summary with action items emailed within 24 hours",
                "All consultations led by certified EHS professionals with deep regulatory expertise",
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", padding: "6px 0", fontSize: "12px", color: t.textSecondary, lineHeight: 1.5, borderBottom: i < 3 ? "1px solid #222" : "none" }}>
                  <span style={{ color: t.green, flexShrink: 0 }}>✓</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>

            {/* Direct contact fallback */}
            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <div style={{ fontSize: "12px", color: t.textTertiary }}>Prefer email?</div>
              <a href="mailto:info@prudencesafety.com?subject=EHS%20Expert%20Consultation%20Request" style={{ fontSize: "13px", color: t.green, fontWeight: 600, textDecoration: "none" }}>
                info@prudencesafety.com
              </a>
            </div>
          </div>

          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      </div>{/* end rl-container */}

      {/* BOTTOM NAV */}
      <div className="rl-bottom-nav" style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", display: "flex", justifyContent: "space-around", alignItems: "center", padding: "10px 0", paddingBottom: "calc(12px + env(safe-area-inset-bottom, 16px))", background: t.navBg, borderTop: `1px solid ${t.navBorder}`, zIndex: 100 }}>
        {[{ id: "dashboard", label: "Home", icon: "⊞" }, { id: "upload", label: "Review", icon: "⊕", action: () => { setSelectedType(null); setTab("upload"); } }, { id: "audit", label: "Readiness", icon: "☷" }, { id: "tools", label: "Tools", icon: "☰" }].map((item) => (
          <button key={item.id} className="rl-nav-item" onClick={() => { supabase.trackEvent("page_view", { tab: item.id }); item.action ? item.action() : setTab(item.id); }} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", color: tab === item.id ? t.green : t.textSecondary, minWidth: "56px" }}>
            <span style={{ fontSize: "22px", lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: "10px", fontWeight: 500 }}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
