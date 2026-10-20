// Powered by OnSpace.AI
import { useContext } from 'react';
import { OrderContext } from '@/contexts/OrderContext';

export function useOrders() {
  const context = useContext(OrderContext);
  if (!context) throw new Error('useOrders must be used within OrderProvider');
  return context;
}
