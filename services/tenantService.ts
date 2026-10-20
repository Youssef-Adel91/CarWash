// Powered by OnSpace.AI
// Tenant (car-wash business) service — the core of the SaaS layer.
// Every business that signs up gets a row here, plus a `tenant_members`
// row with role 'owner'. Customers pick one active tenant to order from.
import { getSupabaseClient } from '@/template';
import type { Tenant } from './types';

const supabase = getSupabaseClient();

function mapTenantRow(row: any): Tenant {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url ?? null,
    city: row.city ?? null,
    isActive: !!row.is_active,
    registrationFeeEgp: Number(row.registration_fee_egp ?? 10),
    createdAt: row.created_at,
  };
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || 'wash'}-${suffix}`;
}

/** Public list of active car-wash companies a customer can order from. */
export async function listActiveTenants(search?: string): Promise<Tenant[]> {
  let query = supabase.from('tenants').select('*').eq('is_active', true).order('name');
  if (search && search.trim()) {
    query = query.ilike('name', `%${search.trim()}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTenantRow);
}

export async function getTenantById(id: string): Promise<Tenant | null> {
  const { data, error } = await supabase.from('tenants').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return mapTenantRow(data);
}

/** Creates a new tenant and makes `ownerId` its owner. Called once, right
 * after a "business" registration completes. */
export async function createTenant(params: {
  ownerId: string;
  name: string;
  city?: string;
  registrationFeeEgp?: number;
}): Promise<Tenant> {
  const { data, error } = await supabase
    .from('tenants')
    .insert({
      owner_id: params.ownerId,
      name: params.name,
      slug: slugify(params.name),
      city: params.city ?? null,
      registration_fee_egp: params.registrationFeeEgp ?? 10,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const tenant = mapTenantRow(data);

  const { error: memberError } = await supabase.from('tenant_members').insert({
    tenant_id: tenant.id,
    user_id: params.ownerId,
    role: 'owner',
  });
  if (memberError) throw new Error(memberError.message);

  return tenant;
}

export async function updateTenant(
  id: string,
  patch: Partial<{ name: string; city: string; logoUrl: string; isActive: boolean; registrationFeeEgp: number }>,
): Promise<Tenant | null> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.registrationFeeEgp !== undefined) row.registration_fee_egp = patch.registrationFeeEgp;

  const { data, error } = await supabase.from('tenants').update(row).eq('id', id).select().single();
  if (error || !data) return null;
  return mapTenantRow(data);
}
