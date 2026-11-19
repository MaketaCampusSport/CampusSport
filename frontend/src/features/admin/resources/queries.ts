import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client, type ResourceInput } from '@/api/client';
import { keys } from '@/api/keys';

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
  return useMutation({ mutationFn: (input: ResourceInput) => client.admin.createResource(input), onSuccess: () => refresh() });
}

/** PATCH /admin/resources/{id}: trimite doar câmpurile modificate (aici: tot formularul sau doar `active`). */
export function useUpdateResource() {
  const refresh = useRefreshResources();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResourceInput }) => client.admin.updateResource(id, input),
    onSuccess: () => refresh(),
  });
}
