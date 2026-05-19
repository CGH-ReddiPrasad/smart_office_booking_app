# Smart Office Booking Portal

Internal Marmon office services web application for seat, lunch, and snacks booking.

## Tech Stack

- UI: Node 22, Angular 19, Bootstrap 5
- API: Node 22, Express 5
- DB: MySQL 9.0
- Runtime: Docker Compose

## Features

- Employee based booking flow for internal users
- Seat availability by date, floor, and zone
- Lunch and snacks ordering by date
- Duplicate booking protection for the same employee, date, and service
- Duplicate seat protection for the same date
- Dashboard counts for total seats, available seats, lunch orders, and snacks orders
- Schema is service-oriented so more office services can be added later

## Local Run

```bash
cd /Users/reddiprasad/Documents/Playground/smart-office-booking-portal
cp .env.example .env
docker compose up --build
```

Open:

- Web app: http://localhost:8081
- API health: http://localhost:8080/api/health
- MySQL: localhost:3307

## Local Development Without Docker

Start MySQL with Docker:

```bash
docker compose up -d db
```

Run the API:

```bash
cd backend
npm install
npm run dev
```

Run the Angular UI:

```bash
cd frontend
npm install
npm start
```

Open http://localhost:4200.

## Data Model

- `employees`: internal employee records
- `seats`: 300 seeded office seats across 3 floors
- `lunch_options`: active lunch menu
- `snack_options`: active snacks menu
- `bookings`: shared booking table with `service_type` for future extensibility

## On-Premise Notes

- Keep MySQL private to the application network in production.
- Put the UI behind the internal reverse proxy or load balancer.
- Integrate SSO or LDAP before production rollout.
- Add audit reports for facilities/admin teams when the workflow is finalized.
