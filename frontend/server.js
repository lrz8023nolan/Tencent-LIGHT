const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const fullPath = path.join(__dirname, filePath);
  
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end(fs.readFileSync(fullPath));
  } else {
    // SPA fallback: serve index.html for unknown routes
    const indexFile = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexFile)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(indexFile));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Frontend HTTP server: http://localhost:${PORT}`);
  // Keep alive
  setInterval(() => {}, 60000);
});
