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
    let foundSearchRequest = false;
    
    page.on('request', request => {
        const reqUrl = request.url();
        // Log all search-related requests to debug
        if (reqUrl.includes('apollo247.com') || reqUrl.includes('apollopharmacy.in')) {
            if (reqUrl.includes('search') || reqUrl.includes('Search')) {
                console.log(`Apollo: Found search request: ${reqUrl}`);
                foundSearchRequest = true;
            }
        }
        
        if (reqUrl.includes('https://search.apollo247.com/v4/fullSearch')) {
            const postData = request.postData();
            let payload = null;
            
            if (postData) {
                try {
                    payload = JSON.parse(postData);
                    console.log('Apollo: Matched fullSearch request with payload');
                } catch (err) {
                    console.error('Apollo: Error parsing request payload', err.message);
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
                console.log('Apollo: Received fullSearch response');
                
                if (responseBody && responseBody.data && responseBody.data.productDetails) {
                    const productDetails = responseBody.data.productDetails;
                    productData = {
                        ...productDetails,
                        products: productDetails.products ? productDetails.products.slice(0, 3) : []
                    };
                    console.log(`Apollo: Extracted ${productData.products.length} products`);
                } else {
                    console.log('Apollo: Response structure unexpected', JSON.stringify(responseBody).substring(0, 200));
                }
            } catch (err) {
                console.error('Apollo: Error parsing response', err.message);
            }
            
            matchedRequest = false;
        }
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    // Give some time for the network request of interest to fire
    await page.waitForTimeout(3000);
    
    if (!foundSearchRequest) {
        console.log('Apollo: No search requests detected - API might have changed');
    }
    
    await browser.close();
    
    return productData;
}

module.exports = { launchApolloSearch };
