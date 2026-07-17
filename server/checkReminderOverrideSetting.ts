import { generateGoogleSheetsToken, fetchSheetValues } from './services/googleSheetsService';

(async () => {
  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData || !tokenData.spreadsheetId) {
    console.error('Failed to get Google Sheets token');
    process.exit(1);
  }
  const rows = await fetchSheetValues(tokenData.accessToken, tokenData.spreadsheetId, 'settings!A:B');
  const relevant = (rows || []).filter(r =>
    typeof r[0] === 'string' && (
      r[0].includes('reminder_day') ||
      r[0].includes('reminder_override') ||
      r[0].includes('weekly_report')
    )
  );
  console.log('Relevant settings rows:');
  relevant.forEach(r => console.log(' ', JSON.stringify(r)));
  process.exit(0);
})();