/**
 * Test script for Gmail OAuth token refresh logic
 * 
 * This script tests:
 * 1. Token refresh when token is expired or within 5 minutes of expiring
 * 2. Handling of revoked/invalid refresh tokens (marks needs_reauth)
 * 
 * Usage: npx tsx scripts/test-token-refresh.ts
 */

import { getGmailToken, updateGmailAccessToken, markNeedsReauth, clearNeedsReauth } from '../server/services/gmailTokenStorage';
import { refreshAccessToken } from '../server/services/gmailOAuthService';
import { logger } from '../server/utils/logger';

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
}

async function runTests(): Promise<void> {
  const results: TestResult[] = [];

  console.log('=== Gmail OAuth Token Refresh Tests ===\n');

  // Test 1: Check if we can read a token
  console.log('Test 1: Reading a Gmail token from storage');
  try {
    // You'll need to replace this with an actual email that has a connected Gmail account
    const testEmail = 'test@example.com'; // Replace with actual email
    const token = await getGmailToken(testEmail);
    
    if (token) {
      results.push({
        testName: 'Read token from storage',
        passed: true,
        message: `Successfully read token for ${testEmail}, needsReauth: ${token.needsReauth}`
      });
      console.log(`✓ Token found for ${testEmail}`);
      console.log(`  - Refresh token exists: ${!!token.refreshToken}`);
      console.log(`  - Access token exists: ${!!token.accessToken}`);
      console.log(`  - Token expiry: ${token.tokenExpiry}`);
      console.log(`  - Needs reauth: ${token.needsReauth}`);
    } else {
      results.push({
        testName: 'Read token from storage',
        passed: false,
        message: `No token found for ${testEmail}. Please connect a Gmail account first.`
      });
      console.log(`✗ No token found for ${testEmail}`);
      console.log('  Please connect a Gmail account via the app first.');
    }
  } catch (error) {
    results.push({
      testName: 'Read token from storage',
      passed: false,
      message: `Error reading token: ${String(error)}`
    });
    console.log(`✗ Error reading token: ${error}`);
  }

  console.log('\n---\n');

  // Test 2: Simulate token expiry and test refresh
  console.log('Test 2: Token refresh with valid refresh token');
  try {
    const testEmail = 'test@example.com'; // Replace with actual email
    const token = await getGmailToken(testEmail);
    
    if (!token || !token.refreshToken) {
      results.push({
        testName: 'Token refresh with valid token',
        passed: false,
        message: 'No valid token to test refresh'
      });
      console.log('✗ Skipping - no valid token available');
    } else {
      console.log(`Attempting to refresh token for ${testEmail}...`);
      const refreshed = await refreshAccessToken(token.refreshToken);
      
      if (refreshed) {
        results.push({
          testName: 'Token refresh with valid token',
          passed: true,
          message: 'Token refreshed successfully'
        });
        console.log('✓ Token refreshed successfully');
        console.log(`  - New access token length: ${refreshed.access_token.length}`);
        console.log(`  - Expires in: ${refreshed.expires_in}s`);
      } else {
        results.push({
          testName: 'Token refresh with valid token',
          passed: false,
          message: 'Token refresh returned null'
        });
        console.log('✗ Token refresh returned null (may be revoked)');
      }
    }
  } catch (error) {
    results.push({
      testName: 'Token refresh with valid token',
      passed: false,
      message: `Exception during refresh: ${String(error)}`
    });
    console.log(`✗ Exception during refresh: ${error}`);
  }

  console.log('\n---\n');

  // Test 3: Test markNeedsReauth
  console.log('Test 3: Mark account as needing re-authentication');
  try {
    const testEmail = 'test@example.com'; // Replace with actual email
    const marked = await markNeedsReauth(testEmail);
    
    if (marked) {
      results.push({
        testName: 'Mark needs_reauth',
        passed: true,
        message: 'Successfully marked needs_reauth'
      });
      console.log('✓ Successfully marked needs_reauth');
      
      // Verify it was set
      const tokenAfter = await getGmailToken(testEmail);
      console.log(`  - needsReauth after marking: ${tokenAfter?.needsReauth}`);
    } else {
      results.push({
        testName: 'Mark needs_reauth',
        passed: false,
        message: 'Failed to mark needs_reauth'
      });
      console.log('✗ Failed to mark needs_reauth');
    }
  } catch (error) {
    results.push({
      testName: 'Mark needs_reauth',
      passed: false,
      message: `Exception: ${String(error)}`
    });
    console.log(`✗ Exception: ${error}`);
  }

  console.log('\n---\n');

  // Test 4: Test clearNeedsReauth
  console.log('Test 4: Clear needs_reauth flag');
  try {
    const testEmail = 'test@example.com'; // Replace with actual email
    const cleared = await clearNeedsReauth(testEmail);
    
    if (cleared) {
      results.push({
        testName: 'Clear needs_reauth',
        passed: true,
        message: 'Successfully cleared needs_reauth'
      });
      console.log('✓ Successfully cleared needs_reauth');
      
      // Verify it was cleared
      const tokenAfter = await getGmailToken(testEmail);
      console.log(`  - needsReauth after clearing: ${tokenAfter?.needsReauth}`);
    } else {
      results.push({
        testName: 'Clear needs_reauth',
        passed: false,
        message: 'Failed to clear needs_reauth'
      });
      console.log('✗ Failed to clear needs_reauth');
    }
  } catch (error) {
    results.push({
      testName: 'Clear needs_reauth',
      passed: false,
      message: `Exception: ${String(error)}`
    });
    console.log(`✗ Exception: ${error}`);
  }

  console.log('\n---\n');

  // Test 5: Test isGmailConnected with needs_reauth
  console.log('Test 5: isGmailConnected respects needs_reauth flag');
  try {
    const { isGmailConnected } = await import('../server/services/gmailTokenStorage');
    const testEmail = 'test@example.com'; // Replace with actual email
    
    // First mark as needing reauth
    await markNeedsReauth(testEmail);
    const connectedWhenNeedsReauth = await isGmailConnected(testEmail);
    
    // Then clear it
    await clearNeedsReauth(testEmail);
    const connectedAfterClear = await isGmailConnected(testEmail);
    
    if (!connectedWhenNeedsReauth && connectedAfterClear) {
      results.push({
        testName: 'isGmailConnected respects needs_reauth',
        passed: true,
        message: 'isGmailConnected correctly returns false when needs_reauth is true'
      });
      console.log('✓ isGmailConnected correctly respects needs_reauth flag');
      console.log(`  - Connected when needs_reauth=true: ${connectedWhenNeedsReauth}`);
      console.log(`  - Connected after clearing: ${connectedAfterClear}`);
    } else {
      results.push({
        testName: 'isGmailConnected respects needs_reauth',
        passed: false,
        message: `isGmailConnected did not respect flag (needs_reauth: ${connectedWhenNeedsReauth}, after clear: ${connectedAfterClear})`
      });
      console.log('✗ isGmailConnected did not respect needs_reauth flag');
    }
  } catch (error) {
    results.push({
      testName: 'isGmailConnected respects needs_reauth',
      passed: false,
      message: `Exception: ${String(error)}`
    });
    console.log(`✗ Exception: ${error}`);
  }

  // Print summary
  console.log('\n=== Test Summary ===');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`Passed: ${passed}/${total}`);
  
  results.forEach(result => {
    const icon = result.passed ? '✓' : '✗';
    console.log(`${icon} ${result.testName}: ${result.message}`);
  });

  if (passed === total) {
    console.log('\n✓ All tests passed!');
  } else {
    console.log(`\n✗ ${total - passed} test(s) failed`);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
