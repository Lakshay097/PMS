import { generateGoogleSheetsToken, fetchSheetValues, updateSheetValues, appendSheetValues } from './services/googleSheetsService';
import { logger } from './utils/logger';

async function disableScheduledEmails() {
  try {
    logger.info('Disabling scheduled emails by setting email_enabled_scheduled_tasks to false...');

    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to obtain Google Sheets access token');
      return;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const accessToken = tokenData.accessToken;

    // Fetch current settings
    const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
    if (!settingsRows) {
      logger.error('Failed to fetch settings sheet');
      return;
    }

    // Find the email_enabled_scheduled_tasks row
    const index = settingsRows.findIndex(r => r[0] === 'email_enabled_scheduled_tasks');
    let success = false;

    if (index >= 0) {
      // Update existing row
      const range = `settings!B${index + 1}`;
      success = await updateSheetValues(accessToken, spreadsheetId, range, [['false']]);
      logger.info(`Updated existing email_enabled_scheduled_tasks setting at row ${index + 1}`);
    } else {
      // Add new row
      success = await appendSheetValues(accessToken, spreadsheetId, 'settings', [['email_enabled_scheduled_tasks', 'false']]);
      logger.info('Added new email_enabled_scheduled_tasks setting');
    }

    if (success) {
      logger.info('✅ Successfully disabled scheduled emails');
    } else {
      logger.error('Failed to update email_enabled_scheduled_tasks setting');
    }
  } catch (err) {
    logger.error('Error disabling scheduled emails:', err);
  }
}

disableScheduledEmails().then(() => {
  process.exit(0);
}).catch((err) => {
  logger.error('Script failed:', err);
  process.exit(1);
});
