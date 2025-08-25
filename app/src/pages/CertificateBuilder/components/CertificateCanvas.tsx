import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
	Move, 
	RotateCw
} from 'lucide-react';

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
}

interface CertificateCanvasProps {
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
}

const CertificateCanvas: React.FC<CertificateCanvasProps> = ({
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
	snappingEnabled
}) => {
	const canvasRef = useRef<HTMLDivElement>(null);
	const [draggedElement, setDraggedElement] = useState<string | null>(null);
	const [resizeHandle, setResizeHandle] = useState<string | null>(null);
	const [rotateHandle, setRotateHandle] = useState<string | null>(null);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [snapGrid] = useState(20);

	const getSnapPosition = (value: number) => {
		if (!snappingEnabled) return value;
		return Math.round(value / snapGrid) * snapGrid;
	};

	const handleMouseDown = (e: React.MouseEvent, elementId: string, action: 'move' | 'resize' | 'rotate') => {
		e.preventDefault();
		e.stopPropagation();
		
		console.log('Mouse down event:', { action, elementId, clientX: e.clientX, clientY: e.clientY });
		
		const rect = canvasRef.current?.getBoundingClientRect();
		if (!rect) return;
		
		const x = (e.clientX - rect.left) / scale;
		const y = (e.clientY - rect.top) / scale;
		
		setDragStart({ x, y });
		
		switch (action) {
			case 'move':
				setDraggedElement(elementId);
				console.log('Setting dragged element:', elementId);
				break;
			case 'resize':
				setResizeHandle(elementId);
				console.log('Setting resize handle:', elementId);
				break;
			case 'rotate':
				setRotateHandle(elementId);
				console.log('Setting rotate handle:', elementId);
				break;
		}
		
		onInteractionStart();
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		if (!draggedElement && !resizeHandle && !rotateHandle) return;
		
		const rect = canvasRef.current?.getBoundingClientRect();
		if (!rect) return;
		
		const x = (e.clientX - rect.left) / scale;
		const y = (e.clientY - rect.top) / scale;
		
		const deltaX = x - dragStart.x;
		const deltaY = y - dragStart.y;
		
		// Add movement threshold to prevent jittery movement
		const movementThreshold = 5;
		if (Math.abs(deltaX) < movementThreshold && Math.abs(deltaY) < movementThreshold) {
			return;
		}
		
		if (draggedElement) {
			const element = elements.find(el => el.id === draggedElement);
			if (element && !element.locked) {
				// No dampening - direct 1:1 movement for natural feel
				const newX = getSnapPosition(element.x + deltaX);
				const newY = getSnapPosition(element.y + deltaY);
				console.log('Moving element:', { oldX: element.x, oldY: element.y, newX, newY });
				onChange({ ...element, x: newX, y: newY });
				
				// Update dragStart to current position for next frame
				setDragStart({ x, y });
			}
		}
		
		if (resizeHandle) {
			const element = elements.find(el => el.id === resizeHandle);
			if (element && !element.locked) {
				// No dampening - direct 1:1 resizing for natural feel
				const newWidth = Math.max(20, getSnapPosition(element.width + deltaX));
				const newHeight = Math.max(20, getSnapPosition(element.height + deltaY));
				console.log('Resizing element:', { oldWidth: element.width, oldHeight: element.height, newWidth, newHeight });
				onChange({ ...element, width: newWidth, height: newHeight });
				
				// Update dragStart to current position for next frame
				setDragStart({ x, y });
			}
		}
		
		if (rotateHandle) {
			const element = elements.find(el => el.id === rotateHandle);
			if (element && !element.locked) {
				const centerX = element.x + element.width / 2;
				const centerY = element.y + element.height / 2;
				const angle = Math.atan2(y - centerY, x - centerX) * (180 / Math.PI);
				onChange({ ...element, rotation: angle });
			}
		}
	};

	const handleMouseUp = () => {
		setDraggedElement(null);
		setResizeHandle(null);
		setRotateHandle(null);
		onChangeEnd();
	};

	const handleElementClick = (e: React.MouseEvent, elementId: string) => {
		e.stopPropagation();
		
		if (e.shiftKey) {
			// Multi-select
			if (selectedElementIds.includes(elementId)) {
				onSelect(selectedElementIds.filter(id => id !== elementId));
			} else {
				onSelect([...selectedElementIds, elementId]);
			}
		} else {
			// Single select
			onSelect([elementId]);
		}
	};

	const handleCanvasClick = () => {
		onSelect([]);
	};

	const renderElement = (element: CanvasElement) => {
		if (element.hidden) return null;
		
		const isSelected = selectedElementIds.includes(element.id);
		const isDragging = draggedElement === element.id;
		const isResizing = resizeHandle === element.id;
		const isRotating = rotateHandle === element.id;
		
		const elementStyle = {
			position: 'absolute' as const,
			left: 0, // Position relative to wrapper, not canvas
			top: 0,  // Position relative to wrapper, not canvas
			width: element.width,
			height: element.height,
			minWidth: element.width,
			minHeight: element.height,
			transform: `rotate(${element.rotation || 0}deg)`,
			opacity: element.opacity || 1,
			zIndex: element.zIndex,
			cursor: element.locked ? 'not-allowed' : (isDragging ? 'grabbing' : 'grab'),
			boxSizing: 'border-box' as const,
			// Add visual feedback when dragging
			...(isDragging && {
				opacity: 0.8,
				boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
				transform: `rotate(${element.rotation || 0}deg) scale(1.02)`,
			}),
		};
		
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
							color: element.color || '#000000',
							textAlign: (element.textAlign as 'left' | 'center' | 'right' | 'justify') || 'left',
							display: 'flex',
							alignItems: 'center',
							justifyContent: element.textAlign === 'center' ? 'center' : 'flex-start',
							padding: '4px',
							userSelect: 'none',
						}}
					>
						{element.content || 'Sample Text'}
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
							color: element.color || '#000000',
							textAlign: (element.textAlign as 'left' | 'center' | 'right' | 'justify') || 'left',
							lineHeight: '1.4',
							padding: '8px',
							userSelect: 'none',
							wordWrap: 'break-word',
							overflowWrap: 'break-word',
						}}
					>
						{element.content || 'This is a sample paragraph with rich text content. You can edit this text with formatting options.'}
					</div>
				);
				break;
				
			case 'image':
				elementContent = (
					<img
						src={element.src || 'https://via.placeholder.com/200x100'}
						alt={element.alt || ''}
						style={{
							...elementStyle,
							objectFit: (element.objectFit as 'cover' | 'contain' | 'fill' | 'none' | 'scale-down') || 'cover',
							userSelect: 'none',
						}}
					/>
				);
				break;
				
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
			<motion.div
				key={element.id}
				layout
				initial={{ opacity: 0, scale: 0.8 }}
				animate={{ 
					opacity: 1, 
					scale: 1,
				}}
				exit={{ opacity: 0, scale: 0.8 }}
				transition={{ duration: 0.2 }}
				className={`
					relative group
					${isDragging ? 'z-50' : ''}
					${isResizing ? 'z-50' : ''}
					${isRotating ? 'z-50' : ''}
				`}
				onClick={(e) => handleElementClick(e, element.id)}
				onMouseDown={(e) => handleMouseDown(e, element.id, 'move')}
				style={{
					position: 'absolute',
					left: element.x,
					top: element.y,
					width: element.width,
					height: element.height,
				}}
			>
				{/* Selection border - positioned absolutely on canvas */}
				{isSelected && !element.locked && (
					<motion.div
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.15 }}
						style={{
							position: 'absolute',
							top: -4,
							left: -4,
							width: `calc(100% + 8px)`,
							height: `calc(100% + 8px)`,
							border: '2px solid #3b82f6',
							pointerEvents: 'none',
							zIndex: 10,
							backgroundColor: 'rgba(59, 130, 246, 0.1)',
						}}
					/>
				)}
				
				{/* Element content */}
				{React.cloneElement(elementContent as React.ReactElement, {
					onMouseDown: (e: React.MouseEvent) => {
						e.preventDefault();
						e.stopPropagation();
						handleMouseDown(e, element.id, 'move');
					}
				} as any)}
				
				{/* Selection handles */}
				{isSelected && !element.locked && (
					<>
						{/* Corner resize handles */}
						{/* Top-left */}
						<div
							className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 border-2 border-white rounded cursor-nw-resize hover:bg-blue-600 hover:scale-110 transition-all duration-150"
							onMouseDown={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handleMouseDown(e, element.id, 'resize');
							}}
							title="Resize"
						/>
						
						{/* Top-right */}
						<div
							className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 border-2 border-white rounded cursor-ne-resize hover:bg-blue-600 hover:scale-110 transition-all duration-150"
							onMouseDown={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handleMouseDown(e, element.id, 'resize');
							}}
							title="Resize"
						/>
						
						{/* Bottom-left */}
						<div
							className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 border-2 border-white rounded cursor-sw-resize hover:bg-blue-600 hover:scale-110 transition-all duration-150"
							onMouseDown={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handleMouseDown(e, element.id, 'resize');
							}}
							title="Resize"
						/>
						
						{/* Bottom-right */}
						<div
							className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 border-2 border-white rounded cursor-se-resize hover:bg-blue-600 hover:scale-110 transition-all duration-150"
							onMouseDown={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handleMouseDown(e, element.id, 'resize');
							}}
							title="Resize"
						/>
						
						{/* Rotate handle */}
						<div
							className="absolute -top-8 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-grab hover:bg-blue-600 hover:scale-110 transition-all duration-150"
							onMouseDown={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handleMouseDown(e, element.id, 'rotate');
							}}
							title="Rotate"
						>
							<RotateCw className="w-2.5 h-2.5 text-white" />
						</div>
						
						{/* Move indicator */}
						<div className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-blue-500 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity">
							<Move className="w-3 h-3 inline mr-1" />
							Move
						</div>
					</>
				)}
			</motion.div>
		);
	};

	// Global mouse event handlers
	useEffect(() => {
		const handleGlobalMouseMove = (e: MouseEvent) => {
			if (!draggedElement && !resizeHandle && !rotateHandle) return;
			
			console.log('Global mouse move:', { draggedElement, resizeHandle, rotateHandle, clientX: e.clientX, clientY: e.clientY });
			
			const rect = canvasRef.current?.getBoundingClientRect();
			if (!rect) return;
			
			const x = (e.clientX - rect.left) / scale;
			const y = (e.clientY - rect.top) / scale;
			
			const deltaX = x - dragStart.x;
			const deltaY = y - dragStart.y;
			
			console.log('Mouse move deltas:', { deltaX, deltaY, threshold: 5 });
			
			// Add movement threshold to prevent jittery movement
			const movementThreshold = 5;
			if (Math.abs(deltaX) < movementThreshold && Math.abs(deltaY) < movementThreshold) {
				console.log('Movement below threshold, skipping');
				return;
			}
			
			if (draggedElement) {
				const element = elements.find(el => el.id === draggedElement);
				if (element && !element.locked) {
					// No dampening - direct 1:1 movement for natural feel
					const newX = getSnapPosition(element.x + deltaX);
					const newY = getSnapPosition(element.y + deltaY);
					console.log('Moving element:', { oldX: element.x, oldY: element.y, newX, newY });
					onChange({ ...element, x: newX, y: newY });
					
					// Update dragStart to current position for next frame
					setDragStart({ x, y });
				}
			}
			
			if (resizeHandle) {
				const element = elements.find(el => el.id === resizeHandle);
				if (element && !element.locked) {
					// No dampening - direct 1:1 resizing for natural feel
					const newWidth = Math.max(20, getSnapPosition(element.width + deltaX));
					const newHeight = Math.max(20, getSnapPosition(element.height + deltaY));
					console.log('Resizing element:', { oldWidth: element.width, oldHeight: element.height, newWidth, newHeight });
					onChange({ ...element, width: newWidth, height: newHeight });
					
					// Update dragStart to current position for next frame
					setDragStart({ x, y });
				}
			}
			
			if (rotateHandle) {
				const element = elements.find(el => el.id === rotateHandle);
				if (element && !element.locked) {
					const centerX = element.x + element.width / 2;
					const centerY = element.y + element.height / 2;
					const angle = Math.atan2(y - centerY, x - centerX) * (180 / Math.PI);
					console.log('Rotating element:', { oldRotation: element.rotation, newRotation: angle });
					onChange({ ...element, rotation: angle });
				}
			}
		};
		
		const handleGlobalMouseUp = () => {
			setDraggedElement(null);
			setResizeHandle(null);
			setRotateHandle(null);
			onChangeEnd();
		};
		
		document.addEventListener('mousemove', handleGlobalMouseMove);
		document.addEventListener('mouseup', handleGlobalMouseUp);
		
		return () => {
			document.removeEventListener('mousemove', handleGlobalMouseMove);
			document.removeEventListener('mouseup', handleGlobalMouseUp);
		};
	}, [draggedElement, resizeHandle, rotateHandle, dragStart, elements, onChange, onChangeEnd, scale, snapGrid, snappingEnabled]);

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
				position: 'relative'
			}}
			onClick={handleCanvasClick}
		>
			{/* Grid */}
			{showGrid && (
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
						// Ensure grid covers the entire canvas area
						left: 0,
						top: 0,
						right: 0,
						bottom: 0,
						// Add a small buffer to ensure grid covers edges
						margin: '1px'
					}}
				/>
			)}
			
			{/* Elements */}
			<AnimatePresence>
				{elements
					.filter(el => !el.hidden)
					.sort((a, b) => a.zIndex - b.zIndex)
					.map(renderElement)}
			</AnimatePresence>
		</div>
	);
};

export default CertificateCanvas;