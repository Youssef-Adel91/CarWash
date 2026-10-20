// Powered by OnSpace.AI
import { APP_CONFIG } from '@/constants/config';
import { mockGateway } from './mockGateway';
import { paymobGateway } from './paymobGateway';
import type { PaymentGateway } from './types';

export const paymentGateway: PaymentGateway =
  APP_CONFIG.paymentProvider === 'paymob' ? paymobGateway : mockGateway;

export * from './types';
export { subscribeToPaymentStatus } from './paymobGateway';
