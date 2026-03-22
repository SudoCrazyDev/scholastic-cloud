import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

const ease = [0.22, 1, 0.36, 1] as const;

export default function HeroMotion({ children }: { children: ReactNode }) {
	const reduce = useReducedMotion();

	if (reduce) {
		return (
			<div className="relative z-10 mx-auto grid w-full max-w-7xl gap-14 lg:grid-cols-12 lg:gap-10 lg:items-center">
				{children}
			</div>
		);
	}

	return (
		<motion.div
			className="relative z-10 mx-auto grid w-full max-w-7xl gap-14 lg:grid-cols-12 lg:gap-10 lg:items-center"
			initial={{ opacity: 0, y: 28 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.85, ease }}
		>
			{children}
		</motion.div>
	);
}
