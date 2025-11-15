const { getBrowser } = require('./browserProvider');

/**
 * Fetch 1mg search results (no file saving)
 */
async function fetchAndSave1mgSearchHTML(keyword = 'paracetamol') {
    const url = `https://www.1mg.com/search/all?name=${encodeURIComponent(keyword)}&filter=true&sort=relevance`;
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Wait for the product grid to load
        await page.waitForSelector('.style__grid-container___3OfcL', { timeout: 3000 });
        
        // Extract all product data from the page
        const productsData = await page.evaluate(() => {
            const products = [];
            const productCards = document.querySelectorAll('.style__container___cTDz0');
            
            productCards.forEach((card) => {
                try {
                    // Check if it's an ad first
                    const adBadge = card.querySelector('.style__adBadge-label___1gTcr');
                    const isAd = adBadge ? true : false;
                    
                    // Product link and URL
                    const productLink = card.querySelector('a[href*="/drugs/"], a[href*="/otc/"]');
                    const productUrl = productLink ? productLink.getAttribute('href') : null;
                    
                    // Product name
                    const titleElement = card.querySelector('.style__pro-title___3zxNC');
                    const productName = titleElement ? titleElement.textContent.trim() : null;
                    
                    // Pack size
                    const packSizeElement = card.querySelector('.style__pack-size___254Cd');
                    const packSize = packSizeElement ? packSizeElement.textContent.trim() : null;
                    
                    // Image - check multiple attributes
                    const imageElement = card.querySelector('.style__image___Ny-Sa');
                    let imageUrl = null;
                    if (imageElement) {
                        imageUrl = imageElement.getAttribute('src') || 
                                   imageElement.getAttribute('data-src') ||
                                   (imageElement.getAttribute('srcset') || '').split(',')[0].trim().split(' ')[0];
                    }
                    
                    // Price extraction
                    const priceElement = card.querySelector('.style__price-tag___B2csA');
                    let sellingPrice = null;
                    let mrpPrice = null;
                    
                    if (priceElement) {
                        const priceText = priceElement.textContent.trim();
                        // Check if it has MRP label (no discount)
                        if (priceElement.querySelector('.style__mrp-tag___1RMM3')) {
                            mrpPrice = priceText.replace(/MRP|₹|,/g, '').trim();
                        } else {
                            sellingPrice = priceText.replace(/₹|,/g, '').trim();
                        }
                    }
                    
                    // Discount price (strikethrough MRP when there's a discount)
                    const discountPriceElement = card.querySelector('.style__discount-price___cFNZn');
                    if (discountPriceElement) {
                        mrpPrice = discountPriceElement.textContent.replace(/₹|,/g, '').trim();
                    }
                    
                    // Discount badge
                    const discountBadge = card.querySelector('.style__off-badge___21aDi');
                    const discount = discountBadge ? discountBadge.textContent.trim() : null;
                    
                    // Delivery info
                    const deliveryElement = card.querySelector('.style__delivery-date___cFNZn');
                    const deliveryInfo = deliveryElement ? deliveryElement.textContent.replace(/Get by|Get in/g, '').trim() : null;
                    
                    // Rating
                    const ratingElement = card.querySelector('.CardRatingDetail__ratings-container___2ZTSK');
                    const rating = ratingElement ? ratingElement.textContent.trim() : null;
                    
                    // Prescription required
                    const rxRequired = card.querySelector('.style__rx-required___3q1Xp');
                    const isPrescriptionRequired = rxRequired ? true : false;
                    
                    // Out of stock
                    const outOfStock = card.querySelector('.style__not-available___ADBvR');
                    const isOutOfStock = outOfStock ? true : false;
                    
                    const product = {
                        name: productName,
                        pack_size: packSize,
                        product_url: productUrl ? `https://www.1mg.com${productUrl}` : null,
                        image_url: imageUrl,
                        selling_price: sellingPrice ? parseFloat(sellingPrice) : null,
                        mrp: mrpPrice ? parseFloat(mrpPrice) : null,
                        discount: discount,
                        delivery_info: deliveryInfo,
                        rating: rating,
                        is_ad: isAd,
                        prescription_required: isPrescriptionRequired,
                        out_of_stock: isOutOfStock
                    };
                    
                    products.push(product);
                } catch (err) {
                    console.error('Error parsing product card:', err);
                }
            });
            
            return products;
        });
        
        // Filter out ads and return only top 3 non-ad products
        const nonAdProducts = productsData.filter(product => !product.is_ad);
        const top3Products = nonAdProducts.slice(0, 3);
        
        console.log(`1mg: Extracted ${productsData.length} products (${nonAdProducts.length} non-ads), returning top 3 non-ad products`);
        
        return { 
            ok: true,
            url,
            productsCount: nonAdProducts.length,
            products: top3Products
        };
    } catch (err) {
        return { ok: false, error: err.message };
    } finally {
        await page.close().catch(() => {});
    }
}

module.exports = { fetchAndSave1mgSearchHTML };
