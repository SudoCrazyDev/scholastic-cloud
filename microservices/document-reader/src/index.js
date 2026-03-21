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
 * @param {ArrayBuffer} buffer
 * @param {import("@cloudflare/workers-types").Ai} ai
 */
async function readImageWithAI(buffer, ai) {
  // Step 1: Submit agreement — must be a standalone prompt-only call (no image, no messages).
  await ai.run(VISION_MODEL, { prompt: "agree" }).catch(() => {});

  // Step 2: Actual OCR — prompt + image schema (image is not supported with the messages schema).
  const response = await ai.run(VISION_MODEL, {
    prompt:
      "You are a document OCR assistant specializing in civil registry documents. Extract the following fields from the document and return them in this exact format:\n\nChild First Name: \nChild Middle Name: \nChild Last Name: \nMother First Name: \nMother Middle Name: \nMother Last Name: \nFather First Name: \nFather Middle Name: \nFather Last Name: \n\nIf a field is not found or not visible, leave it blank. Return only these labeled fields, no other commentary.",
    image: [...new Uint8Array(buffer)],
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
        const text = await readImageWithAI(buffer, env.AI);
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
