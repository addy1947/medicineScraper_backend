const { chromium } = require('playwright');

let browserInstance = null;
let launchingPromise = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;
  if (launchingPromise) return launchingPromise;

  const headless = process.env.HEADLESS === 'false' ? false : true; // default headless true unless explicitly set to 'false'
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-infobars',
    '--disable-extensions',
    '--no-zygote'
  ];

  console.log('Launching browser...');
  launchingPromise = chromium.launch({ headless, args: launchArgs })
    .then(b => {
      browserInstance = b;
      console.log('Browser launched successfully');
      return b;
    })
    .finally(() => { launchingPromise = null; });

  return launchingPromise;
}

async function preLaunchBrowser() {
  try {
    await getBrowser();
  } catch (e) {
    console.error('Failed to pre-launch browser:', e.message);
  }
}

async function closeBrowser() {
  if (browserInstance) {
    try { await browserInstance.close(); } catch (_) {}
    browserInstance = null;
  }
}

process.on('exit', () => { closeBrowser(); });
process.on('SIGINT', () => { closeBrowser().then(() => process.exit(0)); });
process.on('SIGTERM', () => { closeBrowser().then(() => process.exit(0)); });

module.exports = { getBrowser, preLaunchBrowser, closeBrowser };