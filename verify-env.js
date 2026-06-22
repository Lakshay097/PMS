import dotenv from 'dotenv';
import crypto from 'crypto';
import https from 'https';

// Load environment variables
dotenv.config();

console.log('=== PMS Environment Configuration Verification ===\n');

// Check required environment variables
const requiredVars = [
  'JWT_SECRET',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY'
];

const optionalVars = [
  'GOOGLE_SPREADSHEET_ID',
  'GEMINI_API_KEY',
  'NODE_ENV',
  'PORT'
];

console.log('1. Checking required environment variables:');
let allRequiredPresent = true;
for (const varName of requiredVars) {
  const value = process.env[varName];
  if (value) {
    // Mask sensitive values
    const displayValue = varName.includes('KEY') || varName.includes('SECRET') 
      ? `${value.substring(0, 8)}...${value.substring(value.length - 8)}`
      : value;
    console.log(`   ✓ ${varName}: ${displayValue}`);
  } else {
    console.log(`   ✗ ${varName}: MISSING`);
    allRequiredPresent = false;
  }
}

console.log('\n2. Checking optional environment variables:');
for (const varName of optionalVars) {
  const value = process.env[varName];
  if (value) {
    const displayValue = varName.includes('KEY') || varName.includes('SECRET')
      ? `${value.substring(0, 8)}...${value.substring(value.length - 8)}`
      : value;
    console.log(`   ✓ ${varName}: ${displayValue}`);
  } else {
    console.log(`   - ${varName}: not set (optional)`);
  }
}

if (!allRequiredPresent) {
  console.log('\n❌ ERROR: Missing required environment variables. Please check your .env file.');
  process.exit(1);
}

// Test Google Service Account token generation
console.log('\n3. Testing Google Service Account token generation...');
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
const privateKey = process.env.GOOGLE_PRIVATE_KEY?.trim();

if (!email || !privateKey) {
  console.log('   ✗ Google Service Account credentials not found');
  process.exit(1);
}

try {
  // Check private key format
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
    console.log('   ✗ Private key format is invalid. It should start with "-----BEGIN PRIVATE KEY-----"');
    console.log('   Make sure to use \\n for line breaks in the .env file');
    process.exit(1);
  }

  // Format the private key
  const formattedKey = privateKey.replace(/\\n/g, '\n');

  // Create JWT
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
  
  try {
    const signature = sign.sign(formattedKey, "base64url");
    const jwt = `${base64UrlHeader}.${base64UrlPayload}.${signature}`;
    
    console.log('   ✓ JWT created successfully');
    console.log('   ✓ Private key format is valid');

    // Try to exchange JWT for access token
    console.log('\n4. Testing Google OAuth token exchange...');
    
    const postData = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    }).toString();

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
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          const tokenData = JSON.parse(data);
          console.log('   ✓ Access token obtained successfully');
          console.log(`   ✓ Token expires in: ${tokenData.expires_in} seconds`);
          console.log('\n✅ SUCCESS: Google Service Account is properly configured!');
          console.log('\nNext steps:');
          console.log('   - Ensure Google Sheets API is enabled in Google Cloud Console');
          console.log('   - Ensure Google Drive API is enabled in Google Cloud Console');
          console.log('   - If using an existing spreadsheet, share it with the service account email');
        } else {
          console.log(`   ✗ Token exchange failed with status ${res.statusCode}`);
          console.log(`   Response: ${data}`);
          console.log('\n❌ ERROR: Failed to obtain access token');
          console.log('Common causes:');
          console.log('   - Google Sheets API not enabled in Google Cloud Console');
          console.log('   - Google Drive API not enabled in Google Cloud Console');
          console.log('   - Service account email is incorrect');
          console.log('   - Private key is invalid or expired');
          process.exit(1);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`   ✗ Request error: ${error.message}`);
      console.log('\n❌ ERROR: Failed to connect to Google OAuth servers');
      process.exit(1);
    });

    req.write(postData);
    req.end();

  } catch (signError) {
    console.log('   ✗ Failed to sign JWT:', signError.message);
    console.log('   This usually means the private key is invalid or corrupted');
    process.exit(1);
  }

} catch (error) {
  console.log('   ✗ Error:', error.message);
  process.exit(1);
}
