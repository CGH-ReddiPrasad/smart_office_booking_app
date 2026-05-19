import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, AuthUser, Booking, CartItem, Dashboard, FoodOption, Role, Seat, ServiceType } from './api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  today = new Date().toISOString().slice(0, 10);
  bookingDate = this.today;
  user?: AuthUser;
  authMode: 'login' | 'register' = 'login';
  loginForm = { username: 'employee', password: 'Employee@123' };
  registerForm = {
    employeeCode: '',
    fullName: '',
    department: '',
    email: '',
    username: '',
    password: '',
    role: 'EMPLOYEE' as Role
  };

  seats: Seat[] = [];
  lunchOptions: FoodOption[] = [];
  snackOptions: FoodOption[] = [];
  bookings: Booking[] = [];
  cart: CartItem[] = [];
  dashboard?: Dashboard;

  selectedSeatId?: number;
  selectedLunchId?: string;
  selectedSnackId?: string;
  activeService: ServiceType = 'SEAT';
  floorFilter = 'All';
  wingFilter = 'All';
  editingCartId?: number;
  previewType?: 'SEATS' | 'SEAT' | 'LUNCH' | 'SNACKS';
  statusMessage = '';
  errorMessage = '';
  loading = false;

  constructor(private readonly api: ApiService) {}

  ngOnInit() {
    this.user = this.api.savedUser;
    if (this.user) this.loadInitialData();
  }

  get isAdmin() {
    return this.user?.role === 'ADMIN';
  }

  get isEmployee() {
    return this.user?.role === 'EMPLOYEE';
  }

  get floors() {
    return ['All', ...Array.from(new Set(this.seats.map((seat) => String(seat.floor))))];
  }

  get wings() {
    return ['All', 'North Wing', 'South Wing'];
  }

  get previewTitle() {
    if (this.previewType === 'SEATS') return '8th floor seat capacity';
    if (this.previewType === 'SEAT') return 'Seat booking preview';
    if (this.previewType === 'LUNCH') return 'Meals preview';
    if (this.previewType === 'SNACKS') return 'Snacks preview';
    return '';
  }

  get previewRows() {
    if (!this.dashboard || !this.previewType) return [];
    if (this.previewType === 'SEATS') {
      return [
        { employeeName: 'North Wing', department: '8th Floor', item: '100 seats' },
        { employeeName: 'South Wing', department: '8th Floor', item: '100 seats' }
      ];
    }
    return this.dashboard.bookingDetails
      .filter((item) => item.serviceType === this.previewType)
      .map((item) => ({
        employeeName: item.employeeName,
        department: item.department,
        item: this.serviceLabel(item)
      }));
  }

  get filteredSeats() {
    return this.seats.filter((seat) => {
      const floorMatches = this.floorFilter === 'All' || String(seat.floor) === this.floorFilter;
      const wingMatches = this.wingFilter === 'All' || seat.wing === this.wingFilter;
      return floorMatches && wingMatches;
    });
  }

  get availableSeatCount() {
    return this.filteredSeats.filter((seat) => seat.available).length;
  }

  get submittedReadOnly() {
    return this.bookings.length > 0 && this.cart.length === 0;
  }

  openPreview(type: 'SEATS' | ServiceType) {
    this.previewType = type;
  }

  closePreview() {
    this.previewType = undefined;
  }

  login() {
    this.loading = true;
    this.errorMessage = '';
    this.api.login(this.loginForm.username, this.loginForm.password).subscribe({
      next: ({ token, user }) => {
        this.api.setSession(token, user);
        this.user = user;
        this.statusMessage = `Welcome ${user.fullName}`;
        this.loadInitialData();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Login failed.';
      }
    });
  }

  register() {
    this.loading = true;
    this.errorMessage = '';
    this.api.register(this.registerForm).subscribe({
      next: (response) => {
        this.loading = false;
        this.statusMessage = `${response.message}. You can login now.`;
        this.authMode = 'login';
        this.loginForm.username = this.registerForm.username;
        this.loginForm.password = this.registerForm.password;
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Registration failed.';
      }
    });
  }

  logout() {
    this.api.clearSession();
    this.user = undefined;
    this.cart = [];
    this.bookings = [];
    this.dashboard = undefined;
  }

  loadInitialData() {
    this.loading = true;
    this.api.options().subscribe({
      next: ({ lunch, snacks }) => {
        this.lunchOptions = lunch;
        this.snackOptions = snacks;
        this.selectedLunchId = lunch[0]?.id ? String(lunch[0].id) : undefined;
        this.selectedSnackId = snacks[0]?.id ? String(snacks[0].id) : undefined;
        this.refreshDay();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Unable to load options.';
      }
    });
  }

  refreshDay() {
    if (!this.user) return;
    this.loading = true;
    this.statusMessage = '';
    this.errorMessage = '';
    this.api.dashboard(this.bookingDate).subscribe({ next: (data) => (this.dashboard = data) });
    this.api.seats(this.bookingDate).subscribe({
      next: (seats) => {
        this.seats = seats;
        this.selectedSeatId = seats.find((seat) => seat.available)?.id;
        this.loadBookings();
        if (this.isEmployee) this.loadCart();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Unable to load seat availability.';
      }
    });
  }

  loadBookings() {
    this.api.bookings(this.bookingDate).subscribe({
      next: (bookings) => {
        this.bookings = bookings;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Unable to load submitted bookings.';
      }
    });
  }

  loadCart() {
    this.api.cart(this.bookingDate).subscribe({
      next: (cart) => {
        this.cart = cart;
      },
      error: () => {
        this.errorMessage = 'Unable to load cart.';
      }
    });
  }

  serviceLabel(item: { serviceType: ServiceType; seatCode?: string | null; lunchName?: string | null; snackName?: string | null }) {
    if (item.serviceType === 'SEAT') return item.seatCode || 'Seat';
    if (item.serviceType === 'LUNCH') return item.lunchName || 'Lunch';
    return item.snackName || 'Snacks';
  }

  addOrUpdateCart() {
    if (!this.isEmployee || this.submittedReadOnly) return;
    const request = {
      bookingDate: this.bookingDate,
      serviceType: this.activeService,
      seatId: this.activeService === 'SEAT' ? this.selectedSeatId : undefined,
      lunchOptionId: this.activeService === 'LUNCH' ? Number(this.selectedLunchId) : undefined,
      snackOptionId: this.activeService === 'SNACKS' ? Number(this.selectedSnackId) : undefined
    };
    this.loading = true;
    const call = this.editingCartId ? this.api.updateCart(this.editingCartId, request) : this.api.addCart(request);
    call.subscribe({
      next: (response) => {
        this.cart = response.cart;
        this.editingCartId = undefined;
        this.statusMessage = response.message;
        this.refreshDay();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Unable to update cart.';
      }
    });
  }

  editCart(item: CartItem) {
    this.editingCartId = item.id;
    this.activeService = item.serviceType;
    this.selectedSeatId = item.seatId || undefined;
    this.selectedLunchId = item.lunchOptionId ? String(item.lunchOptionId) : this.selectedLunchId;
    this.selectedSnackId = item.snackOptionId ? String(item.snackOptionId) : this.selectedSnackId;
  }

  deleteCart(id: number) {
    this.loading = true;
    this.api.deleteCart(id).subscribe({
      next: () => {
        this.statusMessage = 'Cart item removed';
        this.refreshDay();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Unable to delete cart item.';
      }
    });
  }

  submitCart() {
    this.loading = true;
    this.api.submitCart(this.bookingDate).subscribe({
      next: (response) => {
        this.statusMessage = response.message;
        this.refreshDay();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Unable to submit cart.';
      }
    });
  }
}
