import { useEffect } from 'react';
import Lenis from 'lenis';

/**
 * Global smooth scrolling (Lenis). Pairs with Framer Motion sections.
 * Intercepts same-page #anchor links for smooth scrollTo.
 */
export default function LenisSmooth() {
	useEffect(() => {
		const lenis = new Lenis({
			duration: 1.15,
			easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
			smoothWheel: true,
			touchMultiplier: 1.2,
		});

		let rafId = 0;
		function raf(time: number) {
			lenis.raf(time);
			rafId = requestAnimationFrame(raf);
		}
		rafId = requestAnimationFrame(raf);

		requestAnimationFrame(() => {
			if (window.location.hash.length > 1) {
				const el = document.querySelector(window.location.hash);
				if (el) lenis.scrollTo(el as HTMLElement, { offset: -80, duration: 1.1 });
			}
		});

		function onClick(e: MouseEvent) {
			const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
			if (!a) return;
			const href = a.getAttribute('href');
			if (!href || href === '#' || href.length < 2) return;
			const el = document.querySelector(href);
			if (!el) return;
			e.preventDefault();
			lenis.scrollTo(el as HTMLElement, { offset: -80, duration: 1.15 });
		}

		document.addEventListener('click', onClick);

		return () => {
			cancelAnimationFrame(rafId);
			document.removeEventListener('click', onClick);
			lenis.destroy();
		};
	}, []);

	return null;
}
