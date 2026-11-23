// Udenhood : reçoit l'image d'un coin envoyée depuis la page Launch et la range dans le stockage du site.
// C'est la seule chose que le site garde : pas de compte, pas de base de données.
// Garde-fous : la demande doit venir d'une page du site ; l'image est un PNG, un WebP ou un JPEG de 600 Ko au plus,
// reconnue à ses premiers octets (jamais à ce que la demande prétend) ; son nom est l'empreinte de son contenu, donc
// la même image envoyée deux fois ne prend qu'une place ; une adresse ne peut pas en envoyer plus de 8 par quart
// d'heure.
const { createHash } = require('node:crypto');
const { put } = require('@vercel/blob');

const ORIGINES = new Set(['https://www.udenhood.fun', 'https://udenhood.fun', 'https://udenhood.vercel.app']);
const MAX = 600 * 1024;
const FENETRE = 15 * 60 * 1000;
const PAR_FENETRE = 8;
const envois = new Map(); // adresse -> heures des derniers envois (mémoire de cette instance)

// Le genre d'une image, lu dans ses premiers octets.
function genre(o) {
  if (o.length > 8 && o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return { type: 'image/png', ext: 'png' };
  if (o.length > 12 && o.toString('ascii', 0, 4) === 'RIFF' && o.toString('ascii', 8, 12) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  if (o.length > 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  return null;
}

async function corps(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const morceaux = [];
  let taille = 0;
  for await (const m of req) {
    taille += m.length;
    if (taille > MAX) return null;
    morceaux.push(m);
  }
  return Buffer.concat(morceaux);
}

module.exports = async (req, res) => {
  const dire = (code, message) => res.status(code).json({ error: message });
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return dire(405, 'POST only');
  if (!ORIGINES.has(req.headers.origin || '')) return dire(403, 'This endpoint only serves udenhood.fun');
  if (!process.env.BLOB_READ_WRITE_TOKEN) return dire(503, 'Image storage is not set up');

  const qui = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnu';
  const maintenant = Date.now();
  const recents = (envois.get(qui) || []).filter((t) => maintenant - t < FENETRE);
  if (recents.length >= PAR_FENETRE) return dire(429, 'Too many images from this address. Try again later.');

  let octets;
  try {
    octets = await corps(req);
  } catch {
    return dire(400, 'The image did not arrive');
  }
  if (!octets || octets.length > MAX) return dire(413, 'The image is over 600 KB');
  const g = genre(octets);
  if (!g) return dire(415, 'Not a PNG, WebP or JPEG image');

  recents.push(maintenant);
  envois.set(qui, recents);
  const nom = `coins/${createHash('sha256').update(octets).digest('hex')}.${g.ext}`;
  try {
    const depot = await put(nom, octets, { access: 'public', contentType: g.type, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 });
    return res.status(200).json({ url: depot.url });
  } catch {
    return dire(502, 'The image could not be stored');
  }
};
