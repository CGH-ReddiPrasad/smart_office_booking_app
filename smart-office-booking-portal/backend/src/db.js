import mysql from 'mysql2/promise';

const {
  DB_HOST = 'localhost',
  DB_PORT = '3306',
  DB_NAME = 'smart_office',
  DB_USER = 'office_user',
  DB_PASSWORD = 'office_pass'
} = process.env;

export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 100,
  namedPlaceholders: true,
  timezone: 'Z'
});

export async function assertDatabaseReady() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}
