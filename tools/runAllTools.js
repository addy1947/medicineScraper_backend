const tools = require('./index');

async function runAll(keyword) {
  if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
    throw new Error('Keyword must be a non-empty string');
  }
  const kw = keyword.trim();
  console.log('Running all tools concurrently for:', kw);

  const tasks = {
    apollo: tools.launchApolloSearch(kw).catch(e => ({ error: e.message })),
    pharmeasy: tools.capturePharmEasyTypeaheadFromPage(kw).catch(e => ({ error: e.message })),
    netmeds: tools.captureNetmedsProducts(kw).catch(e => ({ error: e.message })),
    onemg: tools.fetchAndSave1mgSearchHTML(kw).catch(e => ({ error: e.message })),
    truemeds: tools.captureTruemedsProducts(kw).catch(e => ({ error: e.message }))
  };

  const start = Date.now();
  const [apolloRes, pharmeasyRes, netmedsRes, onemgRes, truemedsRes] = await Promise.all(Object.values(tasks));
  const durationMs = Date.now() - start;

  const summary = {
    keyword: kw,
    durationMs,
    apollo: apolloRes,
    pharmeasy: pharmeasyRes,
    netmeds: netmedsRes,
    onemg: onemgRes,
    truemeds: truemedsRes
  };

  // Basic counts
  console.log('Summary counts:', {
    apollo: apolloRes?.products ? apolloRes.products.length : 0,
    pharmeasy: pharmeasyRes?.products ? pharmeasyRes.products.length : 0,
    netmeds: netmedsRes?.products ? netmedsRes.products.length : 0,
    onemg: onemgRes?.products ? onemgRes.products.length : 0,
    truemeds: truemedsRes?.products ? truemedsRes.products.length : 0,
    durationMs
  });

  return summary;
}

if (require.main === module) {
  const kw = process.argv[2] || 'paracetamol';
  runAll(kw)
    .then(summary => {
      console.log('\nDetailed summary:\n', JSON.stringify(summary, null, 2));
    })
    .catch(err => {
      console.error('Runner error:', err.message);
      process.exitCode = 1;
    });
}

module.exports = { runAll };