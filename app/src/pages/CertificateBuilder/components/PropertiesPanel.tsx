import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
	Type, 
	Image, 
	Square, 
	Circle, 
	Triangle, 
	Star,
	Settings,
	Eye,
	EyeOff,
	Lock,
	Unlock,
	Trash2,
	Copy,
	Move,
	RotateCw
} from 'lucide-react';
import { type CanvasElement } from './CertificateCanvas';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

interface PropertiesPanelProps {
	element: CanvasElement | null;
	onChange: (element: CanvasElement) => void;
	onDelete?: (id: string) => void;
	onDuplicate?: (element: CanvasElement) => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ 
	element, 
	onChange, 
	onDelete,
	onDuplicate 
}) => {
	if (!element) {
		return (
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				className="p-6 text-center text-gray-500"
			>
				<Settings className="w-12 h-12 mx-auto mb-4 text-gray-300" />
				<h3 className="text-lg font-medium text-gray-400 mb-2">No Element Selected</h3>
				<p className="text-sm text-gray-400">
					Select an element on the canvas to edit its properties
				</p>
			</motion.div>
		);
	}

	const updateElement = (updates: Partial<CanvasElement>) => {
		onChange({ ...element, ...updates });
	};

	const getElementIcon = () => {
		switch (element.type) {
			case 'text': return Type;
			case 'image': return Image;
			case 'rectangle': case 'square': return Square;
			case 'circle': case 'ellipse': return Circle;
			case 'triangle': return Triangle;
			case 'star': return Star;
			default: return Settings;
		}
	};

	const ElementIcon = getElementIcon();

	return (
		<motion.div
			initial={{ opacity: 0, x: 20 }}
			animate={{ opacity: 1, x: 0 }}
			className="h-full overflow-y-auto"
		>
			{/* Header */}
			<div className="p-4 border-b border-gray-200 bg-gray-50">
				<div className="flex items-center gap-3 mb-3">
					<div className="p-2 bg-white rounded-lg shadow-sm">
						<ElementIcon className="w-5 h-5 text-gray-600" />
					</div>
					<div>
						<h3 className="font-medium text-gray-900 capitalize">
							{element.type} Properties
						</h3>
						<p className="text-sm text-gray-500">ID: {element.id.slice(0, 8)}...</p>
					</div>
				</div>

				{/* Action Buttons */}
				<div className="flex gap-2">
					<Button
						onClick={() => updateElement({ hidden: !element.hidden })}
						variant="ghost"
						
						icon={element.hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
					>
						{element.hidden ? 'Show' : 'Hide'}
					</Button>
					<Button
						onClick={() => updateElement({ locked: !element.locked })}
						variant="ghost"
						
						icon={element.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
					>
						{element.locked ? 'Unlock' : 'Lock'}
					</Button>
					{onDuplicate && (
						<Button
							onClick={() => onDuplicate(element)}
							variant="ghost"
							
							icon={<Copy className="w-4 h-4" />}
						>
							Copy
						</Button>
					)}
					{onDelete && (
						<Button
							onClick={() => onDelete(element.id)}
							variant="danger"
							
							icon={<Trash2 className="w-4 h-4" />}
						>
							Delete
						</Button>
					)}
				</div>
			</div>

			{/* Properties */}
			<div className="p-4 space-y-6">
				{/* Position & Size */}
				<div>
					<h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
						<Move className="w-4 h-4" />
						Position & Size
					</h4>
					<div className="grid grid-cols-2 gap-3">
						<Input
							label="X"
							type="number"
							value={element.x}
							onChange={(e) => updateElement({ x: Number(e.target.value) })}
						/>
						<Input
							label="Y"
							type="number"
							value={element.y}
							onChange={(e) => updateElement({ y: Number(e.target.value) })}
						/>
						<Input
							label="Width"
							type="number"
							value={element.width}
							onChange={(e) => updateElement({ width: Number(e.target.value) })}
						/>
						<Input
							label="Height"
							type="number"
							value={element.height}
							onChange={(e) => updateElement({ height: Number(e.target.value) })}
							
						/>
					</div>
				</div>

				{/* Rotation & Opacity */}
				<div>
					<h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
						<RotateCw className="w-4 h-4" />
						Transform
					</h4>
					<div className="grid grid-cols-2 gap-3">
						<Input
							label="Rotation"
							type="number"
							value={element.rotation || 0}
							onChange={(e) => updateElement({ rotation: Number(e.target.value) })}
							
						/>
						<Input
							label="Opacity"
							type="number"
							value={element.opacity || 1}
							onChange={(e) => updateElement({ opacity: Number(e.target.value) })}
							min={0}
							max={1}
							step={0.1}
							
						/>
					</div>
				</div>

				{/* Type-specific properties */}
				<AnimatePresence mode="wait">
					{element.type === 'text' && (
						<motion.div
							key="text-properties"
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: 'auto' }}
							exit={{ opacity: 0, height: 0 }}
						>
							<h4 className="text-sm font-medium text-gray-700 mb-3">Text Properties</h4>
							<div className="space-y-3">
								<Input
									label="Content"
									value={element.content || ''}
									onChange={(e) => updateElement({ content: e.target.value })}
									
								/>
								<Select
									label="Font Family"
									value={element.fontFamily || 'Arial'}
									onChange={(e) => updateElement({ fontFamily: e.target.value })}
									
								>
									<option value="Arial">Arial</option>
									<option value="Helvetica">Helvetica</option>
									<option value="Times New Roman">Times New Roman</option>
									<option value="Georgia">Georgia</option>
									<option value="Verdana">Verdana</option>
									<option value="Courier New">Courier New</option>
								</Select>
								<div className="grid grid-cols-2 gap-3">
									<Input
										label="Font Size"
										type="number"
										value={element.fontSize || 16}
										onChange={(e) => updateElement({ fontSize: Number(e.target.value) })}
										
									/>
									<Input
										label="Color"
										type="color"
										value={element.color || '#000000'}
										onChange={(e) => updateElement({ color: e.target.value })}
										
									/>
								</div>
								<Select
									label="Font Weight"
									value={element.fontWeight || 'normal'}
									onChange={(e) => updateElement({ fontWeight: e.target.value })}
									
								>
									<option value="normal">Normal</option>
									<option value="bold">Bold</option>
									<option value="100">100</option>
									<option value="200">200</option>
									<option value="300">300</option>
									<option value="400">400</option>
									<option value="500">500</option>
									<option value="600">600</option>
									<option value="700">700</option>
									<option value="800">800</option>
									<option value="900">900</option>
								</Select>
								<Select
									label="Text Align"
									value={element.textAlign || 'left'}
									onChange={(e) => updateElement({ textAlign: e.target.value })}
									
								>
									<option value="left">Left</option>
									<option value="center">Center</option>
									<option value="right">Right</option>
									<option value="justify">Justify</option>
								</Select>
							</div>
						</motion.div>
					)}

					{element.type === 'image' && (
						<motion.div
							key="image-properties"
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: 'auto' }}
							exit={{ opacity: 0, height: 0 }}
						>
							<h4 className="text-sm font-medium text-gray-700 mb-3">Image Properties</h4>
							<div className="space-y-3">
								<Input
									label="Source URL"
									value={element.src || ''}
									onChange={(e) => updateElement({ src: e.target.value })}
									
								/>
								<Input
									label="Alt Text"
									value={element.alt || ''}
									onChange={(e) => updateElement({ alt: e.target.value })}
									
								/>
								<Select
									label="Object Fit"
									value={element.objectFit || 'cover'}
									onChange={(e) => updateElement({ objectFit: e.target.value })}
									
								>
									<option value="cover">Cover</option>
									<option value="contain">Contain</option>
									<option value="fill">Fill</option>
									<option value="none">None</option>
									<option value="scale-down">Scale Down</option>
								</Select>
							</div>
						</motion.div>
					)}

					{(element.type === 'rectangle' || element.type === 'circle' || element.type === 'triangle' || element.type === 'star') && (
						<motion.div
							key="shape-properties"
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: 'auto' }}
							exit={{ opacity: 0, height: 0 }}
						>
							<h4 className="text-sm font-medium text-gray-700 mb-3">Shape Properties</h4>
							<div className="space-y-3">
								<div className="grid grid-cols-2 gap-3">
									<Input
										label="Fill Color"
										type="color"
										value={element.fill || '#3B82F6'}
										onChange={(e) => updateElement({ fill: e.target.value })}
										
									/>
									<Input
										label="Stroke Color"
										type="color"
										value={element.stroke || '#1E40AF'}
										onChange={(e) => updateElement({ stroke: e.target.value })}
										
									/>
								</div>
								<Input
									label="Stroke Width"
									type="number"
									value={element.strokeWidth || 1}
									onChange={(e) => updateElement({ strokeWidth: Number(e.target.value) })}
									min={0}
									
								/>
								{element.type === 'rectangle' && (
									<Input
										label="Corner Radius"
										type="number"
										value={element.cornerRadius || 0}
										onChange={(e) => updateElement({ cornerRadius: Number(e.target.value) })}
										min={0}
										
									/>
								)}
								{element.type === 'star' && (
									<Input
										label="Points"
										type="number"
										value={element.points || 5}
										onChange={(e) => updateElement({ points: Number(e.target.value) })}
										min={3}
										max={20}
										
									/>
								)}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</motion.div>
	);
};

export default PropertiesPanel;