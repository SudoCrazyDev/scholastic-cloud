import React from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

interface CardProps {
	children: React.ReactNode;
	className?: string;
	onClick?: () => void;
	hoverable?: boolean;
	selected?: boolean;
	loading?: boolean;
}

const Card: React.FC<CardProps> = ({ 
	children, 
	className, 
	onClick, 
	hoverable = false, 
	selected = false,
	loading = false 
}) => {
	const baseClasses = clsx(
		'bg-white rounded-xl border shadow-sm transition-all duration-200',
		hoverable && 'cursor-pointer hover:shadow-lg hover:border-gray-300',
		selected && 'ring-2 ring-black ring-offset-2',
		loading && 'animate-pulse',
		className
	);

	const MotionComponent = hoverable ? motion.div : motion.div;

	return (
		<MotionComponent
			className={baseClasses}
			onClick={onClick}
			whileHover={hoverable ? { y: -2, scale: 1.01 } : {}}
			whileTap={hoverable ? { scale: 0.99 } : {}}
			transition={{ duration: 0.2 }}
		>
			{children}
		</MotionComponent>
	);
};

interface CardHeaderProps {
	children: React.ReactNode;
	className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, className }) => (
	<div className={clsx('px-6 py-4 border-b border-gray-100', className)}>
		{children}
	</div>
);

interface CardBodyProps {
	children: React.ReactNode;
	className?: string;
}

export const CardBody: React.FC<CardBodyProps> = ({ children, className }) => (
	<div className={clsx('px-6 py-4', className)}>
		{children}
	</div>
);

interface CardFooterProps {
	children: React.ReactNode;
	className?: string;
}

export const CardFooter: React.FC<CardFooterProps> = ({ children, className }) => (
	<div className={clsx('px-6 py-4 border-t border-gray-100 bg-gray-50', className)}>
		{children}
	</div>
);

export default Card;
