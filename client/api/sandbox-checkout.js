// Same-origin relay for checkout testing while both Vercel previews stay protected.
const endpoints = new Set(['shippingCalculation', 'createPaymentIntent', 'placeOrder', 'placeDigitalOrder']);

module.exports = async function sandboxCheckout(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.VERCEL_ENV !== 'preview' || process.env.REACT_APP_ENV !== 'staging') {
    return res.status(404).json({ error: 'Not found' });
  }
  const endpoint = req.query.endpoint;
  const checkout = req.method === 'POST' && endpoints.has(endpoint);
  const download = req.method === 'GET' && ['download-validate', 'download'].includes(endpoint) &&
    typeof req.query.token === 'string' && /^[a-f0-9]{64}$/i.test(req.query.token) &&
    (endpoint === 'download-validate' || ['standard', 'original'].includes(req.query.version));
  if (!checkout && !download) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const upstream = new URL(process.env.SANDBOX_BACKEND_URL);
    if (upstream.protocol !== 'https:' || upstream.hostname !== process.env.SANDBOX_BACKEND_HOST ||
        !upstream.hostname.endsWith('.vercel.app') || !process.env.SANDBOX_BACKEND_SHARE) {
      throw new Error('Invalid sandbox relay configuration');
    }
    // A deployment-scoped, expiring share link establishes the backend access cookie.
    const accessUrl = new URL('/', upstream);
    accessUrl.searchParams.set('_vercel_share', process.env.SANDBOX_BACKEND_SHARE);
    const access = await fetch(accessUrl, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const cookie = access.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    if (!cookie) throw new Error('Sandbox backend access expired');
    const upstreamPath = checkout ? `/api/${endpoint}` : endpoint === 'download-validate'
      ? `/api/download/validate/${req.query.token}` : `/api/download/${req.query.token}?version=${req.query.version}`;
    const response = await fetch(new URL(upstreamPath, upstream), {
      method: req.method, redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      ...(checkout ? { body: JSON.stringify(req.body) } : {}), signal: AbortSignal.timeout(120000),
    });
    if (download && endpoint === 'download' && response.status === 302) {
      const location = new URL(response.headers.get('location'));
      if (location.protocol !== 'https:' || !['drive.google.com', 'drive.usercontent.google.com', 'docs.google.com'].includes(location.hostname)) {
        throw new Error('Unexpected download destination');
      }
      return res.redirect(302, location.href);
    }
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('Sandbox backend did not return JSON');
    }
    return res.status(response.status).json(await response.json());
  } catch {
    // Never return upstream URLs, access cookies, or provider credentials to the browser.
    return res.status(502).json({ error: 'Sandbox checkout is unavailable. Check the preview backend access and logs.' });
  }
};
