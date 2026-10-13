// Initializes the same stores as the backend, including the one-time JSON import.
import '../server/src/routes/calls';
import '../server/src/routes/telephony';
import '../server/src/services/calendar';
import '../server/src/services/voice_library';
import '../server/src/services/rag';
import { initializeDatabase, databaseStatus, closeDatabase, isMongoEnabled } from '../server/src/services/database';

async function main() {
  try {
    if (!isMongoEnabled()) throw new Error('Set MONGODB_URI in .env first');
    await initializeDatabase();
    const status = await databaseStatus();
    if (status !== 'ok') throw new Error('Atlas readiness check failed');
    console.log('Atlas connected. Existing JSON records imported; all six stores initialized.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'MongoDB check failed');
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

void main();
