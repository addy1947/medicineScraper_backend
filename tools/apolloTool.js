const { chromium } = require('playwright');

/**
 * Launch Apollo Pharmacy search and capture product data
 */
async function launchApolloSearch(keyword) {
    if (!keyword || typeof keyword !== 'string') {
        throw new Error('Keyword must be a non-empty string');
    }

    const url = `https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(keyword)}`;
    const launchArgs = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
    const browser = await chromium.launch(launchArgs);
    const page = await browser.newPage();

    let matchedRequest = false;
    let productData = null;
    
    page.on('request', request => {
        if (request.url().includes('https://search.apollo247.com/v4/fullSearch')) {
            const postData = request.postData();
            let payload = null;
            
            if (postData) {
                try {
                    payload = JSON.parse(postData);
                } catch (err) {
                    // Silent error handling
                }
            }
            
            if (payload && 
                'filters' in payload && 
                payload.page === 1 && 
                'pincode' in payload && 
                'productsPerPage' in payload && 
                'query' in payload && 
                'selSortBy' in payload) {
                matchedRequest = true;
            }
        }
    });

    page.on('response', async response => {
        const reqUrl = response.url();
        if (reqUrl.includes('https://search.apollo247.com/v4/fullSearch') && matchedRequest) {
            try {
                const responseBody = await response.json();
                
                if (responseBody && responseBody.data && responseBody.data.productDetails) {
                    const productDetails = responseBody.data.productDetails;
                    productData = {
                        ...productDetails,
                        products: productDetails.products ? productDetails.products.slice(0, 3) : []
                    };
                }
            } catch (err) {
                // Silent error handling
            }
            
            matchedRequest = false;
        }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Give some time for the network request of interest to fire
    await page.waitForTimeout(5000);
    await browser.close();
    
    return productData;
}

module.exports = { launchApolloSearch };
