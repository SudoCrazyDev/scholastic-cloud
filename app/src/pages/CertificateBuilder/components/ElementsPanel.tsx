import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Type, Image, FileText, Building2, Hash, MapPin, Globe, ImageIcon, User, BookUser, PanelLeftClose, QrCode, ChevronDown, ChevronRight } from 'lucide-react';
import { type CanvasElement } from './CertificateCanvas';
import type { Institution } from '@/types';

interface ElementsPanelProps {
	institution?: Institution | null;
	onAddElement: (element: CanvasElement) => void;
	onCollapse?: () => void;
}

const elementTypes = [
	{ id: 'text', name: 'Text', icon: Type, description: 'Add text elements with customizable fonts and colors', category: 'Basic' },
	{ id: 'paragraph', name: 'Paragraph', icon: FileText, description: 'Add rich text paragraphs with WYSIWYG editing', category: 'Basic' },
	{ id: 'image', name: 'Image', icon: Image, description: 'Insert and manipulate images', category: 'Basic' }
];

const VARIABLES: Array<{
	id: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	type: 'text' | 'image';
	variableKey: string;
	getContent?: (inst?: Institution | null) => string;
}> = [
	{ id: 'var-institution-title', label: 'Institution Title', icon: Building2, type: 'text', variableKey: 'institution_title', getContent: (inst) => inst?.title ?? 'Institution Title' },
	{ id: 'var-government-id', label: 'Government ID', icon: Hash, type: 'text', variableKey: 'gov_id', getContent: (inst) => inst?.gov_id ?? 'Government ID' },
	{ id: 'var-division', label: 'Division', icon: MapPin, type: 'text', variableKey: 'division', getContent: (inst) => inst?.division ?? 'Division' },
	{ id: 'var-region', label: 'Region', icon: Globe, type: 'text', variableKey: 'region', getContent: (inst) => inst?.region ?? 'Region' },
	{ id: 'var-address', label: 'Address', icon: MapPin, type: 'text', variableKey: 'address', getContent: (inst) => inst?.address ?? 'Address' },
	{ id: 'var-logo', label: 'Logo', icon: ImageIcon, type: 'image', variableKey: 'logo' },
];

/** Student elements – text placeholders like {middle_name}, or QR (LRN QR); data binding ready for future student implementation */
const STUDENT_VARIABLES: Array<{ key: string; label: string; icon: React.ComponentType<{ className?: string }>; type: 'text' | 'qr' }> = [
	{ key: 'lrn', label: 'LRN', icon: Hash, type: 'text' },
	{ key: 'first_name', label: 'First Name', icon: User, type: 'text' },
	{ key: 'middle_name', label: 'Middle Name', icon: User, type: 'text' },
	{ key: 'last_name', label: 'Last Name', icon: User, type: 'text' },
	{ key: 'extension', label: 'Extension', icon: User, type: 'text' },
	{ key: 'gender', label: 'Gender', icon: User, type: 'text' },
	{ key: 'religion', label: 'Religion', icon: BookUser, type: 'text' },
	{ key: 'lrn_qr', label: 'LRN QR', icon: QrCode, type: 'qr' },
];

export default function ElementsPanel({ institution, onAddElement, onCollapse }: ElementsPanelProps) {
	const [elementsOpen, setElementsOpen] = useState(true);
	const [variablesOpen, setVariablesOpen] = useState(true);
	const [studentOpen, setStudentOpen] = useState(true);

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
					height: 30,
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

	const addVariable = (variable: (typeof VARIABLES)[number]) => {
		const baseElement = {
			id: crypto.randomUUID(),
			x: 100,
			y: 100,
			width: variable.type === 'image' ? 120 : 200,
			height: variable.type === 'image' ? 120 : 30,
			rotation: 0,
			opacity: 1,
			hidden: false,
			locked: false,
			zIndex: 0,
		};
		if (variable.type === 'text') {
			const content = variable.getContent?.(institution) ?? variable.label;
			onAddElement({
				...baseElement,
				type: 'text',
				content,
				fontSize: 14,
				fontFamily: 'Arial',
				fontWeight: 'normal',
				fontStyle: 'normal',
				color: '#000000',
				textAlign: 'left',
				variableType: 'institution',
				variableKey: variable.variableKey,
			} as CanvasElement);
		} else {
			onAddElement({
				...baseElement,
				type: 'image',
				src: institution?.logo ?? '',
				alt: variable.label,
				objectFit: 'contain',
				variableType: 'institution',
				variableKey: variable.variableKey,
			} as CanvasElement);
		}
	};

	const addStudentVariable = (variable: (typeof STUDENT_VARIABLES)[number]) => {
		const placeholder = `{${variable.key}}`;
		if (variable.type === 'qr') {
			// LRN QR – encodes LRN in a QR code; when binding to student, content is replaced with actual LRN
			onAddElement({
				id: crypto.randomUUID(),
				type: 'qr',
				x: 100,
				y: 100,
				width: 120,
				height: 120,
				rotation: 0,
				opacity: 1,
				hidden: false,
				locked: false,
				zIndex: 0,
				content: placeholder,
				variableType: 'student',
				variableKey: 'lrn',
			} as CanvasElement);
		} else {
			onAddElement({
				id: crypto.randomUUID(),
				type: 'text',
				x: 100,
				y: 100,
				width: 200,
				height: 30,
				rotation: 0,
				opacity: 1,
				hidden: false,
				locked: false,
				zIndex: 0,
				content: placeholder,
				fontSize: 14,
				fontFamily: 'Arial',
				fontWeight: 'normal',
				fontStyle: 'normal',
				color: '#000000',
				textAlign: 'left',
				variableType: 'student',
				variableKey: variable.key,
			} as CanvasElement);
		}
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			className="p-4 h-full flex flex-col min-w-[200px]"
		>
			{/* Header with collapse */}
			<div className="mb-4 pb-3 border-b border-gray-200 flex items-start justify-between gap-2">
				<div>
					<h3 className="text-base font-semibold text-gray-900 mb-0.5 flex items-center gap-2">
						<div className="w-1.5 h-4 bg-indigo-600 rounded-full flex-shrink-0" />
						Elements
					</h3>
					<p className="text-xs text-gray-500 ml-4">Add to canvas</p>
				</div>
				{onCollapse && (
					<button
						type="button"
						onClick={onCollapse}
						className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
						title="Hide panel (more canvas space)"
					>
						<PanelLeftClose className="w-4 h-4" />
					</button>
				)}
			</div>

			<div className="flex-1 overflow-y-auto space-y-1">
				{/* Elements - collapsible */}
				<div className="border-b border-gray-200 last:border-b-0">
					<button
						type="button"
						onClick={() => setElementsOpen((o) => !o)}
						className="w-full flex items-center gap-2 py-2 px-1 text-left hover:bg-gray-50 rounded-md transition-colors"
					>
						{elementsOpen ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
						<h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Elements</h4>
					</button>
					<AnimatePresence initial={false}>
						{elementsOpen && (
							<motion.div
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: 'auto', opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{ duration: 0.2 }}
								className="overflow-hidden"
							>
								<div className="grid grid-cols-3 gap-2 pb-3">
									{elementTypes.map(element => (
										<motion.button
											key={element.id}
											whileHover={{ scale: 1.05, y: -2 }}
											whileTap={{ scale: 0.95 }}
											onClick={() => createElement(element.id)}
											className="flex flex-col items-center gap-2 p-2.5 bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-all group shadow-sm hover:shadow-md"
											title={element.description}
										>
											<element.icon className="w-5 h-5 text-gray-700 group-hover:text-indigo-600 transition-colors" />
											<span className="text-[10px] font-medium text-gray-600 group-hover:text-indigo-700">{element.name}</span>
										</motion.button>
									))}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				{/* Variables - collapsible */}
				<div className="border-b border-gray-200 last:border-b-0">
					<button
						type="button"
						onClick={() => setVariablesOpen((o) => !o)}
						className="w-full flex items-center gap-2 py-2 px-1 text-left hover:bg-gray-50 rounded-md transition-colors"
					>
						{variablesOpen ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
						<h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Variables</h4>
					</button>
					<AnimatePresence initial={false}>
						{variablesOpen && (
							<motion.div
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: 'auto', opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{ duration: 0.2 }}
								className="overflow-hidden"
							>
								<p className="text-[10px] text-gray-400 mb-2 px-1">Institution data</p>
								<div className="space-y-1.5 pb-3">
									{VARIABLES.map((variable) => {
										const Icon = variable.icon;
										return (
											<motion.button
												key={variable.id}
												whileHover={{ scale: 1.02, x: 2 }}
												whileTap={{ scale: 0.98 }}
												onClick={() => addVariable(variable)}
												className="w-full flex items-center gap-2.5 p-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200/50 hover:border-indigo-300 rounded-lg transition-all text-left shadow-sm hover:shadow"
												title={`Add ${variable.label}`}
											>
												<div className="w-6 h-6 bg-white rounded-md flex items-center justify-center shadow-sm">
													<Icon className="w-3.5 h-3.5 text-indigo-600" />
												</div>
												<span className="text-xs font-medium text-gray-700 truncate">{variable.label}</span>
											</motion.button>
										);
									})}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				{/* Student - collapsible */}
				<div className="border-b border-gray-200 last:border-b-0">
					<button
						type="button"
						onClick={() => setStudentOpen((o) => !o)}
						className="w-full flex items-center gap-2 py-2 px-1 text-left hover:bg-gray-50 rounded-md transition-colors"
					>
						{studentOpen ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
						<h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Student</h4>
					</button>
					<AnimatePresence initial={false}>
						{studentOpen && (
							<motion.div
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: 'auto', opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{ duration: 0.2 }}
								className="overflow-hidden"
							>
								<p className="text-[10px] text-gray-400 mb-2 px-1">Placeholders & LRN QR</p>
								<div className="space-y-1.5 pb-3">
									{STUDENT_VARIABLES.map((variable) => {
										const Icon = variable.icon;
										return (
											<motion.button
												key={`${variable.key}-${variable.type}`}
												whileHover={{ scale: 1.02, x: 2 }}
												whileTap={{ scale: 0.98 }}
												onClick={() => addStudentVariable(variable)}
												className="w-full flex items-center gap-2.5 p-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 border border-emerald-200/50 hover:border-emerald-300 rounded-lg transition-all text-left shadow-sm hover:shadow"
												title={`Add {${variable.key}}`}
											>
												<div className="w-6 h-6 bg-white rounded-md flex items-center justify-center shadow-sm">
													<Icon className="w-3.5 h-3.5 text-emerald-600" />
												</div>
												<span className="text-xs font-medium text-gray-700 truncate">{variable.label}</span>
											</motion.button>
										);
									})}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</div>
		</motion.div>
	);
}