import type { InputHTMLAttributes } from 'react';
import { forwardRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
	size?: 'sm' | 'md' | 'lg';
	label?: string;
	error?: string;
	icon?: React.ReactNode;
	rightIcon?: React.ReactNode;
};

const base = 'block w-full rounded-lg border bg-white text-gray-900 shadow-sm focus:border-black focus:ring-2 focus:ring-black focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 placeholder:text-gray-400';
const sizes: Record<string, string> = {
	sm: 'h-9 px-3 text-sm',
	md: 'h-10 px-3 text-sm',
	lg: 'h-12 px-4 text-base',
};

const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ 
	className, 
	size = 'md', 
	label,
	error,
	icon,
	rightIcon,
	...props 
}, ref) {
	const [isFocused, setIsFocused] = useState(false);
	
	return (
		<div className="relative w-full">
			{label && (
				<label className="block text-sm font-medium text-gray-700 mb-2">
					{label}
				</label>
			)}
			<div className="relative">
				{icon && (
					<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
						<div className="h-5 w-5 text-gray-400">
							{icon}
						</div>
					</div>
				)}
				<input 
					ref={ref} 
					className={clsx(
						base, 
						sizes[size],
						icon ? 'pl-10' : '',
						rightIcon ? 'pr-10' : '',
						error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300',
						className
					)} 
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					{...props} 
				/>
				{rightIcon && (
					<div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
						<div className="h-5 w-5 text-gray-400">
							{rightIcon}
						</div>
					</div>
				)}
			</div>
			<AnimatePresence>
				{error && (
					<motion.p
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						className="mt-1 text-sm text-red-600"
					>
						{error}
					</motion.p>
				)}
			</AnimatePresence>
		</div>
	);
});

export default Input;