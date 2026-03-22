import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 3001;
const CLIENT_DIR = join(__dirname, "dist", "client");

// Import the TanStack Start handler
const { default: handler } = await import("./dist/server/server.js");

// MIME types for static files
const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  // Use relative path to avoid join ignoring CLIENT_DIR with absolute pathname
  const filePath = join(CLIENT_DIR, url.pathname.slice(1));

  // Security: prevent directory traversal
  if (!filePath.startsWith(CLIENT_DIR)) return false;

  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return false;

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const data = readFileSync(filePath);

    // Cache static assets (hashed filenames) for 1 year
    const cacheControl = url.pathname.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": data.length,
      "Cache-Control": cacheControl,
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  // Try static files first
  if (serveStatic(req, res)) return;

  // Convert Node request to Web Request
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  // Read body for non-GET requests
  let body = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks);
  }

  const webRequest = new Request(url.toString(), {
    method: req.method,
    headers,
    body,
    duplex: "half",
  });

  try {
    // The handler is a function that takes a Request and returns a Response
    const response = await (typeof handler === "function"
      ? handler(webRequest)
      : handler.fetch(webRequest));

    // Convert Web Response back to Node response, preserving multi-value headers like Set-Cookie
    const nodeHeaders = {};
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() === "set-cookie") continue;
      nodeHeaders[key] = value;
    }

    // Handle Set-Cookie explicitly to preserve multiple cookies
    let setCookieValues = [];
    if (typeof response.headers.getSetCookie === "function") {
      setCookieValues = response.headers.getSetCookie();
    } else {
      const singleSetCookie = response.headers.get("set-cookie");
      if (singleSetCookie) {
        setCookieValues = [singleSetCookie];
      }
    }
    if (setCookieValues.length > 0) {
      nodeHeaders["set-cookie"] = setCookieValues;
    }

    res.writeHead(response.status, nodeHeaders);

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (err) {
    console.error("SSR Error:", err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`🏰 Cartyx running at http://localhost:${PORT}`);
});
