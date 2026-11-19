import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/endpoints';
import { keys } from '@/api/keys';
import type { ResourceInput } from '@/api/types';

function useRefreshResources() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.resources }),
      qc.invalidateQueries({ queryKey: keys.dashboardAll }),
      qc.invalidateQueries({ queryKey: keys.auditAll }),
    ]);
}

export function useCreateResource() {
  const refresh = useRefreshResources();
  return useMutation({ mutationFn: (input: ResourceInput) => api.resources.create(input), onSuccess: () => refresh() });
}

export function useUpdateResource() {
  const refresh = useRefreshResources();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResourceInput }) => api.resources.update(id, input),
    onSuccess: () => refresh(),
  });
}

export function useSetResourceActive() {
  const refresh = useRefreshResources();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.resources.setActive(id, active),
    onSuccess: () => refresh(),
  });
}
