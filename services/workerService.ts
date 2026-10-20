// Powered by OnSpace.AI
// Worker-side job queue + live GPS broadcast, backed by Supabase Realtime.
import { getSupabaseClient } from '@/template';
import type { Order, OrderStatus, Worker, WorkerLocationPing } from './types';
import { mapOrderRow } from './orderService';

const supabase = getSupabaseClient();

/** Looks up the display info (name, vehicle, rating) for the worker
 * assigned to an order. Two small queries (tenant_members has no direct
 * FK to user_profiles) — fine at MVP scale, cache client-side if needed. */
export async function getWorkerDisplayInfo(tenantId: string, workerUserId: string): Promise<Worker | null> {
  const [{ data: member }, { data: profile }] = await Promise.all([
    supabase
      .from('tenant_members')
      .select('vehicle, rating')
      .eq('tenant_id', tenantId)
      .eq('user_id', workerUserId)
      .maybeSingle(),
    supabase.from('user_profiles').select('full_name, phone').eq('id', workerUserId).maybeSingle(),
  ]);
  if (!member && !profile) return null;
  return {
    id: workerUserId,
    name: profile?.full_name || 'Assigned worker',
    vehicle: member?.vehicle || '',
    rating: Number(member?.rating ?? 5),
    phone: profile?.phone || undefined,
  };
}

/** Great-circle distance in kilometres between two coordinates. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Open (unassigned, not-scheduled) orders a worker in this tenant can accept. */
export async function listOpenOrders(tenantId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .is('worker_user_id', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapOrderRow);
}

/** The single order this worker is currently handling, if any. */
export async function getMyActiveOrder(workerUserId: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('worker_user_id', workerUserId)
    .in('status', ['accepted', 'on_the_way', 'washing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapOrderRow(data);
}

export async function getMyCompletedOrders(workerUserId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('worker_user_id', workerUserId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapOrderRow);
}

/** Claims an open order. Uses the `worker_user_id is null` guard so two
 * workers racing to accept the same job can't both win. */
export async function acceptOrder(orderId: string, workerUserId: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'accepted', worker_user_id: workerUserId })
    .eq('id', orderId)
    .is('worker_user_id', null)
    .select()
    .single();
  if (error || !data) return null;
  return mapOrderRow(data);
}

export async function setOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
  const { data, error } = await supabase.from('orders').update({ status }).eq('id', orderId).select().single();
  if (error || !data) return null;
  return mapOrderRow(data);
}

/** Upserts the worker's current GPS position for a live order. Call this
 * from a `Location.watchPositionAsync` subscription while a job is active. */
export async function pushLocation(params: {
  orderId: string;
  tenantId: string;
  workerUserId: string;
  lat: number;
  lng: number;
}): Promise<void> {
  const { error } = await supabase.from('worker_locations').upsert(
    {
      order_id: params.orderId,
      tenant_id: params.tenantId,
      worker_user_id: params.workerUserId,
      lat: params.lat,
      lng: params.lng,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'order_id' },
  );
  if (error) console.log('pushLocation error:', error.message);
}

export async function getLatestLocation(orderId: string): Promise<WorkerLocationPing | null> {
  const { data, error } = await supabase.from('worker_locations').select('*').eq('order_id', orderId).maybeSingle();
  if (error || !data) return null;
  return {
    orderId: data.order_id,
    tenantId: data.tenant_id,
    workerUserId: data.worker_user_id,
    lat: Number(data.lat),
    lng: Number(data.lng),
    updatedAt: data.updated_at,
  };
}

/** Live-subscribes a customer (or admin) to a worker's position for one
 * order. Returns an unsubscribe function. */
export function subscribeToLocation(orderId: string, onUpdate: (ping: WorkerLocationPing) => void): () => void {
  const channel = supabase
    .channel(`worker-location-${orderId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'worker_locations', filter: `order_id=eq.${orderId}` },
      (payload) => {
        const row = payload.new as any;
        if (!row) return;
        onUpdate({
          orderId: row.order_id,
          tenantId: row.tenant_id,
          workerUserId: row.worker_user_id,
          lat: Number(row.lat),
          lng: Number(row.lng),
          updatedAt: row.updated_at,
        });
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Live-subscribes a worker's job queue: fires whenever a new pending order
 * lands in their tenant, or an open one gets claimed by someone else. */
export function subscribeToOpenOrders(tenantId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`open-orders-${tenantId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
      () => onChange(),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
