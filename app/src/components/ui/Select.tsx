import type { SelectHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import clsx from 'clsx';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
	size?: 'sm' | 'md';
};

const base = 'block w-full rounded border border-gray-300 bg-white text-gray-900 shadow-sm focus:border-black focus:ring-1 focus:ring-black disabled:opacity-50 appearance-none pr-8';
const sizes: Record<string, string> = {
	sm: 'h-9 pl-3 text-sm',
	md: 'h-10 pl-3 text-sm',
};

const Chevron = () => (
	<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500">
		<path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, size = 'md', ...props }, ref) {
	return (
		<div className="relative inline-block w-full align-middle">
			<select ref={ref} className={clsx(base, sizes[size], className)} {...props} />
			<div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
				<Chevron />
			</div>
		</div>
	);
});

export default Select;