const { getBrowser } = require('./browserProvider');

/**
 * Fetch Truemeds search results (no file saving)
 */
async function captureTruemedsProducts(keyword) {
    const slugify = (text) => (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const makeTruemedsUrl = (product) => {
        const code = (product?.productCode || '').toLowerCase();
        let name = product?.skuName || '';
        const mgMatch = /(\d+)\s*mg/i.exec(product?.composition || '');
        if (mgMatch && !/\bmg\b/i.test(name)) {
            const num = mgMatch[1];
            const re = new RegExp(`\\b${num}\\b`);
            if (re.test(name)) name = name.replace(re, `${num} mg`);
            else name = `${name} ${num} mg`;
        }
        const slug = slugify(name);
        if (!slug || !code) return null;
        return `https://www.truemeds.in/otc/${slug}-${code}`;
    };
    const baseUrl = 'https://nal.tmmumbai.in/CustomerService/getSearchSuggestion';
    const params = new URLSearchParams({
        searchString: keyword,
        isMultiSearch: 'true',
        elasticSearchType: 'SEARCH_SUGGESTION',
        warehouseId: '20',
        variantId: '18',
        searchVariant: 'N',
        signal: '[object AbortSignal]',
        orderConfirmSrc: 'WEBSITE',
        sourceVersion: 'TM_WEBSITE_V_4.4.1'
    });
    
    const url = `${baseUrl}?${params.toString()}`;
    
    const browser = await getBrowser();
    const page = await browser.newPage();
    
    try {
        // Navigate to the API endpoint
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        if (!response || !response.ok()) {
            return { 
                ok: false, 
                error: `Failed to fetch: ${response ? response.status() : 'No response'}` 
            };
        }
        
        // Get the JSON response
        const jsonData = await response.json();
        
        if (!jsonData) {
            return { ok: false, error: 'No JSON data received' };
        }
        
        // Extract only the product list from the response
        const productList = jsonData?.responseData?.productList || [];
        
        if (productList.length === 0) {
            return { ok: false, error: 'No products found in response' };
        }
        
        // Extract only the "product" object from each item (exclude "suggestion")
        // and limit to top 3 results
        const products = productList
            .map(item => item.product)
            .filter(Boolean)
            .slice(0, 3)
            .map(product => {
                const packSize = parseFloat(product.packSize) || 1;
                const pricePerItem = packSize > 0 ? (product.sellingPrice / packSize).toFixed(2) : null;
                
                return {
                    productCode: product.productCode,
                    skuName: product.skuName,
                    manufacturerName: product.manufacturerName,
                    mrp: product.mrp,
                    sellingPrice: product.sellingPrice,
                    discount: product.discount,
                    packSize: product.packSize,
                    packForm: product.packForm,
                    productImageUrl: product.productImageUrl,
                    composition: product.composition,
                    link: makeTruemedsUrl(product),
                    pricePerItem: pricePerItem ? parseFloat(pricePerItem) : null
                };
            });
        
        console.log(`Truemeds: Extracted ${products.length} products, returning to frontend`);
        
        // Return products data to frontend (no file saving)
        return { 
            ok: true,
            products: products,
            productsCount: products.length,
            message: 'Truemeds data retrieved successfully'
        };
        
    } catch (err) {
        console.error('Truemeds error:', err.message);
        return { ok: false, error: err.message };
    } finally {
        await page.close().catch(() => {});
    }
}

module.exports = { captureTruemedsProducts };
