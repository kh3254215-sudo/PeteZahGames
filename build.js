// build.js
import { execSync, spawn } from 'child_process';
import { createWriteStream, promises as fs } from 'fs';
import fse from 'fs-extra';
import ignore from 'ignore';
import git from 'isomorphic-git';
import minimist from 'minimist';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projdir = __dirname;

// JSON stream writer for large arrays
// Helper to safely encode JSON values
function safeJsonStringify(obj) {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'string') {
      // Only keep printable ASCII characters (space through tilde)
      return value.replace(/[^\x20-\x7E]/g, '');
    }
    if (DEBUG === true) {
      console.log(`Safely strigified value: ${value}`);
    }
    return value;
  });
}

class JsonArrayWriter {
  constructor(filePath) {
    this.stream = createWriteStream(filePath, { encoding: 'utf8' });
    this.count = 0;
    this.hasError = false;
    this.stream.write('[\n');

    // Handle stream errors
    this.stream.on('error', (err) => {
      console.error(`Error writing to ${filePath}:`, err);
      this.hasError = true;
    });
  }

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

  async end() {
    if (this.hasError) {
      throw new Error('Stream is in error state');
    }

    return new Promise((resolve, reject) => {
      this.stream.end('\n]\n', 'utf8', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(this.count);
        }
      });
    });
  }
}

// Move remaining top-level constants and configuration outside the class
const args = minimist(process.argv.slice(2));
let DEBUG = false;
if (args.env === 'debug') {
  DEBUG = true;
  console.log('Debug mode enabled');
}
const SKIP_SUBMODULES = args['skip-submodules'] || process.env.SKIP_SUBMODULES === '1' || false;
const USAGE = `build.js [options]

Options:
  --help, -h              Show this help message
  --skip-submodules       Skip building external submodules (env SKIP_SUBMODULES=1)
  --keep-submodules       Do not refresh submodules (env KEEP_SUBMODULES=1)
  --env=NAME              Set environment mode (e.g., --env=debug)
`;

// --- Submodules configuration (mirrors .gitmodules and bash array)
const Submodules = ['scramjet', 'ultraviolet'];

// --- Build commands ---
const buildCommands = {
  scramjet: "CI=true pnpm install && PATH='$HOME/.cargo/bin:$PATH' npm run rewriter:build && npm run build:all",
  ultraviolet: 'CI=true pnpm install --ignore-workspace-root-check && pnpm run build'
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

function logSection(title) {
  const bar = '-'.repeat(Math.max(10, title.length));
  console.log(`\n${bar}\n${title}\n${bar}`);
}

async function ensureSubmodules() {
  logSection('Checking git submodules');
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
    await new Promise((resolve, reject) => {
      const p = spawn('git', ['submodule', 'update', '--init', '--recursive'], { cwd: projdir, stdio: 'inherit' });
      p.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('git submodule update failed with code ' + code));
      });
    });
  } else {
    console.log('All submodules exist, continuing...');
  }
}

function checkWSL() {
  try {
    const output = execSync('wsl.exe --list --quiet', { encoding: 'utf-8' });
    const distros = output;
    if (!distros || distros.trim().length === 0) {
      throw new Error('WSL is installed but no distros found.');
    }
    console.log(`WSL distros detected: ${distros.trim()}`);
  } catch (err) {
    throw new Error('WSL is not installed or inaccessible. Details: ' + err.message);
  }
}

function wrapCommandForWSL(command, cwd) {
  if (os.platform() !== 'win32') {
    console.log('Non-Windows platform detected, continuing');
    return command;
  }
  console.log('Windows detected, checking WSL...');
  checkWSL();

  // Convert Windows path to WSL path
  const wslPath = cwd.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
  if (DEBUG === true) {
    console.log(`Converted Windows path ${cwd} to WSL path ${wslPath}`);
    return `wsl bash -c "source ~/.bashrc && (cd '${wslPath}' && echo '${command}' && ${command})"`;
  } else {
    return `wsl bash -c "source ~/.bashrc && (cd '${wslPath}' && ${command})"`;
  }
}

async function buildSubmodules() {
  for (const name of Submodules) {
    logSection(`Building ${name}`);
    const subdir = path.join(projdir, 'external', name);
    const buildcommand = buildCommands[name];
    if (!buildcommand) {
      console.warn(`No build command found for ${name}; skipping.`);
      continue;
    }

    const wrapped = wrapCommandForWSL(buildcommand, subdir);
    await new Promise((resolve, reject) => {
      let command;
      if (DEBUG === true && os.platform !== 'win32') {
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
      command.stdout.on('data', (data) => {
        process.stdout.write(`${GREEN}${data}${RESET}`);
      });

      if (DEBUG === true) {
        command.stderr.on('data', (data) => {
          process.stderr.write(`${YELLOW}${data}${RESET}`);
        });
      }

      command.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed for ${name} with exit code ${code}`));
        }
      });
    });
  }
}

function shouldProcess(ext, validExts) {
  return validExts.includes(ext.toLowerCase());
}

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

async function copyVectorOriginal(inputPath, baseDir, outBase) {
  const rel = path.relative(baseDir, inputPath);
  const dest = path.join(outBase, rel);
  await fse.ensureDir(path.dirname(dest));
  await fse.copyFile(inputPath, dest);
  console.log(`Copied vector: ${path.relative(outBase, dest)}`);
}

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
async function walk(dir, handler) {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
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
  logSection('Processing raster images (/inputimages → /public/optimg)');
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
  logSection('Processing vectors (/inputvectors → /public/outvect)');
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
let sitemapIgnore;
try {
  const ignoreContent = await fse.readFile(ignorePath, 'utf8');
  sitemapIgnore = ignore().add(ignoreContent);
  console.log('Loaded .sitemapignore rules');
} catch (err) {
  console.warn('No .sitemapignore file found or failed to read:', err.message);
  sitemapIgnore = ignore();
}

async function crawlAsync(dir, baseUrl = '') {
  try {
    const results = [];
    const entries = await fse.readdir(dir, { withFileTypes: true });

    // Process directories and files in parallel
    const processPromises = entries.map(async (entry) => {
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
        const urlPath = ext === HTML_EXT && entry.name.toLowerCase() === 'index.html' ? (baseUrl === '' ? '/' : baseUrl) : baseUrl + '/' + entry.name;

        const sanitizedPath = urlPath.replace(/\/+/g, '/').replace(/[^\x20-\x7E]/g, '');

        try {
          const stat = await fse.stat(full);
          results.push({
            filePath: full,
            loc: sanitizedPath,
            lastmod: stat.mtime.toISOString(),
            ext,
            commitCount: 0
          });
        } catch (statErr) {
          console.warn(`Warning: Could not stat file ${full}: ${statErr.message}`);
        }
      } catch (err) {
        console.warn(`Warning: Error processing ${full}: ${err.message}`);
      }
    });

    await Promise.all(processPromises);
    return results;
  } catch (err) {
    console.error(`Error crawling directory ${dir}: ${err.message}`);
    return [];
  }
}

// execPromise removed; replaced by isomorphic-git

// Use isomorphic-git for fast, native git metadata with caching
const workdir = __dirname;
const gitCache = new Map();

async function getFileGitData(filePath) {
  const cacheKey = filePath;
  if (gitCache.has(cacheKey)) {
    return gitCache.get(cacheKey);
  }

  try {
    const relPath = path.relative(workdir, filePath).replace(/\\/g, '/');
    const commits = await git.log({ fs: fse, dir: workdir, filepath: relPath });

    if (!commits || commits.length === 0) {
      const result = { lastmod: null, commitCount: 0 };
      gitCache.set(cacheKey, result);
      return result;
    }

    const result = {
      lastmod: new Date(commits[0].commit.committer.timestamp * 1000).toISOString(),
      commitCount: commits.length
    };
    gitCache.set(cacheKey, result);
    return result;
  } catch (err) {
    if (DEBUG) {
      console.warn(`Git data fetch failed for ${filePath}: ${err.message}`);
    }
    const result = { lastmod: null, commitCount: 0 };
    gitCache.set(cacheKey, result);
    return result;
  }
}
function withConcurrencyLimit(items, limit, fn, flushCallback = null, options = {}) {
  const results = [];
  let i = 0;
  let activeWorkers = 0;
  const maxMemoryUsage = options.maxMemoryUsage || 0.8;
  const flushInterval = options.flushInterval || 100; // flush every N items
  let lastFlushIndex = 0;
  if (DEBUG) {
    console.log(`withConcurrencyLimit: limit=${limit}, maxMemoryUsage=${maxMemoryUsage}, flushInterval=${flushInterval}`);
  }
  async function runWorker() {
    while (i < items.length) {
      const memUsage = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal;

      // Flush if memory usage is high or enough items have accumulated
      if ((memUsage > maxMemoryUsage || i - lastFlushIndex >= flushInterval) && flushCallback && results.length > 0) {
        console.warn(`Flushing ${results.length} items at index ${i} (mem: ${Math.round(memUsage * 100)}%)`);
        await flushCallback(results.filter(Boolean));
        results.length = 0; // clear flushed results
        lastFlushIndex = i;
      }

      const idx = i++;
      try {
        activeWorkers++;
        const result = await fn(items[idx], idx);
        if (result) results.push(result);
        if (DEBUG) {
          console.log(`Worker started. Active: ${activeWorkers}`);
        }
      } catch (err) {
        console.warn(`Worker error at index ${idx}:`, err.message);
      } finally {
        activeWorkers--;
        if (DEBUG) {
          console.log(`Worker ended. Active: ${activeWorkers}`);
        }
      }
    }
  }

  const workers = new Array(Math.min(limit, items.length)).fill(null).map(() => runWorker());

  return Promise.all(workers).then(async () => {
    // Final flush after all workers complete
    if (flushCallback && results.length > 0) {
      console.warn(`Final flush of ${results.length} items`);
      await flushCallback(results.filter(Boolean));
    }
    return results;
  });
}

function computePriority(commitCount, maxCommits) {
  if (maxCommits === 0) return 0.5;
  const normalized = commitCount / maxCommits;
  return Math.max(0.1, Math.min(1.0, normalized));
}

function computeChangefreq(lastmod) {
  const last = new Date(lastmod);
  const days = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
  if (isNaN(days)) return 'monthly';
  if (days <= 7) return 'daily';
  if (days <= 30) return 'weekly';
  if (days <= 180) return 'monthly';
  return 'yearly';
}

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

  await processInputImages();
  await processInputVectors();
  // Setup sitemap paths
  const sitemapDir = path.join(__dirname);
  const sitemapBasePath = path.join(sitemapDir, 'sitemap-base.json');
  const sitemapCachePath = path.join(sitemapDir, '.sitemap-cache.json');

  // Load previous git cache if available
  try {
    const previousCache = await fse.readJson(sitemapCachePath);
    if (previousCache && typeof previousCache === 'object') {
      for (const [key, value] of Object.entries(previousCache)) {
        gitCache.set(key, value);
      }
      console.log(`Loaded ${Object.keys(previousCache).length} cached git entries`);
    }
  } catch (err) {
    console.warn(err.message);
    console.log('No previous git cache found, starting fresh');
  }

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
  const filesByDir = new Map();
  for (const entry of crawled) {
    const dir = path.dirname(entry.filePath);
    if (!filesByDir.has(dir)) {
      filesByDir.set(dir, []);
    }
    filesByDir.get(dir).push(entry);
  }

  console.log(`Grouped ${crawled.length} files into ${filesByDir.size} directories`);

  // Process directories in parallel for better git data caching
  const dirEntries = await Promise.all(
    Array.from(filesByDir.entries()).map(async ([dir, entries]) => {
      try {
        // Get git data for directory once
        const dirGitData = await getFileGitData(dir);
        return entries.map((entry) => ({
          entry,
          gitData: dirGitData // Use directory git data as fallback
        }));
      } catch (err) {
        console.warn(`Warning: Failed to get git data for directory ${dir} with error: ${err.message}`);
        return entries.map((entry) => ({ entry, gitData: null }));
      }
    })
  );

  // Process all entries in larger batches
  const batchSize = 200; // Much larger batch size
  const maxConcurrency = Math.min(200, os.cpus().length * 8); // Scale with CPU cores
  let processed = 0;
  let maxCommits = 0;

  // Flatten directory results
  const allEntries = dirEntries.flat();
  const batches = Math.ceil(allEntries.length / batchSize);

  try {
    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, allEntries.length);
      const batch = allEntries.slice(start, end);

      const enriched = await withConcurrencyLimit(
        batch,
        maxConcurrency,
        async ({ entry, gitData: dirGitData }) => {
          try {
            let gitData = dirGitData;
            if (!gitData || !gitData.lastmod) {
              gitData = await getFileGitData(entry.filePath);
            }

            maxCommits = Math.max(maxCommits, gitData.commitCount || 0);

            return {
              loc: entry.loc,
              lastmod: gitData.lastmod || entry.lastmod,
              ext: entry.ext,
              commitCount: gitData.commitCount || 0
            };
          } catch (err) {
            console.warn(`Warning: Failed to process entry ${entry.filePath}: ${err.message}`);
            return {
              loc: entry.loc,
              lastmod: entry.lastmod,
              ext: entry.ext,
              commitCount: 0
            };
          }
        },
        async (partialResults) => {
          // Flush partial results to disk
          for (const entry of partialResults.filter(Boolean)) {
            try {
              await writer.write({
                ...entry,
                priority: computePriority(entry.commitCount, maxCommits),
                changefreq: computeChangefreq(entry.lastmod)
              });
              processed++;
            } catch (writeErr) {
              console.error(`Error writing entry ${entry.loc}: ${writeErr.message}`);
            }
          }
          partialResults.length = 0; // clear memory
        }
      );

      // Final flush after batch
      for (const entry of enriched.filter(Boolean)) {
        try {
          await writer.write({
            ...entry,
            priority: computePriority(entry.commitCount, maxCommits),
            changefreq: computeChangefreq(entry.lastmod)
          });
          processed++;
        } catch (writeErr) {
          console.error(`Error writing entry ${entry.loc}: ${writeErr.message}`);
        }
      }

      if ((i + 1) % 10 === 0 || i === batches - 1) {
        console.log(`Processed ${processed}/${crawled.length} files (${Math.round((processed / crawled.length) * 100)}%)...`);
      }
    }
  } catch (err) {
    console.error('Error during sitemap generation:', err);
    throw err;
  }

  const finalCount = await writer.end();
  console.log('Sitemap base built with', finalCount, 'entries');

  // Save git cache for future runs
  try {
    const cacheObject = Object.fromEntries(gitCache);
    await fse.writeJson(sitemapCachePath, cacheObject, { spaces: 2 });
    console.log(`Saved git cache with ${gitCache.size} entries`);
  } catch (err) {
    console.warn('Failed to save git cache:', err.message);
  }

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
    console.error('Sitemap validation failed:', err.message);
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
  console.error(err);
  process.exit(1);
});
