import React, { useState } from 'react';
import * as Headless from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ChevronDown, ChevronRight } from 'lucide-react';
import { Switch, SwitchField } from '@/components/switch';

export type StudentScope = 'all' | 'limited';

export interface PublishOptions {
	scopeGradeLevelsOnly: boolean;
	gradeLevels: string[];
	studentScope: StudentScope;
}

/** Grade levels 1–12 (string to match class_sections.grade_level) */
export const GRADE_LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

interface PublishOptionsPanelProps {
	options: PublishOptions;
	onChange: (options: PublishOptions) => void;
}

const PublishOptionsPanel: React.FC<PublishOptionsPanelProps> = ({ options, onChange }) => {
	const [collapsed, setCollapsed] = useState(false);

	const toggleGradeLevel = (grade: string) => {
		const current = options.gradeLevels.includes(grade)
			? options.gradeLevels.filter((g) => g !== grade)
			: [...options.gradeLevels, grade].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
		onChange({
			...options,
			scopeGradeLevelsOnly: current.length > 0,
			gradeLevels: current,
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
							{/* Only for selected Grade Level – checkboxes */}
							<div className="space-y-2">
								<label className="block text-sm font-medium text-gray-700">Only for selected Grade Level</label>
								<div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto py-1.5 px-2 border border-gray-200 rounded-lg bg-gray-50/50">
									{GRADE_LEVELS.map((grade) => (
										<label
											key={grade}
											className="flex items-center gap-3 py-2 px-2.5 rounded-md hover:bg-gray-100/80 cursor-pointer text-sm text-gray-700 transition-colors duration-150"
										>
											<input
												type="checkbox"
												checked={options.gradeLevels.includes(grade)}
												onChange={() => toggleGradeLevel(grade)}
												className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-0 transition-all duration-200 ease-out cursor-pointer"
											/>
											<span>Grade {grade}</span>
										</label>
									))}
								</div>
								{options.gradeLevels.length > 0 && (
									<p className="text-xs text-gray-500">
										{options.gradeLevels.length} selected.
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
