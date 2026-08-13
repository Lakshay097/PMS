console.log('[TEST] Script starting...');

async function main() {
  console.log('[TEST] Main function called');
  console.log('[TEST] Process args:', process.argv);
}

main().then(() => {
  console.log('[TEST] Script complete');
}).catch((err) => {
  console.error('[TEST] Error:', err);
});
