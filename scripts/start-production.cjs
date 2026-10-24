// Keep the production entry point portable across Windows and Unix shells.
process.env.NODE_ENV = 'production';
require('../dist/server/src/app.js');
