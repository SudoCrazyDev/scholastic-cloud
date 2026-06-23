import type { CanvasElement } from './components/IdCardCanvas';
import type { CardSize, Orientation, BgObjectFit } from './components/IdCardToolbar';

export interface SideDesign {
	bgColor: string;
	bgImage: string | null;
	bgImageObjectFit: BgObjectFit;
	elements: CanvasElement[];
}

export interface IdCardDesign {
	card: { size: CardSize; orientation: Orientation };
	zoom: number;
	front: SideDesign;
	back: SideDesign;
}

/** Screen pixel dimensions (≈192 DPI for comfortable editing) + print point sizes per side. */
export const CARD_PRESETS: Record<CardSize, { label: string } & Record<Orientation, { w: number; h: number; pw: number; ph: number }>> = {
	cr80: {
		label: 'Standard (CR80)',
		portrait: { w: 400, h: 635, pw: 153, ph: 242.65 },
		landscape: { w: 635, h: 400, pw: 242.65, ph: 153 },
	},
	cr80_lanyard: {
		label: 'Lanyard',
		portrait: { w: 420, h: 660, pw: 252, ph: 396 },
		landscape: { w: 660, h: 420, pw: 396, ph: 252 },
	},
};

export function emptySide(bgColor = '#ffffff'): SideDesign {
	return { bgColor, bgImage: null, bgImageObjectFit: 'cover', elements: [] };
}

export function defaultDesign(): IdCardDesign {
	return {
		card: { size: 'cr80', orientation: 'portrait' },
		zoom: 1,
		front: emptySide(),
		back: emptySide(),
	};
}

/** Returns true if any element on either side binds to student data. */
export function designHasStudentVariables(design: { front?: { elements?: Array<{ variableType?: string }> }; back?: { elements?: Array<{ variableType?: string }> } } | null | undefined): boolean {
	if (!design) return false;
	const sides = [design.front, design.back];
	return sides.some((side) => Array.isArray(side?.elements) && side!.elements!.some((el) => el.variableType === 'student'));
}

/** Coerce an unknown design_json blob into a valid IdCardDesign. */
export function parseDesign(raw: any): IdCardDesign {
	const base = defaultDesign();
	if (!raw || typeof raw !== 'object') return base;

	const card = raw.card && typeof raw.card === 'object' ? raw.card : {};
	const size: CardSize = card.size === 'cr80_lanyard' ? 'cr80_lanyard' : 'cr80';
	const orientation: Orientation = card.orientation === 'landscape' ? 'landscape' : 'portrait';

	const parseSide = (side: any): SideDesign => {
		if (!side || typeof side !== 'object') return emptySide();
		return {
			bgColor: typeof side.bgColor === 'string' ? side.bgColor : '#ffffff',
			bgImage: typeof side.bgImage === 'string' ? side.bgImage : null,
			bgImageObjectFit: (['cover', 'contain', 'fill', 'none', 'scale-down'] as const).includes(side.bgImageObjectFit) ? side.bgImageObjectFit : 'cover',
			elements: Array.isArray(side.elements) ? side.elements : [],
		};
	};

	return {
		card: { size, orientation },
		zoom: typeof raw.zoom === 'number' ? raw.zoom : 1,
		front: parseSide(raw.front),
		back: parseSide(raw.back),
	};
}
