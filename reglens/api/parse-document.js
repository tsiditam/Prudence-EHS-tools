/**
 * Vercel Serverless Function — /api/parse-document
 * Accepts a PDF or DOCX file upload and returns extracted text.
 *
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 */

import { IncomingForm } from "formidable";
import fs from "fs";
import pdf from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";

export const config = {
  api: { bodyParser: false },
};

const MAX_TOKENS = 12000;

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
    const form = new IncomingForm({ maxFileSize: 10 * 1024 * 1024 });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = await parseForm(req);
    const file = files.file?.[0] || files.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = file.filepath || file.path;
    const fileName = (file.originalFilename || file.name || "").toLowerCase();
    const buffer = fs.readFileSync(filePath);

    let rawText = "";

    if (fileName.endsWith(".pdf")) {
      const data = await pdf(buffer);
      rawText = data.text || "";
    } else if (fileName.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value || "";
    } else if (fileName.endsWith(".txt")) {
      rawText = buffer.toString("utf-8");
    } else {
      return res.status(400).json({ error: "Unsupported file type. Upload PDF, DOCX, or TXT." });
    }

    // Clean up whitespace
    rawText = rawText.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

    if (!rawText || rawText.length < 50) {
      return res.status(400).json({ error: "Could not extract meaningful text from this document. It may be scanned/image-based." });
    }

    const tokenCount = estimateTokens(rawText);
    const { text, wasTruncated } = truncateToTokens(rawText, MAX_TOKENS);

    return res.status(200).json({ text, tokenCount, wasTruncated });
  } catch (err) {
    console.error("parse-document error:", err);
    return res.status(500).json({ error: "Failed to parse document. Please try a .txt version." });
  }
}
