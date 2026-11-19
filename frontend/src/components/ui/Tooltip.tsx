import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export const TooltipProvider = RadixTooltip.Provider;

/** Tooltip accesibil: apare la hover și la focus de tastatură. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <RadixTooltip.Root delayDuration={120}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side="top"
          sideOffset={8}
          className="z-[70] max-w-[260px] rounded-xl bg-navy px-3 py-2 text-xs font-semibold text-white shadow-pop"
        >
          {content}
          <RadixTooltip.Arrow className="fill-navy" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
