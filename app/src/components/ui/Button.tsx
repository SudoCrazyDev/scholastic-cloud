import type { ButtonHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import clsx from 'clsx';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: 'primary' | 'secondary' | 'ghost';
	size?: 'sm' | 'md';
};

const base = 'inline-flex items-center justify-center rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
const variants: Record<string, string> = {
	primary: 'bg-black text-white hover:bg-gray-900 focus:ring-black',
	secondary: 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 focus:ring-gray-300',
	ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-gray-200',
};
const sizes: Record<string, string> = {
	sm: 'h-9 px-3 text-sm',
	md: 'h-10 px-4 text-sm',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = 'primary', size = 'md', ...props }, ref) {
	return (
		<button ref={ref} className={clsx(base, variants[variant], sizes[size], className)} {...props} />
	);
});

export default Button;