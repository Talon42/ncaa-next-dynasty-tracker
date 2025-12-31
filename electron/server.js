import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const CONTENT_TYPES = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
  ".html": "text/html",
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = CONTENT_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  fs.createReadStream(filePath).pipe(res);
}

function sendMissingBuild(res, root) {
  res.writeHead(500, { "Content-Type": "text/html" });
  res.end(
    `<html><body><h2>Build missing</h2><p>Expected build at ${root}</p></body></html>`
  );
}

export function createServer({ root, port }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400);
        res.end();
        return;
      }

      const buildIndex = path.join(root, "index.html");
      if (!fs.existsSync(buildIndex)) {
        sendMissingBuild(res, root);
        return;
      }

      const requestUrl = new URL(req.url, "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname);
      const safePath = path.resolve(root, `.${pathname}`);

      if (!safePath.startsWith(root)) {
        res.writeHead(400);
        res.end();
        return;
      }

      if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
        sendFile(res, safePath);
        return;
      }

      sendFile(res, buildIndex);
    });

    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind local server"));
        return;
      }

      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/`,
      });
    });
  });
}
