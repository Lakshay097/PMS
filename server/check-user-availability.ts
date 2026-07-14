import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';

// Load EcomTeamsData.csv for team assignments
const csvPath = path.join(__dirname, '../data/EcomTeamsData.csv');
const csvData = fs.readFileSync(csvPath, 'utf-8');
const csvLines = csvData.split('\n').filter(line => line.trim());

interface CsvUser {
  Name: string;
  Email: string;
  ManagerMail: string;
  Role: string;
  Team: string;
}

const csvUsers: Record<string, CsvUser> = {};
for (let i = 1; i < csvLines.length; i++) {
  const values = csvLines[i].split(',').map(v => v.trim());
  if (values.length >= 5) {
    const user: CsvUser = {
      Name: values[0],
      Email: values[1],
      ManagerMail: values[2],
      Role: values[3],
      Team: values[4]
    };
    csvUsers[user.Email.toLowerCase()] = user;
  }
}

console.log(`Loaded ${Object.keys(csvUsers).length} authorized users from EcomTeamsData.csv`);

// The 49 users that had e-com references
const ecomUsers = [
  'abhay.singh4@pw.live',
  'ajay.kumar12@pw.live',
  'ajay.prakash@pw.live',
  'amar.prasad@pw.live',
  'amit.jain4@pw.live',
  'anand.maurya@pw.live',
  'ankit.kumar6@pw.live',
  'anshu@pw.live',
  'apar.roy@pw.live',
  'arun.singh@pw.live',
  'bhushan.pandey@pw.live',
  'brajesh.kumar@pw.live',
  'dipendra.yadav@pw.live',
  'divyanshu.jha@pw.live',
  'geeta@pw.live',
  'gourav.raghav@pw.live',
  'harshit.sharma5@pw.live',
  'himanshu.nogiya@pw.live',
  'himanshu.verma5@pw.live',
  'hiteshwar.kumar@pw.live',
  'indrajeet.singh@pw.live',
  'jitendra.yadav@pw.live',
  'kajal@pw.live',
  'mukesh.kumar25@pw.live',
  'neeraj.kumar4@pw.live',
  'pankaj.kumar4@pw.live',
  'pappu.tiwari3@pw.live',
  'prem.yadav@pw.live',
  'rahul.kumar47@pw.live',
  'ranjeet.das@pw.live',
  'reetesh.yadav@pw.live',
  'rishabh.ranjan@pw.live',
  'rohit.kushwaha@pw.live',
  'roshan.kumar@pw.live',
  'sagar.yadav@pw.live',
  'sanjay.singh1@pw.live',
  'saswat.verma@pw.live',
  'satyam.kumar16@pw.live',
  'saurabh.4@pw.live',
  'shakeb.tawheed@pw.live',
  'sharvan.kumar@pw.live',
  'sher.singh@pw.live',
  'shivang.1@pw.live',
  'shivani.2@pw.live',
  'sunil.gupta1@pw.live',
  'vibhore.johari@pw.live',
  'vinay.tiwari@pw.live',
  'vinod.pal@pw.live',
  'zaid.mallick@pw.live'
];

async function checkUserAvailability() {
  try {
    console.log('\n=== Checking User Availability in CSV ===\n');
    
    const foundInCsv: string[] = [];
    const notInCsv: string[] = [];

    for (const email of ecomUsers) {
      if (csvUsers[email.toLowerCase()]) {
        foundInCsv.push(email);
      } else {
        notInCsv.push(email);
      }
    }

    console.log(`Found in CSV: ${foundInCsv.length}`);
    foundInCsv.forEach(email => {
      const user = csvUsers[email.toLowerCase()];
      console.log(`  ${email} -> ${user.Team} (Manager: ${user.ManagerMail})`);
    });

    console.log(`\nNot in CSV: ${notInCsv.length}`);
    notInCsv.forEach(email => {
      console.log(`  ${email}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUserAvailability();
