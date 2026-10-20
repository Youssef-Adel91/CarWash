// Powered by OnSpace.AI
// Tenant membership service — who is an owner / admin / worker of which
// tenant. Drives which app "mode" (customer / worker / admin) a signed-in
// user lands in (see contexts/TenantContext.tsx).
import { getSupabaseClient } from '@/template';
import type { TenantMembership, TenantRole } from './types';

const supabase = getSupabaseClient();

function mapRow(row: any): TenantMembership {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenants?.name,
    userId: row.user_id,
    role: row.role as TenantRole,
    isActive: !!row.is_active,
    isOnline: !!row.is_online,
    vehicle: row.vehicle ?? null,
    rating: Number(row.rating ?? 5),
    createdAt: row.created_at,
  };
}

/** All the tenants a user works for / owns / admins, most recent first. */
export async function getMyMemberships(userId: string): Promise<TenantMembership[]> {
  const { data, error } = await supabase
    .from('tenant_members')
    .select('*, tenants(name)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function listMembers(tenantId: string, role?: TenantRole): Promise<TenantMembership[]> {
  let query = supabase.from('tenant_members').select('*').eq('tenant_id', tenantId);
  if (role) query = query.eq('role', role);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

/** Adds an existing platform user (by email, looked up in user_profiles) as
 * a worker/admin of this tenant. The person must already have created an
 * account in the app once (registration is still the single OTP flow). */
export async function addMemberByEmail(params: {
  tenantId: string;
  email: string;
  role: Exclude<TenantRole, 'owner'>;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { data: profile, error: lookupError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', params.email.trim())
    .maybeSingle();

  if (lookupError) return { success: false, error: lookupError.message };
  if (!profile) {
    return {
      success: false,
      error: 'No account with this email yet. Ask them to create a customer account first, then add them here.',
    };
  }

  const { error } = await supabase.from('tenant_members').upsert(
    {
      tenant_id: params.tenantId,
      user_id: profile.id,
      role: params.role,
      is_active: true,
    },
    { onConflict: 'tenant_id,user_id' },
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function removeMember(membershipId: string): Promise<void> {
  const { error } = await supabase.from('tenant_members').delete().eq('id', membershipId);
  if (error) throw new Error(error.message);
}

export async function setOnlineStatus(membershipId: string, isOnline: boolean): Promise<void> {
  const { error } = await supabase.from('tenant_members').update({ is_online: isOnline }).eq('id', membershipId);
  if (error) throw new Error(error.message);
}

export async function updateWorkerProfile(
  membershipId: string,
  patch: { vehicle?: string },
): Promise<void> {
  const { error } = await supabase.from('tenant_members').update(patch).eq('id', membershipId);
  if (error) throw new Error(error.message);
}
