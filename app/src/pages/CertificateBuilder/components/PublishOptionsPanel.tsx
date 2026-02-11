import React, { useState } from 'react';
import * as Headless from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ChevronDown, ChevronRight } from 'lucide-react';
import { Select } from '@/components/select';
import { Switch, SwitchField } from '@/components/switch';

export type StudentScope = 'all' | 'limited';

export interface PublishOptions {
	scopeGradeLevelsOnly: boolean;
	gradeLevels: string[];
	studentScope: StudentScope;
}

/** Grade levels 1–12 (string to match class_sections.grade_level) */
export const GRADE_LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

const GRADE_LEVEL_OPTIONS = GRADE_LEVELS.map((g) => ({ value: g, label: `Grade ${g}` }));

interface PublishOptionsPanelProps {
	options: PublishOptions;
	onChange: (options: PublishOptions) => void;
}

const PublishOptionsPanel: React.FC<PublishOptionsPanelProps> = ({ options, onChange }) => {
	const [collapsed, setCollapsed] = useState(false);

	const handleGradeLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
		const gradeLevels = selected.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
		onChange({
			...options,
			scopeGradeLevelsOnly: gradeLevels.length > 0,
			gradeLevels,
		});
	};

	const setStudentScopeLimited = (checked: boolean) => {
		onChange({ ...options, studentScope: checked ? 'limited' : 'all' });
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			className="border-b border-gray-200"
		>
			<button
				type="button"
				onClick={() => setCollapsed(!collapsed)}
				className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
			>
				<div className="flex items-center gap-2">
					{collapsed ? (
						<ChevronRight className="w-4 h-4 text-gray-500" />
					) : (
						<ChevronDown className="w-4 h-4 text-gray-500" />
					)}
					<Send className="w-4 h-4 text-gray-600" />
					<span className="text-sm font-semibold text-gray-900">Publish options</span>
				</div>
			</button>

			<AnimatePresence initial={false}>
				{!collapsed && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="overflow-hidden"
					>
						<div className="px-4 pb-4 space-y-4">
							{/* Only for selected Grade Level – multi-select */}
							<div className="space-y-2">
								<label className="block text-sm font-medium text-gray-700">Only for selected Grade Level</label>
								<Select
									multiple
									options={GRADE_LEVEL_OPTIONS}
									value={options.gradeLevels}
									onChange={handleGradeLevelChange}
									placeholder="Select grade levels..."
									className="min-h-[80px] text-sm border-gray-300 rounded-lg"
								/>
								{options.gradeLevels.length > 0 && (
									<p className="text-xs text-gray-500">
										{options.gradeLevels.length} selected. Hold Ctrl/Cmd to select multiple.
									</p>
								)}
							</div>

							{/* Limited Students – switch */}
							<SwitchField className="flex flex-row items-center justify-between gap-4">
								<Headless.Label data-slot="label" className="text-sm font-medium text-gray-700 cursor-pointer">
									Limited Students
								</Headless.Label>
								<Switch
									checked={options.studentScope === 'limited'}
									onChange={setStudentScopeLimited}
								/>
							</SwitchField>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
};

export default PublishOptionsPanel;
