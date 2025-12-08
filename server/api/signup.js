import argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import dotenv from 'dotenv';
import db from '../db.js';

dotenv.config();

const requestTimestamps = new Map();
const suspiciousIPs = new Map();
const usedTokens = new Map();

function getClientIP(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.connection?.remoteAddress || null;
  if (ip && typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return ip || 'unknown';
}

function validateBotToken(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }

  let decoded;
  try {
    decoded = Buffer.from(token, 'base64').toString('utf-8');
  } catch (e) {
    return false;
  }

  const parts = decoded.split(':');
  if (parts.length !== 2) {
    return false;
  }

  const timestamp = parseInt(parts[0]);
  const random = parts[1];

  if (isNaN(timestamp) || !random) {
    return false;
  }

  const now = Date.now();
  const age = now - timestamp;

  if (age < 2000) return false;
  if (age > 300000) return false;

  const tokenHash = createHash('sha256').update(token).digest('hex');
  if (usedTokens.has(tokenHash)) {
    return false;
  }

  usedTokens.set(tokenHash, now);
  setTimeout(() => {
    usedTokens.delete(tokenHash);
  }, 900000);

  return true;
}

function validateRequest(req, body) {
  const ip = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';
  const accept = req.headers['accept'] || '';
  const contentType = req.headers['content-type'] || '';
  const formTime = parseInt(req.headers['x-form-time'] || '0');

  if (body.website && body.website.trim() !== '') return false;
  if (!body.bot_token || !validateBotToken(body.bot_token)) return false;
  if (!userAgent || userAgent.length < 10) return false;

  const botPatterns = [/bot|crawler|spider|scraper|curl|wget|python|java|go-http|php|ruby|perl|headless|puppeteer|selenium/i];
  if (botPatterns.some((pattern) => pattern.test(userAgent))) return false;

  if (!accept.includes('application/json') && !accept.includes('*/*') && !accept.includes('text/html')) return false;
  if (!contentType.includes('application/json')) return false;
  if (formTime < 2000 || formTime > 3600000) return false;

  const now = Date.now();
  const ipKey = `signup_${ip}`;
  const lastRequest = requestTimestamps.get(ipKey) || 0;

  if (now - lastRequest < 3000) {
    const suspiciousCount = suspiciousIPs.get(ip) || 0;
    suspiciousIPs.set(ip, suspiciousCount + 1);
    if (suspiciousCount > 2) return false;
  }

  requestTimestamps.set(ipKey, now);
  setTimeout(() => {
    requestTimestamps.delete(ipKey);
  }, 60000);

  return true;
}

export async function signupHandler(req, res) {
  const { email, password, school, age, website, bot_token } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Signup failed.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Signup failed.' });
  }
  if (!validateRequest(req, { website, bot_token })) {
    const ip = getClientIP(req);
    const count = suspiciousIPs.get(ip) || 0;
    suspiciousIPs.set(ip, count + 1);
    return res.status(400).json({ error: 'Signup failed.' });
  }

  try {
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Signup failed.' });
    }

    // Argon2id hashing
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65565, // ~64 MB
      timeCost: 5, // iterations
      parallelism: 1 // threads
    });

    const userId = randomUUID();
    const now = Date.now();
    const ip = getClientIP(req);

    const isFirstUser = db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0;
    const isAdmin = isFirstUser || email === process.env.ADMIN_EMAIL;

    db.prepare(
      `
      INSERT INTO users (id, email, password_hash, created_at, updated_at, is_admin, email_verified, school, age, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(userId, email, passwordHash, now, now, isAdmin ? 1 : 0, 1, school || null, age || null, ip);

    const ipKey = `signup_${ip}`;
    requestTimestamps.delete(ipKey);

    res.status(201).json({
      message: isFirstUser ? 'Admin account created and verified automatically!' : 'Account created successfully! You can now log in.'
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed.' });
  }
}
