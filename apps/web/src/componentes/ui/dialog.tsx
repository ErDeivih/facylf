'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/cn';

/**
 * Diálogo (shadcn sobre Radix): foco atrapado, Escape y `aria-modal` resueltos por la
 * primitiva. Se usa para un panel que en móvil no cabe en flujo (los filtros del listado
 * cuando hay JavaScript); sin JavaScript el mismo contenido se sirve plegado con
 * `<details>`, así que el diálogo es una mejora, no un requisito.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-[var(--capa-velo)] bg-[var(--fondo-fuerte)]/60 data-[state=open]:opacity-100 data-[state=closed]:opacity-0',
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-[var(--capa-modal)] max-h-[85dvh] overflow-y-auto rounded-t-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 pb-4 pt-3 text-[var(--texto)] shadow-[var(--sombra-2)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-tarjeta)]',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Cerrar"
          className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--texto-suave)] hover:bg-[var(--fondo-sutil)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foco)]"
        >
          <span aria-hidden="true">×</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3 flex flex-col gap-1 pr-10', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('m-0 text-bloque font-bold text-[var(--texto)]', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('m-0 text-nota text-[var(--texto-suave)]', className)} {...props} />;
}
