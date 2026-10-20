// Powered by OnSpace.AI
// Payment-gateway abstraction. Two implementations exist:
//  - mockGateway.ts   → instant simulated success (default, used in dev/demo)
//  - paymobGateway.ts → real Paymob Accept/Unified Checkout flow (Egypt)
// Swap which one is active via APP_CONFIG.paymentProvider in constants/config.ts.
import type { CardInput } from '@/services/types';

export type ChargeParams = {
  userId: string;
  tenantId?: string;
  orderId?: string;
  amountEgp: number;
  kind: 'registration_fee' | 'wash';
  card?: CardInput; // only used by the mock gateway; Paymob collects the card itself
  customer: { fullName: string; email: string; phone: string };
};

export type ChargeStart =
  | { success: true; mode: 'instant'; paymentId: string; cardLast4: string }
  | { success: true; mode: 'checkout'; paymentId: string; checkoutUrl: string }
  | { success: false; error: string };

export type PaymentGateway = {
  /** Kicks off a charge. Either resolves instantly (mock) or returns a
   * checkout URL to open in a WebView (Paymob), where the customer enters
   * their card. The final status always lands via `payments` table update
   * (mock: written immediately; Paymob: written by the webhook once Paymob
   * confirms the transaction server-side). */
  charge(params: ChargeParams): Promise<ChargeStart>;
};
