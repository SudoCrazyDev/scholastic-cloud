# Document Reader – Cloudflare Worker AI

API route that reads text content from **PDF** or **image** files. Uses **Workers AI** (Llama 3.2 Vision) for images and **unpdf** for PDFs.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Cloudflare account](https://dash.cloudflare.com/sign-up) with **Workers** and **Workers AI** enabled
- First-time use of Llama 3.2 Vision: [agree to Meta’s license](https://developers.cloudflare.com/workers-ai/guides/tutorials/llama-vision-tutorial/#1-agree-to-metas-license) once

## Setup

```bash
cd microservices/document-reader
npm install
```

## Development

```bash
npm run dev
```

Local URL: `http://localhost:8787`

## Deploy

```bash
npm run deploy
```

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (or run `npx wrangler login`).

---

## API

### `GET /` or `GET /health`

Health and usage info.

**Response**

```json
{
  "service": "document-reader",
  "status": "ok",
  "usage": "POST /read with multipart file (file/document/image) or JSON { file: base64, mimeType? }",
  "supported": {
    "images": ["image/png", "image/jpeg", "image/webp", "image/gif"],
    "pdf": true
  }
}
```

### `POST /read`

Extract text from a PDF or image.

**Ways to send the file**

1. **Multipart form**  
   Field name: `file`, `document`, or `image`.  
   `Content-Type: multipart/form-data`.

2. **JSON body**  
   `Content-Type: application/json`  
   Body: `{ "file": "<base64 string>", "mimeType": "image/png" }`  
   `mimeType` is optional; inferred from content when possible.

**Supported types**

- **Images:** `image/png`, `image/jpeg`, `image/jpg`, `image/webp`, `image/gif` → text via Workers AI (Llama 3.2 Vision).
- **PDF:** `application/pdf` → text via unpdf.

**Max file size:** 10 MB.

**Success – image**

```json
{
  "success": true,
  "type": "image",
  "text": "Extracted text from the image..."
}
```

**Success – PDF**

```json
{
  "success": true,
  "type": "pdf",
  "totalPages": 3,
  "text": "Full text from all pages..."
}
```

**Error**

```json
{
  "error": "Description of what went wrong"
}
```

---

## Examples

### cURL – multipart file

```bash
curl -X POST https://document-reader.<your-subdomain>.workers.dev/read \
  -F "file=@document.pdf"
```

```bash
curl -X POST https://document-reader.<your-subdomain>.workers.dev/read \
  -F "file=@screenshot.png"
```

### cURL – JSON (base64)

```bash
# Replace BASE64_STRING with actual base64-encoded file content
curl -X POST https://document-reader.<your-subdomain>.workers.dev/read \
  -H "Content-Type: application/json" \
  -d '{"file": "BASE64_STRING", "mimeType": "application/pdf"}'
```

### JavaScript (fetch)

```js
const formData = new FormData();
formData.append("file", fileInput.files[0]);

const res = await fetch("https://document-reader.<your-subdomain>.workers.dev/read", {
  method: "POST",
  body: formData,
});
const data = await res.json();
console.log(data.text);
```

---

## Bindings

- **Workers AI** (`env.AI`): used for image text extraction (Llama 3.2 11B Vision).  
  Configured in `wrangler.toml` as:

  ```toml
  [ai]
  binding = "AI"
  ```

## License

Same as the parent project.
