// Powered by OnSpace.AI
// Wallet service — reads/writes to the wallets and wallet_transactions
// tables created in supabase/migrations/0005_wallet.sql.
//
// KEY RULES (enforced here and at DB level):
//  - balance is stored in INTEGER PIASTRES in Postgres; this layer
//    converts to/from EGP floats for the UI (÷100 / ×100).
//  - Top-up only: there is no withdrawal path. Refunds go back as
//    wallet credit, not to a bank account. This is intentional — do
//    not add a withdrawal flow without owner approval.
//  - The DB trigger (apply_wallet_transaction) keeps balances
//    consistent atomically — we never UPDATE wallets directly.
import { getSupabaseClient } from '@/template';
import { APP_CONFIG } from '@/constants/config';
import { paymentGateway } from './paymentGateway';
import type { Wallet, WalletTransaction, WalletTxType } from './types';

const supabase = getSupabaseClient();

function toEgp(piastres: number): number {
  return piastres / 100;
}
function toPiastres(egp: number): number {
  return Math.round(egp * 100);
}

function mapWalletRow(row: any): Wallet {
  return {
    userId: row.user_id,
    balanceEgp: toEgp(row.balance_piastres ?? 0),
    updatedAt: row.updated_at,
  };
}

function mapTxRow(row: any): WalletTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as WalletTxType,
    amountEgp: toEgp(row.amount_piastres),
    orderId: row.order_id ?? undefined,
    paymentId: row.payment_id ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

/** Get the wallet for a user (returns null if not yet created). */
export async function getWallet(userId: string): Promise<Wallet | null> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapWalletRow(data);
}

/** Convenience: returns balance in EGP (0 if no wallet yet). */
export async function getWalletBalance(userId: string): Promise<number> {
  const wallet = await getWallet(userId);
  return wallet?.balanceEgp ?? 0;
}

/** Last N wallet transactions for the user. */
export async function getWalletTransactions(
  userId: string,
  limit = 30,
): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map(mapTxRow);
}

export type TopUpResult =
  | { success: true; mode: 'instant'; newBalanceEgp: number }
  | { success: true; mode: 'checkout'; checkoutUrl: string; paymentId: string }
  | { success: false; error: string };

/**
 * Top up the wallet by `amountEgp`.
 *
 * Mock mode: charges immediately and inserts a 'topup' transaction
 * (the DB trigger then bumps the balance atomically).
 *
 * Paymob mode: creates a checkout intention; the edge function webhook
 * inserts the 'topup' transaction once payment is confirmed.
 */
export async function topUpWallet(params: {
  userId: string;
  amountEgp: number;
  customer: { fullName: string; email: string; phone: string };
}): Promise<TopUpResult> {
  const { userId, amountEgp, customer } = params;

  const result = await paymentGateway.charge({
    userId,
    amountEgp,
    kind: 'wash', // closest kind available in gateway types
    customer,
  });

  if (!result.success) return { success: false, error: result.error };

  if (result.mode === 'instant') {
    // Mock gateway: insert transaction directly — trigger updates balance.
    const { error } = await supabase.from('wallet_transactions').insert({
      user_id: userId,
      type: 'topup',
      amount_piastres: toPiastres(amountEgp),
      note: `Top-up ${amountEgp} ${APP_CONFIG.currency}`,
    });
    if (error) return { success: false, error: error.message };
    const newBalance = await getWalletBalance(userId);
    return { success: true, mode: 'instant', newBalanceEgp: newBalance };
  }

  // Paymob: webhook will insert the transaction after payment confirmation.
  return { success: true, mode: 'checkout', checkoutUrl: result.checkoutUrl, paymentId: result.paymentId };
}

export type WalletPayResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Deduct `amountEgp` from the wallet for a wash order.
 * The DB trigger (apply_wallet_transaction, fixed by Claude while
 * reviewing this migration) locks the wallet row and RAISE EXCEPTIONs
 * if the debit would take the balance below 0 — that's the real safety
 * net, enforced no matter what calls this. The balance check below is
 * just a fast client-side rejection so the user gets an instant, friendly
 * error instead of waiting on a round-trip that's going to fail anyway.
 * Call this AFTER the order is created to keep the order_id reference intact.
 */
export async function payWithWallet(params: {
  userId: string;
  orderId: string;
  amountEgp: number;
}): Promise<WalletPayResult> {
  const { userId, orderId, amountEgp } = params;

  const balance = await getWalletBalance(userId);
  if (balance < amountEgp) {
    return { success: false, error: 'Insufficient wallet balance.' };
  }

  const { error } = await supabase.from('wallet_transactions').insert({
    user_id: userId,
    type: 'order_debit',
    amount_piastres: toPiastres(amountEgp),
    order_id: orderId,
    note: `Order payment ${amountEgp} ${APP_CONFIG.currency}`,
  });
  if (error) {
    // The DB trigger raises this if a race condition let two debits
    // through the client-side check at once — rare, but handle it.
    if (error.message?.toLowerCase().includes('insufficient wallet balance')) {
      return { success: false, error: 'Insufficient wallet balance.' };
    }
    return { success: false, error: error.message };
  }
  return { success: true };
}

/** Refund amountEgp back to the wallet (e.g. cancelled order). */
export async function refundToWallet(params: {
  userId: string;
  orderId: string;
  amountEgp: number;
  note?: string;
}): Promise<WalletPayResult> {
  const { error } = await supabase.from('wallet_transactions').insert({
    user_id: params.userId,
    type: 'refund',
    amount_piastres: toPiastres(params.amountEgp),
    order_id: params.orderId,
    note: params.note ?? `Refund ${params.amountEgp} ${APP_CONFIG.currency}`,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
