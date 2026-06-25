import { db } from './firestoreConfig';
import { sheetsApi } from './sheetsService';
import { getDocs, collection, writeBatch, doc } from 'firebase/firestore';

const COLLECTIONS = ['users', 'teams', 'templates', 'tasks', 'reports', 'followups', 'settings', 'subtasks', 'comments'];

export async function syncFirestoreToSheets(): Promise<void> {
  for (const collectionName of COLLECTIONS) {
    try {
      const snapshot = await getDocs(collection(db, collectionName));
      const docs = snapshot.docs.map(d => d.data());
      
      if (docs.length === 0) continue;
      
      await sheetsApi.saveCollection(collectionName as any, docs);
      console.log(`Synced ${docs.length} docs from Firestore → ${collectionName}`);
    } catch (err) {
      console.error(`Failed to sync ${collectionName}:`, err);
    }
  }
}
