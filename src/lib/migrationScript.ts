import { db } from './firestoreConfig';
import { dbService } from './dbService';
import { writeBatch, doc } from 'firebase/firestore';

const COLLECTIONS = {
  tasks:     { fetch: () => dbService.getTasks(),     idField: 'TaskID' },
  subtasks:  { fetch: () => dbService.getSubtasks(),  idField: 'SubtaskID' },
  reports:   { fetch: () => dbService.getReports(),   idField: 'ReportID' },
  followups: { fetch: () => dbService.getFollowups(), idField: 'FollowUpID' },
  users:     { fetch: () => dbService.getUsers(),     idField: 'Email' },
  teams:     { fetch: () => dbService.getTeams(),     idField: 'TeamID' },
  templates: { fetch: () => dbService.getTemplates(), idField: 'TemplateID' },
  comments:  { fetch: () => dbService.getComments(),  idField: 'CommentID' },
  settings:  { fetch: () => dbService.getSettings(),  idField: null }, // fixed doc ID
};

export async function migrateFromSheets(): Promise<void> {
  for (const [collectionName, config] of Object.entries(COLLECTIONS)) {
    try {
      const records = await config.fetch() as any[];
      const batches = [];
      for (let i = 0; i < records.length; i += 500) {
        batches.push(records.slice(i, i + 500));
      }
      for (const batch of batches) {
        const wb = writeBatch(db);
        for (const record of batch) {
          const id = config.idField ? record[config.idField] : 'config';
          wb.set(doc(db, collectionName, id), record);
        }
        await wb.commit();
      }
      console.log(`Migrated ${records.length} records → ${collectionName}`);
    } catch (err) {
      console.error(`Failed to migrate ${collectionName}:`, err);
    }
  }
}
