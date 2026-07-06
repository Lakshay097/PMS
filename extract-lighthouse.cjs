const fs = require('fs');
const html = fs.readFileSync('lighthouse-report.html', 'utf8');
const match = html.match(/window\.__LIGHTHOUSE_JSON__ = ({.*?});<\/script>/s);

if (match) {
  const json = JSON.parse(match[1]);
  const metrics = [
    'first-contentful-paint', 
    'largest-contentful-paint', 
    'total-blocking-time', 
    'cumulative-layout-shift', 
    'speed-index', 
    'interactive',
    'total-byte-weight',
    'unused-javascript',
    'unused-css-rules',
    'render-blocking-resources',
    'uses-rel-preconnect',
    'server-response-time'
  ];
  
  console.log('=== PRODUCTION BUILD PERFORMANCE METRICS ===\n');
  console.log('Overall Performance Score:', json.categories.performance.score);
  console.log('\nCore Web Vitals:');
  
  metrics.forEach(m => {
    const audit = json.audits[m];
    if (audit) {
      console.log(`${m}:`);
      console.log(`  Score: ${audit.score}`);
      console.log(`  Value: ${audit.displayValue}`);
      if (audit.numericValue !== undefined) {
        console.log(`  Numeric: ${audit.numericValue}`);
      }
      console.log('');
    }
  });
  
  console.log('\n=== RESOURCE SUMMARY ===');
  const resourceSummary = json.audits['resource-summary'];
  if (resourceSummary) {
    resourceSummary.details.items.forEach(item => {
      console.log(item.label + ':');
      console.log('  Count: ' + item.requestCount);
      const sizeMB = item.transferSize / 1024 / 1024;
      console.log('  Size: ' + item.transferSize + ' bytes (' + sizeMB.toFixed(2) + ' MB)');
    });
  }
} else {
  console.log('Could not find Lighthouse JSON in report');
}
