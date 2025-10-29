import { baremuxPath } from '@mercuryworkshop/bare-mux/node';
import { epoxyPath } from '@mercuryworkshop/epoxy-transport';
import { libcurlPath } from '@mercuryworkshop/libcurl-transport';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';
import { createClient } from '@supabase/supabase-js';
import { createBareServer } from '@tomphttp/bare-server-node';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fileUpload from 'express-fileupload';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import fs from 'fs';
import NodeCache from 'node-cache';
import fetch from 'node-fetch';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { hostname } from 'node:os';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signinHandler } from './server/api/signin.js';
import { signupHandler } from './server/api/signup.js';

const cache = new NodeCache({ stdTTL: 86400 });
let SESSION_SECRET;
dotenv.config();
const envFile = `.env.${process.env.NODE_ENV || 'production'}`;
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { SUPABASE_URL, SUPABASE_KEY } = process.env;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bare = createBareServer('/bare/');
const app = express();
const publicPath = 'public';
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type']
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
if (process.env.SESSION_SECRET) {
  SESSION_SECRET = process.env.SESSION_SECRET;
} else {
  console.warn('SESSION_SECRET not set, generating a random one for this session');
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
}
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true }
  })
);
app.use(cookieParser());
const getRandomIPv6 = () => {
  const i = Math.floor(Math.random() * 5000) + 1;
  return `2607:5300:205:200:${i.toString(16).padStart(4, '0')}::1`;
};
app.use('/baremux/', express.static(baremuxPath));
app.use('/epoxy/', express.static(epoxyPath));
app.use('/libcurl/', express.static(libcurlPath));

const verifyMiddleware = (req, res, next) => {
  const verified = req.cookies?.verified === 'ok' || req.headers['x-bot-token'] === process.env.BOT_TOKEN;
  const ua = req.headers['user-agent'] || '';
  const isBrowser = /Mozilla|Chrome|Safari|Firefox|Edge/i.test(ua);
  const acceptsHtml = req.headers.accept?.includes('text/html');

  if (!isBrowser) return res.status(403).send('Forbidden');
  if (verified && isBrowser) return next();
  if (!acceptsHtml) return next();

  req.session.verified = true;

  res.status(200).send(`
    <!DOCTYPE html>
    <html><body>
      <script>
        setTimeout(() => window.location.replace(window.location.pathname), 100);
      </script>
      <noscript>Enable JavaScript to continue.</noscript>
    </body></html>
  `);
};

app.use(verifyMiddleware);

const apiLimiter = rateLimit({
  windowMs: 15 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: '429: Too many requests, please try again later.',
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({
      status: 429,
      error: 'Too many requests, please try again later.',
      message: options.message,
      retryAfter: Math.ceil(options.windowMs / 1000) + ' seconds'
    });
  }
});

app.use('/bare/', apiLimiter);
app.use('/api/', apiLimiter);

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type']
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  })
);
app.use((req, res, next) => {
  res.set({
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp'
  });
  next();
});

app.get('/results/:query', async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const response = await fetch(`http://api.duckduckgo.com/ac?q=${encodeURIComponent(query)}&format=json`);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const data = await response.json();
    const suggestions = data.map((item) => ({ phrase: item.phrase })).slice(0, 8);
    // Optionally fetch from Supabase (example: search user history or bookmarks)
    /*
    const { data, error } = await supabase
      .from('user_history') // Ensure you have a table for history or suggestions
      .select('url')
      .ilike('url', `%${query}%`)
      .limit(8);
    if (error) throw error;
    const suggestions = data.map(item => ({ phrase: item.url }));
    */
    return res.status(200).json(suggestions);
  } catch (error) {
    console.error('Error generating suggestions:', error.message);
    return res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

app.post('/api/signup', signupHandler);
app.post('/api/signin', signinHandler);
app.post('/api/signout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    req.session.destroy();
    return res.status(200).json({ message: 'Signout successful' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.get('/api/profile', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { data, error } = await supabase.auth.getUser(req.session.access_token);
    if (error) throw error;
    return res.status(200).json({ user: data.user });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.post('/api/signin/oauth', async (req, res) => {
  const { provider } = req.body;
  const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers.host;
  if (!host) {
    return res.status(400).json({ error: 'Host header missing' });
  }
  const redirectTo = `${protocol}://${host}/auth/callback`;
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo }
    });
    if (error) throw error;
    return res.status(200).json({ url: data.url, openInNewTab: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.get('/auth/callback', (req, res) => {
  return res.sendFile(join(__dirname, publicPath, 'auth-callback.html'));
});
app.post('/api/set-session', async (req, res) => {
  const { access_token, refresh_token } = req.body;
  if (!access_token || !refresh_token) {
    return res.status(400).json({ error: 'Invalid session tokens' });
  }
  try {
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token
    });
    if (error) throw error;
    req.session.user = data.user;
    req.session.access_token = access_token;
    return res.status(200).json({ message: 'Session set successfully' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.post('/api/upload-profile-pic', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const file = req.files?.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const userId = req.session.user.id;
    const fileName = `${userId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('profile-pics').upload(fileName, file.data, { contentType: file.mimetype });
    if (error) throw error;
    const { data: publicUrlData } = supabase.storage.from('profile-pics').getPublicUrl(fileName);
    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: publicUrlData.publicUrl }
    });
    if (updateError) throw updateError;
    return res.status(200).json({ url: publicUrlData.publicUrl });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.post('/api/update-profile', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { username, bio } = req.body;
    const { error } = await supabase.auth.updateUser({
      data: { name: username, bio }
    });
    if (error) throw error;
    return res.status(200).json({ message: 'Profile updated' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.post('/api/save-localstorage', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { data } = req.body;
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: req.session.user.id, localstorage_data: data }, { onConflict: 'user_id' });
    if (error) throw error;
    return res.status(200).json({ message: 'LocalStorage saved' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.get('/api/load-localstorage', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { data, error } = await supabase.from('user_settings').select('localstorage_data').eq('user_id', req.session.user.id).single();
    if (error) throw error;
    return res.status(200).json({ data: data?.localstorage_data || '{}' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.delete('/api/delete-account', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { error } = await supabase.rpc('delete_user', {
      user_id: req.session.user.id
    });
    if (error) throw error;
    req.session.destroy();
    return res.status(200).json({ message: 'Account deleted' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.post('/api/link-account', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { provider } = req.body;
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers.host;
    if (!host) {
      return res.status(400).json({ error: 'Host header missing' });
    }
    const redirectTo = `${protocol}://${host}/auth/callback`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true }
    });
    if (error) throw error;
    return res.status(200).json({ url: data.url, openInNewTab: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.use(express.static('public'));
app.use((req, res) => {
  return res.status(404).sendFile(join(__dirname, publicPath, '404.html'));
});

function parseCookies(header) {
  if (!header) return {};
  return header.split(';').reduce((acc, cookie) => {
    const [name, value] = cookie.trim().split('=');
    acc[name] = value;
    return acc;
  }, {});
}

const isVerified = (req) => {
  const cookies = parseCookies(req.headers.cookie);
  return cookies.verified === 'ok' || req.headers['x-bot-token'] === process.env.BOT_TOKEN;
};

const isBrowser = (req) => {
  const ua = req.headers['user-agent'] || '';
  return /Mozilla|Chrome|Safari|Firefox|Edge/i.test(ua);
};

const handleHttpVerification = (req, res, next) => {
  const acceptsHtml = req.headers.accept?.includes('text/html');
  if (!acceptsHtml) return next();
  if (isVerified(req) && isBrowser(req)) return next();
  if (!isBrowser(req)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Set-Cookie': 'verified=ok; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax'
  });
  res.end(`
    <!DOCTYPE html>
    <html>
      <body>
        <script>
          document.cookie = "verified=ok; Max-Age=86400; SameSite=Lax";
          setTimeout(() => window.location.replace(window.location.pathname), 100);
        </script>
        <noscript>Enable JavaScript to continue.</noscript>
      </body>
    </html>
  `);
};

const handleUpgradeVerification = (req, socket, next) => {
  const verified = isVerified(req);
  const isWsBrowser = isBrowser(req);
  console.log(`WebSocket Upgrade Attempt: URL=${req.url}, Verified=${verified}, IsBrowser=${isWsBrowser}, Cookies=${req.headers.cookie || 'none'}`);
  if (req.url.startsWith('/wisp/')) {
    return next();
  }
  if (verified && isWsBrowser) {
    return next();
  }
  console.log(`WebSocket Rejected: URL=${req.url}, Reason=${verified ? 'Not a browser' : 'Not verified'}`);
  socket.destroy();
};

const server = createServer((req, res) => {
  if (bare.shouldRoute(req)) {
    handleHttpVerification(req, res, () => {
      req.ipv6 = getRandomIPv6();
      bare.routeRequest(req, res);
    });
  } else {
    app.handle(req, res);
  }
});

server.on('upgrade', (req, socket, head) => {
  if (bare.shouldRoute(req)) {
    handleUpgradeVerification(req, socket, () => {
      req.ipv6 = getRandomIPv6();
      bare.routeUpgrade(req, socket, head);
    });
  } else if (req.url && req.url.startsWith('/wisp/')) {
    handleUpgradeVerification(req, socket, () => {
      req.ipv6 = getRandomIPv6();
      wisp.routeRequest(req, socket, head);
    });
  } else {
    socket.end();
  }
});
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'];

// Load cache at startup
const urls = JSON.parse(fs.readFileSync('.sitemap-base.json', 'utf8'));
cache.set('urls', urls);

// --- Priority & changefreq ---
function computePriority(commitCount, maxCommits) {
  if (maxCommits === 0) return 0.5;
  const normalized = commitCount / maxCommits;
  return Math.max(0.1, Math.min(1.0, normalized));
}
function computeChangefreq(lastmod) {
  const last = new Date(lastmod);
  const days = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return 'daily';
  if (days <= 30) return 'weekly';
  if (days <= 180) return 'monthly';
  return 'yearly';
}

// --- XML generator ---
function generateXml(domain, urls) {
  const maxCommits = urls.reduce((max, u) => Math.max(max, u.commitCount), 0);
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
  xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"\n`;
  xml += `        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n`;
  urls.forEach((u) => {
    const priority = computePriority(u.commitCount, maxCommits).toFixed(2);
    const changefreq = computeChangefreq(u.lastmod);
    xml += `  <url>\n`;
    xml += `    <loc>${domain}${u.loc}</loc>\n`;
    xml += `    <lastmod>${u.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${changefreq}</changefreq>\n`;
    xml += `    <priority>${priority}</priority>\n`;
    if (IMAGE_EXTENSIONS.includes(u.ext)) {
      xml += `    <image:image><image:loc>${domain}${u.loc}</image:loc></image:image>\n`;
    }
    if (VIDEO_EXTENSIONS.includes(u.ext)) {
      xml += `    <video:video>\n`;
      xml += `      <video:content_loc>${domain}${u.loc}</video:content_loc>\n`;
      xml += `      <video:title>${path.basename(u.loc)}</video:title>\n`;
      xml += `      <video:description>Video file ${path.basename(u.loc)}</video:description>\n`;
      xml += `    </video:video>\n`;
    }
    xml += `  </url>\n`;
  });
  xml += `</urlset>`;
  return xml;
}

// --- JSON generator ---
function generateJson(domain, urls) {
  const maxCommits = urls.reduce((max, u) => Math.max(max, u.commitCount), 0);
  return urls.map((u) => ({
    loc: domain + u.loc,
    lastmod: u.lastmod,
    changefreq: computeChangefreq(u.lastmod),
    priority: computePriority(u.commitCount, maxCommits),
    type: IMAGE_EXTENSIONS.includes(u.ext) ? 'image' : VIDEO_EXTENSIONS.includes(u.ext) ? 'video' : 'page'
  }));
}

// --- TXT generator ---
function generateTxt(domain, urls) {
  return urls.map((u) => domain + u.loc).join('\n');
}

// --- Routes ---
app.use(express.static(path.join(__dirname, 'public'))); // serve sitemap.xsl

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  const domain = req.protocol + '://' + req.get('host');
  res.send(generateXml(domain, cache.get('urls')));
});

app.get('/sitemap.json', (req, res) => {
  const domain = req.protocol + '://' + req.get('host');
  res.json(generateJson(domain, cache.get('urls')));
});

app.get('/sitemap.txt', (req, res) => {
  res.type('text/plain');
  const domain = req.protocol + '://' + req.get('host');
  res.send(generateTxt(domain, cache.get('urls')));
});
const port = parseInt(process.env.PORT || '3000');
server.listen({ port }, () => {
  const address = server.address();
  console.log(`Listening on:`);
  console.log(`\thttp://localhost:${address.port}`);
  console.log(`\thttp://${hostname()}:${address.port}`);
  console.log(`\thttp://${address.family === 'IPv6' ? `[${address.address}]` : address.address}:${address.port}`);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function shutdown(signal) {
  console.log(`${signal} received: shutting down...`);
  server.close(() => {
    console.log('HTTP server closed');
    bare.close(() => {
      console.log('Bare server closed');
      process.exit(0);
    });
  });
}
