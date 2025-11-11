const { chromium } = require('playwright');

/**
 * Launch Apollo Pharmacy search and capture product data
 * Updated to extract from DOM since API interception is not working
 */
async function launchApolloSearch(keyword) {
    if (!keyword || typeof keyword !== 'string') {
        throw new Error('Keyword must be a non-empty string');
    }

    const url = `https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(keyword)}`;
    const launchArgs = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
    const browser = await chromium.launch(launchArgs);
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        
        // Wait for products to load
        await page.waitForTimeout(5000);
        
        // Try to extract products from the page DOM
        console.log('Apollo: Extracting products from DOM...');
        
        const products = await page.evaluate(() => {
            const productElements = document.querySelectorAll('[data-qa="product-card"], .ProductCard_productCard, [class*="ProductCard"], [class*="product-card"]');
            console.log(`Found ${productElements.length} product elements`);
            
            const extractedProducts = [];
            
            productElements.forEach((element, index) => {
                if (index >= 3) return; // Only take first 3
                
                try {
                    // Try to extract product information
                    const nameElement = element.querySelector('[data-qa="medicine_name"], [class*="medicineName"], [class*="product-name"], h2, .name');
                    const priceElement = element.querySelector('[data-qa="price"], [class*="price"], .price');
                    const imageElement = element.querySelector('img');
                    const linkElement = element.querySelector('a');
                    
                    const product = {
                        name: nameElement ? nameElement.textContent.trim() : null,
                        price: priceElement ? priceElement.textContent.trim() : null,
                        image: imageElement ? imageElement.src : null,
                        url: linkElement ? linkElement.href : null
                    };
                    
                    if (product.name) {
                        extractedProducts.push(product);
                    }
                } catch (err) {
                    console.error('Error extracting product:', err);
                }
            });
            
            return extractedProducts;
        });
        
        console.log(`Apollo: Extracted ${products.length} products from DOM`);
        
        await browser.close();
        
        if (products.length > 0) {
            return {
                products: products,
                totalProductsCount: products.length
            };
        }
        
        return null;
        
    } catch (err) {
        console.error('Apollo: Error during scraping:', err.message);
        await browser.close();
        return null;
    }
}

module.exports = { launchApolloSearch };
