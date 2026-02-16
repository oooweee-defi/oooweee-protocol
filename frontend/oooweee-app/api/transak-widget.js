// Transak API key (same as frontend constant — not secret)
const TRANSAK_API_KEY = '5cb34a9b-f4da-43e8-8f4b-8e573b79ab22';

// Production endpoints
const REFRESH_TOKEN_URL = 'https://api.transak.com/partners/api/v2/refresh-token';
const CREATE_WIDGET_URL = 'https://api-gateway.transak.com/api/v2/auth/session';

// Module-level cache — persists across warm invocations on Vercel
let cachedAccessToken = null;
let tokenExpiresAt = 0; // ms timestamp — refresh after 6 days (token valid for 7)

const TOKEN_LIFETIME_MS = 6 * 24 * 60 * 60 * 1000; // 6 days

async function getAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const apiSecret = process.env.TRANSAK_API_SECRET;
  if (!apiSecret) {
    throw new Error('TRANSAK_API_SECRET environment variable is not set');
  }

  const res = await fetch(REFRESH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'api-secret': apiSecret,
    },
    body: JSON.stringify({ apiKey: TRANSAK_API_KEY }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Transak refresh-token failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const accessToken = data.data?.accessToken || data.accessToken;
  if (!accessToken) {
    throw new Error('No accessToken in Transak refresh-token response');
  }

  cachedAccessToken = accessToken;
  tokenExpiresAt = now + TOKEN_LIFETIME_MS;
  return accessToken;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { walletAddress, fiatCurrency } = req.query;

  // Validate wallet address (0x + 40 hex chars)
  if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    return res.status(400).json({ error: 'Valid walletAddress is required' });
  }

  // Validate fiat currency if provided
  const currency = fiatCurrency || 'EUR';
  if (!['USD', 'EUR', 'GBP'].includes(currency)) {
    return res.status(400).json({ error: 'fiatCurrency must be USD, EUR, or GBP' });
  }

  try {
    const accessToken = await getAccessToken();

    const sessionRes = await fetch(CREATE_WIDGET_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'access-token': accessToken,
      },
      body: JSON.stringify({
        widgetParams: {
          apiKey: TRANSAK_API_KEY,
          referrerDomain: 'oooweee.io',
          walletAddress,
          cryptoCurrencyCode: 'ETH',
          network: 'ethereum',
          defaultCryptoCurrency: 'ETH',
          fiatCurrency: currency,
          defaultFiatAmount: 50,
          themeColor: '7B68EE',
          disableWalletAddressForm: true,
        },
      }),
    });

    if (!sessionRes.ok) {
      const text = await sessionRes.text();
      // If token was rejected, clear cache so next request retries
      if (sessionRes.status === 401) {
        cachedAccessToken = null;
        tokenExpiresAt = 0;
      }
      throw new Error(`Transak create-widget-url failed (${sessionRes.status}): ${text}`);
    }

    const sessionData = await sessionRes.json();
    const widgetUrl = sessionData.data?.widgetUrl;

    if (!widgetUrl) {
      throw new Error('No widgetUrl in Transak response');
    }

    res.status(200).json({ widgetUrl });
  } catch (error) {
    console.error('Transak widget error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
