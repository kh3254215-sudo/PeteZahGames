const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'];
/**
 * @param {number} commitCount
 * @param {number} maxCommits
 * @returns {number}
 */
function computePriority(commitCount, maxCommits) {
  if (maxCommits === 0) return 0.5;
  const normalized = commitCount / maxCommits;
  return Math.max(0.1, Math.min(1.0, normalized));
}
/**
 * @param {Date} lastmod
 * @returns {string}
 */
function computeChangefreq(lastmod) {
  const last = new Date(lastmod);
  const days = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return 'daily';
  if (days <= 30) return 'weekly';
  if (days <= 180) return 'monthly';
  return 'yearly';
}
/**
 * @param {URL} domain
 * @param {Array<{ loc: string; lastmod: Date; commitCount: number; ext: string }>} urls
 * @returns {string}
 */
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
      xml += `      <video:title>${u.loc.replace(/.*\//, '')}</video:title>\n`;
      xml += `      <video:description>Video file ${u.loc.replace(/.*\//, '')}</video:description>\n`;
      xml += `    </video:video>\n`;
    }
    xml += `  </url>\n`;
  });
  xml += `</urlset>`;
  return xml;
}
/**
 * @param {URL} domain
 * @param {UrlEntry[]} urls
 * @returns {JsonEntry[]}
 */
function generateJson(domain, urls) {
  const maxCommits = urls.reduce((max, u) => Math.max(max, u.commitCount), 0);
  return urls.map((u) => ({
    loc: domain.toString() + u.loc, // safer than domain + u.loc
    lastmod: u.lastmod,
    changefreq: computeChangefreq(u.lastmod),
    priority: computePriority(u.commitCount, maxCommits),
    type: IMAGE_EXTENSIONS.includes(u.ext) ? 'image' : VIDEO_EXTENSIONS.includes(u.ext) ? 'video' : 'page'
  }));
}
/**
 * @param {URL} domain
 * @param {Array<{ loc: string }>} urls
 * @returns {string}
 */
function generateTxt(domain, urls) {
  return urls.map((u) => domain + u.loc).join('\n');
}
export { computeChangefreq, computePriority, generateJson, generateTxt, generateXml };
/**
 * @typedef {Object} UrlEntry
 * @property {string} loc
 * @property {Date} lastmod
 * @property {number} commitCount
 * @property {string} ext
 */
/**
 * @typedef {Object} JsonEntry
 * @property {string} loc
 * @property {Date} lastmod
 * @property {string} changefreq
 * @property {number} priority
 * @property {'image' | 'video' | 'page'} type
 */
