import * as RadixTabs from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ className, ...rest }: ComponentPropsWithoutRef<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn('inline-flex gap-1 rounded-2xl bg-surface p-1.5 shadow-card', className)}
      {...rest}
    />
  );
}

export function TabsTrigger({ className, ...rest }: ComponentPropsWithoutRef<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'h-10 rounded-xl px-4 text-sm font-semibold text-muted transition-colors hover:text-ink data-[state=active]:bg-navy data-[state=active]:font-bold data-[state=active]:text-white',
        className,
      )}
      {...rest}
    />
  );
}
