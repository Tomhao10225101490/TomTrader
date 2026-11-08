import { clsx,type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Conditional class names, then de-duplicated so later utilities win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
