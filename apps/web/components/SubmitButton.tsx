'use client';

import type { ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';
import { buttonClass } from './ui';

export function SubmitButton({
  children,
  pendingText,
  variant,
  size,
  className,
  confirm,
  ...rest
}: ComponentProps<'button'> & {
  pendingText?: string;
  variant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || rest.disabled}
      className={buttonClass(variant, size, className)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      {...rest}
    >
      {pending ? (pendingText ?? 'Working…') : children}
    </button>
  );
}
