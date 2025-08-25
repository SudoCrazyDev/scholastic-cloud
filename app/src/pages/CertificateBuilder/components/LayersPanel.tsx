import React from 'react';
import { motion } from 'framer-motion';
import { 
	Eye, 
	EyeOff, 
	Lock, 
	Unlock, 
	Trash2, 
	Copy,
	Layers,
	ChevronUp,
	ChevronDown
} from 'lucide-react';
import { type CanvasElement } from './CertificateCanvas';
import Button from '@/components/ui/Button';

interface LayersPanelProps {
	elements: CanvasElement[];
	selectedIds: string[];
	onSelect: (ids: string[]) => void;
	onToggleHide: (id: string) => void;
	onToggleLock: (id: string) => void;
	onReorder: (id: string, direction: 'up' | 'down') => void;
	onDelete: (id: string) => void;
	onDuplicate: (element: CanvasElement) => void;
}

const LayersPanel: React.FC<LayersPanelProps> = ({
	elements,
	selectedIds,
	onSelect,
	onToggleHide,
	onToggleLock,
	onReorder,
	onDelete,
	onDuplicate
}) => {
	const getElementIcon = (element: CanvasElement) => {
		switch (element.type) {
			case 'text': return 'T';
			case 'image': return '🖼️';
			case 'rectangle': case 'square': return '⬜';
			case 'circle': case 'ellipse': return '⭕';
			case 'triangle': return '🔺';
			case 'star': return '⭐';
			default: return '📄';
		}
	};

	const getElementColor = (element: CanvasElement) => {
		switch (element.type) {
			case 'text': return 'text-blue-600';
			case 'image': return 'text-green-600';
			case 'rectangle': case 'square': return 'text-purple-600';
			case 'circle': case 'ellipse': return 'text-orange-600';
			case 'triangle': return 'text-red-600';
			case 'star': return 'text-yellow-600';
			default: return 'text-gray-600';
		}
	};

	const handleElementClick = (id: string, multiSelect: boolean) => {
		if (multiSelect) {
			if (selectedIds.includes(id)) {
				onSelect(selectedIds.filter(selectedId => selectedId !== id));
			} else {
				onSelect([...selectedIds, id]);
			}
		} else {
			onSelect([id]);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleElementClick(id, e.shiftKey);
		}
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			className="p-4"
		>
			<div className="mb-4">
				<h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
					<Layers className="w-5 h-5" />
					Layers
				</h3>
				<p className="text-sm text-gray-600">
					{elements.length} element{elements.length !== 1 ? 's' : ''}
				</p>
			</div>

			{elements.length === 0 ? (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					className="text-center py-8 text-gray-500"
				>
					<Layers className="w-12 h-12 mx-auto mb-3 text-gray-300" />
					<p className="text-sm">No elements yet</p>
					<p className="text-xs text-gray-400">Add elements from the left panel</p>
				</motion.div>
			) : (
				<div className="space-y-1">
					{elements.map((element, index) => {
						const isSelected = selectedIds.includes(element.id);
						const isFirst = index === 0;
						const isLast = index === elements.length - 1;
						
						return (
							<motion.div
								key={element.id}
								layout
								initial={{ opacity: 0, scale: 0.8 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.8 }}
								className={`
									group relative p-3 rounded-lg border cursor-pointer transition-all duration-200
									${isSelected 
										? 'border-blue-500 bg-blue-50 shadow-sm' 
										: 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
									}
									${element.hidden ? 'opacity-50' : ''}
								`}
								onClick={() => handleElementClick(element.id, false)}
								onKeyDown={(e) => handleKeyDown(e, element.id)}
								tabIndex={0}
								role="button"
								aria-label={`Layer ${index + 1}: ${element.type}`}
							>
								{/* Selection indicator */}
								{isSelected && (
									<motion.div
										initial={{ scale: 0 }}
										animate={{ scale: 1 }}
										className="absolute -left-1 top-1/2 w-1 h-8 bg-blue-500 rounded-r transform -translate-y-1/2"
									/>
								)}

								<div className="flex items-center gap-3">
									{/* Element icon */}
									<div className={`
										flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-medium
										${getElementColor(element)}
									`}>
										{getElementIcon(element)}
									</div>

									{/* Element info */}
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium text-gray-900 truncate capitalize">
												{element.type}
											</span>
											{element.hidden && (
												<EyeOff className="w-3 h-3 text-gray-400" />
											)}
											{element.locked && (
												<Lock className="w-3 h-3 text-gray-400" />
											)}
										</div>
										<p className="text-xs text-gray-500 truncate">
											{element.type === 'text' && element.content ? element.content : `${Math.round(element.width)} × ${Math.round(element.height)}`}
										</p>
									</div>

									{/* Actions */}
									<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
										<Button
											onClick={(e) => {
												e.stopPropagation();
												onToggleHide(element.id);
											}}
											variant="ghost"
											size="sm"
											className="p-1 h-6 w-6"
											icon={element.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
										/>
										<Button
											onClick={(e) => {
												e.stopPropagation();
												onToggleLock(element.id);
											}}
											variant="ghost"
											size="sm"
											className="p-1 h-6 w-6"
											icon={element.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
										/>
									</div>
								</div>

								{/* Reorder controls */}
								<div className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
									<div className="flex flex-col gap-1">
										<Button
											onClick={(e) => {
												e.stopPropagation();
												onReorder(element.id, 'up');
											}}
											disabled={isFirst}
											variant="ghost"
											size="sm"
											className="p-1 h-5 w-5"
											icon={<ChevronUp className="w-3 h-3" />}
										/>
										<Button
											onClick={(e) => {
												e.stopPropagation();
												onReorder(element.id, 'down');
											}}
											disabled={isLast}
											variant="ghost"
											size="sm"
											className="p-1 h-5 w-5"
											icon={<ChevronDown className="w-3 h-3" />}
										/>
									</div>
								</div>

								{/* Context menu (appears on right-click) */}
								{isSelected && (
									<motion.div
										initial={{ opacity: 0, scale: 0.9 }}
										animate={{ opacity: 1, scale: 1 }}
										className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10"
									>
										<button
											onClick={(e) => {
												e.stopPropagation();
												onDuplicate(element);
											}}
											className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
										>
											<Copy className="w-4 h-4" />
											Duplicate
										</button>
										<button
											onClick={(e) => {
												e.stopPropagation();
												onDelete(element.id);
											}}
											className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
										>
											<Trash2 className="w-4 h-4" />
											Delete
										</button>
									</motion.div>
								)}
							</motion.div>
						);
					})}
				</div>
			)}

			{/* Footer actions */}
			{elements.length > 0 && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					className="mt-4 pt-4 border-t border-gray-200"
				>
					<div className="flex gap-2">
						<Button
							onClick={() => onSelect([])}
							variant="ghost"
							size="sm"
							className="flex-1"
						>
							Deselect All
						</Button>
						<Button
							onClick={() => onSelect(elements.map(el => el.id))}
							variant="ghost"
							size="sm"
							className="flex-1"
						>
							Select All
						</Button>
					</div>
				</motion.div>
			)}
		</motion.div>
	);
};

export default LayersPanel;