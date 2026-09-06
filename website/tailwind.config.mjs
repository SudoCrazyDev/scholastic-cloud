/** @type {import('tailwindcss').Config} */

/*
 * Palette: light, paper-grounded, academic.
 *
 * Three scales carry the whole site.
 *
 *   ink      — the neutral. Warm grey with a faint green cast so it sits with
 *              pine instead of fighting it. Text, borders, hairlines.
 *   pine     — the primary. A deep, desaturated academic green: chalkboards,
 *              school trim, exercise-book covers. Structure, and anything the
 *              reader should read as the brand speaking.
 *   marigold — the accent. Warm and singular; spent only on calls to action,
 *              eyebrows, and the one thing per screen that must be noticed.
 *
 * `ink-950` is a real near-black and exists for text, NOT as a page ground —
 * this site is light throughout. Grounds come from `paper`.
 */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	theme: {
		extend: {
			fontFamily: {
				sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
				display: ['"Syne"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
			},
			colors: {
				// Page grounds. Named rather than numbered because there are only
				// three, and the name says which band of the page you are on.
				paper: {
					DEFAULT: '#FBFBF9',
					alt: '#F4F6F2',
					sunk: '#EDF0EA',
				},
				ink: {
					50: '#F8F9F7',
					100: '#EFF1ED',
					200: '#E1E5DC',
					300: '#C7CCC3',
					400: '#98A09A',
					500: '#6F786F',
					600: '#545C55',
					700: '#3F463F',
					800: '#2C322D',
					900: '#1D221E',
					950: '#121614',
				},
				pine: {
					50: '#F0F6F3',
					100: '#DCEBE4',
					200: '#B9D7C9',
					300: '#8CBCA7',
					400: '#5B9B81',
					500: '#3A7D63',
					600: '#2A6450',
					700: '#235141',
					800: '#1E4235',
					900: '#19362C',
					950: '#0D1F19',
				},
				marigold: {
					50: '#FDF6EA',
					100: '#FAE9CB',
					200: '#F4D398',
					300: '#EDB85F',
					400: '#E7A23A',
					500: '#D9871F',
					600: '#B96B17',
					700: '#955217',
					800: '#7A4319',
					900: '#653818',
				},
			},
		},
	},
	plugins: [],
};
