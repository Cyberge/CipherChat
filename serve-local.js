const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

http
  .createServer((req, res) => {
    let reqPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (reqPath === "/") reqPath = "/index.html";

    const filePath = path.join(root, reqPath.replace(/^\/+/, ""));
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }

      res.setHeader("Content-Type", mime[path.extname(filePath)] || "text/plain; charset=utf-8");
      res.end(data);
    });
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`CipherChat local server running at http://127.0.0.1:${port}`);
  });
