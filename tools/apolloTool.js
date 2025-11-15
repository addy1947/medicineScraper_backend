const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

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
    const browser = await chromium.launch({ headless: true });
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
        } catch (e) {
            console.error('Apollo interception error:', e.message);
        }
    });

    try {
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(4000);
    } catch (e) {
        console.error('Apollo navigation error:', e.message);
    }

    await browser.close();

    if (!fullSearchJson) {
        console.warn('Apollo: fullSearch response not captured.');
        return [];
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

    const outFile = path.join(__dirname, `apollo_top3_${clean.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`);
    try {
        fs.writeFileSync(outFile, JSON.stringify({ products: normalizedTop3, productsCount: normalizedTop3.length, query: clean }, null, 2), 'utf-8');
        console.log(`Apollo: saved normalized top 3 products to ${outFile}`);
    } catch (e) {
        console.error('Apollo: failed to save top3 file:', e.message);
    }

    return { products: normalizedTop3, productsCount: normalizedTop3.length, query: clean };
}

module.exports = { launchApolloSearch };
