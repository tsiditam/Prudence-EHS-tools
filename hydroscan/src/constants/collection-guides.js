/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Sample-collection protocols for the parameters HydroScan recommends.
 * Step-by-step guidance keyed to the governing standard. Extracted verbatim
 * from the original App.jsx monolith (Phase 1 relocation — content unchanged).
 */

export const COLLECTION_GUIDES = {
  lead_first_draw: {
    title: "Lead First-Draw Sample Collection",
    std: "EPA 3Ts Protocol / Lead and Copper Rule",
    steps: [
      {n:1,text:"Identify the tap to sample (kitchen cold water or drinking fountain). Do NOT use bathroom taps.",icon:"🚰"},
      {n:2,text:"Ensure the tap has been unused for AT LEAST 6 hours (overnight stagnation is ideal). Post 'DO NOT USE' signs the evening before.",icon:"⏰"},
      {n:3,text:"Without pre-flushing, gently turn on the cold water tap and collect the FIRST 250 mL in the provided bottle. This is the 'first draw' — it captures water that has been in contact with plumbing fixtures.",icon:"🧪"},
      {n:4,text:"Immediately collect a SECOND 250 mL sample (second draw). This captures water from interior plumbing.",icon:"🧪"},
      {n:5,text:"Let the water run for 2-3 minutes, then collect a THIRD 'flushed' sample. This represents supply water after plumbing influence is purged.",icon:"💧"},
      {n:6,text:"Cap tightly. Label each bottle: sample location, date, time, collector name, 'First Draw' / 'Second Draw' / 'Flushed'.",icon:"🏷️"},
      {n:7,text:"Store on ice (<10°C). Deliver to certified lab within 48 hours. Samples should be preserved with HNO₃ (lab may pre-add).",icon:"🧊"},
    ],
    notes: "Comparing first-draw vs. flushed results identifies whether lead originates from fixtures (high first draw, low flushed) or service line (elevated in all samples). Use only cold water — hot water dissolves more lead."
  },
  bacteria: {
    title: "Bacteriological Sample Collection",
    std: "SM 9223B / EPA Total Coliform Rule",
    steps: [
      {n:1,text:"Use a STERILE sample container provided by the lab (contains sodium thiosulfate if water is chlorinated). Do NOT open until ready to collect.",icon:"🧫"},
      {n:2,text:"Select a cold water tap WITHOUT aerator screen, filter, or hose attachment. Remove aerator if present. Do NOT sample from outside spigots or swivel faucets.",icon:"🚰"},
      {n:3,text:"Run cold water for 2-3 minutes to flush the line (opposite of lead testing — we want supply water, not stagnant).",icon:"💧"},
      {n:4,text:"Turn off water. Disinfect the faucet opening with chlorine wipe or flame (lighter held under spout for 2-3 seconds). Let cool.",icon:"🔥"},
      {n:5,text:"Open sterile container without touching the inside of the cap or bottle rim. Fill to the marked line (usually 100 mL). Do NOT overfill.",icon:"🧪"},
      {n:6,text:"Cap immediately. Label with location, date, time, collector name.",icon:"🏷️"},
      {n:7,text:"Keep on ice (<10°C). Deliver to lab within 6 HOURS (strict hold time). Do not freeze. Do not expose to sunlight.",icon:"🧊"},
    ],
    notes: "The 6-hour hold time is non-negotiable — results from samples held longer are invalid. Plan collection timing around lab receiving hours. If you cannot deliver within 6 hours, contact the lab about shipping options."
  },
  pfas: {
    title: "PFAS Sample Collection",
    std: "EPA 533 / EPA 537.1",
    steps: [
      {n:1,text:"Use only HDPE (high-density polyethylene) or polypropylene containers provided by the lab. NEVER use glass — PFAS can adhere to glass surfaces.",icon:"🧪"},
      {n:2,text:"Do NOT wear waterproof or stain-resistant clothing, sunscreen, or insect repellent during collection — these contain PFAS and will contaminate the sample.",icon:"⚠️"},
      {n:3,text:"Do NOT use any products containing Teflon, Gore-Tex, or fluoropolymer materials during collection.",icon:"🚫"},
      {n:4,text:"Run the cold water tap for 2-3 minutes. Collect the sample directly into the provided container.",icon:"💧"},
      {n:5,text:"Add Trizma preservative if provided by lab (may be pre-added to container).",icon:"🧫"},
      {n:6,text:"Cap tightly. Label with location, date, time, collector name. Double-bag in provided ziplock.",icon:"🏷️"},
      {n:7,text:"Store on ice. Deliver to lab within 14 days. Lab must be capable of EPA 533 or 537.1 method with detection limits ≤2 ppt.",icon:"🧊"},
    ],
    notes: "PFAS sampling has unusually strict contamination prevention requirements. The most common source of false positives is contamination from the collector's clothing or equipment. Field blanks are strongly recommended."
  },
};
