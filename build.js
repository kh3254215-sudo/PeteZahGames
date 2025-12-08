// @ts-check
import { execSync, spawn } from 'child_process';
import { createWriteStream, promises as fs } from 'fs';
import fse from 'fs-extra';
import ignore from 'ignore';
import minimist from 'minimist';
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'os';
import pLimit from 'p-limit';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

/**
 * Creates hash of given files/folders. Used to conditionally deploy custom
 * resources depending if source files have changed
 * @param {string[]} paths
 * @param {import("crypto").Hash} inputHash
 * @returns {string|import("crypto").Hash}
 */
function computeMetaHash(paths, inputHash) {
  const hash = inputHash ? inputHash : createHash('sha1');
  for (const path of paths) {
    const statInfo = statSync(path);
    if (statInfo.isDirectory()) {
      const directoryEntries = readdirSync(path, { withFileTypes: true });
      const fullPaths = directoryEntries.map((e) => join(path, e.name));
      // recursively walk sub-folders
      computeMetaHash(fullPaths, hash);
    } else {
      const statInfo = statSync(path);
      // compute hash string name:size:mtime
      const fileInfo = `${path}:${statInfo.size}:${statInfo.mtimeMs}`;
      hash.update(fileInfo);
    }
  }
  // if not being called recursively, get the digest and return it as the hash result
  if (!inputHash) {
    return hash.digest().toString('base64');
  }
  return hash;
}

/**
 * @typedef {Object} SitemapEntry
 * @property {string} loc
 * @property {string} lastmod
 * @property {string} filePath
 * @property {string} ext
 * @property {number} commitCount
 * @property {number} [priority]
 * @property {string} [changefreq]
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projdir = __dirname;

// JSON stream writer for large arrays
// Helper to safely encode JSON values
/**
 * Safely stringify an object to JSON, removing non-printable characters from strings.
 *
 * @param {unknown} obj
 * @returns {string}
 */
function safeJsonStringify(obj) {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'string') {
      return value.replace(/[^\x20-\x7E]/g, '');
    }
    if (DEBUG === true) {
      console.log(`Safely stringified value: ${value}`);
    }
    return value;
  });
}

/**
 * JSON array writer for large datasets.
 */
class JsonArrayWriter {
  /**
   *
   * @param {string} filePath
   */
  constructor(filePath) {
    this.stream = createWriteStream(filePath, { encoding: 'utf8' });
    this.count = 0;
    this.hasError = false;
    this.stream.write('[\n');

    // Handle stream errors
    this.stream.on('error', (err) => {
      console.error(`Error writing to ${filePath}:`, err instanceof Error ? err.message : String(err));
      this.hasError = true;
    });
  }

  /**
   * Write an object to the JSON array.
   *
   * @param {unknown} obj - Object to write
   * @returns {Promise<void>}
   */
  async write(obj) {
    if (this.hasError) {
      throw new Error('Stream is in error state');
    }

    return new Promise((resolve, reject) => {
      const data = this.count > 0 ? ',\n  ' : '  ';
      this.stream.write(data + safeJsonStringify(obj), 'utf8', (err) => {
        if (err) {
          this.hasError = true;
          reject(err);
        } else {
          this.count++;
          resolve();
        }
      });
    });
  }

  /**
   * Close the stream and return the count of written entries.
   *
   * @returns {Promise<number>}
   */
  async end() {
    if (this.hasError) {
      throw new Error('Stream is in error state');
    }
    return new Promise((resolve, reject) => {
      this.stream.end(
        '\n]\n',
        'utf8',
        /**
         * @param {Error | null | undefined} err
         * @returns {void}
         */
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(this.count);
          }
        }
      );
    });
  }
}

// Move remaining top-level constants and configuration outside the class
const args = minimist(process.argv.slice(2));
/** @type {boolean} */
let DEBUG = false;
if (args.env === 'debug') {
  DEBUG = true;
  console.log('Debug mode enabled');
}

const SKIP_SUBMODULES = args['skip-submodules'] || process.env.SKIP_SUBMODULES === '1' || false;
const _NO_CACHE = args['no-cache'] || process.env.NO_CACHE === '1' || false;
const USAGE = `build.js [options]

Options:
  --help, -h              Show this help message
  --skip-submodules       Skip building external submodules (env SKIP_SUBMODULES=1)
  --keep-submodules       Do not refresh submodules (env KEEP_SUBMODULES=1)
  --no-cache              Do not load or save git metadata cache (env NO_CACHE=1)
  --env=NAME              Set environment mode (e.g., --env=debug)
`;

// --- Submodules configuration (mirrors .gitmodules and bash array)
/** @type {string[]} */
const Submodules = ['scramjet', 'ultraviolet'];

// --- Build commands ---
/** @type {Record<string, string>} */
const buildCommands = {
  scramjet: 'CI=true pnpm install --no-verify-store-integrity	--store-dir ~/.pnpm-store && npm run rewriter:build && npm run build:all',
  ultraviolet: 'CI=true pnpm install --ignore-workspace --no-lockfile --no-verify-store-integrity && pnpm run build'
};
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';
// --- Asset building ---
const INPUT_IMAGES = path.join(projdir, 'inputimages');
const INPUT_VECTORS = path.join(projdir, 'inputvectors');
const OUTPUT_OPTIMG = path.join(projdir, 'public', 'optimg');
const OUTPUT_OUTVECT = path.join(projdir, 'public', 'outvect');

// Raster formats to generate
/**
 * @typedef {Object} RasterTarget
 * @property {string} ext
 * @property {(img: import('sharp').Sharp) => import('sharp').Sharp} opts
 */
/** @type {RasterTarget[]} */
const RASTER_TARGETS = [
  { ext: '.avif', opts: (img) => img.avif({ quality: 80 }) },
  { ext: '.webp', opts: (img) => img.webp({ quality: 80 }) },
  { ext: '.jpg', opts: (img) => img.jpeg({ quality: 80 }) },
  { ext: '.png', opts: (img) => img.png() }
];

// Recognized raster inputs (will be processed via sharp)
const RASTER_INPUT_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp', '.avif'];

// Recognized vector inputs (will be copied and rasterized via sharp)
const VECTOR_INPUT_EXTS = ['.svg', '.pdf'];
/**
 * Adds a log section header.
 *
 * @param {string} title
 * @returns {void}
 */
function logSection(title) {
  const bar = '-'.repeat(Math.max(10, title.length));
  console.log(`\n${bar}\n${title}\n${bar}`);
}

/**
 * Ensure all git submodules are initialized.
 * @returns {Promise<void>}
 */
async function ensureSubmodules() {
  logSection('Checking git submodules');
  /** @type {boolean} */
  let missing = false;
  for (const name of Submodules) {
    const dir = path.join(projdir, 'external', name);
    const exists = await fse.pathExists(dir);
    if (!exists) {
      if (args['keep-submodules'] || process.env.KEEP_SUBMODULES === '1') {
        console.log(`Submodule ${name} missing, but KEEP_SUBMODULES is set; skipping initialization.`);
        continue;
      } else {
        missing = true;
        break;
      }
    }
  }

  if (missing) {
    console.log('Not all submodules found, installing...');
    /**
     * @type {Promise<void>}
     * @returns {Promise<void>}
     */
    await new Promise((resolve, reject) => {
      const p = spawn('git', ['submodule', 'update', '--init', '--recursive'], { cwd: projdir, stdio: 'inherit' });
      p.on('close', (code) => {
        if (code === 0) resolve(undefined);
        else reject(new Error('git submodule update failed with code ' + code));
      });
    });
  } else {
    console.log('All submodules exist, continuing...');
  }
}

/**
 * Check if WSL is installed and accessible.
 * @returns {void}
 */
function checkWSL() {
  try {
    const output = execSync('wsl.exe --list --quiet', { encoding: 'utf-8' });
    const distros = output;
    if (!distros || distros.trim().length === 0) {
      throw new Error('WSL is installed but no distros found.');
    }
    console.log(`WSL distros detected: \n${distros.trim()}`);
  } catch (err) {
    throw new Error('WSL is not installed or inaccessible. Details: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Converts Windows path to WSL path and wraps command for WSL execution.
 *
 * @param {string} command - The shell command to run
 * @param {string} cwd - The current working directory (Windows path)
 * @returns {string} - The wrapped command string for WSL execution
 */
function wrapCommandForWSL(command, cwd) {
  if (os.platform() !== 'win32') {
    return command;
  }
  checkWSL();

  // Convert Windows path to WSL path
  const wslPath = cwd.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);

  // Important: do not inject Windows PATH, let WSL use its own PATH
  const wslCommand = `cd '${wslPath}' && export PATH="$HOME/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" && ${command}`;

  if (DEBUG) {
    console.log(`Converted Windows path ${cwd} to WSL path ${wslPath}`);
    return `wsl bash -c "source ~/.bashrc && echo '${command}' && ${wslCommand}"`;
  } else {
    return `wsl bash -c "source ~/.bashrc && ${wslCommand}"`;
  }
}

/**
 * Builds all configured git submodules with their respective build commands.
 * @returns {Promise<void>} Resolves when all submodules are built
 */
async function buildSubmodules() {
  for (const name of Submodules) {
    logSection(`Building ${name}`);
    /** @type {string} */
    const subdir = path.join(projdir, 'external', name);
    /** @type {string | undefined} */
    const buildcommand = buildCommands[name];
    if (!buildcommand) {
      console.warn(`No build command found for ${name}; skipping.`);
      continue;
    }
    /** @type {string} */
    const wrapped = wrapCommandForWSL(buildcommand, subdir);
    await new Promise((resolve, reject) => {
      /** @type {import('child_process').ChildProcess} */
      let command;
      if (DEBUG === true && os.platform() !== 'win32') {
        command = spawn(wrapped, {
          shell: true,
          cwd: subdir,
          env: { ...process.env, RELEASE: '1' },
          stdio: ['inherit', 'pipe', 'pipe']
        });
      } else {
        command = spawn(wrapped, {
          shell: true,
          cwd: subdir,
          env: { ...process.env, RELEASE: '1' },
          stdio: ['inherit', 'pipe', 'pipe']
        });
      }
      command.stdout?.on('data', (data) => {
        process.stdout.write(`${GREEN}${data}${RESET}`);
      });

      if (DEBUG === true) {
        command.stderr?.on('data', (data) => {
          process.stderr.write(`${YELLOW}${data}${RESET}`);
        });
      }

      command.on('close', (code) => {
        if (code === 0) {
          resolve(undefined);
        } else {
          reject(new Error(`Build failed for ${name} with exit code ${code}`));
        }
      });
    });
  }
}

/**
 *
 * @param {string} ext
 * @param {string[]} validExts
 * @returns {boolean}
 */
function shouldProcess(ext, validExts) {
  return validExts.includes(ext.toLowerCase());
}

/**
 * Convert a raster file to multiple formats.
 *
 * @param {string} inputPath
 * @param {string} baseDir
 * @param {string} outBase
 * @returns {Promise<void>}
 */
async function convertRasterFile(inputPath, baseDir, outBase) {
  const ext = path.extname(inputPath).toLowerCase();
  const rel = path.relative(baseDir, inputPath);
  const relNoExt = rel.slice(0, -ext.length);

  // Always copy original file into output
  const copyDest = path.join(outBase, rel);
  await fse.ensureDir(path.dirname(copyDest));
  await fse.copyFile(inputPath, copyDest);
  console.log(`Copied original: ${path.relative(outBase, copyDest)}`);

  // Convert to all targets except same-format
  const buffer = await fs.readFile(inputPath);
  const image = sharp(buffer);

  for (const target of RASTER_TARGETS) {
    if (target.ext === ext) {
      // Skip same-format conversion
      continue;
    }
    const outPath = path.join(outBase, relNoExt + target.ext);
    await fse.ensureDir(path.dirname(outPath));
    await target.opts(image.clone()).toFile(outPath);
    console.log(`${rel} → ${path.relative(outBase, outPath)}`);
  }
}

/**
 * Copy vector file to output directory preserving structure.
 *
 * @param {string} inputPath - Path to the input vector file
 * @param {string} baseDir - Base directory for relative path calculation
 * @param {string} outBase - Output base directory
 * @returns {Promise<void>}
 */
async function copyVectorOriginal(inputPath, baseDir, outBase) {
  const rel = path.relative(baseDir, inputPath);
  const dest = path.join(outBase, rel);
  await fse.ensureDir(path.dirname(dest));
  await fse.copyFile(inputPath, dest);
  console.log(`Copied vector: ${path.relative(outBase, dest)}`);
}

/**
 * Rasterize vector file to multiple formats as fallbacks.
 *
 * @param {string} inputPath - Path to the input vector file
 * @param {string} baseDir - Base directory for relative path calculation
 * @param {string} outBase - Output base directory
 * @returns {Promise<void>}
 */
async function rasterizeVectorFallbacks(inputPath, baseDir, outBase) {
  const ext = path.extname(inputPath).toLowerCase();
  const rel = path.relative(baseDir, inputPath);
  const relNoExt = rel.slice(0, -ext.length);

  const buffer = await fs.readFile(inputPath);
  const image = sharp(buffer);

  for (const target of RASTER_TARGETS) {
    const outPath = path.join(outBase, relNoExt + target.ext);
    await fse.ensureDir(path.dirname(outPath));
    await target.opts(image.clone()).toFile(outPath);
    console.log(`${rel} → ${path.relative(outBase, outPath)}`);
  }
}

/**
 * Recursively walk directory tree and call handler for each file.
 *
 * @param {string} dir - Starting directory path
 * @param {(file: string) => Promise<void>} handler - Async function to call for each file
 * @returns {Promise<void>}
 */
async function walk(dir, handler) {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue; // guard against undefined to satisfy TS
    /** @type {import('fs').Dirent[]} */
    const entries = await fse.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        await handler(full);
      }
    }
  }
}

async function processInputImages() {
  logSection('Processing raster images (/inputimages \u2192 /public/optimg)');
  const exists = await fse.pathExists(INPUT_IMAGES);
  if (!exists) {
    console.warn('inputimages directory not found; skipping raster pipeline.');
    return;
  }
  await walk(INPUT_IMAGES, async (file) => {
    const ext = path.extname(file).toLowerCase();
    if (!shouldProcess(ext, RASTER_INPUT_EXTS)) return;
    await convertRasterFile(file, INPUT_IMAGES, OUTPUT_OPTIMG);
  });
}

async function processInputVectors() {
  logSection('Processing vectors (/inputvectors \u2192 /public/outvect)');
  const exists = await fse.pathExists(INPUT_VECTORS);
  if (!exists) {
    console.warn('inputvectors directory not found; skipping vector pipeline.');
    return;
  }
  await walk(INPUT_VECTORS, async (file) => {
    const ext = path.extname(file).toLowerCase();
    if (!shouldProcess(ext, VECTOR_INPUT_EXTS)) return;
    // Copy original vector
    await copyVectorOriginal(file, INPUT_VECTORS, OUTPUT_OUTVECT);
    // Raster fallbacks
    await rasterizeVectorFallbacks(file, INPUT_VECTORS, OUTPUT_OUTVECT);
  });
}
const HTML_EXT = '.html';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'];

// Synchronous git helpers removed in favor of async variants (getGitLastModAsync, getGitCommitCountAsync)
// Async crawl that collects file entries without running git per-file synchronously
// Set of valid extensions for faster lookup
const VALID_EXTENSIONS = new Set([HTML_EXT, ...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);
const ignorePath = path.join(__dirname, '.sitemapignore');
/**
 * @type {import('ignore').Ignore}
 */
let sitemapIgnore;
try {
  const ignoreContent = await fse.readFile(ignorePath, 'utf8');
  sitemapIgnore = ignore().add(ignoreContent);
  console.log('Loaded .sitemapignore rules');
} catch (err) {
  console.warn('No .sitemapignore file found or failed to read:', err instanceof Error ? err.message : String(err));
  sitemapIgnore = ignore();
}

/**
 *
 * @param {string} dir
 * @param {string} [baseUrl]
 * @returns {Promise<Array<{filePath: string, loc: string, lastmod: string, ext: string, commitCount: number}>>}
 */
async function crawlAsync(dir, baseUrl = '') {
  try {
    /**
     * @type {Array<{filePath: string, loc: string, lastmod: string, ext: string, commitCount: number}>}
     */

    const results = [];
    /** @type {import('fs').Dirent[]} */
    const entries = await fse.readdir(dir, { withFileTypes: true });

    // Process directories and files in parallel
    const limit = pLimit(os.cpus().length * 2);
    const processPromises = entries.map((entry) => {
      return limit(async () => {
        const full = path.join(dir, entry.name);

        try {
          if (entry.isDirectory()) {
            const children = await crawlAsync(full, baseUrl + '/' + entry.name);
            results.push(...children);
            return;
          }

          const ext = path.extname(entry.name).toLowerCase();
          if (!VALID_EXTENSIONS.has(ext)) return;

          // Sanitize and validate URL path
          const urlPath =
            ext === HTML_EXT && entry.name.toLowerCase() === 'index.html' ? (baseUrl === '' ? '/' : baseUrl) : baseUrl + '/' + entry.name;

          const sanitizedPath = urlPath.replace(/\/+/g, '/').replace(/[^\x20-\x7E]/g, '');

          try {
            const stat = await fse.stat(full);
            // Use date-only (YYYY-MM-DD) to avoid millisecond precision and
            // reduce entropy in sitemap change detection.
            const lastmodDate = stat.mtime.toISOString().split('T')[0];
            results.push({
              filePath: full,
              loc: sanitizedPath,
              lastmod: lastmodDate,
              ext,
              commitCount: 0
            });
          } catch (statErr) {
            console.warn(`Warning: Could not stat file ${full}: ${statErr instanceof Error ? statErr.message : String(statErr)}`);
          }
        } catch (err) {
          console.warn(`Warning: Error processing ${full}: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    });

    await Promise.all(processPromises);
    return results;
  } catch (err) {
    console.error(`Error crawling directory ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
const _workdir = __dirname;
// Git metadata is fetched on-demand per-directory using fast git log commands.
// No caching in memory; results are computed and written directly to sitemap.
// This keeps memory usage low while providing accurate commit counts.

/**
 * Get commit count for a directory using git log.
 * Returns 0 if git is not available or directory is not in a git repo.
 *
 * @param {string} dir - Directory path
 * @returns {number} Commit count for files in this directory
 */
function getGitCommitCountForDir(dir) {
  try {
    // Use git log with path filtering to count commits for this directory
    const output = execSync(`git log --oneline -- .`, {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const lines = output
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);
    return lines.length;
  } catch (err) {
    console.warn(`Warning: Could not get git commit count for directory ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

/**
 * Run tasks with concurrency limit.
 *
 * @template T,R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
function withConcurrencyLimit(items, limit, fn) {
  /** @type {R[]} */
  const results = [];
  let i = 0;

  async function runWorker() {
    while (i < items.length) {
      const idx = i++;
      try {
        const result = await fn(items[idx], idx);
        if (result) results.push(result);
      } catch (err) {
        console.warn(`Worker error at index ${idx}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  const workers = new Array(Math.min(limit, items.length)).fill(null).map(() => runWorker());
  return Promise.all(workers).then(() => results);
}

/**
 * Compute priority value based on commit count and maximum commits.
 *
 * @param {number} commitCount - Number of commits for this file
 * @param {number} maxCommits - Maximum commit count across all files
 * @returns {number} Priority value between 0.1 and 1.0
 */
function computePriority(commitCount, maxCommits) {
  if (maxCommits === 0) return 0.5;
  const normalized = commitCount / maxCommits;
  return Math.max(0.1, Math.min(1.0, normalized));
}

/**
 * Compute change frequency based on last modification date.
 *
 * @param {string} lastmod
 * @returns {string}
 */
function computeChangefreq(lastmod) {
  const last = new Date(lastmod);
  const days = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
  if (isNaN(days)) return 'monthly';
  if (days <= 7) return 'daily';
  if (days <= 30) return 'weekly';
  if (days <= 180) return 'monthly';
  return 'yearly';
}

/**
 * Format duration in milliseconds to human-readable string.
 *
 * @param {number} ms
 * @returns
 */
function formatDuration(ms) {
  let s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  s = s % 3600;
  const m = Math.floor(s / 60);
  s = s % 60;
  let out = '';
  if (h > 0) out += `${h}h `;
  if (m > 0 || h > 0) out += `${m}m `;
  out += `${s}s`;
  return out.trim();
}

async function main() {
  const start = Date.now();
  logSection(`Build start (${new Date().toLocaleString()}) on ${os.platform()} node ${process.version}`);

  if (args.help || args.h) {
    console.log(USAGE);
    return;
  }

  if (!SKIP_SUBMODULES) {
    await ensureSubmodules();
    await buildSubmodules();
  } else {
    console.log('Skipping submodule builds due to SKIP_SUBMODULES flag');
  }
  const markerPath = path.join(__dirname, 'optimg', 'processed.sha1');

  try {
    await access(markerPath);
  } catch {
    await processInputImages();
    await processInputVectors();
  }
  // Setup sitemap paths
  const sitemapDir = path.join(__dirname);
  const sitemapBasePath = path.join(sitemapDir, '.sitemap-base.json');
  const _sitemapCachePath = path.join(sitemapDir, '.sitemap-cache.json');

  // Crawl files asynchronously
  const allCrawled = await crawlAsync(path.join(__dirname, 'public'));
  const rootDir = path.join(__dirname, 'public');

  const crawled = allCrawled.filter((entry) => {
    const relativePath = path.relative(rootDir, entry.filePath).replace(/\\/g, '/');
    return !sitemapIgnore.ignores(relativePath);
  });

  // Ensure sitemap directory exists
  await fse.ensureDir(sitemapDir);

  // Initialize JSON array writer
  const writer = new JsonArrayWriter(sitemapBasePath);

  // Group files by directory for more efficient processing
  /** @type {Map<string, SitemapEntry[]>} */
  const filesByDir = new Map();
  for (const entry of crawled) {
    const dir = path.dirname(entry.filePath);
    /** @type {SitemapEntry[] | undefined} */
    let arr = filesByDir.get(dir);
    if (!arr) {
      filesByDir.set(dir, [entry]);
    } else {
      arr.push(entry);
    }
  }

  console.log(`Grouped ${crawled.length} files into ${filesByDir.size} directories`);

  // Compute commit counts per-directory on-demand (one lookup per dir)
  // Map directories to their commit counts
  /** @type {Map<string, number>} */
  const dirCommitCounts = new Map();
  let maxCommits = 0;

  for (const dir of filesByDir.keys()) {
    const count = getGitCommitCountForDir(dir);
    dirCommitCounts.set(dir, count);
    maxCommits = Math.max(maxCommits, count);
  }

  if (DEBUG) {
    console.log(`Git commit counts computed: ${dirCommitCounts.size} directories, max commits: ${maxCommits}`);
  }

  // Process all entries and write directly to sitemap
  let processed = 0;
  const maxConcurrency = Math.min(200, Math.max(4, os.cpus().length * 4));

  // Create an array of entries with their directory for processing
  /** @type {Array<{entry: SitemapEntry, dir: string}>} */
  const entriesToProcess = [];
  for (const [dir, entries] of filesByDir.entries()) {
    for (const entry of entries) {
      entriesToProcess.push({ entry, dir });
    }
  }

  try {
    const batchSize = 100;
    const batches = Math.ceil(entriesToProcess.length / batchSize);

    for (let b = 0; b < batches; b++) {
      const start = b * batchSize;
      const end = Math.min(start + batchSize, entriesToProcess.length);
      const batch = entriesToProcess.slice(start, end);

      // Process batch in parallel, compute commit count from dir, and collect for writing
      const enriched = await withConcurrencyLimit(batch, maxConcurrency, async ({ entry, dir }) => {
        const commitCount = dirCommitCounts.get(dir) || 0;
        return {
          ...entry,
          commitCount,
          priority: computePriority(commitCount, maxCommits),
          changefreq: computeChangefreq(entry.lastmod)
        };
      });

      // Write all enriched entries from this batch directly to sitemap
      for (const sitemapEntry of enriched) {
        try {
          await writer.write(sitemapEntry);
          processed++;
        } catch (writeErr) {
          console.error(`Error writing entry ${sitemapEntry.loc}: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`);
        }
      }

      if ((b + 1) % 10 === 0 || b === batches - 1) {
        console.log(`Processed ${processed} entries / ${crawled.length} files (${Math.round((processed / Math.max(1, crawled.length)) * 100)}%)...`);
      }
    }
  } catch (err) {
    console.error('Error during sitemap generation:', err instanceof Error ? err.message : String(err));
    throw err;
  }

  const finalCount = await writer.end();
  console.log('Sitemap base built with', finalCount, 'entries (maxCommits: ' + maxCommits + ')');

  // Git metadata has been computed on-demand per-directory; no cache to save.
  console.log('Git commit counts computed on-demand during build (no cache)');

  // Validate generated sitemap
  try {
    const generated = await fse.readJson(sitemapBasePath);
    if (!Array.isArray(generated)) {
      throw new Error('Generated sitemap is not an array');
    }
    if (generated.length !== finalCount) {
      throw new Error(`Count mismatch: expected ${finalCount} but found ${generated.length}`);
    }

    // Basic validation of each entry
    const invalid = generated.filter((entry) => {
      return (
        !entry.loc ||
        typeof entry.loc !== 'string' ||
        !entry.lastmod ||
        typeof entry.lastmod !== 'string' ||
        typeof entry.priority !== 'number' ||
        !entry.changefreq ||
        typeof entry.changefreq !== 'string'
      );
    });

    if (invalid.length > 0) {
      console.warn(`Found ${invalid.length} invalid entries in sitemap`);
      console.warn('First invalid entry:', invalid[0]);
    } else {
      console.log('Sitemap validation successful');
    }
  } catch (err) {
    console.error('Sitemap validation failed:', err instanceof Error ? err.message : String(err));
    throw err;
  }
  logSection(`Done in ${formatDuration(Date.now() - start)}`);

  // Return success status
  return {
    totalFiles: crawled.length,
    processedFiles: finalCount,
    duration: Date.now() - start,
    sitemapPath: sitemapBasePath
  };
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
