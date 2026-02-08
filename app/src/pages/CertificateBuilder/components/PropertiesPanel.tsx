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
			<div className="p-3 border-b border-gray-200 bg-gray-50">
				<div className="flex items-center gap-2 mb-2">
					<div className="p-1.5 bg-white rounded-md shadow-sm flex-shrink-0">
						<ElementIcon className="w-4 h-4 text-gray-600" />
					</div>
					<div className="min-w-0 flex-1">
						<h3 className="font-medium text-gray-900 capitalize text-sm truncate">
							{element.type} Properties
						</h3>
						<p className="text-xs text-gray-500 truncate">ID: {element.id.slice(0, 8)}...</p>
					</div>
				</div>

				{/* Action Buttons - compact icon-only */}
				<div className="flex flex-wrap gap-1">
					<Button
						onClick={() => updateElement({ hidden: !element.hidden })}
						variant="ghost"
						size="sm"
						className="!p-1.5 !h-7 !min-w-0"
						title={element.hidden ? 'Show' : 'Hide'}
						icon={element.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
					/>
					<Button
						onClick={() => updateElement({ locked: !element.locked })}
						variant="ghost"
						size="sm"
						className="!p-1.5 !h-7 !min-w-0"
						title={element.locked ? 'Unlock' : 'Lock'}
						icon={element.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
					/>
					{onDuplicate && (
						<Button
							onClick={() => onDuplicate(element)}
							variant="ghost"
							size="sm"
							className="!p-1.5 !h-7 !min-w-0"
							title="Copy"
							icon={<Copy className="w-3.5 h-3.5" />}
						/>
					)}
					{onDelete && (
						<Button
							onClick={() => onDelete(element.id)}
							variant="danger"
							size="sm"
							className="!p-1.5 !h-7 !min-w-0"
							title="Delete"
							icon={<Trash2 className="w-3.5 h-3.5" />}
						/>
					)}
				</div>
			</div>

			{/* Properties */}
			<div className="p-3 space-y-4">
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
									<option value="UnifrakturMaguntia">Old English</option>
									<option value="Old English Text MT">Old English Text MT (system)</option>
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
								<Select
									label="Font Style"
									value={element.fontStyle || 'normal'}
									onChange={(e) => updateElement({ fontStyle: e.target.value })}
									
								>
									<option value="normal">Normal</option>
									<option value="italic">Italic</option>
									<option value="oblique">Oblique</option>
								</Select>
								<Select
									label="Text Decoration"
									value={element.textDecoration || 'none'}
									onChange={(e) => updateElement({ textDecoration: e.target.value })}
									
								>
									<option value="none">None</option>
									<option value="underline">Underline</option>
									<option value="overline">Overline</option>
									<option value="line-through">Line through</option>
									<option value="underline line-through">Underline + Line through</option>
								</Select>
							</div>
						</motion.div>
					)}

					{element.type === 'qr' && (
						<motion.div
							key="qr-properties"
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: 'auto' }}
							exit={{ opacity: 0, height: 0 }}
						>
							<h4 className="text-sm font-medium text-gray-700 mb-3">QR Code</h4>
							<p className="text-xs text-gray-500">
								Encodes LRN (Learner Reference Number). When generating certificates for students, this QR will contain the student&apos;s LRN. Resize with the canvas handles.
							</p>
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
								{/* Image file upload (images only) */}
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1.5">Upload Image</label>
									<label className="flex items-center justify-center gap-2 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-sm text-gray-600 cursor-pointer transition-colors">
										<Image className="w-4 h-4 text-gray-500 flex-shrink-0" />
										<span>Choose image...</span>
										<input
											type="file"
											accept="image/*"
											className="hidden"
											onChange={(e) => {
												const file = e.target.files?.[0];
												if (!file) return;
												const reader = new FileReader();
												reader.onload = () => updateElement({ src: reader.result as string });
												reader.readAsDataURL(file);
												e.target.value = '';
											}}
										/>
									</label>
									<p className="mt-1 text-xs text-gray-500">PNG, JPG, GIF, WebP</p>
								</div>
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