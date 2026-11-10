const {Pool} = require('pg');

// Two ways to connect:
//   • DATABASE_URL set (production: Neon / any hosted Postgres) → one connection string, SSL on
//   • otherwise (local development) → the separate DB_HOST / DB_PORT / … values from .env, no SSL
//
// DB_SSL=false turns SSL off for a DATABASE_URL (only useful for testing against a local database).

const useUrl = !!process.env.DATABASE_URL;

const pool = new Pool(
    useUrl
        ? {
            connectionString: process.env.DATABASE_URL,
            // hosted Postgres requires encrypted connections; verify the server's certificate
            ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: true },
            max: 5,                          // free plans allow few connections; 5 is plenty here
            idleTimeoutMillis: 30000,        // close connections idle for 30 s
            connectionTimeoutMillis: 10000   // a sleeping Neon database needs ~1 s to wake up
        }
        : {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        }
);

// An idle connection can be closed by the server (e.g. Neon suspending after 5 min idle).
// Without this handler that 'error' event would crash the whole Node process; the pool simply
// opens a new connection on the next query.
pool.on('error', (err) => {
    console.log('Database connection lost (will reconnect on next query):', err.message);
});

module.exports = pool;
