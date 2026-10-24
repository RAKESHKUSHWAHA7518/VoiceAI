import express, { Express } from 'express';
import fs from 'fs';
import path from 'path';

// Keep API errors and missing assets out of the browser-router fallback.
export function mountStudio(app: Express, directory: string) {
  const index = path.join(directory, 'index.html');
  if (!fs.existsSync(index)) throw new Error('Built studio is missing. Run npm run client:build.');
  app.use(express.static(directory, { index: false, setHeaders: res => res.set('Cache-Control', 'no-cache') }));
  app.get('*', (req, res, next) => {
    if (/^\/(api|health|assets|speech|ws|media-stream|recordings)(\/|$)/.test(req.path) || path.extname(req.path) || !req.accepts('html')) return next();
    res.set('Cache-Control', 'no-cache').sendFile(index);
  });
}
