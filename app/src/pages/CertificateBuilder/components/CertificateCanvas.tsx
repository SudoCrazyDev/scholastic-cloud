import { useCallback, useEffect, useRef, useState } from 'react';

export type ElementType = 'text' | 'image' | 'shape';

export type CanvasElement = {
	id: string;
	type: ElementType;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number; // degrees
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
	elements,
	selectedElementId,
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
	elements: CanvasElement[];
	selectedElementId: string | null;
	onSelect: (id: string | null) => void;
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
			// If clicked on empty canvas background (not on any element)
			if (target.closest('[data-el-id]')) return;
			onSelect(null);
		}
		document.addEventListener('mousedown', handleDeselect);
		return () => document.removeEventListener('mousedown', handleDeselect);
	}, [onSelect]);

	const collectSnapLines = useCallback((currentId: string) => {
		const verticals: number[] = [0, width / 2, width];
		const horizontals: number[] = [0, height / 2, height];
		for (const el of elements) {
			if (el.id === currentId) continue;
			verticals.push(el.x, el.x + el.width / 2, el.x + el.width);
			horizontals.push(el.y, el.y + el.height / 2, el.y + el.height);
		}
		return { verticals, horizontals };
	}, [elements, width, height]);

	function applySnap(x: number, y: number, w: number, h: number, id: string) {
		if (!snappingEnabled) return { x, y, guides: [] as GuideLine[] };
		const { verticals, horizontals } = collectSnapLines(id);
		const g: GuideLine[] = [];

		let snappedX = x;
		let snappedY = y;

		// Vertical snapping: left, center, right
		const candidatesX = [x, x + w / 2, x + w];

		for (let i = 0; i < candidatesX.length; i++) {
			for (const v of verticals) {
				if (Math.abs(candidatesX[i] - v) <= snapThreshold) {
					const delta = v - candidatesX[i];
					if (i === 0) snappedX = x + delta;
					if (i === 1) snappedX = x + delta;
					if (i === 2) snappedX = x + delta;
					g.push({ orientation: 'v', pos: v });
				}
			}
		}

		// Horizontal snapping: top, middle, bottom
		const candidatesY = [y, y + h / 2, y + h];
		for (let i = 0; i < candidatesY.length; i++) {
			for (const hLine of horizontals) {
				if (Math.abs(candidatesY[i] - hLine) <= snapThreshold) {
					const delta = hLine - candidatesY[i];
					if (i === 0) snappedY = y + delta;
					if (i === 1) snappedY = y + delta;
					if (i === 2) snappedY = y + delta;
					g.push({ orientation: 'h', pos: hLine });
				}
			}
		}

		return { x: snappedX, y: snappedY, guides: g };
	}

	const startDrag = useCallback((event: React.MouseEvent, el: CanvasElement) => {
		event.stopPropagation();
		onSelect(el.id);
		onInteractionStart && onInteractionStart();
		const startX = event.clientX;
		const startY = event.clientY;
		const originX = el.x;
		const originY = el.y;

		function onMove(e: MouseEvent) {
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
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
	}, [onChange, onSelect, onInteractionStart, onChangeEnd]);

	const startResize = useCallback((event: React.MouseEvent, el: CanvasElement, corner: 'se' | 'e' | 's') => {
		event.stopPropagation();
		onInteractionStart && onInteractionStart();
		const startX = event.clientX;
		const startY = event.clientY;
		const startW = el.width;
		const startH = el.height;

		function onMove(e: MouseEvent) {
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			let newW = startW;
			let newH = startH;
			if (corner === 'se') { newW = startW + dx; newH = startH + dy; }
			if (corner === 'e') { newW = startW + dx; }
			if (corner === 's') { newH = startH + dy; }
			newW = Math.max(10, newW);
			newH = Math.max(10, newH);
			// Snap right/bottom edges when resizing from those directions
			const { x: sx, y: sy, guides: g } = applySnap(el.x, el.y, newW, newH, el.id);
			setGuides(g);
			onChange({ ...el, width: newW, height: newH, x: sx, y: sy });
		}
		function onUp() {
			setGuides([]);
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			onChangeEnd && onChangeEnd();
		}
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}, [onChange, onChangeEnd, onInteractionStart]);

	const startRotate = useCallback((event: React.MouseEvent, el: CanvasElement) => {
		event.stopPropagation();
		onInteractionStart && onInteractionStart();
		const centerX = (el.x + el.width / 2);
		const centerY = (el.y + el.height / 2);
		function onMove(e: MouseEvent) {
			const dx = e.clientX - (containerRef.current?.getBoundingClientRect().left || 0) - centerX;
			const dy = e.clientY - (containerRef.current?.getBoundingClientRect().top || 0) - centerY;
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
	}, [onChange, onChangeEnd, onInteractionStart]);

	const gridBackground = showGrid
		? {
			backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)`,
			backgroundSize: '20px 20px',
		}
		: {} as React.CSSProperties;

	return (
		<div ref={containerRef} className="absolute" style={{ width, height, ...gridBackground }}>
			{/* Guides */}
			{guides.map((g, idx) => (
				<div key={idx} className="absolute bg-indigo-500" style={g.orientation === 'v' ? { left: g.pos, top: 0, bottom: 0, width: 1 } : { top: g.pos, left: 0, right: 0, height: 1 }} />
			))}
			{elements.map(el => {
				const isSelected = el.id === selectedElementId;
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
							cursor: 'move',
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
								{/* Resize handles */}
								<div className="absolute -right-2 -bottom-2 w-3 h-3 bg-sky-500 cursor-se-resize" onMouseDown={(e) => startResize(e, el, 'se')} />
								<div className="absolute -right-2 top-1/2 -mt-1.5 w-3 h-3 bg-sky-500 cursor-e-resize" onMouseDown={(e) => startResize(e, el, 'e')} />
								<div className="absolute left-1/2 -ml-1.5 -bottom-2 w-3 h-3 bg-sky-500 cursor-s-resize" onMouseDown={(e) => startResize(e, el, 's')} />
								{/* Rotate handle */}
								<div className="absolute left-1/2 -ml-2 -top-8 w-4 h-4 rounded-full bg-sky-500 cursor-crosshair" onMouseDown={(e) => startRotate(e, el)} />
							</>
						)}
					</div>
				);
			})}
		</div>
	);
}