import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { RotateCw, User as UserIcon } from 'lucide-react';
import type { Student } from '@/types';

export interface CanvasElement {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	opacity: number;
	hidden: boolean;
	locked: boolean;
	zIndex: number;

	// Text properties
	content?: string;
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: string;
	fontStyle?: string;
	color?: string;
	textAlign?: string;
	textDecoration?: string;

	// Image properties
	src?: string;
	alt?: string;
	objectFit?: string;

	// Shape properties
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	cornerRadius?: number;
	points?: number;

	// Variable placeholders (institution / student / section data)
	variableType?: 'institution' | 'student' | 'section';
	variableKey?: string;

	// Prefix / suffix for variable text elements
	prefix?: string;
	suffix?: string;

	// Full-name format: 'last_first' = LAST, FIRST MI. EXT | 'first_last' = FIRST MI. LAST EXT
	nameFormat?: 'last_first' | 'first_last';

	// Text transform for full_name (and any text element)
	textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

/** Extra student context resolved from the student's current class section. */
export interface StudentContext {
	gradeLevel?: string;
	sectionTitle?: string;
}

interface IdCardCanvasProps {
	width: number;
	height: number;
	scale: number;
	elements: CanvasElement[];
	selectedElementIds: string[];
	onSelect: (ids: string[]) => void;
	onChange: (element: CanvasElement) => void;
	onInteractionStart: () => void;
	onChangeEnd: () => void;
	showGrid: boolean;
	snappingEnabled: boolean;
	previewStudent?: Student | null;
	studentContext?: StudentContext | null;
	/** When true, hide selection chrome (used for clean PDF/export capture). */
	readOnly?: boolean;
}

function getStudentVariableValue(
	student: Student,
	variableKey: string,
	nameFormat?: 'last_first' | 'first_last',
	context?: StudentContext | null,
): string {
	const s = student as unknown as Record<string, unknown>;

	if (variableKey === 'grade_level') {
		if (context?.gradeLevel) return context.gradeLevel;
		return s.grade_level != null ? String(s.grade_level) : '';
	}
	if (variableKey === 'section') {
		if (context?.sectionTitle) return context.sectionTitle;
		return s.section != null ? String(s.section) : '';
	}
	if (variableKey === 'extension') {
		return s.ext_name != null ? String(s.ext_name) : '';
	}
	if (variableKey === 'middle_initial') {
		const mn = s.middle_name;
		if (mn == null || String(mn).trim() === '') return '';
		return String(mn).trim().charAt(0).toUpperCase() + '.';
	}
	if (variableKey === 'full_name') {
		const firstName = s.first_name != null ? String(s.first_name).trim() : '';
		const lastName = s.last_name != null ? String(s.last_name).trim() : '';
		const middleName = s.middle_name != null ? String(s.middle_name).trim() : '';
		const extName = s.ext_name != null ? String(s.ext_name).trim() : '';
		const mi = middleName ? middleName.charAt(0).toUpperCase() + '.' : '';

		if (nameFormat === 'first_last') {
			return [firstName, mi, lastName, extName].filter(Boolean).join(' ');
		}
		const afterComma = [firstName, mi, extName].filter(Boolean).join(' ');
		return lastName ? `${lastName}, ${afterComma}`.trimEnd() : afterComma;
	}

	return s[variableKey] != null ? String(s[variableKey]) : '';
}

/** Builds the display text, wrapping with prefix/suffix when the element is a variable. */
function buildDisplayText(
	element: CanvasElement,
	previewStudent: Student | null | undefined,
	studentContext?: StudentContext | null,
): string {
	const isStudentVar = element.variableType === 'student' && element.variableKey && previewStudent;
	const resolvedValue = isStudentVar
		? getStudentVariableValue(previewStudent, element.variableKey!, element.nameFormat, studentContext)
		: null;

	const raw =
		resolvedValue !== null && resolvedValue !== ''
			? resolvedValue
			: element.content || (element.type === 'text' ? 'Sample Text' : 'Sample paragraph text.');

	const hasVariable = !!element.variableType && !!element.variableKey;
	if (!hasVariable) return raw;

	const prefix = element.prefix ?? '';
	const suffix = element.suffix ?? '';
	return `${prefix}${raw}${suffix}`;
}

type InteractionKind = 'move' | 'resize' | 'rotate';

const IdCardCanvas: React.FC<IdCardCanvasProps> = ({
	width,
	height,
	scale,
	elements,
	selectedElementIds,
	onSelect,
	onChange,
	onInteractionStart,
	onChangeEnd,
	showGrid,
	snappingEnabled,
	previewStudent,
	studentContext,
	readOnly = false,
}) => {
	const canvasRef = useRef<HTMLDivElement>(null);
	const [snapGrid] = useState(10);

	// Stable refs so the mousemove handler never reads stale closure values
	const elementsRef = useRef(elements);
	elementsRef.current = elements;
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const onChangeEndRef = useRef(onChangeEnd);
	onChangeEndRef.current = onChangeEnd;
	const scaleRef = useRef(scale);
	scaleRef.current = scale;
	const snappingRef = useRef(snappingEnabled);
	snappingRef.current = snappingEnabled;
	const snapGridRef = useRef(snapGrid);
	snapGridRef.current = snapGrid;

	const interactionRef = useRef<{
		kind: InteractionKind;
		elementId: string;
		mouseOriginX: number;
		mouseOriginY: number;
		elOriginX: number;
		elOriginY: number;
		elOriginW: number;
		elOriginH: number;
	} | null>(null);

	const [activeElementId, setActiveElementId] = useState<string | null>(null);
	const [activeKind, setActiveKind] = useState<InteractionKind | null>(null);

	const handleMouseDown = useCallback((e: React.MouseEvent, elementId: string, action: InteractionKind) => {
		if (readOnly) return;
		e.preventDefault();
		e.stopPropagation();

		const rect = canvasRef.current?.getBoundingClientRect();
		if (!rect) return;

		const element = elementsRef.current.find((el) => el.id === elementId);
		if (!element || element.locked) return;

		const mx = (e.clientX - rect.left) / scaleRef.current;
		const my = (e.clientY - rect.top) / scaleRef.current;

		interactionRef.current = {
			kind: action,
			elementId,
			mouseOriginX: mx,
			mouseOriginY: my,
			elOriginX: element.x,
			elOriginY: element.y,
			elOriginW: element.width,
			elOriginH: element.height,
		};
		setActiveElementId(elementId);
		setActiveKind(action);
		onInteractionStart();
	}, [onInteractionStart, readOnly]);

	const handleElementClick = useCallback((e: React.MouseEvent, elementId: string) => {
		if (readOnly) return;
		e.stopPropagation();

		if (e.shiftKey) {
			if (selectedElementIds.includes(elementId)) {
				onSelect(selectedElementIds.filter((id) => id !== elementId));
			} else {
				onSelect([...selectedElementIds, elementId]);
			}
		} else {
			onSelect([elementId]);
		}
	}, [selectedElementIds, onSelect, readOnly]);

	const handleCanvasClick = useCallback(() => {
		if (readOnly) return;
		onSelect([]);
	}, [onSelect, readOnly]);

	const renderElement = (element: CanvasElement) => {
		if (element.hidden) return null;

		const isSelected = !readOnly && selectedElementIds.includes(element.id);
		const isDragging = activeKind === 'move' && activeElementId === element.id;
		const isResizing = activeKind === 'resize' && activeElementId === element.id;
		const isRotating = activeKind === 'rotate' && activeElementId === element.id;

		const elementStyle: React.CSSProperties = {
			position: 'absolute',
			left: 0,
			top: 0,
			width: element.width,
			height: element.height,
			minWidth: element.width,
			minHeight: element.height,
			transform: `rotate(${element.rotation || 0}deg)`,
			opacity: element.opacity ?? 1,
			zIndex: element.zIndex,
			cursor: readOnly ? 'default' : element.locked ? 'not-allowed' : isDragging ? 'grabbing' : 'grab',
			boxSizing: 'border-box',
			...(isDragging && {
				opacity: 0.85,
				filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.12))',
			}),
		};

		const displayText = buildDisplayText(element, previewStudent, studentContext);

		// Resolve a student photo (profile picture) when bound
		const isPhotoVar = element.variableType === 'student' && element.variableKey === 'profile_picture';
		const photoSrc = isPhotoVar ? previewStudent?.profile_picture || '' : '';

		let elementContent: React.ReactNode;

		switch (element.type) {
			case 'text':
				elementContent = (
					<div
						style={{
							...elementStyle,
							fontFamily: element.fontFamily || 'Arial',
							fontSize: element.fontSize || 16,
							fontWeight: element.fontWeight || 'normal',
							fontStyle: element.fontStyle || 'normal',
							color: element.color || '#000000',
							textAlign: (element.textAlign as 'left' | 'center' | 'right' | 'justify') || 'left',
							textDecoration: element.textDecoration || 'none',
							textTransform: (element.textTransform as React.CSSProperties['textTransform']) || 'none',
							display: 'flex',
							alignItems: 'center',
							justifyContent:
								element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start',
							padding: '2px',
							userSelect: 'none',
							lineHeight: 1.1,
						}}
					>
						{displayText}
					</div>
				);
				break;

			case 'paragraph':
				elementContent = (
					<div
						style={{
							...elementStyle,
							fontFamily: element.fontFamily || 'Arial',
							fontSize: element.fontSize || 14,
							fontWeight: element.fontWeight || 'normal',
							fontStyle: element.fontStyle || 'normal',
							color: element.color || '#000000',
							textAlign: (element.textAlign as 'left' | 'center' | 'right' | 'justify') || 'left',
							textDecoration: element.textDecoration || 'none',
							lineHeight: '1.35',
							padding: '4px',
							userSelect: 'none',
							wordWrap: 'break-word',
							overflowWrap: 'break-word',
						}}
					>
						{displayText}
					</div>
				);
				break;

			case 'photo': {
				// Rendered as a background image so a failed/cross-origin load never shows a
				// broken-image glyph — it just falls back to the placeholder frame.
				const photoFit = element.objectFit === 'contain' ? 'contain' : element.objectFit === 'fill' ? '100% 100%' : 'cover';
				elementContent = (
					<div
						style={{
							...elementStyle,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: element.fill || '#e5e7eb',
							backgroundImage: photoSrc ? `url("${photoSrc}")` : undefined,
							backgroundSize: photoFit,
							backgroundPosition: 'center',
							backgroundRepeat: 'no-repeat',
							border: `${element.strokeWidth || 0}px solid ${element.stroke || '#cbd5e1'}`,
							borderRadius: element.cornerRadius || 0,
							color: '#94a3b8',
							userSelect: 'none',
						}}
					>
						{!photoSrc && <UserIcon style={{ width: '45%', height: '45%' }} />}
					</div>
				);
				break;
			}

			case 'image': {
				// Background image (vs <img>) avoids the broken-image glyph when a logo/asset
				// URL fails or lacks CORS headers; the placeholder shows an upload hint instead.
				const imgFit = element.objectFit === 'contain' ? 'contain' : element.objectFit === 'fill' ? '100% 100%' : element.objectFit === 'cover' ? 'cover' : 'contain';
				elementContent = (
					<div
						style={{
							...elementStyle,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: element.src ? 'transparent' : '#f1f5f9',
							backgroundImage: element.src ? `url("${element.src}")` : undefined,
							backgroundSize: imgFit,
							backgroundPosition: 'center',
							backgroundRepeat: 'no-repeat',
							borderRadius: element.cornerRadius || 0,
							color: '#94a3b8',
							fontSize: 11,
							userSelect: 'none',
						}}
					>
						{!element.src && <span>Image</span>}
					</div>
				);
				break;
			}

			case 'rectangle':
				elementContent = (
					<div
						style={{
							...elementStyle,
							backgroundColor: element.fill || '#3B82F6',
							border: `${element.strokeWidth || 0}px solid ${element.stroke || 'transparent'}`,
							borderRadius: element.cornerRadius || 0,
							userSelect: 'none',
						}}
					/>
				);
				break;

			case 'circle':
				elementContent = (
					<div
						style={{
							...elementStyle,
							backgroundColor: element.fill || '#10B981',
							border: `${element.strokeWidth || 0}px solid ${element.stroke || 'transparent'}`,
							borderRadius: '50%',
							userSelect: 'none',
						}}
					/>
				);
				break;

			case 'qr': {
				const qrStudentVar = element.variableType === 'student' && element.variableKey && previewStudent;
				const qrValue = qrStudentVar ? getStudentVariableValue(previewStudent, element.variableKey ?? '') : null;
				const qrDisplayValue = qrValue != null && qrValue !== '' ? qrValue : element.content || '{lrn}';
				elementContent = (
					<div
						style={{
							...elementStyle,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: '#fff',
							userSelect: 'none',
						}}
					>
						<QRCodeSVG
							value={qrDisplayValue}
							size={Math.min(element.width, element.height)}
							level="M"
							includeMargin={false}
							bgColor="#ffffff"
							fgColor="#000000"
						/>
					</div>
				);
				break;
			}

			default:
				elementContent = (
					<div
						style={{
							...elementStyle,
							backgroundColor: element.fill || '#6B7280',
							border: `${element.strokeWidth || 0}px solid ${element.stroke || 'transparent'}`,
							userSelect: 'none',
						}}
					/>
				);
		}

		return (
			<div
				key={element.id}
				className={`absolute group ${isDragging || isResizing || isRotating ? 'z-50' : ''}`}
				onClick={(e) => handleElementClick(e, element.id)}
				onMouseDown={(e) => handleMouseDown(e, element.id, 'move')}
				style={{
					left: element.x,
					top: element.y,
					width: element.width,
					height: element.height,
				}}
			>
				{/* Selection border */}
				{isSelected && !element.locked && (
					<div
						style={{
							position: 'absolute',
							top: -2,
							left: -2,
							width: `calc(100% + 4px)`,
							height: `calc(100% + 4px)`,
							border: '1.5px solid #3b82f6',
							borderRadius: 2,
							pointerEvents: 'none',
							zIndex: 10,
						}}
					/>
				)}

				{/* Element content */}
				{React.cloneElement(elementContent as React.ReactElement, {
					onMouseDown: (e: React.MouseEvent) => {
						if (readOnly) return;
						e.preventDefault();
						e.stopPropagation();
						handleMouseDown(e, element.id, 'move');
					},
				} as React.HTMLAttributes<HTMLElement>)}

				{/* Selection handles */}
				{isSelected && !element.locked && (
					<>
						{(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
							const pos: React.CSSProperties = {
								position: 'absolute',
								width: 8,
								height: 8,
								backgroundColor: '#ffffff',
								border: '1.5px solid #3b82f6',
								borderRadius: 1,
								zIndex: 12,
								...(corner.includes('n') ? { top: -4 } : { bottom: -4 }),
								...(corner.includes('w') ? { left: -4 } : { right: -4 }),
								cursor: `${corner}-resize`,
							};
							return (
								<div
									key={corner}
									style={pos}
									onMouseDown={(e) => {
										e.preventDefault();
										e.stopPropagation();
										handleMouseDown(e, element.id, 'resize');
									}}
								/>
							);
						})}

						{/* Rotate handle */}
						<div
							style={{
								position: 'absolute',
								top: -28,
								left: '50%',
								transform: 'translateX(-50%)',
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								pointerEvents: 'none',
								zIndex: 12,
							}}
						>
							<div
								style={{
									width: 18,
									height: 18,
									borderRadius: '50%',
									backgroundColor: '#ffffff',
									border: '1.5px solid #3b82f6',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									cursor: 'grab',
									pointerEvents: 'auto',
								}}
								onMouseDown={(e) => {
									e.preventDefault();
									e.stopPropagation();
									handleMouseDown(e, element.id, 'rotate');
								}}
							>
								<RotateCw style={{ width: 10, height: 10, color: '#3b82f6' }} />
							</div>
							<div style={{ width: 1, height: 6, backgroundColor: '#3b82f6' }} />
						</div>
					</>
				)}
			</div>
		);
	};

	// Global mouse listeners — registered once, reads everything from refs
	useEffect(() => {
		const handleGlobalMouseMove = (e: MouseEvent) => {
			const i = interactionRef.current;
			if (!i) return;

			const rect = canvasRef.current?.getBoundingClientRect();
			if (!rect) return;

			const curScale = scaleRef.current;
			const mx = (e.clientX - rect.left) / curScale;
			const my = (e.clientY - rect.top) / curScale;

			const totalDx = mx - i.mouseOriginX;
			const totalDy = my - i.mouseOriginY;

			const element = elementsRef.current.find((el) => el.id === i.elementId);
			if (!element || element.locked) return;

			const doSnap = snappingRef.current;
			const grid = snapGridRef.current;
			const snapVal = (v: number) => (doSnap ? Math.round(v / grid) * grid : v);

			if (i.kind === 'move') {
				const newX = snapVal(i.elOriginX + totalDx);
				const newY = snapVal(i.elOriginY + totalDy);
				onChangeRef.current({ ...element, x: newX, y: newY });
			}

			if (i.kind === 'resize') {
				const newW = Math.max(10, snapVal(i.elOriginW + totalDx));
				const newH = Math.max(10, snapVal(i.elOriginH + totalDy));
				onChangeRef.current({ ...element, width: newW, height: newH });
			}

			if (i.kind === 'rotate') {
				const cx = element.x + element.width / 2;
				const cy = element.y + element.height / 2;
				const angle = Math.atan2(my - cy, mx - cx) * (180 / Math.PI) + 90;
				onChangeRef.current({ ...element, rotation: Math.round(angle) });
			}
		};

		const handleGlobalMouseUp = () => {
			if (interactionRef.current) {
				interactionRef.current = null;
				setActiveElementId(null);
				setActiveKind(null);
				onChangeEndRef.current();
			}
		};

		document.addEventListener('mousemove', handleGlobalMouseMove);
		document.addEventListener('mouseup', handleGlobalMouseUp);

		return () => {
			document.removeEventListener('mousemove', handleGlobalMouseMove);
			document.removeEventListener('mouseup', handleGlobalMouseUp);
		};
	}, []);

	return (
		<div
			ref={canvasRef}
			className="relative overflow-hidden"
			style={{
				width: `${width}px`,
				height: `${height}px`,
				margin: 0,
				padding: 0,
				boxSizing: 'border-box',
				position: 'relative',
			}}
			onClick={handleCanvasClick}
		>
			{/* Grid */}
			{showGrid && !readOnly && (
				<div
					className="absolute inset-0 pointer-events-none"
					style={{
						backgroundImage: `
							linear-gradient(to right, #9CA3AF 1px, transparent 1px),
							linear-gradient(to bottom, #9CA3AF 1px, transparent 1px)
						`,
						backgroundSize: `${snapGrid}px ${snapGrid}px`,
						backgroundPosition: '0 0',
						width: '100%',
						height: '100%',
						opacity: 0.4,
						zIndex: 1,
					}}
				/>
			)}

			{/* Elements */}
			<AnimatePresence>
				{elements
					.filter((el) => !el.hidden)
					.sort((a, b) => a.zIndex - b.zIndex)
					.map(renderElement)}
			</AnimatePresence>
		</div>
	);
};

export default IdCardCanvas;
