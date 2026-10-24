// Keep the production entry point portable across Windows and Unix shells.
process.env.NODE_ENV = 'production';
if (process.env.VOICEAI_REQUIRE_MONGODB === 'true' && !process.env.MONGODB_URI?.trim()) {
  throw new Error('MONGODB_URI is required on hosts with temporary local storage.');
}
require('../dist/server/src/app.js');
