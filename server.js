import express from 'express';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import serveStatic from 'serve-static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, 'dist');

app.use(compression());
app.use(serveStatic(DIST, { index: false, maxAge: '1h', fallthrough: true }));

// Health checks
app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    message: 'frontend up',
    ts: new Date().toISOString(),
    port: PORT
  });
});

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

// Graceful shutdown logs (prevents abrupt SIGTERM noise)
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}`);
});

function shutdown(sig) {
  console.log(`[server] received ${sig}, closing...`);
  server.close(() => {
    console.log('[server] closed. Bye!');
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));