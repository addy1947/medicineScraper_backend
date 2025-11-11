const { chromium } = require('playwright');
const cheerio = require('cheerio');

/**
 * Capture the PharmEasy search page HTML response.
 * Navigates to the search page and extracts product data from menuitem elements.
 */
async function capturePharmEasyTypeaheadFromPage(keyword) {
    if (!keyword || typeof keyword !== 'string') {
        throw new Error('Keyword must be a non-empty string');
    }

    const searchUrl = `https://pharmeasy.in/search/all?name=${encodeURIComponent(keyword)}`;

    // Try to use system Chrome if available to avoid large downloads; fallback to bundled browser
    const launchArgs = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
    let browser;
    try {
        browser = await chromium.launch({ ...launchArgs, channel: 'chrome' });
    } catch (e) {
        browser = await chromium.launch(launchArgs);
    }
    const page = await browser.newPage();
    try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // Wait a bit for content to load
        await page.waitForTimeout(2000);

        // Extract only menuitem elements
        const menuItems = await page.evaluate(() => {
            const items = document.querySelectorAll('[role="menuitem"]');
            return Array.from(items).map(item => item.outerHTML).join('\n');
        });

        if (!menuItems) {
            throw new Error('Failed to extract menu items');
        }

        // Parse the HTML directly without saving it
        const $ = cheerio.load(menuItems);
        const products = [];
        
        $('[role="menuitem"]').each((index, element) => {
            const dataId = $(element).attr('data-id');
            
            // Skip data-id="0" as it's not product data
            if (dataId === '0') {
                return;
            }
            
            const $link = $(element).find('a').first();
            const productUrl = $link.attr('href');
            
            // Extract product name
            const productName = $(element).find('.ProductCard_medicineName__Uzjm7').text().trim();
            
            // Extract brand/manufacturer
            const brand = $(element).find('.ProductCard_brandName__p8vDS').text().trim().replace('By ', '');
            
            // Extract unit/measurement
            const unit = $(element).find('.ProductCard_measurementUnit__utxiv').text().trim();
            
            // Extract price
            const priceText = $(element).find('.ProductCard_ourPrice__yU5GB').text().trim();
            const price = parseFloat(priceText.replace('₹', '').replace('*', '').trim());
            
            // Extract original price
            const originalPriceText = $(element).find('.ProductCard_originalMrp__9osyn .ProductCard_striked__OoYd9').text().trim();
            const originalPrice = parseFloat(originalPriceText.replace('₹', '').trim());
            
            // Extract discount percentage
            const discountText = $(element).find('.ProductCard_gcdDiscountPercent__Dl0UK').text().trim();
            const discount = discountText.replace('% OFF', '').trim();
            
            // Extract image URL
            const imgSrc = $(element).find('img.ProductCard_productImage__LUmca').attr('src') || 
                           $(element).find('img.ProductCard_productImage__LUmca').attr('srcset')?.split(' ')[0];
            
            // Only add if we have valid product data
            if (productName && productUrl) {
                products.push({
                    dataId,
                    name: productName,
                    brand: brand || null,
                    unit: unit || null,
                    price: isNaN(price) ? null : price,
                    originalPrice: isNaN(originalPrice) ? null : originalPrice,
                    discount: discount || null,
                    image: imgSrc || null,
                    url: productUrl ? `https://pharmeasy.in${productUrl}` : null
                });
            }
        });
        
        // Keep only top 3 products
        const top3Products = products.slice(0, 3);

        // Return products to caller without saving to disk
        return {
            ok: true,
            products: top3Products
        };
    } finally {
        await page.close().catch(() => {});
        await browser.close().catch(() => {});
    }
}

module.exports = { capturePharmEasyTypeaheadFromPage };
