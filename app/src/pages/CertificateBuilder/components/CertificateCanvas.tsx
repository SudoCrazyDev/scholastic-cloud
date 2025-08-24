import { useCallback, useEffect, useRef, useState } from 'react';

export type ElementType = 'text' | 'image' | 'shape';

export type CanvasElement = {
	id: string;
	type: ElementType;
	name?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number; // degrees
	zIndex?: number;
	locked?: boolean;
	hidden?: boolean;
	// text
	text?: string;
	fontFamily?: string;
	fontSize?: number;
	fontWeight?: number;
	color?: string;
	// image
	src?: string;
	// shape
	shape?: 'rect' | 'ellipse';
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
};

type GuideLine = { orientation: 'v' | 'h'; pos: number };

export function CertificateCanvas({
	width,
	height,
	scale = 1,
	elements,
	selectedElementIds,
	onSelect,
	onChange,
	onInteractionStart,
	onChangeEnd,
	showGrid = true,
	snappingEnabled = true,
	snapThreshold = 8,
}:{
	width: number;
	height: number;
	scale?: number;
	elements: CanvasElement[];
	selectedElementIds: string[];
	onSelect: (ids: string[]) => void;
	onChange: (el: CanvasElement) => void;
	onInteractionStart?: () => void;
	onChangeEnd?: () => void;
	showGrid?: boolean;
	snappingEnabled?: boolean;
	snapThreshold?: number;
}) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [guides, setGuides] = useState<GuideLine[]>([]);

	useEffect(() => {
		function handleDeselect(e: MouseEvent) {
			if (!containerRef.current) return;
			if (!(e.target instanceof Node)) return;
			const target = e.target as HTMLElement;
			if (!containerRef.current.contains(target)) return;
			if (target.closest('[data-el-id]')) return;
			onSelect([]);
		}
		document.addEventListener('mousedown', handleDeselect);
		return () => document.removeEventListener('mousedown', handleDeselect);
	}, [onSelect]);

	const interactableElements = elements
		.filter(el => !el.hidden)
		.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

	const collectSnapLines = useCallback((currentId: string) => {
		const verticals: number[] = [0, width / 2, width];
		const horizontals: number[] = [0, height / 2, height];
		for (const el of interactableElements) {
			if (el.id === currentId) continue;
			verticals.push(el.x, el.x + el.width / 2, el.x + el.width);
			horizontals.push(el.y, el.y + el.height / 2, el.y + el.height);
		}
		return { verticals, horizontals };
	}, [interactableElements, width, height]);

	function applySnap(x: number, y: number, w: number, h: number, id: string) {
		if (!snappingEnabled) return { x, y, guides: [] as GuideLine[] };
		const { verticals, horizontals } = collectSnapLines(id);
		const g: GuideLine[] = [];
		let snappedX = x;
		let snappedY = y;
		const candidatesX = [x, x + w / 2, x + w];
		for (let i = 0; i < candidatesX.length; i++) {
			for (const v of verticals) {
				if (Math.abs(candidatesX[i] - v) <= snapThreshold) {
					const delta = v - candidatesX[i];
					snappedX = x + delta;
					g.push({ orientation: 'v', pos: v });
				}
			}
		}
		const candidatesY = [y, y + h / 2, y + h];
		for (let i = 0; i < candidatesY.length; i++) {
			for (const hLine of horizontals) {
				if (Math.abs(candidatesY[i] - hLine) <= snapThreshold) {
					const delta = hLine - candidatesY[i];
					snappedY = y + delta;
					g.push({ orientation: 'h', pos: hLine });
				}
			}
		}
		return { x: snappedX, y: snappedY, guides: g };
	}

	const startDrag = useCallback((event: React.MouseEvent, el: CanvasElement) => {
		event.stopPropagation();
		if (el.locked) return;
		if (event.shiftKey || event.metaKey || event.ctrlKey) {
			const set = new Set(selectedElementIds);
			if (set.has(el.id)) set.delete(el.id); else set.add(el.id);
			onSelect(Array.from(set));
		} else {
			onSelect([el.id]);
		}
		onInteractionStart && onInteractionStart();
		const startX = event.clientX;
		const startY = event.clientY;
		const origin = interactableElements.find(e => e.id === el.id)!;
		const originX = origin.x;
		const originY = origin.y;

		function onMove(e: MouseEvent) {
			const dx = (e.clientX - startX) / scale;
			const dy = (e.clientY - startY) / scale;
			const nextX = originX + dx;
			const nextY = originY + dy;
			const { x: sx, y: sy, guides: g } = applySnap(nextX, nextY, el.width, el.height, el.id);
			setGuides(g);
			onChange({ ...el, x: sx, y: sy });
		}
		function onUp() {
			setGuides([]);
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			onChangeEnd && onChangeEnd();
		}
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}, [onChange, onSelect, onInteractionStart, onChangeEnd, selectedElementIds, scale, interactableElements]);

	const startResize = useCallback((event: React.MouseEvent, el: CanvasElement, handle: 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w') => {
		event.stopPropagation();
		if (el.locked) return;
		onInteractionStart && onInteractionStart();
		const startX = event.clientX;
		const startY = event.clientY;
		const start = { x: el.x, y: el.y, w: el.width, h: el.height };

		function onMove(e: MouseEvent) {
			const dx = (e.clientX - startX) / scale;
			const dy = (e.clientY - startY) / scale;
			let x = start.x;
			let y = start.y;
			let w = start.w;
			let h = start.h;
			if (handle.includes('e')) w = Math.max(10, start.w + dx);
			if (handle.includes('s')) h = Math.max(10, start.h + dy);
			if (handle.includes('w')) { w = Math.max(10, start.w - dx); x = start.x + dx; }
			if (handle.includes('n')) { h = Math.max(10, start.h - dy); y = start.y + dy; }
			const { x: sx, y: sy, guides: g } = applySnap(x, y, w, h, el.id);
			setGuides(g);
			onChange({ ...el, x: sx, y: sy, width: w, height: h });
		}
		function onUp() {
			setGuides([]);
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			onChangeEnd && onChangeEnd();
		}
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}, [onChange, onChangeEnd, onInteractionStart, scale]);

	const startRotate = useCallback((event: React.MouseEvent, el: CanvasElement) => {
		event.stopPropagation();
		if (el.locked) return;
		onInteractionStart && onInteractionStart();
		const centerX = (el.x + el.width / 2);
		const centerY = (el.y + el.height / 2);
		function onMove(e: MouseEvent) {
			const dx = (e.clientX - (containerRef.current?.getBoundingClientRect().left || 0)) / scale - centerX;
			const dy = (e.clientY - (containerRef.current?.getBoundingClientRect().top || 0)) / scale - centerY;
			const angle = Math.atan2(dy, dx) * 180 / Math.PI;
			onChange({ ...el, rotation: angle });
		}
		function onUp() {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			onChangeEnd && onChangeEnd();
		}
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}, [onChange, onChangeEnd, onInteractionStart, scale]);

	const gridBackground = showGrid
		? {
			backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)`,
			backgroundSize: '20px 20px',
		}
		: {} as React.CSSProperties;

	return (
		<div ref={containerRef} className="absolute" style={{ width, height, ...gridBackground }}>
			{guides.map((g, idx) => (
				<div key={idx} className="absolute bg-indigo-500" style={g.orientation === 'v' ? { left: g.pos, top: 0, bottom: 0, width: 1 } : { top: g.pos, left: 0, right: 0, height: 1 }} />
			))}
			{interactableElements.map(el => {
				const isSelected = selectedElementIds.includes(el.id);
				return (
					<div
						key={el.id}
						data-el-id={el.id}
						className="absolute"
						style={{
							left: el.x,
							top: el.y,
							width: el.width,
							height: el.height,
							transform: `rotate(${el.rotation}deg)`,
							transformOrigin: 'center',
							cursor: el.locked ? 'not-allowed' : 'move',
						}}
						onMouseDown={(e) => startDrag(e, el)}
					>
						{el.type === 'text' && (
							<div
								style={{
									fontFamily: el.fontFamily || 'serif',
									fontSize: el.fontSize || 24,
									fontWeight: el.fontWeight || 400,
									color: el.color || '#111827',
									width: '100%',
									height: '100%',
									whiteSpace: 'pre-wrap'
								}}
							>
								{el.text}
							</div>
						)}
						{el.type === 'image' && el.src && (
							<img src={el.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
						)}
						{el.type === 'shape' && el.shape === 'rect' && (
							<div style={{ width: '100%', height: '100%', background: el.fill || '#e5e7eb', border: `${el.strokeWidth || 0}px solid ${el.stroke || 'transparent'}` }} />
						)}
						{el.type === 'shape' && el.shape === 'ellipse' && (
							<div style={{ width: '100%', height: '100%', background: el.fill || '#e5e7eb', borderRadius: '9999px', border: `${el.strokeWidth || 0}px solid ${el.stroke || 'transparent'}` }} />
						)}

						{isSelected && (
							<>
								<div className="absolute inset-0 border-2 border-sky-500 pointer-events-none" />
								{selectedElementIds.length === 1 && (
									<>
										{/* 8 Resize handles */}
										<div className="absolute -left-2 -top-2 w-3 h-3 bg-sky-500 cursor-nw-resize" onMouseDown={(e) => startResize(e, el, 'nw')} />
										<div className="absolute left-1/2 -ml-1.5 -top-2 w-3 h-3 bg-sky-500 cursor-n-resize" onMouseDown={(e) => startResize(e, el, 'n')} />
										<div className="absolute -right-2 -top-2 w-3 h-3 bg-sky-500 cursor-ne-resize" onMouseDown={(e) => startResize(e, el, 'ne')} />
										<div className="absolute -right-2 top-1/2 -mt-1.5 w-3 h-3 bg-sky-500 cursor-e-resize" onMouseDown={(e) => startResize(e, el, 'e')} />
										<div className="absolute -right-2 -bottom-2 w-3 h-3 bg-sky-500 cursor-se-resize" onMouseDown={(e) => startResize(e, el, 'se')} />
										<div className="absolute left-1/2 -ml-1.5 -bottom-2 w-3 h-3 bg-sky-500 cursor-s-resize" onMouseDown={(e) => startResize(e, el, 's')} />
										<div className="absolute -left-2 -bottom-2 w-3 h-3 bg-sky-500 cursor-sw-resize" onMouseDown={(e) => startResize(e, el, 'sw')} />
										<div className="absolute -left-2 top-1/2 -mt-1.5 w-3 h-3 bg-sky-500 cursor-w-resize" onMouseDown={(e) => startResize(e, el, 'w')} />
										{/* Rotation handle with icon */}
										<div className="absolute left-1/2 -ml-3 -top-10 w-6 h-6 rounded-full bg-white border border-sky-500 text-sky-600 flex items-center justify-center cursor-crosshair shadow" onMouseDown={(e) => startRotate(e, el)} title="Rotate">
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 6V2l-4 4 4 4V6zm5.657 1.757a6 6 0 10.001 8.486l1.414 1.414a8 8 0 11-.001-11.314l-1.414 1.414z"/></svg>
										</div>
									</>
								)}
							</>
						)}
					</div>
				);
			})}
		</div>
	);
}