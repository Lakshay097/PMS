import 'dotenv/config';
import { firestoreAdmin } from './services/firebaseAdmin';
import { logger } from './utils/logger';

interface TeamRecipientUpdate {
  teamId: string;
  teamName: string;
  teamLeaderEmails: string[];
  stakeholderEmails: string[];
}

async function updateTeamRecipients() {
  try {
    console.log('=== Update Team Recipients ===\n');

    // Define the recipient updates here
    const updates: TeamRecipientUpdate[] = [
      {
        teamId: 'T-230',
        teamName: 'Software Purchase',
        teamLeaderEmails: [], // Add team leader emails here
        stakeholderEmails: [], // Add stakeholder emails here
      },
      {
        teamId: 'T-125',
        teamName: 'Administration',
        teamLeaderEmails: [],
        stakeholderEmails: [],
      },
      {
        teamId: 'T-263',
        teamName: 'Expansion - Akshay',
        teamLeaderEmails: [],
        stakeholderEmails: [],
      },
      {
        teamId: 'T-267',
        teamName: 'Supply Chain Management',
        teamLeaderEmails: [],
        stakeholderEmails: [],
      },
      {
        teamId: 'T-3',
        teamName: 'Expansion-School',
        teamLeaderEmails: [],
        stakeholderEmails: [],
      },
      {
        teamId: 'T-5',
        teamName: 'Travel Desk',
        teamLeaderEmails: [],
        stakeholderEmails: [],
      },
      {
        teamId: 'T-6',
        teamName: 'E-Com',
        teamLeaderEmails: [],
        stakeholderEmails: [],
      },
      {
        teamId: 'T-7',
        teamName: 'Business Excellence',
        teamLeaderEmails: [],
        stakeholderEmails: [],
      },
      {
        teamId: 'T-706',
        teamName: 'Infra Office/Corparate',
        teamLeaderEmails: [],
        stakeholderEmails: [],
      },
      {
        teamId: 'T-739',
        teamName: 'ATL/BTL Marketing',
        teamLeaderEmails: [],
        stakeholderEmails: [],
      },
      {
        teamId: 'T-ALL',
        teamName: 'Global Management',
        teamLeaderEmails: [],
        stakeholderEmails: [],
      },
    ];

    console.log(`Preparing to update ${updates.length} teams:\n`);
    updates.forEach(update => {
      console.log(`${update.teamName} (${update.teamId})`);
      console.log(`  Team Leaders: ${update.teamLeaderEmails.length} emails`);
      console.log(`  Stakeholders: ${update.stakeholderEmails.length} emails`);
      console.log('');
    });

    console.log('Proceeding with updates...\n');

    let successCount = 0;
    let failureCount = 0;

    for (const update of updates) {
      try {
        const teamRef = firestoreAdmin.collection('teams').doc(update.teamId);
        await teamRef.update({
          TeamLeaderEmails: update.teamLeaderEmails,
          StakeholderEmails: update.stakeholderEmails,
          UpdatedAt: new Date().toISOString(),
        });
        successCount++;
        console.log(`✅ Updated: ${update.teamName}`);
      } catch (error) {
        failureCount++;
        console.error(`❌ Failed to update ${update.teamName}:`, error);
      }
    }

    console.log('\n=== Update Complete ===');
    console.log(`Success: ${successCount}`);
    console.log(`Failures: ${failureCount}`);

  } catch (error) {
    console.error('Error in updateTeamRecipients:', error);
    process.exit(1);
  }
}

updateTeamRecipients()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
