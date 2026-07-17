import './config';
import { generateGoogleSheetsToken, fetchSheetValues } from './services/googleSheetsService.js';

const tokenData = await generateGoogleSheetsToken();
const rows = await fetchSheetValues(tokenData.accessToken, tokenData.spreadsheetId, 'email_templates!A:D');
rows.forEach((r, i) => console.log(i + 1, '|', r[0], '|', JSON.stringify(r[1])));
