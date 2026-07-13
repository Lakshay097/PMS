import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getGmailToken } from './services/gmailTokenStorage';
import { logger } from './utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from parent directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function getGmailMessageHeaders(messageId: string, accessToken: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=Subject`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail API error: ${errorText}`);
  }

  const data = await response.json();
  return data;
}

async function listRecentMessages(accessToken: string, maxResults: number = 5) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail API error: ${errorText}`);
  }

  const data = await response.json();
  return data.messages || [];
}

async function checkEmailHeaders() {
  try {
    const senderEmail = 'rajeev.1@pw.live';
    console.log(`Checking email headers for ${senderEmail}\n`);

    const token = await getGmailToken(senderEmail);
    if (!token || !token.accessToken) {
      console.error('Failed to get Gmail token');
      return;
    }

    console.log(`Found access token for ${senderEmail}\n`);

    // Get recent messages
    const recentMessages = await listRecentMessages(token.accessToken, 10);
    console.log(`Found ${recentMessages.length} recent messages\n`);

    // Get headers for each message
    for (const msg of recentMessages) {
      try {
        const messageData = await getGmailMessageHeaders(msg.id, token.accessToken);
        const headers = messageData.payload?.headers || [];
        
        const messageId = headers.find((h: any) => h.name === 'Message-ID')?.value || 'N/A';
        const inReplyTo = headers.find((h: any) => h.name === 'In-Reply-To')?.value || 'N/A';
        const references = headers.find((h: any) => h.name === 'References')?.value || 'N/A';
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'N/A';
        const threadId = messageData.threadId || 'N/A';

        console.log(`Gmail API Message ID: ${msg.id}`);
        console.log(`Gmail Thread ID: ${threadId}`);
        console.log(`Message-ID header: ${messageId}`);
        console.log(`Subject: ${subject}`);
        console.log(`In-Reply-To: ${inReplyTo}`);
        console.log(`References: ${references}`);
        console.log('---\n');
      } catch (err) {
        console.error(`Error fetching headers for message ${msg.id}:`, err);
      }
    }

  } catch (error) {
    console.error('Error checking email headers:', error);
  }
}

checkEmailHeaders();
