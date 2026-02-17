/**
 * Document Reader – Cloudflare Worker AI
 * API to read text content from PDF or image files.
 *
 * Routes:
 *   POST /read  – multipart file or JSON { "file": "base64...", "mimeType": "image/png" }
 *   GET  /      – health / usage
 */

const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const PDF_TYPE = "application/pdf";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** @type {Record<string, string>} */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...headers },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

/**
 * Extract text from an image using Workers AI (Llama 3.2 Vision).
 * @param {string} imageDataUrl - data URL e.g. "data:image/png;base64,..."
 * @param {import("@cloudflare/workers-types").Ai} ai
 */
async function readImageWithAI(imageDataUrl, ai) {
  const response = await ai.run(VISION_MODEL, {
    messages: [
      {
        role: "system",
        content:
          "You are a document OCR assistant. Extract and return ALL text visible in the image, preserving structure (line breaks, lists) where clear. Return only the raw extracted text, no commentary.",
      },
      { role: "user", content: "Extract all text from this image.", image: imageDataUrl },
    ],
  });
  const text = response?.response ?? response?.result ?? String(response);
  return typeof text === "string" ? text : (text?.trim?.() ?? JSON.stringify(text));
}

/**
 * Extract text from a PDF using unpdf (Worker-compatible).
 * @param {ArrayBuffer} buffer
 */
async function readPdf(buffer) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { totalPages, text: text ?? "" };
}

/**
 * Parse multipart/form-data and return the first file part.
 * @param {Request} request
 */
async function getFileFromMultipart(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("multipart/form-data")) return null;

  const formData = await request.formData();
  const file = formData.get("file") ?? formData.get("document") ?? formData.get("image");
  if (!file || typeof file.arrayBuffer !== "function") return null;

  const buffer = await file.arrayBuffer();
  const mimeType = file.type || "application/octet-stream";
  return { buffer, mimeType, name: file.name };
}

/**
 * Parse JSON body: { file: "<base64>", mimeType?: "image/png" }
 * @param {Request} request
 */
async function getFileFromJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) return null;

  const body = await request.json();
  const b64 = body.file ?? body.content ?? body.data;
  if (!b64 || typeof b64 !== "string") return null;

  const binary = Uint8Array.from(atob(b64.replace(/^data:[^;]+;base64,/, "")), (c) => c.charCodeAt(0));
  const mimeType = body.mimeType ?? body.type ?? "application/octet-stream";
  return { buffer: binary.buffer, mimeType, name: body.name ?? "upload" };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Health / usage
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({
        service: "document-reader",
        status: "ok",
        usage: "POST /read with multipart file (file/document/image) or JSON { file: base64, mimeType? }",
        supported: { images: ["image/png", "image/jpeg", "image/webp", "image/gif"], pdf: true },
      });
    }

    if (request.method !== "POST" || url.pathname !== "/read") {
      return error("Not Found. Use POST /read to extract text from a file.", 404);
    }

    let file = await getFileFromMultipart(request);
    if (!file) file = await getFileFromJson(request);
    if (!file) {
      return error(
        "No file provided. Send multipart form with 'file' or JSON body: { file: '<base64>', mimeType?: 'image/png' }"
      );
    }

    if (file.buffer.byteLength > MAX_FILE_SIZE) {
      return error(`File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024} MB`);
    }

    const { buffer, mimeType } = file;
    const normalizedMime = mimeType.split(";")[0].trim().toLowerCase();

    try {
      if (IMAGE_TYPES.has(normalizedMime)) {
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        const dataUrl = `data:${normalizedMime};base64,${base64}`;
        const text = await readImageWithAI(dataUrl, env.AI);
        return json({ success: true, type: "image", text });
      }

      if (normalizedMime === PDF_TYPE) {
        const result = await readPdf(buffer);
        return json({ success: true, type: "pdf", ...result });
      }

      return error(
        `Unsupported type: ${mimeType}. Use image (PNG, JPEG, WebP, GIF) or application/pdf.`
      );
    } catch (e) {
      return json(
        { success: false, error: "Extraction failed", detail: e?.message ?? String(e) },
        500
      );
    }
  },
};
