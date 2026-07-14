/**
 * scripts/check-firestore-user.ts
 *
 * Diagnostic script to check for duplicate user entries in Firestore.
 * Usage: npx tsx scripts/check-firestore-user.ts <email>
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from '../server/services/firebaseAdmin';

async function main() {
  const email = process.argv[2];
  
  if (!email) {
    console.error('Usage: npx tsx scripts/check-firestore-user.ts <email>');
    console.error('Example: npx tsx scripts/check-firestore-user.ts bhola.upadhyay@pw.live');
    process.exit(1);
  }

  console.log(`Checking Firestore for email: ${email}\n`);

  try {
    // Check by email (document ID)
    const userDoc = await firestoreAdmin.collection('users').doc(email.toLowerCase()).get();
    
    if (userDoc.exists) {
      console.log('=== USER FOUND BY EMAIL (Document ID) ===');
      console.log('Document ID:', userDoc.id);
      console.log('Data:', JSON.stringify(userDoc.data(), null, 2));
      console.log();
    } else {
      console.log('No user found with email as document ID');
      console.log();
    }

    // Check for any documents with matching email field
    console.log('=== SEARCHING FOR DOCUMENTS WITH MATCHING EMAIL FIELD ===');
    const snapshot = await firestoreAdmin.collection('users')
      .where('Email', '==', email.toLowerCase())
      .get();

    if (snapshot.empty) {
      console.log('No documents found with Email field matching:', email);
    } else {
      console.log(`Found ${snapshot.size} document(s) with Email field matching: ${email}\n`);
      snapshot.forEach(doc => {
        console.log('Document ID:', doc.id);
        console.log('Data:', JSON.stringify(doc.data(), null, 2));
        console.log();
      });
    }

    // Check for any documents with matching UserID field
    console.log('=== SEARCHING FOR DOCUMENTS WITH MATCHING UserID FIELD ===');
    const userIdSnapshot = await firestoreAdmin.collection('users')
      .where('UserID', '==', email.toLowerCase())
      .get();

    if (userIdSnapshot.empty) {
      console.log('No documents found with UserID field matching:', email);
    } else {
      console.log(`Found ${userIdSnapshot.size} document(s) with UserID field matching: ${email}\n`);
      userIdSnapshot.forEach(doc => {
        console.log('Document ID:', doc.id);
        console.log('Data:', JSON.stringify(doc.data(), null, 2));
        console.log();
      });
    }

  } catch (error) {
    console.error('Error checking Firestore:', error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
