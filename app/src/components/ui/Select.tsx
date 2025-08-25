import type { SelectHTMLAttributes } from 'react';
import { forwardRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
	size?: 'sm' | 'md' | 'lg';
	label?: string;
	error?: string;
};

const base = 'block w-full rounded-lg border bg-white text-gray-900 shadow-sm focus:border-black focus:ring-2 focus:ring-black focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 appearance-none';
const sizes: Record<string, string> = {
	sm: 'h-9 pl-3 pr-8 text-sm',
	md: 'h-10 pl-3 pr-8 text-sm',
	lg: 'h-12 pl-4 pr-10 text-base',
};

const Chevron = ({ isOpen }: { isOpen: boolean }) => (
	<motion.svg 
		viewBox="0 0 20 20" 
		fill="none" 
		xmlns="http://www.w3.org/2000/svg" 
		className="w-4 h-4 text-gray-500"
		animate={{ rotate: isOpen ? 180 : 0 }}
		transition={{ duration: 0.2 }}
	>
		<path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
	</motion.svg>
);

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ 
	className, 
	size = 'md', 
	label,
	error,
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
				<select 
					ref={ref} 
					className={clsx(
						base, 
						sizes[size], 
						error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300',
						className
					)} 
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					{...props} 
				/>
				<div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
					<Chevron isOpen={isFocused} />
				</div>
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

export default Select;