function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withExponentialBackoff(fn, options = {}) {
  const {
    retries = 3,
    baseMs = 100,
    factor = 2,
    onRetry = () => {},
  } = options;

  let attempt = 0;
  // attempt count: attempt 0..retries (total retries+1 tries)
  // On failure and if attempt < retries, wait baseMs * factor^attempt.
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries) {
        throw err;
      }
      const delay = Math.max(0, Math.floor(baseMs * Math.pow(factor, attempt)));
      try { onRetry({ attempt, delay, error: err }); } catch (_) {}
      if (delay > 0) {
        await sleep(delay);
      }
      attempt += 1;
    }
  }
}

module.exports = { withExponentialBackoff, sleep };

