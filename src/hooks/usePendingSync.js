import { useState } from 'react';

export function usePendingSync() {
  const [pendingCount, setPendingCount] = useState(0);

  const addPendingTask = async (task) => {
    try {
      const db = await openDB();
      await addPendingTaskToDB(db, task);
      setPendingCount(prev => prev + 1);

      // Try to trigger background sync
      if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register('sync-tasks');
      } else {
        // Fallback: try direct POST
        try {
          const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task)
          });
          
          if (response.ok) {
            await deletePendingTaskFromDB(db, task.id);
            setPendingCount(prev => prev - 1);
          }
        } catch (error) {
          console.error('Direct sync failed, task remains pending:', error);
        }
      }

      db.close();
    } catch (error) {
      console.error('Failed to add pending task:', error);
    }
  };

  return { pendingCount, addPendingTask };
}

// IndexedDB helpers
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('taskflow-offline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingTasks')) {
        db.createObjectStore('pendingTasks', { keyPath: 'id' });
      }
    };
  });
}

function addPendingTaskToDB(db, task) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pendingTasks', 'readwrite');
    const store = transaction.objectStore('pendingTasks');
    const request = store.add(task);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function deletePendingTaskFromDB(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pendingTasks', 'readwrite');
    const store = transaction.objectStore('pendingTasks');
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
