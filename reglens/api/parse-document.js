/**
 * Vercel Serverless Function — /api/parse-document
 * Authenticated PDF / DOCX / TXT text extractor.
 *
 * Requires an Authorization: Bearer <supabase-jwt> header. Per-user rate
 * limited via the api_rate_limits table. Returns extracted text along with
 * size metadata so the caller can decide how aggressively to truncate.
 *
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 */

const { IncomingForm } = require("formidable");
const fs = require("fs");
const mammoth = require("mammoth");
const { requireAuthAndLimit } = require("./_lib/auth.js");

module.exports.config = {
  api: { bodyParser: false },
};

const MAX_TOKENS = 50000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const RATE_LIMIT_PER_MINUTE = 15;
const RATE_LIMIT_PER_DAY = 100;

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function truncateToTokens(text, maxTokens) {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return { text, wasTruncated: false };
  return { text: text.slice(0, maxChars), wasTruncated: true };
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ maxFileSize: MAX_FILE_BYTES });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function classifyPdfError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (msg.includes("encrypted") || msg.includes("password")) {
    return { status: 400, error: "This PDF is password-protected. Remove the password and try again." };
  }
  if (msg.includes("invalid") || msg.includes("corrupt") || msg.includes("malformed")) {
    return { status: 400, error: "This PDF appears to be corrupted or invalid. Try re-saving it from the source." };
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireAuthAndLimit(req, res, {
    endpoint: "parse-document",
    maxPerMinute: RATE_LIMIT_PER_MINUTE,
    maxPerDay: RATE_LIMIT_PER_DAY,
  });
  if (!auth.ok) return;

  let parsed;
  try {
    parsed = await parseForm(req);
  } catch (err) {
    const msg = String(err?.message || "").toLowerCase();
    if (msg.includes("maxfilesize")) {
      return res.status(413).json({ error: `File exceeds ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB limit.` });
    }
    console.error("parse-document upload error:", err);
    return res.status(400).json({ error: "Could not read uploaded file." });
  }

  const file = parsed.files.file?.[0] || parsed.files.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const filePath = file.filepath || file.path;
  const fileName = (file.originalFilename || file.name || "").toLowerCase();
  const fileSize = file.size || 0;

  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (err) {
    console.error("parse-document read error:", err);
    return res.status(500).json({ error: "Could not read uploaded file from disk." });
  }

  let rawText = "";
  let mimeType = "";

  try {
    if (fileName.endsWith(".pdf")) {
      mimeType = "application/pdf";
      const pdf = require("pdf-parse/lib/pdf-parse.js");
      try {
        const data = await pdf(buffer);
        rawText = data.text || "";
      } catch (err) {
        const classified = classifyPdfError(err);
        if (classified) return res.status(classified.status).json({ error: classified.error });
        console.error("pdf-parse error:", err);
        return res.status(400).json({ error: "Could not parse this PDF. Try re-saving or exporting to .txt." });
      }
    } else if (fileName.endsWith(".docx")) {
      mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value || "";
    } else if (fileName.endsWith(".txt")) {
      mimeType = "text/plain";
      rawText = buffer.toString("utf-8");
    } else {
      return res.status(400).json({ error: "Unsupported file type. Upload PDF, DOCX, or TXT." });
    }
  } catch (err) {
    console.error("parse-document extract error:", err);
    return res.status(500).json({ error: "Failed to parse document. Please try a .txt version." });
  }

  rawText = rawText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!rawText || rawText.length < 50) {
    return res.status(400).json({
      error: "Could not extract meaningful text. The document may be scanned or image-only — try a text-based version or run OCR first.",
    });
  }

  const charCount = rawText.length;
  const tokenCount = estimateTokens(rawText);
  const { text, wasTruncated } = truncateToTokens(rawText, MAX_TOKENS);

  return res.status(200).json({
    text,
    tokenCount,
    charCount,
    wasTruncated,
    mimeType,
    fileSize,
  });
};
