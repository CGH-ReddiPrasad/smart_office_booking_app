import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';

export type Role = 'EMPLOYEE' | 'ADMIN';
export type ServiceType = 'SEAT' | 'LUNCH' | 'SNACKS';

export interface AuthUser {
  id: number;
  employeeId: number;
  username: string;
  role: Role;
  fullName: string;
  department: string;
  email: string;
}

export interface Seat {
  id: number;
  seatCode: string;
  floor: number;
  wing: string;
  zone: string;
  hasMonitor: boolean;
  available: boolean;
  bookedBy?: string | null;
}

export interface FoodOption {
  id: number;
  name: string;
  description: string;
  price: string;
}

export interface Booking {
  id: number;
  bookingDate: string;
  serviceType: ServiceType;
  status: 'CONFIRMED' | 'CANCELLED';
  employeeId: number;
  employeeName: string;
  department: string;
  seatCode?: string | null;
  lunchName?: string | null;
  snackName?: string | null;
  floor?: number | null;
  wing?: string | null;
}

export interface CartItem {
  id: number;
  bookingDate: string;
  serviceType: ServiceType;
  seatId?: number | null;
  lunchOptionId?: number | null;
  snackOptionId?: number | null;
  seatCode?: string | null;
  lunchName?: string | null;
  snackName?: string | null;
  floor?: number | null;
  wing?: string | null;
}

export interface Dashboard {
  date: string;
  totalSeats: number;
  availableSeats: number;
  seatsBooked: number;
  lunchBooked: number;
  snacksBooked: number;
  wingSummary: Array<{ floor: number; wing: string; booked: number }>;
  bookingDetails: Array<{
    id: number;
    serviceType: ServiceType;
    employeeName: string;
    department: string;
    seatCode?: string | null;
    floor?: number | null;
    wing?: string | null;
    lunchName?: string | null;
    snackName?: string | null;
  }>;
  recentBookings: Array<{
    id: number;
    serviceType: ServiceType;
    employeeName: string;
    department: string;
    seatCode?: string | null;
    lunchName?: string | null;
    snackName?: string | null;
  }>;
}

export interface CartRequest {
  bookingDate: string;
  serviceType: ServiceType;
  seatId?: number;
  lunchOptionId?: number;
  snackOptionId?: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = '/api';
  private token = localStorage.getItem('smartOfficeToken') || '';

  constructor(private readonly http: HttpClient) {}

  get savedUser(): AuthUser | undefined {
    const raw = localStorage.getItem('smartOfficeUser');
    return raw ? JSON.parse(raw) as AuthUser : undefined;
  }

  private headers() {
    return this.token ? { headers: new HttpHeaders({ Authorization: `Bearer ${this.token}` }) } : {};
  }

  setSession(token: string, user: AuthUser) {
    this.token = token;
    localStorage.setItem('smartOfficeToken', token);
    localStorage.setItem('smartOfficeUser', JSON.stringify(user));
  }

  clearSession() {
    this.token = '';
    localStorage.removeItem('smartOfficeToken');
    localStorage.removeItem('smartOfficeUser');
  }

  login(username: string, password: string) {
    return this.http.post<{ token: string; user: AuthUser }>(`${this.baseUrl}/auth/login`, { username, password });
  }

  register(request: {
    employeeCode: string;
    fullName: string;
    department: string;
    email: string;
    username: string;
    password: string;
    role: Role;
  }) {
    return this.http.post<{ message: string }>(`${this.baseUrl}/auth/register`, request);
  }

  seats(date: string) {
    return this.http.get<Seat[]>(`${this.baseUrl}/seats`, { params: { date }, ...this.headers() });
  }

  options() {
    return this.http.get<{ lunch: FoodOption[]; snacks: FoodOption[] }>(`${this.baseUrl}/options`, this.headers());
  }

  dashboard(date: string) {
    return this.http.get<Dashboard>(`${this.baseUrl}/dashboard`, { params: { date }, ...this.headers() });
  }

  bookings(date: string) {
    return this.http.get<Booking[]>(`${this.baseUrl}/bookings`, { params: { date }, ...this.headers() });
  }

  cart(date: string) {
    return this.http.get<CartItem[]>(`${this.baseUrl}/cart`, { params: { date }, ...this.headers() });
  }

  addCart(request: CartRequest) {
    return this.http.post<{ message: string; cart: CartItem[] }>(`${this.baseUrl}/cart`, request, this.headers());
  }

  updateCart(id: number, request: CartRequest) {
    return this.http.put<{ message: string; cart: CartItem[] }>(`${this.baseUrl}/cart/${id}`, request, this.headers());
  }

  deleteCart(id: number) {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/cart/${id}`, this.headers());
  }

  submitCart(bookingDate: string) {
    return this.http.post<{ message: string }>(`${this.baseUrl}/cart/submit`, { bookingDate }, this.headers());
  }
}
