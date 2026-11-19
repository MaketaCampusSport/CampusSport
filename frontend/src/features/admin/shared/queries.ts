import { useQuery } from '@tanstack/react-query';
import { client, type Block, type Resource, type Sport } from '@/api/client';
import { keys } from '@/api/keys';
import { EQUIPMENT_IDS } from '@/lib/validators';

export function useSports() {
  return useQuery({ queryKey: keys.sports, queryFn: ({ signal }) => client.catalog.sports(signal), staleTime: 5 * 60_000 });
}

/** Toate resursele, inclusiv cele dezactivate (parametrul e respectat doar pentru admin). */
export function useResources() {
  return useQuery({
    queryKey: keys.resources,
    queryFn: ({ signal }) => client.catalog.resources({ include_inactive: true }, signal),
  });
}

/**
 * Blocările de urgență / mentenanță care se suprapun cu momentul curent: starea „blocată acum”
 * și urgențele active din panou. Contractul nu are un câmp `blocked` pe resursă.
 */
export function useActiveBlocks() {
  return useQuery({
    queryKey: keys.activeBlocks,
    queryFn: async () => {
      const now = new Date();
      const page = await client.admin.blocks({
        from: now.toISOString(),
        to: new Date(now.getTime() + 60_000).toISOString(),
        page_size: 100,
      });
      return page.items.filter((b) => b.kind === 'emergency' || b.kind === 'maintenance');
    },
    refetchInterval: 60_000,
  });
}

/** Blocarea activă a fiecărei resurse (urgența are prioritate). */
export function activeBlockByResource(blocks: Block[] | undefined): Map<string, Block> {
  const map = new Map<string, Block>();
  for (const b of blocks ?? []) {
    const existing = map.get(b.resource_id);
    if (!existing || (existing.kind !== 'emergency' && b.kind === 'emergency')) map.set(b.resource_id, b);
  }
  return map;
}

/** Numele unui sport în limba curentă. */
export function sportName(sport: Sport, lng: string): string {
  return lng.startsWith('en') ? sport.name_en : sport.name_ro;
}

export function activeResources(list: Resource[] | undefined): Resource[] {
  return (list ?? []).filter((r) => r.active !== false);
}

export function resourceName(resources: Resource[] | undefined, id: string): string {
  return resources?.find((r) => r.id === id)?.name ?? id;
}

/** Dotările propuse în formulare: cele cunoscute + cele deja folosite de server (texte libere în contract). */
export function equipmentOptions(sports: Sport[] | undefined, extra: string[] = []): string[] {
  const all = new Set<string>([...EQUIPMENT_IDS, ...extra, ...(sports ?? []).flatMap((s) => s.required_equipment)]);
  return [...all];
}
