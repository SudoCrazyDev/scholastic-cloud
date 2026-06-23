import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
	Type,
	Image as ImageIcon,
	FileText,
	Square,
	Circle as CircleIcon,
	Building2,
	Hash,
	MapPin,
	Globe,
	User,
	BookUser,
	PanelLeftClose,
	QrCode,
	ChevronDown,
	ChevronRight,
	GraduationCap,
	Users,
	IdCard,
	Home,
	Phone,
	Briefcase,
	Languages,
	School,
} from 'lucide-react';
import { type CanvasElement } from './IdCardCanvas';
import type { Institution } from '@/types';

interface ElementsPanelProps {
	institution?: Institution | null;
	onAddElement: (element: CanvasElement) => void;
	onCollapse?: () => void;
}

const BASIC_ELEMENTS = [
	{ id: 'text', name: 'Text', icon: Type },
	{ id: 'paragraph', name: 'Paragraph', icon: FileText },
	{ id: 'image', name: 'Image', icon: ImageIcon },
	{ id: 'rectangle', name: 'Box', icon: Square },
	{ id: 'circle', name: 'Circle', icon: CircleIcon },
];

const INSTITUTION_VARIABLES: Array<{
	id: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	type: 'text' | 'image';
	variableKey: string;
	getContent?: (inst?: Institution | null) => string;
}> = [
	{ id: 'var-logo', label: 'Logo', icon: ImageIcon, type: 'image', variableKey: 'logo' },
	{ id: 'var-institution-title', label: 'Institution Name', icon: Building2, type: 'text', variableKey: 'institution_title', getContent: (inst) => inst?.title ?? 'Institution Name' },
	{ id: 'var-government-id', label: 'Government ID', icon: Hash, type: 'text', variableKey: 'gov_id', getContent: (inst) => inst?.gov_id ?? 'Government ID' },
	{ id: 'var-division', label: 'Division', icon: MapPin, type: 'text', variableKey: 'division', getContent: (inst) => inst?.division ?? 'Division' },
	{ id: 'var-region', label: 'Region', icon: Globe, type: 'text', variableKey: 'region', getContent: (inst) => inst?.region ?? 'Region' },
	{ id: 'var-address', label: 'Address', icon: MapPin, type: 'text', variableKey: 'address', getContent: (inst) => inst?.address ?? 'Address' },
];

const STUDENT_VARIABLES: Array<{
	key: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	type: 'text' | 'qr' | 'photo';
}> = [
	{ key: 'profile_picture', label: 'Student Photo', icon: User, type: 'photo' },
	{ key: 'full_name', label: 'Full Name', icon: User, type: 'text' },
	{ key: 'first_name', label: 'First Name', icon: User, type: 'text' },
	{ key: 'middle_name', label: 'Middle Name', icon: User, type: 'text' },
	{ key: 'middle_initial', label: 'Middle Initial', icon: User, type: 'text' },
	{ key: 'last_name', label: 'Last Name', icon: User, type: 'text' },
	{ key: 'extension', label: 'Extension (Jr., III)', icon: User, type: 'text' },
	{ key: 'grade_level', label: 'Grade Level', icon: GraduationCap, type: 'text' },
	{ key: 'section', label: 'Section', icon: Users, type: 'text' },
	{ key: 'lrn', label: 'LRN', icon: Hash, type: 'text' },
	{ key: 'gender', label: 'Gender', icon: User, type: 'text' },
	{ key: 'religion', label: 'Religion', icon: BookUser, type: 'text' },
	{ key: 'lrn_qr', label: 'LRN QR Code', icon: QrCode, type: 'qr' },
];

// Family & Background — resolved from the student's normalized admission records.
const FAMILY_VARIABLES: Array<{
	key: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	type: 'text';
}> = [
	{ key: 'complete_address', label: 'Address', icon: Home, type: 'text' },
	{ key: 'mobile_number', label: 'Mobile Number', icon: Phone, type: 'text' },
	{ key: 'place_of_birth', label: 'Place of Birth', icon: MapPin, type: 'text' },
	{ key: 'mother_tongue', label: 'Mother Tongue', icon: Languages, type: 'text' },
	{ key: 'last_school_attended', label: 'Last School Attended', icon: School, type: 'text' },
	{ key: 'father_name', label: "Father's Name", icon: User, type: 'text' },
	{ key: 'father_occupation', label: "Father's Occupation", icon: Briefcase, type: 'text' },
	{ key: 'mother_name', label: "Mother's Name", icon: User, type: 'text' },
	{ key: 'mother_occupation', label: "Mother's Occupation", icon: Briefcase, type: 'text' },
	{ key: 'emergency_contact_name', label: 'Emergency Contact', icon: User, type: 'text' },
	{ key: 'emergency_contact_number', label: 'Emergency Number', icon: Phone, type: 'text' },
	{ key: 'emergency_contact_relationship', label: 'Emergency Relationship', icon: Users, type: 'text' },
];

export default function IdElementsPanel({ institution, onAddElement, onCollapse }: ElementsPanelProps) {
	const [elementsOpen, setElementsOpen] = useState(true);
	const [institutionOpen, setInstitutionOpen] = useState(true);
	const [studentOpen, setStudentOpen] = useState(true);
	const [familyOpen, setFamilyOpen] = useState(false);

	const baseElement = () => ({
		id: crypto.randomUUID(),
		x: 40,
		y: 40,
		rotation: 0,
		opacity: 1,
		hidden: false,
		locked: false,
		zIndex: 0,
	});

	const createElement = (type: string) => {
		const base = baseElement();
		switch (type) {
			case 'text':
				onAddElement({ ...base, type, width: 180, height: 28, content: 'Sample Text', fontSize: 18, fontFamily: 'Arial', fontWeight: 'normal', fontStyle: 'normal', color: '#000000', textAlign: 'left' } as CanvasElement);
				break;
			case 'paragraph':
				onAddElement({ ...base, type, width: 220, height: 80, content: 'Sample paragraph text.', fontSize: 12, fontFamily: 'Arial', fontWeight: 'normal', fontStyle: 'normal', color: '#000000', textAlign: 'left' } as CanvasElement);
				break;
			case 'image':
				onAddElement({ ...base, type, width: 140, height: 100, src: '', alt: 'Image', objectFit: 'cover', cornerRadius: 0 } as CanvasElement);
				break;
			case 'rectangle':
				onAddElement({ ...base, type, width: 160, height: 60, fill: '#1e3a8a', stroke: 'transparent', strokeWidth: 0, cornerRadius: 0 } as CanvasElement);
				break;
			case 'circle':
				onAddElement({ ...base, type, width: 80, height: 80, fill: '#10B981', stroke: 'transparent', strokeWidth: 0 } as CanvasElement);
				break;
		}
	};

	const addInstitutionVariable = (variable: (typeof INSTITUTION_VARIABLES)[number]) => {
		const base = baseElement();
		if (variable.type === 'text') {
			const content = variable.getContent?.(institution) ?? variable.label;
			onAddElement({
				...base,
				type: 'text',
				width: 200,
				height: 28,
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
				...base,
				type: 'image',
				width: 90,
				height: 90,
				src: institution?.logo ?? '',
				alt: variable.label,
				objectFit: 'contain',
				variableType: 'institution',
				variableKey: variable.variableKey,
			} as CanvasElement);
		}
	};

	const addStudentVariable = (variable: (typeof STUDENT_VARIABLES)[number]) => {
		const base = baseElement();
		const placeholder = `{${variable.key}}`;

		if (variable.type === 'photo') {
			onAddElement({
				...base,
				type: 'photo',
				width: 140,
				height: 170,
				alt: 'Student photo',
				objectFit: 'cover',
				fill: '#e5e7eb',
				stroke: '#cbd5e1',
				strokeWidth: 1,
				cornerRadius: 4,
				variableType: 'student',
				variableKey: 'profile_picture',
			} as CanvasElement);
		} else if (variable.type === 'qr') {
			onAddElement({
				...base,
				type: 'qr',
				width: 100,
				height: 100,
				content: '{lrn}',
				variableType: 'student',
				variableKey: 'lrn',
			} as CanvasElement);
		} else {
			onAddElement({
				...base,
				type: 'text',
				width: 200,
				height: 28,
				content: placeholder,
				fontSize: 14,
				fontFamily: 'Arial',
				fontWeight: 'normal',
				fontStyle: 'normal',
				color: '#000000',
				textAlign: 'left',
				variableType: 'student',
				variableKey: variable.key,
				...(variable.key === 'full_name' && { nameFormat: 'first_last' as const }),
			} as CanvasElement);
		}
	};

	const SectionHeader = ({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) => (
		<button
			type="button"
			onClick={onToggle}
			className="w-full flex items-center gap-2 py-2 px-1 text-left hover:bg-gray-50 rounded-md transition-colors"
		>
			{open ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
			<h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{label}</h4>
		</button>
	);

	return (
		<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-4 h-full flex flex-col min-w-[200px]">
			<div className="mb-4 pb-3 border-b border-gray-200 flex items-start justify-between gap-2">
				<div>
					<h3 className="text-base font-semibold text-gray-900 mb-0.5 flex items-center gap-2">
						<IdCard className="w-4 h-4 text-indigo-600" />
						Elements
					</h3>
					<p className="text-xs text-gray-500 ml-6">Add to card</p>
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
				{/* Basic elements */}
				<div className="border-b border-gray-200">
					<SectionHeader open={elementsOpen} onToggle={() => setElementsOpen((o) => !o)} label="Basic" />
					<AnimatePresence initial={false}>
						{elementsOpen && (
							<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
								<div className="grid grid-cols-3 gap-2 pb-3">
									{BASIC_ELEMENTS.map((element) => (
										<motion.button
											key={element.id}
											whileHover={{ scale: 1.05, y: -2 }}
											whileTap={{ scale: 0.95 }}
											onClick={() => createElement(element.id)}
											className="flex flex-col items-center gap-2 p-2.5 bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-all group shadow-sm hover:shadow-md"
											title={`Add ${element.name}`}
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

				{/* Institution variables */}
				<div className="border-b border-gray-200">
					<SectionHeader open={institutionOpen} onToggle={() => setInstitutionOpen((o) => !o)} label="Institution" />
					<AnimatePresence initial={false}>
						{institutionOpen && (
							<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
								<div className="space-y-1.5 pb-3">
									{INSTITUTION_VARIABLES.map((variable) => {
										const Icon = variable.icon;
										return (
											<motion.button
												key={variable.id}
												whileHover={{ scale: 1.02, x: 2 }}
												whileTap={{ scale: 0.98 }}
												onClick={() => addInstitutionVariable(variable)}
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

				{/* Student variables */}
				<div className="border-b border-gray-200 last:border-b-0">
					<SectionHeader open={studentOpen} onToggle={() => setStudentOpen((o) => !o)} label="Student" />
					<AnimatePresence initial={false}>
						{studentOpen && (
							<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
								<p className="text-[10px] text-gray-400 mb-2 px-1">Bound to selected student</p>
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
												title={`Add ${variable.label}`}
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

				{/* Family & Background variables */}
				<div className="border-b border-gray-200 last:border-b-0">
					<SectionHeader open={familyOpen} onToggle={() => setFamilyOpen((o) => !o)} label="Family & Background" />
					<AnimatePresence initial={false}>
						{familyOpen && (
							<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
								<p className="text-[10px] text-gray-400 mb-2 px-1">Bound to selected student</p>
								<div className="space-y-1.5 pb-3">
									{FAMILY_VARIABLES.map((variable) => {
										const Icon = variable.icon;
										return (
											<motion.button
												key={variable.key}
												whileHover={{ scale: 1.02, x: 2 }}
												whileTap={{ scale: 0.98 }}
												onClick={() => addStudentVariable(variable)}
												className="w-full flex items-center gap-2.5 p-2.5 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 border border-amber-200/50 hover:border-amber-300 rounded-lg transition-all text-left shadow-sm hover:shadow"
												title={`Add ${variable.label}`}
											>
												<div className="w-6 h-6 bg-white rounded-md flex items-center justify-center shadow-sm">
													<Icon className="w-3.5 h-3.5 text-amber-600" />
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
