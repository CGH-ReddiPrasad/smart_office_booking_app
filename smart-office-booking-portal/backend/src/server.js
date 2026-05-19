import 'dotenv/config';
import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { assertDatabaseReady, pool } from './db.js';

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const port = Number(process.env.PORT || 8080);
const jwtSecret = process.env.JWT_SECRET || 'change-this-local-dev-secret';

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4200,http://localhost:8081')
  .split(',')
  .map((origin) => origin.trim());

app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

const validServices = new Set(['SEAT', 'LUNCH', 'SNACKS']);

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');
  if (missing.length > 0) throw Object.assign(new Error(`Missing required field(s): ${missing.join(', ')}`), { status: 400 });
}

function assertDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Object.assign(new Error('bookingDate must use YYYY-MM-DD format'), { status: 400 });
}

function publicUser(row) {
  return {
    id: row.userId,
    employeeId: row.employeeId,
    username: row.username,
    role: row.role,
    fullName: row.fullName,
    department: row.department,
    email: row.email
  };
}

function signUser(row) {
  const user = publicUser(row);
  const token = jwt.sign(user, jwtSecret, { expiresIn: '8h' });
  return { token, user };
}

function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [, token] = header.split(' ');
    if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 });
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch (error) {
    error.status = error.status || 401;
    error.message = error.message === 'jwt expired' ? 'Session expired' : error.message;
    next(error);
  }
}

function requireRole(role) {
  return (req, _res, next) => {
    if (req.user?.role !== role) {
      next(Object.assign(new Error(`${role} role required`), { status: 403 }));
      return;
    }
    next();
  };
}

function payloadFor(serviceType, body) {
  if (!validServices.has(serviceType)) throw Object.assign(new Error('serviceType must be one of SEAT, LUNCH, SNACKS'), { status: 400 });
  if (serviceType === 'SEAT' && !body.seatId) throw Object.assign(new Error('seatId is required for seat booking'), { status: 400 });
  if (serviceType === 'LUNCH' && !body.lunchOptionId) throw Object.assign(new Error('lunchOptionId is required for lunch booking'), { status: 400 });
  if (serviceType === 'SNACKS' && !body.snackOptionId) throw Object.assign(new Error('snackOptionId is required for snacks booking'), { status: 400 });
  return [
    serviceType === 'SEAT' ? body.seatId : null,
    serviceType === 'LUNCH' ? body.lunchOptionId : null,
    serviceType === 'SNACKS' ? body.snackOptionId : null
  ];
}

async function listCart(employeeId, bookingDate) {
  const [rows] = await pool.query(
    `SELECT
       c.id,
       c.booking_date AS bookingDate,
       c.service_type AS serviceType,
       c.notes,
       c.seat_id AS seatId,
       c.lunch_option_id AS lunchOptionId,
       c.snack_option_id AS snackOptionId,
       s.seat_code AS seatCode,
       s.floor,
       s.wing,
       lo.name AS lunchName,
       so.name AS snackName
     FROM cart_items c
     LEFT JOIN seats s ON s.id = c.seat_id
     LEFT JOIN lunch_options lo ON lo.id = c.lunch_option_id
     LEFT JOIN snack_options so ON so.id = c.snack_option_id
     WHERE c.employee_id = ? AND c.booking_date = ?
     ORDER BY c.created_at`,
    [employeeId, bookingDate]
  );
  return rows;
}

app.get('/api/health', async (_req, res, next) => {
  try {
    await assertDatabaseReady();
    res.json({ status: 'UP', service: 'smart-office-booking-api' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    requireFields(req.body, ['username', 'password']);
    const [rows] = await pool.query(
      `SELECT u.id AS userId, u.employee_id AS employeeId, u.username, u.password_hash AS passwordHash,
              u.role, e.full_name AS fullName, e.department, e.email
       FROM users u
       JOIN employees e ON e.id = u.employee_id
       WHERE u.username = ? AND u.active = TRUE AND e.active = TRUE`,
      [req.body.username]
    );
    const row = rows[0];
    if (!row || row.passwordHash !== hashPassword(req.body.password)) throw Object.assign(new Error('Invalid username or password'), { status: 401 });
    res.json(signUser(row));
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/register', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    requireFields(req.body, ['employeeCode', 'fullName', 'department', 'email', 'username', 'password']);
    await connection.beginTransaction();
    const [employeeResult] = await connection.query(
      'INSERT INTO employees (employee_code, full_name, department, email) VALUES (?, ?, ?, ?)',
      [req.body.employeeCode, req.body.fullName, req.body.department, req.body.email]
    );
    await connection.query(
      'INSERT INTO users (employee_id, username, password_hash, role) VALUES (?, ?, ?, ?)',
      [employeeResult.insertId, req.body.username, hashPassword(req.body.password), req.body.role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE']
    );
    await connection.commit();
    res.status(201).json({ message: 'User created' });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      error.status = 409;
      error.message = 'Employee code, email, or username already exists';
    }
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/me', authenticate, (req, res) => res.json(req.user));

app.get('/api/seats', authenticate, async (req, res, next) => {
  try {
    const bookingDate = req.query.date;
    if (!bookingDate) throw Object.assign(new Error('date query parameter is required'), { status: 400 });
    assertDate(bookingDate);

    const [rows] = await pool.query(
      `SELECT
         s.id,
         s.seat_code AS seatCode,
         s.floor,
         s.wing,
         s.has_monitor AS hasMonitor,
         b.id AS bookingId,
         c.id AS cartItemId,
         e.full_name AS bookedBy
       FROM seats s
       LEFT JOIN bookings b
         ON b.seat_id = s.id
        AND b.booking_date = ?
        AND b.service_type = 'SEAT'
        AND b.status = 'CONFIRMED'
       LEFT JOIN cart_items c
         ON c.seat_id = s.id
        AND c.booking_date = ?
       LEFT JOIN employees e ON e.id = b.employee_id
       WHERE s.active = TRUE
       ORDER BY s.floor, s.wing, s.seat_code`,
      [bookingDate, bookingDate]
    );
    res.json(rows.map((row) => ({ ...row, zone: row.wing, available: row.bookingId === null && row.cartItemId === null })));
  } catch (error) {
    next(error);
  }
});

app.get('/api/options', authenticate, async (_req, res, next) => {
  try {
    const [lunch] = await pool.query('SELECT id, name, description, price, active FROM lunch_options WHERE active = TRUE ORDER BY name');
    const [snacks] = await pool.query('SELECT id, name, description, price, active FROM snack_options WHERE active = TRUE ORDER BY name');
    res.json({ lunch, snacks });
  } catch (error) {
    next(error);
  }
});

app.get('/api/bookings', authenticate, async (req, res, next) => {
  try {
    const bookingDate = req.query.date;
    if (!bookingDate) throw Object.assign(new Error('date query parameter is required'), { status: 400 });
    assertDate(bookingDate);
    const employeeId = req.user.role === 'ADMIN' && req.query.employeeId ? req.query.employeeId : req.user.employeeId;

    const [rows] = await pool.query(
      `SELECT
         b.id,
         b.booking_date AS bookingDate,
         b.service_type AS serviceType,
         b.status,
         b.submitted_at AS submittedAt,
         e.id AS employeeId,
         e.full_name AS employeeName,
         e.department,
         s.seat_code AS seatCode,
         s.floor,
         s.wing,
         lo.name AS lunchName,
         so.name AS snackName
       FROM bookings b
       JOIN employees e ON e.id = b.employee_id
       LEFT JOIN seats s ON s.id = b.seat_id
       LEFT JOIN lunch_options lo ON lo.id = b.lunch_option_id
       LEFT JOIN snack_options so ON so.id = b.snack_option_id
       WHERE b.booking_date = ? AND (? IS NULL OR b.employee_id = ?)
       ORDER BY b.submitted_at DESC`,
      [bookingDate, employeeId, employeeId]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/cart', authenticate, async (req, res, next) => {
  try {
    const bookingDate = req.query.date;
    if (!bookingDate) throw Object.assign(new Error('date query parameter is required'), { status: 400 });
    assertDate(bookingDate);
    res.json(await listCart(req.user.employeeId, bookingDate));
  } catch (error) {
    next(error);
  }
});

app.post('/api/cart', authenticate, requireRole('EMPLOYEE'), async (req, res, next) => {
  try {
    requireFields(req.body, ['bookingDate', 'serviceType']);
    const { bookingDate, serviceType, notes = null } = req.body;
    assertDate(bookingDate);
    const [seatId, lunchOptionId, snackOptionId] = payloadFor(serviceType, req.body);
    await pool.query(
      `INSERT INTO cart_items (employee_id, booking_date, service_type, seat_id, lunch_option_id, snack_option_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         seat_id = VALUES(seat_id),
         lunch_option_id = VALUES(lunch_option_id),
         snack_option_id = VALUES(snack_option_id),
         notes = VALUES(notes)`,
      [req.user.employeeId, bookingDate, serviceType, seatId, lunchOptionId, snackOptionId, notes]
    );
    res.status(201).json({ message: 'Added to cart', cart: await listCart(req.user.employeeId, bookingDate) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      error.status = 409;
      error.message = 'This seat is already in another cart for the selected date';
    }
    next(error);
  }
});

app.put('/api/cart/:id', authenticate, requireRole('EMPLOYEE'), async (req, res, next) => {
  try {
    requireFields(req.body, ['bookingDate', 'serviceType']);
    const { bookingDate, serviceType, notes = null } = req.body;
    assertDate(bookingDate);
    const [seatId, lunchOptionId, snackOptionId] = payloadFor(serviceType, req.body);
    const [result] = await pool.query(
      `UPDATE cart_items
       SET service_type = ?, seat_id = ?, lunch_option_id = ?, snack_option_id = ?, notes = ?
       WHERE id = ? AND employee_id = ?`,
      [serviceType, seatId, lunchOptionId, snackOptionId, notes, req.params.id, req.user.employeeId]
    );
    if (result.affectedRows === 0) throw Object.assign(new Error('Cart item not found'), { status: 404 });
    res.json({ message: 'Cart updated', cart: await listCart(req.user.employeeId, bookingDate) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/cart/:id', authenticate, requireRole('EMPLOYEE'), async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM cart_items WHERE id = ? AND employee_id = ?', [req.params.id, req.user.employeeId]);
    if (result.affectedRows === 0) throw Object.assign(new Error('Cart item not found'), { status: 404 });
    res.json({ message: 'Cart item removed' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/cart/submit', authenticate, requireRole('EMPLOYEE'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    requireFields(req.body, ['bookingDate']);
    const { bookingDate } = req.body;
    assertDate(bookingDate);
    await connection.beginTransaction();
    const [cart] = await connection.query('SELECT * FROM cart_items WHERE employee_id = ? AND booking_date = ?', [req.user.employeeId, bookingDate]);
    if (cart.length === 0) throw Object.assign(new Error('Cart is empty'), { status: 400 });
    for (const item of cart) {
      await connection.query(
        `INSERT INTO bookings (employee_id, booking_date, service_type, seat_id, lunch_option_id, snack_option_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [item.employee_id, item.booking_date, item.service_type, item.seat_id, item.lunch_option_id, item.snack_option_id, item.notes]
      );
    }
    await connection.query('DELETE FROM cart_items WHERE employee_id = ? AND booking_date = ?', [req.user.employeeId, bookingDate]);
    await connection.commit();
    res.json({ message: 'Booking submitted. Your bookings are now read only.' });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      error.status = 409;
      error.message = 'One or more submitted bookings conflict with an existing confirmed booking';
    }
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/dashboard', authenticate, async (req, res, next) => {
  try {
    const bookingDate = req.query.date;
    if (!bookingDate) throw Object.assign(new Error('date query parameter is required'), { status: 400 });
    assertDate(bookingDate);
    const [[seatCount]] = await pool.query('SELECT COUNT(*) AS totalSeats FROM seats WHERE active = TRUE');
    const [summary] = await pool.query(
      `SELECT service_type AS serviceType, COUNT(*) AS total
       FROM bookings
       WHERE booking_date = ? AND status = 'CONFIRMED'
       GROUP BY service_type`,
      [bookingDate]
    );
    const [wingSummary] = await pool.query(
      `SELECT s.floor, s.wing, COUNT(b.id) AS booked
       FROM seats s
       LEFT JOIN bookings b ON b.seat_id = s.id AND b.booking_date = ? AND b.status = 'CONFIRMED'
       WHERE s.active = TRUE
       GROUP BY s.floor, s.wing
       ORDER BY s.floor, s.wing`,
      [bookingDate]
    );
    const [recentBookings] = await pool.query(
      `SELECT b.id, b.service_type AS serviceType, e.full_name AS employeeName, e.department,
              s.seat_code AS seatCode, lo.name AS lunchName, so.name AS snackName, b.submitted_at AS submittedAt
       FROM bookings b
       JOIN employees e ON e.id = b.employee_id
       LEFT JOIN seats s ON s.id = b.seat_id
       LEFT JOIN lunch_options lo ON lo.id = b.lunch_option_id
       LEFT JOIN snack_options so ON so.id = b.snack_option_id
       WHERE b.booking_date = ? AND b.status = 'CONFIRMED'
       ORDER BY b.submitted_at DESC
      LIMIT 20`,
      [bookingDate]
    );
    const [bookingDetails] = await pool.query(
      `SELECT b.id, b.service_type AS serviceType, e.full_name AS employeeName, e.department,
              s.seat_code AS seatCode, s.floor, s.wing, lo.name AS lunchName, so.name AS snackName
       FROM bookings b
       JOIN employees e ON e.id = b.employee_id
       LEFT JOIN seats s ON s.id = b.seat_id
       LEFT JOIN lunch_options lo ON lo.id = b.lunch_option_id
       LEFT JOIN snack_options so ON so.id = b.snack_option_id
       WHERE b.booking_date = ? AND b.status = 'CONFIRMED'
       ORDER BY b.service_type, e.full_name`,
      [bookingDate]
    );
    const totals = { seatsBooked: 0, lunchBooked: 0, snacksBooked: 0 };
    for (const row of summary) {
      if (row.serviceType === 'SEAT') totals.seatsBooked = Number(row.total);
      if (row.serviceType === 'LUNCH') totals.lunchBooked = Number(row.total);
      if (row.serviceType === 'SNACKS') totals.snacksBooked = Number(row.total);
    }
    res.json({
      date: bookingDate,
      totalSeats: Number(seatCount.totalSeats),
      availableSeats: Number(seatCount.totalSeats) - totals.seatsBooked,
      ...totals,
      wingSummary,
      recentBookings: req.user.role === 'ADMIN' ? recentBookings : [],
      bookingDetails
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, _next) => {
  req.log.error(error);
  res.status(error.status || 500).json({ message: error.message || 'Unexpected server error' });
});

async function start() {
  await assertDatabaseReady();
  app.listen(port, '0.0.0.0', () => logger.info(`Smart Office Booking API listening on ${port}`));
}

start().catch((error) => {
  logger.error(error, 'API startup failed');
  process.exit(1);
});
