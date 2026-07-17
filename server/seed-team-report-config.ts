import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from './utils/logger';

// Initialize Firebase Admin with explicit credentials for local execution
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase Admin credentials in .env file');
  process.exit(1);
}

const app = initializeApp({
  credential: cert({
    projectId,
    clientEmail,
    privateKey,
  }),
});

const firestoreAdmin = getFirestore(app);

interface TeamConfig {
  teamId: string;
  teamName: string;
  reminderDay: string;
  meetingDay: string;
  entityType: 'team' | 'subteam';
  parentTeamId?: string;
}

/**
 * Script to seed team_report_config directly to Firestore
 * 
 * This script:
 * 1. Fetches all active teams and sub-teams from Firestore
 * 2. Maps entities to their reminder/meeting days
 * 3. Seeds the Firestore collection with configurations
 */

// Map entity names to their reminder/meeting days and entity type
const ENTITY_SCHEDULE_MAP: Record<string, { reminderDay: string; meetingDay: string; entityType: 'team' | 'subteam' }> = {
  // Team-level entities
  'Ecom - SST': { reminderDay: 'Monday', meetingDay: 'Tuesday', entityType: 'team' },
  'Business Excellence': { reminderDay: 'Friday', meetingDay: 'Monday', entityType: 'team' },
  'Infra Office/Corparate': { reminderDay: 'Friday', meetingDay: 'Saturday', entityType: 'team' },
  'Expansion': { reminderDay: 'Friday', meetingDay: 'Saturday', entityType: 'team' },
  'SCM': { reminderDay: 'Friday', meetingDay: 'Saturday', entityType: 'team' },
  'Expansion-School': { reminderDay: 'Friday', meetingDay: 'Saturday', entityType: 'team' },
  'Travel Desk': { reminderDay: 'Friday', meetingDay: 'Saturday', entityType: 'team' },
  'Ecom - ERP & Tools': { reminderDay: 'Friday', meetingDay: 'Monday', entityType: 'team' },
  'Ecom - Planning': { reminderDay: 'Monday', meetingDay: 'Tuesday', entityType: 'team' },
  'Ecom - Printing': { reminderDay: 'Tuesday', meetingDay: 'Wednesday', entityType: 'team' },
  'Ecom - Purchase': { reminderDay: 'Tuesday', meetingDay: 'Wednesday', entityType: 'team' },
  'Ecom - Billing': { reminderDay: 'Tuesday', meetingDay: 'Wednesday', entityType: 'team' },
  'Warehouse': { reminderDay: 'Friday', meetingDay: 'Monday', entityType: 'team' },
  'Ecom - KAM': { reminderDay: 'Wednesday', meetingDay: 'Thursday', entityType: 'team' },
  'ATL/BTL Marketing': { reminderDay: 'Wednesday', meetingDay: 'Thursday', entityType: 'team' },

  // Sub-team-level entities under Expansion (inherit parent schedule)
  'Akshay': { reminderDay: 'Friday', meetingDay: 'Saturday', entityType: 'subteam' },
  'Aman': { reminderDay: 'Friday', meetingDay: 'Saturday', entityType: 'subteam' },
  'MEP': { reminderDay: 'Friday', meetingDay: 'Saturday', entityType: 'subteam' },
};

async function seedTeamReportConfig() {
  try {
    console.log('=== Seeding Team Report Configuration to Firestore ===\n');

    // Step 1: Fetch all active teams from Firestore
    console.log('Step 1: Fetching active teams from Firestore...');
    const teamsSnapshot = await firestoreAdmin.collection('teams').get();
    const entities: TeamConfig[] = [];
    
    teamsSnapshot.forEach(doc => {
      const team = doc.data();
      if (team.Active !== false) {
        const teamName = team.TeamName;
        const schedule = ENTITY_SCHEDULE_MAP[teamName];
        
        // Only include teams that are in the schedule map
        if (schedule && schedule.entityType === 'team') {
          entities.push({
            teamId: doc.id,
            teamName: teamName,
            reminderDay: schedule.reminderDay,
            meetingDay: schedule.meetingDay,
            entityType: 'team',
          });
        }
      }
    });
    
    console.log(`✅ Found ${entities.length} team-level entities\n`);

    // Step 2: Fetch sub-teams under Expansion
    console.log('Step 2: Fetching sub-teams under Expansion...');
    const expansionSnapshot = await firestoreAdmin.collection('teams')
      .where('TeamName', '==', 'Expansion')
      .get();

    if (!expansionSnapshot.empty) {
      const expansionId = expansionSnapshot.docs[0].id;
      const subTeamsSnapshot = await firestoreAdmin.collection('sub_teams')
        .where('TeamID', '==', expansionId)
        .get();

      subTeamsSnapshot.forEach(doc => {
        const subTeam = doc.data();
        const subTeamName = subTeam.SubTeamName;
        const schedule = ENTITY_SCHEDULE_MAP[subTeamName];

        // Only include sub-teams that are in the schedule map
        if (schedule && schedule.entityType === 'subteam') {
          entities.push({
            teamId: doc.id,
            teamName: subTeamName,
            reminderDay: schedule.reminderDay,
            meetingDay: schedule.meetingDay,
            entityType: 'subteam',
            parentTeamId: expansionId,
          });
        }
      });

      console.log(`✅ Found ${subTeamsSnapshot.size} sub-teams under Expansion\n`);
    }

    console.log(`✅ Total entities to configure: ${entities.length}\n`);

    // Step 3: Display entities
    console.log('Step 3: Entities to be configured:');
    console.log('================================');
    entities.forEach((entity, index) => {
      console.log(`${index + 1}. ${entity.teamName} (${entity.teamId})`);
      console.log(`   Type: ${entity.entityType}`);
      if (entity.parentTeamId) {
        console.log(`   Parent Team ID: ${entity.parentTeamId}`);
      }
      console.log(` reminder Day: ${entity.reminderDay}`);
      console.log(`   Meeting Day: ${entity.meetingDay}`);
      console.log('');
    });

    // Step 4: Clear configs for teams NOT in schedule map (leave blank for later admin config)
    console.log('Step 4: Clearing configs for teams not in schedule map...');
    const allConfigsSnapshot = await firestoreAdmin.collection('team_report_config').get();
    const configuredTeamIds = new Set(entities.map(e => e.teamId));
    let clearedCount = 0;

    for (const doc of allConfigsSnapshot.docs) {
      const teamId = doc.id;
      if (!configuredTeamIds.has(teamId)) {
        try {
          await firestoreAdmin.collection('team_report_config').doc(teamId).delete();
          clearedCount++;
          console.log(`🗑️  Cleared config for team ID: ${teamId}`);
        } catch (error) {
          console.error(`❌ Error clearing config for ${teamId}:`, error);
        }
      }
    }
    console.log(`✅ Cleared ${clearedCount} team configs not in schedule map\n`);

    // Step 5: Save configurations to Firestore
    console.log('Step 5: Saving configurations to Firestore...');
    let successCount = 0;
    let failureCount = 0;

    const now = new Date().toISOString();

    for (const entity of entities) {
      try {
        const docRef = firestoreAdmin.collection('team_report_config').doc(entity.teamId);
        await docRef.set({
          teamId: entity.teamId,
          teamName: entity.teamName,
          reminderDay: entity.reminderDay,
          meetingDay: entity.meetingDay,
          active: true,
          createdAt: now,
          updatedAt: now,
          entityType: entity.entityType,
          parentTeamId: entity.parentTeamId || null,
        });

        successCount++;
        console.log(`✅ Saved: ${entity.teamName}`);
      } catch (error) {
        failureCount++;
        console.error(`❌ Error saving ${entity.teamName}:`, error);
      }
    }

    console.log('\n=== Seeding Complete ===');
    console.log(`Configs Cleared: ${clearedCount}`);
    console.log(`Configs Saved: ${successCount}`);
    console.log(`Failures: ${failureCount}`);
    console.log('\nConfigurations saved to Firestore team_report_config collection.');
    console.log('Teams not in schedule map have been cleared and can be configured via Admin Panel.');

  } catch (error) {
    console.error('Error in seedTeamReportConfig:', error);
    process.exit(1);
  }
}

// Run the script
seedTeamReportConfig()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
