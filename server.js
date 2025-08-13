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

console.log('[boot] NODE_ENV=', process.env.NODE_ENV);
console.log('[boot] PORT=', PORT);
console.log('[boot] DIST path=', DIST);
console.log('[boot] DIST exists?', fs.existsSync(DIST));
console.log('[boot] index.html exists?', fs.existsSync(path.join(DIST, 'index.html')));

// Health check (Railway should hit this)
app.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    ts: new Date().toISOString(),
    port: PORT,
    distExists: fs.existsSync(DIST),
    indexExists: fs.existsSync(path.join(DIST, 'index.html'))
  });
});

// If dist exists, serve it. Otherwise show a helpful message.
if (fs.existsSync(DIST)) {
  app.use(compression());
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));

  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => {
    res.status(200).send(
      `<pre>dist/ not found.
Build probably didn't run or failed.

Expected file: ${path.join(DIST, 'index.html')}

Check Railway build logs and ensure "npm run build" ran successfully.
</pre>`
    );
  });
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}`);
});

function shutdown(sig) {
  console.log(`[server] received ${sig}, closing...`);
  server.close(() => {
    console.log('[server] closed.');
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));