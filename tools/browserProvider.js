const { chromium } = require('playwright');

let browserInstance = null;
let launchingPromise = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;
  if (launchingPromise) return launchingPromise;
  launchingPromise = chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    .then(b => {
      browserInstance = b;
      return b;
    })
    .finally(() => { launchingPromise = null; });
  return launchingPromise;
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

module.exports = { getBrowser, closeBrowser };