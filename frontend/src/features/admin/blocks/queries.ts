import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/endpoints';
import { keys } from '@/api/keys';
import type { BlockInput, BlockPreviewQuery } from '@/api/types';

export function useBlocks() {
  return useQuery({ queryKey: keys.blocks, queryFn: () => api.blocks.list() });
}

export function useBlockPreview(q: BlockPreviewQuery | null) {
  return useQuery({
    queryKey: keys.blockPreview(q?.resourceId ?? '', q?.from ?? '', q?.to ?? null, q?.excludeBlockId),
    queryFn: () => api.blocks.preview(q as BlockPreviewQuery),
    enabled: !!q,
    staleTime: 0,
  });
}

/** Raportul „anunțați / livrați”; se reîmprospătează cât timp trimiterea nu s-a încheiat (SDD 7.3). */
export function useDelivery(blockId: string | null) {
  return useQuery({
    queryKey: keys.delivery(blockId ?? ''),
    queryFn: () => api.blocks.delivery(blockId as string),
    enabled: !!blockId,
    refetchInterval: (query) => (query.state.data?.complete ? false : 1500),
  });
}

/** După orice modificare de blocări se reîncarcă tot ce depinde de ele. */
function useInvalidateAfterBlockChange() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.blocks }),
      qc.invalidateQueries({ queryKey: keys.dashboardAll }),
      qc.invalidateQueries({ queryKey: keys.resources }),
      qc.invalidateQueries({ queryKey: keys.auditAll }),
    ]);
}

export function useCreateBlock() {
  const invalidate = useInvalidateAfterBlockChange();
  return useMutation({
    mutationFn: (input: BlockInput) => api.blocks.create(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateBlock() {
  const invalidate = useInvalidateAfterBlockChange();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BlockInput }) => api.blocks.update(id, input),
    onSuccess: () => invalidate(),
  });
}

export function useReleaseBlock() {
  const invalidate = useInvalidateAfterBlockChange();
  return useMutation({
    mutationFn: (id: string) => api.blocks.release(id),
    onSuccess: () => invalidate(),
  });
}
