/**
 * Local HTTP server for the Dwellings generator.
 *
 * Serves the static files and opens your browser.
 * Useful for interactive exploration or as a backend for the Puppeteer wrapper.
 *
 * Usage: npx tsx server.ts [port]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "public");
const PORT = parseInt(process.argv[2] || "3456", 10);

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".json": "application/json",
  ".css": "text/css",
};

const server = http.createServer((req, res) => {
  let urlPath = req.url === "/" ? "/index.html" : req.url || "/index.html";
  // Strip query string
  urlPath = urlPath.split("?")[0];

  const filePath = path.join(PUBLIC_DIR, urlPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   🏠 Watabou Dwellings - Local Server  ║
║   http://localhost:${PORT}                  ║
║                                          ║
║   URL parameters:                        ║
║   ?seed=12345                            ║
║   ?tags=large,slab,spiral                ║
║   ?floors=3                              ║
║                                          ║
║   Press Enter to generate new house      ║
║   Right-click for options menu           ║
║   Ctrl+S to export PNG/SVG/JSON          ║
╚══════════════════════════════════════════╝
`);
});
