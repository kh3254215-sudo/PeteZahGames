/* global describe test expect */
import request from 'supertest';
import { app } from '../../server.js';

describe('API endpoints', () => {
  test('GET /sitemap.json returns an object', async () => {
    const res = await request(app).get('/sitemap.json').set('User-Agent', 'Mozilla/5.0');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('length');
  }, 10000);

  test('GET /sitemap.xml returns XML content', async () => {
    const res = await request(app).get('/sitemap.xml').set('User-Agent', 'Mozilla/5.0');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).toMatch(/<urlset/);
  }, 10000);

  test('GET /sitemap.txt returns plain text', async () => {
    const res = await request(app).get('/sitemap.txt').set('User-Agent', 'Mozilla/5.0');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text.split('\n').length).toBeGreaterThan(0);
  }, 10000);

  test('GET /ip returns an integer', async () => {
    const res = await request(app).get('/ip').set('User-Agent', 'Mozilla/5.0');
    expect(res.statusCode).toBe(200);
    const ipValue = parseInt(res.text, 10);
    expect(Number.isInteger(ipValue)).toBe(true);
  });

  test('Non-existent route returns 404', async () => {
    const res = await request(app).get('/non-existent-route-12345');
    expect(res.statusCode).toBe(404);
  });
});
