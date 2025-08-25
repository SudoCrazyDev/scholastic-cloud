import { motion } from 'framer-motion';
import { Type, Image, Square, Circle, FileText } from 'lucide-react';
import { type CanvasElement } from './CertificateCanvas';

interface ElementsPanelProps {
	onAddElement: (element: CanvasElement) => void;
}

const elementTypes = [
	{ id: 'text', name: 'Text', icon: Type, description: 'Add text elements with customizable fonts and colors', category: 'Basic' },
	{ id: 'paragraph', name: 'Paragraph', icon: FileText, description: 'Add rich text paragraphs with WYSIWYG editing', category: 'Basic' },
	{ id: 'image', name: 'Image', icon: Image, description: 'Insert and manipulate images', category: 'Basic' },
	{ id: 'rectangle', name: 'Rectangle', icon: Square, description: 'Add rectangular shapes for backgrounds and borders', category: 'Shapes' },
	{ id: 'circle', name: 'Circle', icon: Circle, description: 'Add circular shapes for logos and decorative elements', category: 'Shapes' }
];

export default function ElementsPanel({ onAddElement }: ElementsPanelProps) {
	const createElement = (type: string) => {
		const baseElement = {
			id: crypto.randomUUID(),
			type,
			x: 100,
			y: 100,
			width: 200,
			height: 100,
			rotation: 0,
			opacity: 1,
			hidden: false,
			locked: false,
			zIndex: 0,
		};

		switch (type) {
			case 'text':
				onAddElement({
					...baseElement,
					content: 'Sample Text',
					fontSize: 16,
					fontFamily: 'Arial',
					fontWeight: 'normal',
					fontStyle: 'normal',
					color: '#000000',
					textAlign: 'left',
				} as CanvasElement);
				break;
			case 'paragraph':
				onAddElement({
					...baseElement,
					content: 'This is a sample paragraph with rich text content. You can edit this text with formatting options.',
					fontSize: 14,
					fontFamily: 'Arial',
					fontWeight: 'normal',
					fontStyle: 'normal',
					color: '#000000',
					textAlign: 'left',
					width: 300,
					height: 120,
				} as CanvasElement);
				break;
			case 'image':
				onAddElement({
					...baseElement,
					src: 'https://via.placeholder.com/200x100',
					alt: 'Sample Image',
					objectFit: 'cover',
				} as CanvasElement);
				break;
			case 'rectangle':
				onAddElement({
					...baseElement,
					fill: '#3B82F6',
					stroke: 'transparent',
					strokeWidth: 0,
					cornerRadius: 0,
				} as CanvasElement);
				break;
			case 'circle':
				onAddElement({
					...baseElement,
					fill: '#10B981',
					stroke: 'transparent',
					strokeWidth: 0,
				} as CanvasElement);
				break;
		}
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			className="p-4"
		>
			{/* Header */}
			<div className="mb-6">
				<h3 className="text-lg font-semibold text-gray-900 mb-2">Elements</h3>
				<p className="text-sm text-gray-600">Click elements to add them to the canvas</p>
			</div>

			{/* Basic Elements */}
			<div className="mb-6">
				<h4 className="text-sm font-medium text-gray-700 mb-3 uppercase tracking-wide">Basic</h4>
				<div className="grid grid-cols-4 gap-2">
					{elementTypes
						.filter(element => element.category === 'Basic')
						.map(element => (
							<motion.button
								key={element.id}
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
								onClick={() => createElement(element.id)}
								className="p-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors group"
								title={element.description}
							>
								<element.icon className="w-5 h-5 text-gray-600 mx-auto" />
							</motion.button>
						))}
				</div>
			</div>

			{/* Shapes */}
			<div className="mb-6">
				<h4 className="text-sm font-medium text-gray-700 mb-3 uppercase tracking-wide">Shapes</h4>
				<div className="grid grid-cols-4 gap-2">
					{elementTypes
						.filter(element => element.category === 'Shapes')
						.map(element => (
							<motion.button
								key={element.id}
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.95 }}
								onClick={() => createElement(element.id)}
								className="p-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors group"
								title={element.description}
							>
								<element.icon className="w-5 h-5 text-gray-600 mx-auto" />
							</motion.button>
						))}
				</div>
			</div>
		</motion.div>
	);
}