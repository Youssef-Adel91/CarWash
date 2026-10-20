// Powered by OnSpace.AI
// Shared domain types (mirror the Postgres schema described in the blueprint).
// Extended for the multi-tenant SaaS model: every car-wash business is a
// `Tenant`; a user can be a plain customer, or a member of one or more
// tenants with role 'owner' | 'admin' | 'worker'.

export type UserRole = 'customer' | 'worker';

export type User = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  createdAt: string;
  // Masked card reference kept for display only (never store raw PANs in production).
  cardLast4?: string;
};

export type PaymentKind = 'registration_fee' | 'wash';
export type PaymentStatus = 'succeeded' | 'failed';
export type PaymentProvider = 'mock' | 'paymob';

export type Payment = {
  id: string;
  userId: string;
  tenantId?: string;
  orderId?: string;
  kind: PaymentKind;
  amountEgp: number;
  currency: 'EGP';
  status: PaymentStatus;
  provider: PaymentProvider;
  providerRef?: string;
  cardLast4: string;
  createdAt: string;
};

export type GeoLocation = {
  latitude: number;
  longitude: number;
  address: string;
};

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'on_the_way'
  | 'washing'
  | 'completed'
  | 'cancelled';

export type Worker = {
  id: string;
  name: string;
  rating: number;
  vehicle: string;
  phone?: string;
};

export type Order = {
  id: string;
  tenantId: string;
  tenantName?: string;
  customerId: string;
  washTypeId: string;
  washTypeName: string;
  priceEgp: number;
  status: OrderStatus;
  location: GeoLocation;
  scheduledFor: string | null; // null = now
  worker?: Worker;
  workerUserId?: string | null;
  createdAt: string;
};

export type CardInput = {
  number: string;
  expiry: string;
  cvc: string;
  name: string;
};

// ---------------------------------------------------------------------
// Multi-tenant SaaS types
// ---------------------------------------------------------------------

export type TenantRole = 'owner' | 'admin' | 'worker';

export type Tenant = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  city?: string | null;
  isActive: boolean;
  registrationFeeEgp: number;
  createdAt: string;
};

export type TenantMembership = {
  id: string;
  tenantId: string;
  tenantName?: string;
  userId: string;
  role: TenantRole;
  isActive: boolean;
  isOnline: boolean;
  vehicle?: string | null;
  rating: number;
  createdAt: string;
};

// The "mode" the app should render for the signed-in user right now.
export type AppMode =
  | { kind: 'customer' }
  | { kind: 'worker'; tenantId: string }
  | { kind: 'admin'; tenantId: string; role: 'owner' | 'admin' };

export type WorkerLocationPing = {
  orderId: string;
  tenantId: string;
  workerUserId: string;
  lat: number;
  lng: number;
  updatedAt: string;
};

// ---------------------------------------------------------------------
// Wallet & in-app credit types (see supabase/migrations/0005_wallet.sql)
// ---------------------------------------------------------------------

/** A tokenized saved payment method. Raw card numbers are NEVER stored —
 *  only the opaque gateway token + last 4 digits for display. */
export type PaymentMethod = {
  id: string;
  userId: string;
  token: string;      // opaque Paymob token (or 'mock_token_<last4>' in dev)
  last4: string;
  brand: string;      // 'visa' | 'mastercard' | 'card'
  expiresAt?: string; // 'MM/YY' — display only
  isDefault: boolean;
  createdAt: string;
};

/** Wallet snapshot (balance is in EGP float; stored as piastres in DB). */
export type Wallet = {
  userId: string;
  balanceEgp: number;   // derived from balance_piastres / 100
  updatedAt: string;
};

/** Immutable ledger row. commission_debit is kept separate from
 *  order_debit on the same order for full transparency. */
export type WalletTxType = 'topup' | 'order_debit' | 'refund' | 'commission_debit';

export type WalletTransaction = {
  id: string;
  userId: string;
  type: WalletTxType;
  amountEgp: number;   // derived from amount_piastres / 100
  orderId?: string;
  paymentId?: string;
  note?: string;
  createdAt: string;
};

export type SavedAddress = {
  id: string;
  userId: string;
  label: string;
  lat: number;
  lng: number;
  address: string;
  isDefault: boolean;
  createdAt: string;
};

