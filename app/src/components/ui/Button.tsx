import type { ButtonHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import clsx from 'clsx';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof HTMLMotionProps<'button'> | 'onClick'> & {
	variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
	size?: 'sm' | 'md' | 'lg';
	loading?: boolean;
	icon?: React.ReactNode;
	className?: string;
	children?: React.ReactNode;
	disabled?: boolean;
	onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

const base = 'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95';
const variants: Record<string, string> = {
	primary: 'bg-black text-white hover:bg-gray-900 focus:ring-black shadow-lg hover:shadow-xl',
	secondary: 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 focus:ring-gray-300 hover:border-gray-400',
	ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-gray-200 hover:text-gray-900',
	danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-lg hover:shadow-xl',
	success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 shadow-lg hover:shadow-xl',
};
const sizes: Record<string, string> = {
	sm: 'h-9 px-3 text-sm',
	md: 'h-10 px-4 text-sm',
	lg: 'h-12 px-6 text-base',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ 
	className, 
	variant = 'primary', 
	size = 'md', 
	loading = false,
	icon,
	children,
	disabled,
	onClick,
	...props 
}, ref) {
	const isDisabled = disabled || loading;
	
	return (
		<motion.button
			ref={ref}
			className={clsx(base, variants[variant], sizes[size], className)}
			disabled={isDisabled}
			whileHover={!isDisabled ? { scale: 1.02 } : {}}
			whileTap={!isDisabled ? { scale: 0.98 } : {}}
			onClick={onClick}
			{...props}
		>
			{loading && (
				<motion.div
					className="mr-2 h-4 w-4"
					animate={{ rotate: 360 }}
					transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
				>
					<svg className="h-full w-full" viewBox="0 0 24 24" fill="none">
						<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
						<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
					</svg>
				</motion.div>
			)}
			{icon && !loading && (
				<span className="mr-2">{icon}</span>
			)}
			{children}
		</motion.button>
	);
});

export default Button;