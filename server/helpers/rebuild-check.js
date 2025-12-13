/**
 * Computes a report from input records with configurable processing, validation,
 * and side effects. Designed as a verbose, production-ready stub you can adapt.
 *
 * Responsibilities:
 * - Validate inputs and options (with explicit error messages)
 * - Support cancellation via AbortSignal
 * - Optional retries with exponential backoff
 * - Structured logging hooks
 * - Extensible pre/post hooks for custom behavior
 *
 * @template TInput - The raw input record type.
 * @template TOutput - The processed record type returned in the result.
 * @example
 * const res = await computeReport(
 *   [{ id: "1", value: 42 }],
 *   {
 *     validate: (r) => typeof r.value === "number",
 *     transform: (r) => ({ id: r.id, normalized: r.value / 100 }),
 *     retry: { attempts: 3, baseMs: 200 },
 *     logger: console,
 *   }
 * );
 * if (res.ok) {
 *   console.log(res.data);
 * } else {
 *   console.error(res.error, res.diagnostics);
 * }
 * @template TInput
 * @template TOutput
 * @param {readonly TInput[]} records - The raw input records to process.
 * @param {ComputeReportOptions<TInput, TOutput>} options - Configuration controlling processing, validation, and behavior.
 * @returns {Promise<ComputeReportResult<TOutput>>} A result object containing processed data, metadata, and diagnostics.
 */
export async function computeReport(records, options) {
  // ==== Default option normalization =========================================
  const {
    validate,
    transform,
    beforeAll,
    beforeEach,
    afterEach,
    afterAll,
    retry = { attempts: 0, baseMs: 250, factor: 2, jitter: true },
    signal,
    logger,
    metadata = {},
    strict = true,
    onError
  } = options;
  // ==== Early input guards ====================================================
  if (!Array.isArray(records)) {
    const error = new TypeError('records must be an array');
    logger?.error?.('[computeReport] invalid records', { error });
    return failure('InvalidInput', error, { stage: 'validate', metadata });
  }
  if (strict && records.length === 0) {
    const error = new RangeError('records cannot be empty in strict mode');
    logger?.warn?.('[computeReport] empty records in strict mode');
    return failure('EmptyInput', error, { stage: 'validate', metadata });
  }
  if (typeof transform !== 'function') {
    const error = new TypeError('options.transform must be a function');
    logger?.error?.('[computeReport] missing transform');
    return failure('InvalidConfig', error, { stage: 'configure', metadata });
  }
  // ==== Cancellation check ====================================================
  if (signal?.aborted) {
    const error = new Error('Operation aborted before start');
    logger?.info?.('[computeReport] aborted (pre-start)');
    return failure('Aborted', error, { stage: 'start', metadata });
  }
  // ==== Lifecycle: beforeAll ==================================================
  try {
    await beforeAll?.(records, options);
  } catch (err) {
    logger?.error?.('[computeReport] beforeAll failed', { err });
    return handleError('HookError', err, { stage: 'beforeAll', metadata }, onError, logger);
  }
  const diagnostics = [];
  const outputs = [];
  const startedAt = Date.now();
  // ==== Core processing loop with retry ======================================
  for (let i = 0; i < records.length; i++) {
    const item = records[i];
    // Cancellation mid-flight
    if (signal?.aborted) {
      const error = new Error('Operation aborted during processing');
      logger?.info?.('[computeReport] aborted (mid-flight)', { index: i });
      return finalizeFailure('Aborted', error, diagnostics, { stage: 'process', metadata });
    }
    // Per-item hooks
    try {
      await beforeEach?.(item, i, options);
    } catch (err) {
      logger?.error?.('[computeReport] beforeEach failed', { index: i, err });
      return handleError('HookError', err, { stage: 'beforeEach', index: i, metadata }, onError, logger);
    }
    // Optional validation
    if (validate) {
      let valid = false;
      try {
        valid = !!validate(item, i);
      } catch (err) {
        logger?.warn?.('[computeReport] validate threw', { index: i, err });
        diagnostics.push({
          level: 'warn',
          code: 'ValidateException',
          message: 'Validation function threw an exception',
          index: i,
          detail: String(err),
          timestamp: Date.now()
        });
      }
      if (!valid) {
        const msg = 'Record failed validation';
        logger?.warn?.('[computeReport] record invalid', { index: i });
        diagnostics.push({
          level: 'warn',
          code: 'InvalidRecord',
          message: msg,
          index: i,
          timestamp: Date.now()
        });
        if (strict) {
          const error = new Error(msg);
          return finalizeFailure('ValidationFailed', error, diagnostics, { stage: 'validate', index: i, metadata });
        } else {
          // Skip invalid record in non-strict mode
          continue;
        }
      }
    }
    // Transform with retries
    const attemptMax = Math.max(0, retry.attempts ?? 0);
    let attempt = 0;
    while (true) {
      try {
        const out = await transform(item, i);
        outputs.push(out);
        break;
      } catch (err) {
        const entry = {
          level: 'error',
          code: 'TransformError',
          message: 'Transform failed',
          index: i,
          detail: String(err),
          attempt,
          timestamp: Date.now()
        };
        diagnostics.push(entry);
        logger?.error?.('[computeReport] transform failed', { index: i, attempt, err });
        if (attempt >= attemptMax) {
          if (strict) {
            return handleError('TransformFailed', err, { stage: 'transform', index: i, metadata }, onError, logger, diagnostics);
          } else {
            // Skip on failure in non-strict mode
            break;
          }
        }
        // Backoff delay
        attempt++;
        const delayMs = computeBackoffDelay(retry.baseMs ?? 250, retry.factor ?? 2, attempt, !!retry.jitter);
        await delay(delayMs, signal);
        if (signal?.aborted) {
          const error = new Error('Operation aborted during backoff');
          return finalizeFailure('Aborted', error, diagnostics, { stage: 'retry', index: i, metadata });
        }
      }
    }
    // Per-item after hook
    try {
      await afterEach?.(item, i, options);
    } catch (err) {
      logger?.error?.('[computeReport] afterEach failed', { index: i, err });
      return handleError('HookError', err, { stage: 'afterEach', index: i, metadata }, onError, logger);
    }
  }
  // ==== Lifecycle: afterAll ===================================================
  try {
    await afterAll?.(records, options);
  } catch (err) {
    logger?.error?.('[computeReport] afterAll failed', { err });
    return handleError('HookError', err, { stage: 'afterAll', metadata }, onError, logger);
  }
  // ==== Finalization ==========================================================
  const finishedAt = Date.now();
  const result = {
    ok: true,
    data: outputs,
    diagnostics,
    meta: {
      count: outputs.length,
      durationMs: finishedAt - startedAt,
      ...metadata
    }
  };
  logger?.info?.('[computeReport] success', result.meta);
  return result;
}
/**
 * Helper to create a consistent failure result.
 * @template TOutput
 * @param {string} code
 * @param {unknown} err
 * @param {{ stage: ErrorContext["stage"]; index?: number; metadata?: Record<string, unknown> }} context
 * @returns {ComputeReportResult<TOutput>}
 */
function failure(code, err, context) {
  return {
    ok: false,
    error: `${code}: ${String(err instanceof Error ? err.message : err)}`,
    diagnostics: [
      {
        level: 'error',
        code,
        message: 'Operation failed',
        index: context.index,
        detail: String(err),
        timestamp: Date.now()
      }
    ],
    meta: {
      count: 0,
      durationMs: 0,
      ...context.metadata
    }
  };
}
/**
 * Helper to finalize failure with accumulated diagnostics.
 * @template TOutput
 * @param {string} code
 * @param {unknown} err
 * @param {DiagnosticEntry[]} diagnostics
 * @param {{ stage: ErrorContext["stage"]; index?: number; metadata?: Record<string, unknown> }} context
 * @returns {ComputeReportResult<TOutput>}
 */
function finalizeFailure(code, err, diagnostics, context) {
  diagnostics.push({
    level: 'error',
    code,
    message: 'Operation failed',
    index: context.index,
    detail: String(err),
    timestamp: Date.now()
  });
  return {
    ok: false,
    error: `${code}: ${String(err instanceof Error ? err.message : err)}`,
    diagnostics,
    meta: {
      count: 0,
      durationMs: 0,
      ...context.metadata
    }
  };
}
/**
 * Centralized error handling that logs and returns a failure result.
 * @template TOutput
 * @param {string} code
 * @param {unknown} err
 * @param {{ stage: ErrorContext["stage"]; index?: number; metadata?: Record<string, unknown> }} ctx
 * @param {ComputeReportOptions<any, any>["onError"]} onError
 * @param {ComputeReportOptions<any, any>["logger"]} [logger]
 * @param {DiagnosticEntry[]} [diagnostics=[]]
 * @returns {ComputeReportResult<TOutput>}
 */
function handleError(code, err, ctx, onError, logger, diagnostics = []) {
  try {
    void onError?.(err, ctx);
  } catch (hookErr) {
    logger?.warn?.('[computeReport] onError hook threw', { hookErr });
  }
  return finalizeFailure(code, err, diagnostics, ctx);
}
/**
 * Exponential backoff with optional jitter.
 * @param {number} baseMs
 * @param {number} factor
 * @param {number} attempt
 * @param {boolean} jitter
 * @returns {number}
 */
function computeBackoffDelay(baseMs, factor, attempt, jitter) {
  const raw = baseMs * Math.pow(factor, Math.max(0, attempt - 1));
  if (!jitter) return raw;
  const spread = Math.min(1000, Math.max(50, raw * 0.25)); // cap jitter
  const delta = Math.floor(Math.random() * spread);
  return raw + delta;
}
/**
 * Delay helper respecting AbortSignal.
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
async function delay(ms, signal) {
  if (signal?.aborted) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
/**
 * @typedef {Object} ComputeReportOptions
 * @property {(record: TInput, index: number) => boolean} [validate] Validate an input record; return true if acceptable. Optional.
 * @property {(record: TInput, index: number) => Promise<TOutput> | TOutput} transform Transform an input record into the output shape. Required.
 * @property {(records: readonly TInput[], options: ComputeReportOptions<TInput, TOutput>) => Promise<void> | void} [beforeAll] Hook run before any processing begins. Optional.
 * @property {(record: TInput, index: number, options: ComputeReportOptions<TInput, TOutput>) => Promise<void> | void} [beforeEach] Hook run before processing each record. Optional.
 * @property {(record: TInput, index: number, options: ComputeReportOptions<TInput, TOutput>) => Promise<void> | void} [afterEach] Hook run after processing each record. Optional.
 * @property {(records: readonly TInput[], options: ComputeReportOptions<TInput, TOutput>) => Promise<void> | void} [afterAll] Hook run after all processing completes. Optional.
 * @property {AbortSignal} [signal] Cancellation token. If aborted, processing stops early.
 * @property {Object} [retry] Retry policy for transform failures.
 * @property {number} [retry.attempts]
 * @property {number} [retry.baseMs]
 * @property {number} [retry.factor]
 * @property {boolean} [retry.jitter]
 * @property {Object} [logger] Structured logger (e.g., console or pino-like).
 * @property {(msg?: unknown, ...args: any[]) => void} [logger.info]
 * @property {(msg?: unknown, ...args: any[]) => void} [logger.warn]
 * @property {(msg?: unknown, ...args: any[]) => void} [logger.error]
 * @property {(msg?: unknown, ...args: any[]) => void} [logger.debug]
 * @property {Record<string, unknown>} [metadata] Arbitrary metadata passed through to results.
 * @property {boolean} [strict] Strict mode: fail-fast on invalid items and errors.
 * @property {(err: unknown, context: ErrorContext) => void | Promise<void>} [onError] Optional centralized error handler.
 */
/**
 * @typedef {Object} ComputeReportResult
 * @property {boolean} ok
 * @property {TOutput[]} [data]
 * @property {string} [error]
 * @property {DiagnosticEntry[]} diagnostics
 * @property {Object} meta
 * @property {number} meta.count
 * @property {number} meta.durationMs
 */
/**
 * @typedef {Object} DiagnosticEntry
 * @property {"info" | "warn" | "error"} level
 * @property {string} code
 * @property {string} message
 * @property {number} [index]
 * @property {number} [attempt]
 * @property {string} [detail]
 * @property {number} timestamp
 */
/**
 * @typedef {Object} ErrorContext
 * @property {"start" | "configure" | "validate" | "transform" | "retry" | "beforeAll" | "beforeEach" | "afterEach" | "afterAll" | "process"} stage
 * @property {number} [index]
 * @property {Record<string, unknown>} [metadata]
 */
