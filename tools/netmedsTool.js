const { getBrowser } = require('./browserProvider');

/**
 * Function to clean medicine data - keep only important fields
 */
function cleanMedicineData(items) {
    const importantFields = [
        'name', 'slug', 'uid', 'item_code', 'brand_name', 'price', 'discount',
        'available_sizes', 'categories', 'is_active', 'sellable', 'rating',
        'description', 'country_of_origin', 'tags', 'medias', 'url'
    ];

    const importantAttributeFields = {
        'genericname': 'generic_name',
        'genericnamewithdosage': 'generic_with_dosage',
        'ingredients': 'ingredients',
        'marketername': 'marketer',
        'manufacturername': 'manufacturer',
        'dosage': 'dosage',
        'dosageunit': 'dosage_unit',
        'packsize': 'pack_size',
        'packsizeunit': 'pack_size_unit',
        'itemtype': 'item_type',
        'mrp': 'mrp',
        'schedule': 'schedule'
    };

    return items.map(item => {
        const cleaned = {};

        // Copy important top-level fields
        importantFields.forEach(field => {
            if (item[field] !== undefined) {
                cleaned[field] = item[field];
            }
        });

        // Add full Netmeds product URL
        if (item.url && typeof item.url === 'string') {
            cleaned.product_url = `https://www.netmeds.com${item.url}`;
        }

        // Extract important fields from attributes
        if (item.attributes) {
            cleaned.medicine_info = {};
            
            Object.keys(importantAttributeFields).forEach(oldKey => {
                const newKey = importantAttributeFields[oldKey];
                if (item.attributes[oldKey] !== undefined && item.attributes[oldKey] !== null && item.attributes[oldKey] !== '') {
                    cleaned.medicine_info[newKey] = item.attributes[oldKey];
                }
            });

            if (Object.keys(cleaned.medicine_info).length === 0) {
                delete cleaned.medicine_info;
            }
        }

        // Clean HTML from description
        if (cleaned.description && typeof cleaned.description === 'string') {
            cleaned.description = cleaned.description
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/\\u[\dA-Fa-f]{4}/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 500);
        }

        // Simplify medias - keep only first image
        if (cleaned.medias && Array.isArray(cleaned.medias) && cleaned.medias.length > 0) {
            cleaned.image_url = cleaned.medias[0].url;
            delete cleaned.medias;
        }

        // Simplify categories
        if (cleaned.categories && Array.isArray(cleaned.categories)) {
            cleaned.category_names = cleaned.categories.map(cat => cat.name);
            delete cleaned.categories;
        }

        // Simplify price
        if (cleaned.price && cleaned.price.effective) {
            cleaned.selling_price = cleaned.price.effective.min;
            cleaned.marked_price = cleaned.price.marked ? cleaned.price.marked.min : null;
            cleaned.currency = cleaned.price.effective.currency_code;
            delete cleaned.price;
        }

        // Calculate price per unit
        if (cleaned.medicine_info && cleaned.selling_price) {
            const packSize = parseInt(cleaned.medicine_info.pack_size);
            if (!isNaN(packSize) && packSize > 0) {
                cleaned.price_per_unit = cleaned.selling_price / packSize;
            }
        }

        return cleaned;
    });
}

/**
 * Capture Netmeds product data (no file saving)
 */
async function captureNetmedsProducts(keyword) {
    if (!keyword || typeof keyword !== 'string') {
        throw new Error('Keyword must be a non-empty string');
    }

    const searchUrl = `https://www.netmeds.com/products?q=${encodeURIComponent(keyword)}&sort_on=relevance`;

    const browser = await getBrowser();
    const startTime = Date.now();
    console.log(`[Netmeds] Opening page...`);
    const page = await browser.newPage();
    let htmlContent = null;

    try {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        // Use a realistic user agent and increase navigation timeout
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        page.setDefaultNavigationTimeout(120000);
        page.on('response', async (response) => {
            const url = response.url();
            if (url === searchUrl && response.status() === 200) {
                try {
                    htmlContent = await response.text();
                } catch (err) {}
            }
        });

        // Retry navigation a couple of times before giving up
        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
            attempts++;
            try {
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
                break;
            } catch (err) {
                console.warn(`[Netmeds] goto attempt ${attempts} failed: ${err.message}`);
                if (attempts >= maxAttempts) throw err;
                await sleep(1500 * attempts);
            }
        }

        // If network capture failed for any reason, fallback to the current page HTML
        if (!htmlContent) {
            try {
                htmlContent = await page.content();
            } catch (_) {}
        }

        // Extract and parse only the items array from the HTML
        if (htmlContent) {
            // Extract the items array using a more robust approach
            // Find the start of items array
            const itemsStartMatch = htmlContent.match(/"items"\s*:\s*\[/);
            if (!itemsStartMatch) {
                return {
                    ok: false,
                    error: 'Failed to find items array in HTML'
                };
            }
            
            const startIndex = itemsStartMatch.index + itemsStartMatch[0].length - 1; // -1 to include the [
            
            // Find the closing bracket by counting brackets
            let bracketCount = 0;
            let endIndex = -1;
            let inString = false;
            let escapeNext = false;
            
            for (let i = startIndex; i < htmlContent.length; i++) {
                const char = htmlContent[i];
                
                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }
                
                if (char === '\\') {
                    escapeNext = true;
                    continue;
                }
                
                if (char === '"') {
                    inString = !inString;
                    continue;
                }
                
                if (!inString) {
                    if (char === '[') {
                        bracketCount++;
                    } else if (char === ']') {
                        bracketCount--;
                        if (bracketCount === 0) {
                            endIndex = i + 1;
                            break;
                        }
                    }
                }
            }
            
            if (endIndex === -1) {
                return {
                    ok: false,
                    error: 'Failed to find end of items array'
                };
            }
            
            const itemsArray = htmlContent.substring(startIndex, endIndex);
            
            try {
                const items = JSON.parse(itemsArray);
                const cleanedData = cleanMedicineData(items);
                const top3Products = cleanedData.slice(0, 3);
                
                const requestTime = Date.now() - startTime;
                console.log(`[Netmeds] Request completed in ${requestTime}ms`);
                
                return {
                    ok: true,
                    products: top3Products,
                    productsCount: top3Products.length,
                    message: `Netmeds: Found ${cleanedData.length} products`
                };
            } catch (err) {
                return {
                    ok: false,
                    error: `Failed to parse products: ${err.message}`
                };
            }
        } else {
            return {
                ok: false,
                error: 'Failed to capture HTML response'
            };
        }
    } finally {
        await page.close().catch(() => {});
        console.log(`[Netmeds] Page closed`);
    }
}

module.exports = { captureNetmedsProducts };
