import './config';
import { firestoreAdmin } from './services/firebaseAdmin';

(async () => {
  const snap = await firestoreAdmin.collection('team_report_config').get();
  snap.forEach(doc => {
    const d = doc.data();
    console.log(
      doc.id,
      '| active:', d.active,
      '| reminderDay:', JSON.stringify(d.reminderDay),
      '| meetingDay:', JSON.stringify(d.meetingDay)
    );
  });
  process.exit(0);
})();