import dotenv from 'dotenv';
import crypto from 'crypto';
import https from 'https';

dotenv.config();

async function generateAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.trim();

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const claims = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp,
    iat
  };

  const header = { alg: "RS256", typ: "JWT" };
  const base64UrlHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64UrlPayload = Buffer.from(JSON.stringify(claims)).toString("base64url");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${base64UrlHeader}.${base64UrlPayload}`);
  const formattedKey = privateKey.replace(/\\n/g, "\n");
  const signature = sign.sign(formattedKey, "base64url");
  const jwt = `${base64UrlHeader}.${base64UrlPayload}.${signature}`;

  const postData = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt
  }).toString();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'oauth2.googleapis.com',
      port: 443,
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const tokenData = JSON.parse(data);
          resolve(tokenData.access_token);
        } else {
          reject(new Error(`Token exchange failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function testSpreadsheetAccess(accessToken, spreadsheetId) {
  console.log(`\nTesting access to spreadsheet: ${spreadsheetId}`);
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'sheets.googleapis.com',
      port: 443,
      path: `/v4/spreadsheets/${spreadsheetId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const sheetData = JSON.parse(data);
          console.log('✅ Successfully accessed spreadsheet');
          console.log(`   Title: ${sheetData.properties.title}`);
          console.log(`   Sheets: ${sheetData.sheets.map(s => s.properties.title).join(', ')}`);
          resolve(true);
        } else if (res.statusCode === 403) {
          console.log('❌ 403 Forbidden - Permission denied');
          console.log(`   Response: ${data}`);
          resolve(false);
        } else if (res.statusCode === 404) {
          console.log('❌ 404 Not Found - Spreadsheet does not exist or you don\'t have access');
          console.log(`   Response: ${data}`);
          resolve(false);
        } else {
          console.log(`❌ Error: ${res.statusCode}`);
          console.log(`   Response: ${data}`);
          resolve(false);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function testDriveAccess(accessToken) {
  console.log('\nTesting Drive API access (search for spreadsheet)...');
  
  return new Promise((resolve, reject) => {
    const query = encodeURIComponent("name='PMS Systems Database' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    const options = {
      hostname: 'www.googleapis.com',
      port: 443,
      path: `/drive/v3/files?q=${query}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const driveData = JSON.parse(data);
          console.log('✅ Drive API access successful');
          if (driveData.files && driveData.files.length > 0) {
            console.log(`   Found ${driveData.files.length} spreadsheet(s)`);
            driveData.files.forEach(file => {
              console.log(`   - ${file.name} (${file.id})`);
            });
          } else {
            console.log('   No spreadsheets found (will create new one)');
          }
          resolve(true);
        } else if (res.statusCode === 403) {
          console.log('❌ 403 Forbidden - Drive API permission denied');
          console.log(`   Response: ${data}`);
          resolve(false);
        } else {
          console.log(`❌ Error: ${res.statusCode}`);
          console.log(`   Response: ${data}`);
          resolve(false);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('=== Google Sheets API Access Test ===\n');
  
  try {
    const accessToken = await generateAccessToken();
    console.log('✅ Access token generated successfully');

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    
    if (spreadsheetId) {
      await testSpreadsheetAccess(accessToken, spreadsheetId);
    } else {
      console.log('No GOOGLE_SPREADSHEET_ID set, will test Drive API instead');
    }

    await testDriveAccess(accessToken);

    console.log('\n=== Summary ===');
    console.log('If you see 403 errors, you need to:');
    console.log('1. Go to https://console.cloud.google.com/apis/library');
    console.log('2. Enable "Google Sheets API"');
    console.log('3. Enable "Google Drive API"');
    console.log('4. Share your spreadsheet with the service account email:');
    console.log(`   ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
