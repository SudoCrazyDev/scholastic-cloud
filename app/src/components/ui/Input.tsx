import type { InputHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import clsx from 'clsx';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
	variant?: 'default';
	size?: 'sm' | 'md';
};

const base = 'block w-full rounded border border-gray-300 bg-white text-gray-900 placeholder-gray-400 shadow-sm focus:border-black focus:ring-1 focus:ring-black disabled:opacity-50';
const sizes: Record<string, string> = {
	sm: 'h-9 px-2 text-sm',
	md: 'h-10 px-3 text-sm',
};

const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, size = 'md', ...props }, ref) {
	return <input ref={ref} className={clsx(base, sizes[size], className)} {...props} />;
});

export default Input;