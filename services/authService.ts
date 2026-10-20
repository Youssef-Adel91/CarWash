// Powered by OnSpace.AI
// Real auth service backed by Supabase. Registration is a single
// signUp() call — no email verification step. "Confirm email" is
// switched OFF in the Supabase project (Authentication → Sign In /
// Providers → User Signups), because the project has no verified
// custom-SMTP domain yet, so Supabase's own transactional emails can't
// reliably reach real users' inboxes with a usable code (see
// SAAS_SETUP.md). Once a domain + SMTP provider (e.g. Resend) is set
// up, "Confirm email" can be switched back on in that same dashboard
// screen and the flow below only needs a small addition (surface
// `data.session === null` as "check your email to confirm") — no
// rewrite required.
import { getSupabaseClient } from '@/template';
import { paymentGateway } from './paymentGateway';
import { validateCard } from './paymentService';
import { APP_CONFIG } from '@/constants/config';
import type { CardInput, User } from './types';

const supabase = getSupabaseClient();

export type AuthResult = { success: true; user: User } | { success: false; error: string };
export type RegistrationCharge =
  | { success: true; mode: 'instant' }
  | { success: true; mode: 'checkout'; checkoutUrl: string; paymentId: string }
  | { success: false; error: string };

// Suppress the auth-change listener while a multi-step registration is running
// so the app does not navigate away before the profile + fee are persisted.
let suppressAuthEvents = false;

function friendly(message: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Invalid email or password.';
  if (m.includes('expired')) return 'The code has expired. Please request a new one.';
  if (m.includes('token') || (m.includes('invalid') && m.includes('otp')))
    return 'Invalid or incorrect verification code.';
  if (m.includes('already registered') || m.includes('already exists'))
    return 'An account with this email already exists.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Too many attempts. Please wait a moment and try again.';
  return message || 'Something went wrong. Please try again.';
}

async function buildUser(authUser: { id: string; email?: string | null; created_at?: string; user_metadata?: Record<string, any> }): Promise<User> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, phone, card_last4, email, created_at')
    .eq('id', authUser.id)
    .maybeSingle();

  const meta = authUser.user_metadata ?? {};
  return {
    id: authUser.id,
    email: authUser.email ?? profile?.email ?? '',
    fullName: profile?.full_name || meta.full_name || meta.username || '',
    phone: profile?.phone || meta.phone || '',
    role: 'customer',
    createdAt: authUser.created_at ?? profile?.created_at ?? new Date().toISOString(),
    cardLast4: profile?.card_last4 || undefined,
  };
}

export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  return buildUser(session.user);
}

export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (suppressAuthEvents) return;
    if (session?.user) {
      const user = await buildUser(session.user);
      if (!suppressAuthEvents) callback(user);
    } else {
      callback(null);
    }
  });
  return () => data.subscription.unsubscribe();
}

// Single-step registration: create the auth user + password directly.
// With "Confirm email" off, Supabase signs the user in immediately (no
// email round-trip). The `handle_new_user` DB trigger already inserted a
// bare user_profiles row (id, email) on the auth.users insert — this
// fills in full_name/phone right after.
export async function completeRegistration(params: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}): Promise<AuthResult> {
  const { fullName, email, phone, password } = params;

  suppressAuthEvents = true;
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName, phone, username: fullName } },
    });
    if (error || !data.user) {
      return { success: false, error: error ? friendly(error.message) : 'Could not create account.' };
    }
    if (!data.session) {
      // Should not normally happen with "Confirm email" off, but guard
      // against it rather than leaving the caller stuck.
      return {
        success: false,
        error: 'Account created, but could not sign in automatically. Please try logging in.',
      };
    }

    const authUser = data.user;
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({ full_name: fullName, phone })
      .eq('id', authUser.id);
    if (profileError) console.log('profile update error:', profileError.message);

    const user = await buildUser({
      id: authUser.id,
      email: authUser.email,
      created_at: authUser.created_at,
      user_metadata: { full_name: fullName, phone, username: fullName },
    });
    return { success: true, user };
  } catch (e) {
    return { success: false, error: friendly((e as Error).message) };
  } finally {
    suppressAuthEvents = false;
  }
}

/** Charges the mandatory onboarding fee for a freshly-created account.
 * With the mock gateway this resolves instantly and also updates the
 * user's stored card_last4. With Paymob it returns a checkout URL for the
 * caller to open in a WebView; card_last4 gets filled in later by the
 * webhook via the payments row (see profile screen for payment history). */
export async function chargeRegistrationFee(params: {
  user: User;
  card?: CardInput;
}): Promise<RegistrationCharge> {
  if (APP_CONFIG.paymentProvider === 'mock') {
    if (!params.card) return { success: false, error: 'Card details are required.' };
    const cardError = validateCard(params.card);
    if (cardError) return { success: false, error: cardError };
  }

  const result = await paymentGateway.charge({
    userId: params.user.id,
    amountEgp: APP_CONFIG.registrationFee,
    kind: 'registration_fee',
    card: params.card,
    customer: { fullName: params.user.fullName, email: params.user.email, phone: params.user.phone },
  });

  if (!result.success) return { success: false, error: result.error };

  if (result.mode === 'instant') {
    await supabase.from('user_profiles').update({ card_last4: result.cardLast4 }).eq('id', params.user.id);
    return { success: true, mode: 'instant' };
  }
  return { success: true, mode: 'checkout', checkoutUrl: result.checkoutUrl, paymentId: result.paymentId };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error || !data.user) {
    return { success: false, error: error ? friendly(error.message) : 'Login failed.' };
  }
  const user = await buildUser(data.user);
  return { success: true, user };
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

// -------------------------------------------------------------------
// Profile management
// -------------------------------------------------------------------

export type UpdateProfileResult = { success: true; user: User } | { success: false; error: string };

/** Update full_name and/or phone in user_profiles + auth user_metadata. */
export async function updateProfile(
  userId: string,
  updates: { fullName?: string; phone?: string },
): Promise<UpdateProfileResult> {
  const patch: Record<string, string> = {};
  if (updates.fullName !== undefined) patch.full_name = updates.fullName;
  if (updates.phone !== undefined) patch.phone = updates.phone;

  const { error } = await supabase.from('user_profiles').update(patch).eq('id', userId);
  if (error) return { success: false, error: friendly(error.message) };

  // Keep auth user_metadata in sync so buildUser() always reads fresh data.
  const metaPatch: Record<string, string> = {};
  if (updates.fullName) metaPatch.full_name = updates.fullName;
  if (updates.phone) metaPatch.phone = updates.phone;
  if (Object.keys(metaPatch).length > 0) {
    await supabase.auth.updateUser({ data: metaPatch });
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { success: false, error: 'Session expired.' };
  const user = await buildUser(session.user);
  return { success: true, user };
}

export type PasswordUpdateResult = { success: true } | { success: false; error: string };

/** Change the password for the currently signed-in user. */
export async function updatePassword(newPassword: string): Promise<PasswordUpdateResult> {
  if (newPassword.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' };
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { success: false, error: friendly(error.message) };
  return { success: true };
}

export type EmailUpdateResult =
  | { success: true; mode: 'immediate' }   // confirm-email OFF: change applied now
  | { success: true; mode: 'confirm' }      // confirm-email ON: check inbox
  | { success: false; error: string };

/**
 * Request an email change for the current user.
 *
 * Supabase behaviour depends on the "Confirm email" setting:
 *  - OFF (current default): change applied immediately, no email sent.
 *  - ON (future): Supabase sends a confirmation link to the NEW email;
 *    the change only takes effect after the user clicks it.
 *
 * We detect which path occurred by comparing the session email after
 * the call: if it updated immediately the mode is 'immediate'; if
 * Supabase returned a non-error but the email is unchanged in the
 * session, the mode is 'confirm' (link was sent to new email).
 */
export async function updateEmail(newEmail: string): Promise<EmailUpdateResult> {
  const trimmed = newEmail.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  const { error } = await supabase.auth.updateUser({ email: trimmed });
  if (error) return { success: false, error: friendly(error.message) };

  // Check whether the session reflects the new email already.
  const { data: { session } } = await supabase.auth.getSession();
  const sessionEmail = session?.user?.email ?? '';
  const mode = sessionEmail.toLowerCase() === trimmed ? 'immediate' : 'confirm';
  return { success: true, mode };
}

export type DeleteAccountResult = { success: true } | { success: false; error: string };

/**
 * Request account deletion.
 *
 * WHY NOT ACTUAL DELETION HERE: Deleting an auth user requires
 * `auth.admin.deleteUser()` which is a server-side-only operation
 * (it uses the service role key, which must never ship in the app
 * bundle). Until an edge function is deployed for this, we:
 *  1. Insert a deletion_request row (auditable + lets an admin process it).
 *  2. Sign the user out immediately (they lose access right away).
 * A future edge function / manual step will permanently delete the
 * auth.users row and all related data (GDPR / App Store requirement).
 */
export async function requestAccountDeletion(userId: string): Promise<DeleteAccountResult> {
  const { error } = await supabase
    .from('account_deletion_requests')
    .insert({ user_id: userId });
  if (error) return { success: false, error: friendly(error.message) };

  // Sign out immediately so the user loses access while deletion is pending.
  await supabase.auth.signOut();
  return { success: true };
}

