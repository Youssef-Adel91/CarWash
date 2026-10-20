// Powered by OnSpace.AI
// Order service backed by the `orders` table (RLS: tenant-scoped — see
// supabase/migrations/0001_saas_multitenant.sql). Every order now belongs
// to a tenant (the car-wash company the customer picked) and, once
// accepted, to a real worker user (worker_user_id), not a mock name.
import { getSupabaseClient } from '@/template';
import { APP_CONFIG } from '@/constants/config';
import type { GeoLocation, Order, OrderStatus, Worker } from './types';

const supabase = getSupabaseClient();

export function mapOrderRow(row: any): Order {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenants?.name,
    customerId: row.customer_id,
    washTypeId: row.wash_type_id ?? '',
    washTypeName: row.wash_type_name,
    priceEgp: Number(row.price_egp),
    status: row.status as OrderStatus,
    location: {
      latitude: row.lat ?? APP_CONFIG.defaultLocation.latitude,
      longitude: row.lng ?? APP_CONFIG.defaultLocation.longitude,
      address: row.address ?? APP_CONFIG.defaultLocation.address,
    },
    scheduledFor: row.scheduled_for ?? null,
    workerUserId: row.worker_user_id ?? null,
    worker: row.worker_name
      ? {
          id: row.worker_user_id ?? 'wrk',
          name: row.worker_name,
          vehicle: row.worker_vehicle ?? '',
          rating: Number(row.worker_rating ?? 0),
        }
      : undefined,
    createdAt: row.created_at,
  };
}

export async function getOrders(customerId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, tenants(name)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapOrderRow);
}

/** A customer's most recent completed orders — used for the "order again" /
 * order-history surfaces (home screen "Last order" card, orders screen
 * "Past orders" section). */
export async function getMyOrderHistory(customerId: string, limit = 10): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, tenants(name)')
    .eq('customer_id', customerId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapOrderRow);
}

export async function getOrdersForTenant(tenantId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapOrderRow);
}

export async function getOrderById(id: string): Promise<Order | null> {
  const { data, error } = await supabase.from('orders').select('*, tenants(name)').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return mapOrderRow(data);
}

export async function createOrder(params: {
  customerId: string;
  tenantId: string;
  washType: { id: string; name: string; priceEgp: number };
  location: GeoLocation;
  scheduledFor: string | null;
}): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .insert({
      customer_id: params.customerId,
      tenant_id: params.tenantId,
      wash_type_id: params.washType.id,
      wash_type_name: params.washType.name,
      price_egp: params.washType.priceEgp,
      status: 'pending',
      lat: params.location.latitude,
      lng: params.location.longitude,
      address: params.location.address,
      scheduled_for: params.scheduledFor,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapOrderRow(data);
}

/** Creates the order AND debits the wallet in one database transaction
 * (RPC place_order_with_wallet). The price is read from wash_types on the
 * server, so the client-sent price is ignored; if the balance is too low
 * nothing is created and the error message contains "insufficient". */
export async function placeOrderWithWallet(params: {
  tenantId: string;
  washType: { id: string };
  location: GeoLocation;
  scheduledFor: string | null;
}): Promise<Order> {
  const { data, error } = await supabase.rpc('place_order_with_wallet', {
    p_tenant_id: params.tenantId,
    p_wash_type_id: params.washType.id,
    p_lat: params.location.latitude,
    p_lng: params.location.longitude,
    p_address: params.location.address,
    p_scheduled_for: params.scheduledFor,
  });
  if (error) throw new Error(error.message);
  return mapOrderRow(data);
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  worker?: Worker,
): Promise<Order | null> {
  const patch: Record<string, unknown> = { status };
  if (worker) {
    patch.worker_user_id = worker.id;
    patch.worker_name = worker.name;
    patch.worker_vehicle = worker.vehicle;
    patch.worker_rating = worker.rating;
  }
  const { data, error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error || !data) return null;
  return mapOrderRow(data);
}
