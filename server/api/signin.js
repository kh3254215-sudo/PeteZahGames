import bcrypt from 'bcrypt';
import argon2 from 'argon2';
import db from '../db.js';

export async function signinHandler(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = db.prepare(
      'SELECT id, email, password_hash, username, bio, avatar_url, email_verified, ip FROM users WHERE email = ?'
    ).get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const hash = user.password_hash;
    let passwordMatch = false;

    // Detect hash type
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
      // bcrypt
      passwordMatch = await bcrypt.compare(password, hash);

      if (passwordMatch) {
        // Upgrade to Argon2id
        const newHash = await argon2.hash(password, {
          type: argon2.argon2id,
          memoryCost: 65565,   // 64 MB
          timeCost: 5,         // iterations
          parallelism: 1       // threads (you can adjust if needed)
        });
        db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
          .run(newHash, Date.now(), user.id);
      }
    } else if (hash.startsWith('$argon2id$')) {
      // Argon2id
      passwordMatch = await argon2.verify(hash, password);
    } else {
      console.warn('Unknown hash format for user:', user.email);
    }

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.email_verified) {
      return res.status(401).json({
        error: 'Please verify your email before logging in. Check your inbox for the verification link.'
      });
    }

    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || null;
    if (ip && typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
    if (!user.ip) {
      db.prepare('UPDATE users SET ip = ? WHERE id = ?').run(ip, user.id);
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      bio: user.bio,
      avatar_url: user.avatar_url
    };

    res.status(200).json({ user: req.session.user, message: 'Signin successful' });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
