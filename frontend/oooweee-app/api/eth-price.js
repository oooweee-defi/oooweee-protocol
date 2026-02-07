// Module-level cache — persists across warm invocations on Vercel
let cachedPrices = null;
let cachedAt = 0;

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,eur,gbp'
    );

    if (!response.ok) {
      throw new Error(`CoinGecko responded with ${response.status}`);
    }

    const data = await response.json();

    // Cache the successful response
    cachedPrices = data.ethereum;
    cachedAt = Date.now();

    res.status(200).json({
      ethereum: data.ethereum,
      _meta: { source: 'live', cachedAt }
    });
  } catch (error) {
    // Return last cached price if available, otherwise hardcoded fallback
    const fallback = cachedPrices || { usd: 2000, eur: 1850, gbp: 1600 };
    const source = cachedPrices ? 'cached' : 'fallback';

    res.status(200).json({
      ethereum: fallback,
      _meta: {
        source,
        cachedAt: cachedAt || null,
        error: error.message,
        downSince: Date.now()
      }
    });
  }
}
