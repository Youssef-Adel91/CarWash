// Powered by OnSpace.AI
// Customer-side order state. The worker lifecycle used to be simulated
// with client-side timers; now a real worker (in the (worker) app mode)
// accepts and updates the order, and this context just listens for those
// changes over Supabase Realtime.
import React, { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from './TenantContext';
import * as orderService from '@/services/orderService';
import { recordPayment } from '@/services/paymentService';
import { getSupabaseClient } from '@/template';
import type { GeoLocation, Order } from '@/services/types';

const supabase = getSupabaseClient();

type PlaceParams = {
  washType: { id: string; name: string; priceEgp: number };
  location: GeoLocation;
  scheduledFor: string | null;
  paymentMethod?: 'card' | 'wallet';
};

type OrderContextType = {
  orders: Order[];
  loading: boolean;
  refresh: () => Promise<void>;
  placeOrder: (params: PlaceParams) => Promise<Order | null>;
  getById: (id: string) => Order | undefined;
};

export const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { selectedTenant } = useTenant();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setOrders([]);
      return;
    }
    setLoading(true);
    try {
      const data = await orderService.getOrders(user.id);
      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live-update this customer's own orders whenever a worker (or admin)
  // changes their status/assignment.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`customer-orders-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `customer_id=eq.${user.id}` },
        (payload) => {
          const updated = orderService.mapOrderRow(payload.new);
          setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const placeOrder = useCallback(
    async (params: PlaceParams) => {
      if (!user || !selectedTenant) return null;
      let order: Order;
      if (params.paymentMethod === 'wallet') {
        // One DB transaction: order + wallet debit, or nothing.
        order = await orderService.placeOrderWithWallet({
          tenantId: selectedTenant.id,
          washType: params.washType,
          location: params.location,
          scheduledFor: params.scheduledFor,
        });
      } else {
        order = await orderService.createOrder({
          customerId: user.id,
          tenantId: selectedTenant.id,
          washType: params.washType,
          location: params.location,
          scheduledFor: params.scheduledFor,
        });
        await recordPayment({
          userId: user.id,
          tenantId: selectedTenant.id,
          orderId: order.id,
          kind: 'wash',
          amountEgp: order.priceEgp,
          cardLast4: user.cardLast4 ?? '0000',
        });
      }

      setOrders((prev) => [order, ...prev]);
      return order;
    },
    [user, selectedTenant],
  );

  const getById = useCallback((id: string) => orders.find((o) => o.id === id), [orders]);

  return (
    <OrderContext.Provider value={{ orders, loading, refresh, placeOrder, getById }}>
      {children}
    </OrderContext.Provider>
  );
}
