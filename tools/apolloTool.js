const { getBrowser } = require('./browserProvider');

/**
 * Capture Apollo search page network traffic, intercept fullSearch response,
 * extract top 3 products, save them to a JSON file, and return the array.
 * Only saves the top 3; no other files or structures retained.
 */
async function launchApolloSearch(keyword) {
    if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
        throw new Error('Keyword must be a non-empty string');
    }
    const clean = keyword.trim();
    const searchUrl = `https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(clean)}`;
    const targetApi = 'https://search.apollo247.com/v4/fullSearch';
    const browser = await getBrowser();
    const startTime = Date.now();
    console.log(`[Apollo] Opening page...`);
    const page = await browser.newPage();

    let fullSearchJson = null;

    page.on('response', async (resp) => {
        try {
            const url = resp.url();
            if (!url.startsWith(targetApi)) return;
            if (resp.status() !== 200) return;
            if (fullSearchJson) return; // already captured
            const ct = resp.headers()['content-type'] || '';
            if (!ct.includes('application/json')) return;
            fullSearchJson = await resp.json();
        } catch (e) {}
    });

    try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
        await page.waitForResponse(resp => resp.url().startsWith(targetApi), { timeout: 20000 });
        await page.waitForTimeout(500);
    } catch (e) {}

    const requestTime = Date.now() - startTime;
    console.log(`[Apollo] Request completed in ${requestTime}ms`);
    await page.close().catch(()=>{});
    console.log(`[Apollo] Page closed`);

    if (!fullSearchJson) {
        return { products: [], productsCount: 0, query: clean };
    }

    const products = Array.isArray(fullSearchJson?.data?.productDetails?.products)
        ? fullSearchJson.data.productDetails.products
        : [];

    const rawTop3 = products.slice(0, 3);
    const normalizedTop3 = rawTop3.map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        urlKey: p.urlKey,
        unitSize: p.unitSize,
        price: p.price, // original MRP
        specialPrice: typeof p.specialPrice === 'number' ? p.specialPrice : p.price, // effective purchasing price
        discountPercentage: p.discountPercentage,
        thumbnail: p.thumbnail,
        isPrescriptionRequired: p.isPrescriptionRequired,
        additionalInfo: p.additionalInfo || {},
        tags: p.tags || null,
    }));

    return { products: normalizedTop3, productsCount: normalizedTop3.length, query: clean };
}

module.exports = { launchApolloSearch };
