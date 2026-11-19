import clsx, { type ClassValue } from 'clsx';

/** Combină clase condiționale (clsx). */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
