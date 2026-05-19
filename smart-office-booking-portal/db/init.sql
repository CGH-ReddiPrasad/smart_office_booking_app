CREATE DATABASE IF NOT EXISTS smart_office;
USE smart_office;

CREATE TABLE IF NOT EXISTS employees (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_code VARCHAR(30) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  department VARCHAR(80) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id BIGINT NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(128) NOT NULL,
  role ENUM('EMPLOYEE', 'ADMIN') NOT NULL DEFAULT 'EMPLOYEE',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS seats (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  seat_code VARCHAR(30) NOT NULL UNIQUE,
  floor INT NOT NULL,
  wing ENUM('North Wing', 'South Wing') NOT NULL,
  has_monitor BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lunch_options (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  price DECIMAL(8,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS snack_options (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  price DECIMAL(8,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS cart_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id BIGINT NOT NULL,
  booking_date DATE NOT NULL,
  service_type ENUM('SEAT', 'LUNCH', 'SNACKS') NOT NULL,
  seat_id BIGINT NULL,
  lunch_option_id BIGINT NULL,
  snack_option_id BIGINT NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cart_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_cart_seat FOREIGN KEY (seat_id) REFERENCES seats(id),
  CONSTRAINT fk_cart_lunch FOREIGN KEY (lunch_option_id) REFERENCES lunch_options(id),
  CONSTRAINT fk_cart_snack FOREIGN KEY (snack_option_id) REFERENCES snack_options(id),
  CONSTRAINT chk_cart_payload CHECK (
    (service_type = 'SEAT' AND seat_id IS NOT NULL AND lunch_option_id IS NULL AND snack_option_id IS NULL)
    OR (service_type = 'LUNCH' AND seat_id IS NULL AND lunch_option_id IS NOT NULL AND snack_option_id IS NULL)
    OR (service_type = 'SNACKS' AND seat_id IS NULL AND lunch_option_id IS NULL AND snack_option_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_cart_employee_service_day ON cart_items (employee_id, booking_date, service_type);
CREATE UNIQUE INDEX uq_cart_seat_day ON cart_items (seat_id, booking_date);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id BIGINT NOT NULL,
  booking_date DATE NOT NULL,
  service_type ENUM('SEAT', 'LUNCH', 'SNACKS') NOT NULL,
  seat_id BIGINT NULL,
  lunch_option_id BIGINT NULL,
  snack_option_id BIGINT NULL,
  status ENUM('CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'CONFIRMED',
  notes VARCHAR(255) NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP NULL,
  active_booking_key TINYINT GENERATED ALWAYS AS (CASE WHEN status = 'CONFIRMED' THEN 1 ELSE NULL END) STORED,
  active_seat_key TINYINT GENERATED ALWAYS AS (CASE WHEN service_type = 'SEAT' AND status = 'CONFIRMED' THEN 1 ELSE NULL END) STORED,
  CONSTRAINT fk_bookings_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_bookings_seat FOREIGN KEY (seat_id) REFERENCES seats(id),
  CONSTRAINT fk_bookings_lunch FOREIGN KEY (lunch_option_id) REFERENCES lunch_options(id),
  CONSTRAINT fk_bookings_snack FOREIGN KEY (snack_option_id) REFERENCES snack_options(id),
  CONSTRAINT chk_service_payload CHECK (
    (service_type = 'SEAT' AND seat_id IS NOT NULL AND lunch_option_id IS NULL AND snack_option_id IS NULL)
    OR (service_type = 'LUNCH' AND seat_id IS NULL AND lunch_option_id IS NOT NULL AND snack_option_id IS NULL)
    OR (service_type = 'SNACKS' AND seat_id IS NULL AND lunch_option_id IS NULL AND snack_option_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_active_employee_service_day
  ON bookings (employee_id, booking_date, service_type, active_booking_key);

CREATE UNIQUE INDEX uq_active_seat_day
  ON bookings (seat_id, booking_date, active_seat_key);

CREATE INDEX idx_bookings_date_service ON bookings (booking_date, service_type, status);
CREATE INDEX idx_seats_floor_wing ON seats (floor, wing, active);

INSERT INTO employees (employee_code, full_name, department, email) VALUES
  ('MARADMIN', 'Marmon Admin', 'Facilities', 'admin@marmon.local'),
  ('MAR001', 'Aarav Sharma', 'Engineering', 'aarav.sharma@marmon.local'),
  ('MAR002', 'Priya Nair', 'Finance', 'priya.nair@marmon.local'),
  ('MAR003', 'Rahul Menon', 'Operations', 'rahul.menon@marmon.local'),
  ('MAR004', 'Sneha Iyer', 'Human Resources', 'sneha.iyer@marmon.local'),
  ('MAR005', 'Vikram Rao', 'Information Technology', 'vikram.rao@marmon.local')
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO users (employee_id, username, password_hash, role)
SELECT id, 'admin', SHA2('Admin@123', 256), 'ADMIN' FROM employees WHERE employee_code = 'MARADMIN'
ON DUPLICATE KEY UPDATE role = VALUES(role);

INSERT INTO users (employee_id, username, password_hash, role)
SELECT id, 'employee', SHA2('Employee@123', 256), 'EMPLOYEE' FROM employees WHERE employee_code = 'MAR001'
ON DUPLICATE KEY UPDATE role = VALUES(role);

INSERT INTO lunch_options (name, description, price) VALUES
  ('South Indian Meals', 'Rice, sambar, rasam, poriyal, curd and pickle', 120.00),
  ('North Indian Thali', 'Roti, dal, paneer curry, rice, salad and dessert', 140.00),
  ('Vegetable Biryani', 'Basmati rice with vegetables, raita and gravy', 130.00),
  ('Lean Protein Bowl', 'Grilled paneer or chicken, millet, greens and sauce', 160.00)
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO snack_options (name, description, price) VALUES
  ('Tea and Biscuits', 'Masala tea with assorted biscuits', 35.00),
  ('Coffee and Sandwich', 'Filter coffee with vegetable sandwich', 75.00),
  ('Fruit Cup', 'Seasonal cut fruits', 60.00),
  ('Samosa Plate', 'Two samosas with chutney', 45.00)
ON DUPLICATE KEY UPDATE description = VALUES(description);

DELIMITER //
CREATE PROCEDURE seed_seats()
BEGIN
  DECLARE seat_no INT DEFAULT 1;
  DECLARE wing_name VARCHAR(20);

  WHILE seat_no <= 200 DO
    SET wing_name = CASE WHEN seat_no <= 100 THEN 'North Wing' ELSE 'South Wing' END;
    INSERT IGNORE INTO seats (seat_code, floor, wing, has_monitor)
    VALUES (
      CONCAT('F8-', CASE WHEN wing_name = 'North Wing' THEN 'N' ELSE 'S' END, '-', LPAD(CASE WHEN seat_no <= 100 THEN seat_no ELSE seat_no - 100 END, 3, '0')),
      8,
      wing_name,
      seat_no % 5 <> 0
    );
    SET seat_no = seat_no + 1;
  END WHILE;
END//
DELIMITER ;

CALL seed_seats();
DROP PROCEDURE seed_seats;
