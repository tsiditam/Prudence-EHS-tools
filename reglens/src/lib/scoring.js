/**
 * RegLens deterministic scoring engine, citation registry, and readiness
 * check scoring. Pure functions with no React or browser dependencies so
 * they can be unit tested (see tests/scoring.test.js).
 *
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 */

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
    return { Excellent: "#34C759", Strong: "#65a30d", Good: "#84cc16", Functional: "#F59E0B", "Moderate Risk": "#ea580c", "High Risk": "#EF4444", "Critical Risk": "#991b1b" }[band] || "#8E8E93";
  }
  return { computeScore, getBand, getBandColor };
})();

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

export {
  RegLensScoring,
  CFR_RE,
  STD_RE,
  CITATION_REGISTRY,
  validateCitation,
  SCORING_CATEGORIES,
  SCORING_QUESTIONS,
  RED_FLAG_DEFINITIONS,
  REGULATORY_PENALTIES,
  computeAuditScore,
};
