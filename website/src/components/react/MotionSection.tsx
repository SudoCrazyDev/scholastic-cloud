import { motion, useReducedMotion } from 'framer-motion';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export interface MotionSectionProps extends ComponentPropsWithoutRef<'section'> {
	delay?: number;
}

const ease = [0.22, 1, 0.36, 1] as const;

export default function MotionSection({ id, className, children, delay = 0, ...rest }: MotionSectionProps) {
	const reduce = useReducedMotion();

	if (reduce) {
		return (
			<section id={id} className={className} {...rest}>
				{children}
			</section>
		);
	}

	return (
		<motion.section
			id={id}
			className={className}
			initial={{ opacity: 0, y: 36 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: '-72px', amount: 0.12 }}
			transition={{ duration: 0.65, ease, delay }}
			{...rest}
		>
			{children}
		</motion.section>
	);
}
