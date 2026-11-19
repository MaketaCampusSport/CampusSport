import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, type BlockCreate, type DeliveryStatus, type ListBlocksData } from '@/api/client';
import { keys } from '@/api/keys';

export function useBlocks(q: ListBlocksData['query']) {
  return useQuery({ queryKey: keys.blocks(q), queryFn: () => client.admin.blocks(q), placeholderData: keepPreviousData });
}

/** Toate mesajele au primit un rezultat (livrat sau eșuat). */
export function deliveryComplete(d: DeliveryStatus): boolean {
  return d.delivered + d.failed >= d.notified;
}

/** Contorul „anunțați / livrați”; se reîmprospătează cât timp trimiterea nu s-a încheiat (SDD 7.3, pasul 4). */
export function useDelivery(blockId: string | null) {
  return useQuery({
    queryKey: keys.delivery(blockId ?? ''),
    queryFn: () => client.admin.blockDelivery(blockId as string),
    enabled: !!blockId,
    refetchInterval: (query) => (query.state.data && deliveryComplete(query.state.data) ? false : 2000),
  });
}

/** După orice modificare de blocări se reîncarcă tot ce depinde de ele. */
function useInvalidateAfterBlockChange() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.blocksAll }),
      qc.invalidateQueries({ queryKey: keys.dashboardAll }),
      qc.invalidateQueries({ queryKey: keys.adminBookingsAll }),
      qc.invalidateQueries({ queryKey: keys.auditAll }),
    ]);
}

export function useCreateBlock() {
  const invalidate = useInvalidateAfterBlockChange();
  return useMutation({
    mutationFn: (input: BlockCreate) => client.admin.createBlock(input),
    onSuccess: () => invalidate(),
  });
}

/** DELETE /admin/blocks/{id}: deblocare (rezervările deja anulate nu se refac). */
export function useReleaseBlock() {
  const invalidate = useInvalidateAfterBlockChange();
  return useMutation({
    mutationFn: (id: string) => client.admin.deleteBlock(id),
    onSuccess: () => invalidate(),
  });
}
