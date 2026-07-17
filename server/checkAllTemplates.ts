import './config';
import { generateGoogleSheetsToken, fetchSheetValues } from './services/googleSheetsService.js';

const tokenData = await generateGoogleSheetsToken();
const rows = await fetchSheetValues(tokenData.accessToken, tokenData.spreadsheetId, 'email_templates!A:D');
rows.slice(1).forEach(r => console.log(r[0], '|', JSON.stringify(r[1])));
