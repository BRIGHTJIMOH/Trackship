import {WalletError} from './provider.mjs';

export const FUNDING_WEBHOOK_PATH = '/api/wallet/webhooks/mock-bank';
const MAX_BODY = 65536;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    const finish = (error, value) => {
      clearTimeout(timer);
      req.off('data', data); req.off('end', end); req.off('error', failed); req.off('aborted', aborted);
      if (error) { req.resume(); reject(error); } else resolve(value);
    };
    const data = chunk => {
      size += chunk.length;
      if (size > MAX_BODY) finish(new WalletError('Webhook is too large.', 413));
      else parts.push(chunk);
    };
    const end = () => finish(null, Buffer.concat(parts));
    const failed = () => finish(new WalletError('Webhook body could not be read.'));
    const aborted = () => finish(new WalletError('Webhook request was interrupted.'));
    const timer = setTimeout(() => finish(new WalletError('Webhook body timed out.', 408)), 10000);
    timer.unref();
    req.on('data', data); req.once('end', end); req.once('error', failed); req.once('aborted', aborted);
  });
}

// Explicit test injection only; no environment flag silently enables mock funding.
export function createFundingWebhookHandler({funding, env = process.env, clock = Date.now, rateLimit = 60}) {
  if (env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production' || funding?.provider?.mode !== 'mock') {
    throw new Error('Mock wallet funding cannot be mounted in production.');
  }
  if (!Number.isSafeInteger(rateLimit) || rateLimit < 1 || rateLimit > 1000) throw new Error('Invalid webhook rate limit.');
  const requests = new Map();
  function allowed(address) {
    const now = clock();
    for (const [key, item] of requests) if (item.until <= now) requests.delete(key);
    let entry = requests.get(address);
    if (!entry) {
      if (requests.size >= 10000) return false;
      entry = {until: now + 60000, count: 0}; requests.set(address, entry);
    }
    return ++entry.count <= rateLimit;
  }
  return {
    matches: req => req.url?.split('?')[0] === FUNDING_WEBHOOK_PATH,
    async handle(req, res) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      const send = (status, value) => { res.writeHead(status); res.end(JSON.stringify(value)); };
      try {
        if (!allowed(req.socket.remoteAddress || 'unknown')) throw new WalletError('Too many webhook requests. Retry later.', 429);
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new WalletError('Use POST for webhooks.', 405); }
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '') ||
            req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
          throw new WalletError('Send an uncompressed application/json webhook.', 415);
        }
        const length = req.headers['content-length'];
        if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) throw new WalletError('Webhook is too large.', 413);
        const rawBody = await readRawBody(req);
        const result = await funding.receive({rawBody, signature: req.headers['x-sendrack-mock-signature']});
        send(200, result);
      } catch (error) {
        const status = error instanceof WalletError ? error.status : 503;
        if (status === 429 || status === 503) res.setHeader('Retry-After', '60');
        // Close rejected requests rather than retaining unread request bodies on keep-alive sockets.
        res.setHeader('Connection', 'close');
        send(status, {error: error instanceof WalletError ? error.message : 'Funding is temporarily unavailable. Retry the same event.'});
      }
    }
  };
}
