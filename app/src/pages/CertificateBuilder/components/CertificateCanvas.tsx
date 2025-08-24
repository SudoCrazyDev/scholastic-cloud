import { useCallback, useEffect, useRef } from 'react';

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

export function CertificateCanvas({
	elements,
	selectedElementId,
	onSelect,
	onChange,
}:{
	elements: CanvasElement[];
	selectedElementId: string | null;
	onSelect: (id: string | null) => void;
	onChange: (el: CanvasElement) => void;
}) {
	const containerRef = useRef<HTMLDivElement | null>(null);


	useEffect(() => {
		function handleDeselect(e: MouseEvent) {
			if (!containerRef.current) return;
			if (!(e.target instanceof Node)) return;
			if (!containerRef.current.contains(e.target)) return;
			// If clicked on empty canvas area
			const target = e.target as HTMLElement;
			if (target.dataset.elId) return;
			onSelect(null);
		}
		document.addEventListener('mousedown', handleDeselect);
		return () => document.removeEventListener('mousedown', handleDeselect);
	}, [onSelect]);

	const startDrag = useCallback((event: React.MouseEvent, el: CanvasElement) => {
		event.stopPropagation();
		onSelect(el.id);
		const startX = event.clientX;
		const startY = event.clientY;
		const originX = el.x;
		const originY = el.y;

		function onMove(e: MouseEvent) {
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			onChange({ ...el, x: originX + dx, y: originY + dy });
		}
		function onUp() {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		}
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}, [onChange, onSelect]);

	const startResize = useCallback((event: React.MouseEvent, el: CanvasElement, corner: 'se' | 'e' | 's') => {
		event.stopPropagation();
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
			onChange({ ...el, width: Math.max(10, newW), height: Math.max(10, newH) });
		}
		function onUp() {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		}
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}, [onChange]);

	const startRotate = useCallback((event: React.MouseEvent, el: CanvasElement) => {
		event.stopPropagation();
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
		}
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}, [onChange]);

	return (
		<div ref={containerRef} className="absolute inset-0">
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
							cursor: 'move'
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
									height: '100%'
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