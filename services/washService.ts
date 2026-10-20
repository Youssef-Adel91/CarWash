// Powered by OnSpace.AI
// Wash catalog — scoped per tenant. Falls back to a shared static list
// (tenant_id IS NULL rows, or the hardcoded WASH_TYPES) so a brand-new
// tenant with no priced services yet still shows something sensible.
import type { ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getSupabaseClient } from '@/template';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type WashType = {
  id: string;
  tenantId?: string | null;
  name: string;
  description: string;
  priceEgp: number;
  durationMin: number;
  icon: IconName;
};

export const WASH_TYPES: WashType[] = [
  {
    id: 'exterior',
    name: 'Exterior Only',
    description: 'Foam wash, rinse and dry of the car body.',
    priceEgp: 80,
    durationMin: 20,
    icon: 'car-wash',
  },
  {
    id: 'interior_exterior',
    name: 'Interior + Exterior',
    description: 'Full inside vacuum and complete outside clean.',
    priceEgp: 150,
    durationMin: 40,
    icon: 'car-seat',
  },
  {
    id: 'premium',
    name: 'Premium / Wax Detailing',
    description: 'Deep detailing, polish and protective wax coat.',
    priceEgp: 300,
    durationMin: 75,
    icon: 'shimmer',
  },
];

export function getWashTypeById(id: string): WashType | undefined {
  return WASH_TYPES.find((w) => w.id === id);
}

function mapRow(row: any): WashType {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? null,
    name: row.name,
    description: row.description ?? '',
    priceEgp: Number(row.price_egp),
    durationMin: row.duration_min ?? 30,
    icon: (row.icon as IconName) || 'car-wash',
  };
}

export async function fetchWashTypes(tenantId?: string): Promise<WashType[]> {
  try {
    const supabase = getSupabaseClient();
    const load = async (forTenant: string | null) => {
      const base = supabase.from('wash_types').select('*').eq('is_active', true);
      const query = forTenant ? base.eq('tenant_id', forTenant) : base.is('tenant_id', null);
      const { data, error } = await query.order('sort_order', { ascending: true });
      return error || !data ? [] : data;
    };
    // The tenant's own services first, then the shared catalog (real rows
    // the server can price orders from), and only then the static list.
    const own = tenantId ? await load(tenantId) : [];
    if (own.length > 0) return own.map(mapRow);
    const shared = await load(null);
    return shared.length > 0 ? shared.map(mapRow) : WASH_TYPES;
  } catch {
    return WASH_TYPES;
  }
}

export async function createWashType(params: {
  tenantId: string;
  name: string;
  description: string;
  priceEgp: number;
  durationMin: number;
  icon?: IconName;
}): Promise<WashType> {
  const { data, error } = await getSupabaseClient()
    .from('wash_types')
    .insert({
      tenant_id: params.tenantId,
      name: params.name,
      description: params.description,
      price_egp: params.priceEgp,
      duration_min: params.durationMin,
      icon: params.icon ?? 'car-wash',
      is_active: true,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

export async function updateWashType(
  id: string,
  patch: Partial<{ name: string; description: string; priceEgp: number; durationMin: number; isActive: boolean }>,
): Promise<WashType | null> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.priceEgp !== undefined) row.price_egp = patch.priceEgp;
  if (patch.durationMin !== undefined) row.duration_min = patch.durationMin;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  const { data, error } = await getSupabaseClient().from('wash_types').update(row).eq('id', id).select().single();
  if (error || !data) return null;
  return mapRow(data);
}

export async function deleteWashType(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('wash_types').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
