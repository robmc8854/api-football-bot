// server.js
import express from 'express';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, 'dist');

console.log('[boot] Node:', process.version);
console.log('[boot] PORT:', PORT);
console.log('[boot] dist exists?', fs.existsSync(DIST));
console.log('[boot] index.html exists?', fs.existsSync(path.join(DIST, 'index.html')));

app.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    ts: new Date().toISOString(),
    distExists: fs.existsSync(DIST),
    indexExists: fs.existsSync(path.join(DIST, 'index.html'))
  });
});

if (fs.existsSync(DIST)) {
  app.use(compression());
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
} else {
  app.get('*', (_req, res) =>
    res
      .status(200)
      .send('<pre>dist/ not found. Did the build run? (Railway should run `npm run build`)</pre>')
  );
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}`);
});