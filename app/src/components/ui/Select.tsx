import type { SelectHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import clsx from 'clsx';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
	size?: 'sm' | 'md';
};

const base = 'block w-full rounded border border-gray-300 bg-white text-gray-900 shadow-sm focus:border-black focus:ring-1 focus:ring-black disabled:opacity-50';
const sizes: Record<string, string> = {
	sm: 'h-9 px-2 text-sm',
	md: 'h-10 px-3 text-sm',
};

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, size = 'md', ...props }, ref) {
	return <select ref={ref} className={clsx(base, sizes[size], className)} {...props} />;
});

export default Select;