import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
	Download, 
	Save, 
	Undo, 
	Redo, 
	Settings,
	Grid,
	Ruler,
	Magnet,
	FileText,
	Image,
	Palette,
	ArrowLeft
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import { useCreateCertificate, useUpdateCertificate } from '@/hooks/useCertificates';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'react-hot-toast';

interface CertificateToolbarProps {
	paper: string;
	orientation: 'portrait' | 'landscape';
	zoom: number;
	bgColor: string;
	bgImage: string | null;
	bgImageObjectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
	title: string;
	certificateId: number | string | null;
	onPaperChange: (paper: string) => void;
	onOrientationChange: (orientation: 'portrait' | 'landscape') => void;
	onZoomChange: (zoom: number) => void;
	onBgColorChange: (color: string) => void;
	onBgImageChange: (image: string | null) => void;
	onBgImageObjectFitChange?: (value: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down') => void;
	onTitleChange: (title: string) => void;
	onExportPdf: () => void;
	onUndo: () => void;
	onRedo: () => void;
	onToggleGrid: () => void;
	onToggleRuler: () => void;
	onToggleSnapping: () => void;
	showGrid: boolean;
	showRuler: boolean;
	snapping: boolean;
	canUndo: boolean;
	canRedo: boolean;
	designData: any;
	onBackToList?: () => void;
}

const CertificateToolbar: React.FC<CertificateToolbarProps> = ({
	paper,
	orientation,
	zoom,
	bgColor,
	bgImage,
	bgImageObjectFit,
	title,
	certificateId,
	onPaperChange,
	onOrientationChange,
	onZoomChange,
	onBgColorChange,
	onBgImageChange,
	onBgImageObjectFitChange,
	onTitleChange,
	onExportPdf,
	onUndo,
	onRedo,
	onToggleGrid,
	onToggleRuler,
	onToggleSnapping,
	showGrid,
	showRuler,
	snapping,
	canUndo,
	canRedo,
	designData,
	onBackToList
}) => {
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const { user } = useAuth();
	const createCertificate = useCreateCertificate();
	const updateCertificate = useUpdateCertificate();

	// Get user's default institution
	const defaultInstitution = user?.user_institutions?.find((ui: any) => ui.is_default)?.institution;
	const mainInstitution = user?.user_institutions?.find((ui: any) => ui.is_main)?.institution;
	const currentInstitution = defaultInstitution || mainInstitution;

	const handleSave = async () => {
		if (!currentInstitution) {
			toast.error('No institution access. Please contact your administrator.');
			return;
		}

		if (!title.trim()) {
			toast.error('Please enter a certificate title');
			return;
		}

		setIsSaving(true);
		try {
			if (certificateId) {
				await updateCertificate.mutateAsync({
					id: certificateId,
					payload: { title, design_json: designData }
				});
			} else {
				await createCertificate.mutateAsync({
					title,
					design_json: designData,
					institution_id: currentInstitution.id
				});
			}
		} catch (error) {
			console.error('Save failed:', error);
		} finally {
			setIsSaving(false);
		}
	};

	const handleBgImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		
		const reader = new FileReader();
		reader.onload = () => onBgImageChange(reader.result as string);
		reader.readAsDataURL(file);
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: -20 }}
			animate={{ opacity: 1, y: 0 }}
			className="bg-gradient-to-r from-white to-gray-50 border-b border-gray-200 shadow-sm"
		>
			<div className="px-4 py-3">
				{/* Top Row - Actions + Title */}
				<div className="flex items-center gap-3 mb-3">
					{/* Back to list + Primary Actions */}
					<div className="flex items-center gap-2">
						{onBackToList && (
							<Button
								onClick={onBackToList}
								icon={<ArrowLeft className="w-4 h-4" />}
								variant="ghost"
								size="sm"
								title="Back to certificate list"
							>
								Back to list
							</Button>
						)}
						<Button
							onClick={handleSave}
							icon={<Save className="w-4 h-4" />}
							variant="primary"
							loading={isSaving}
							size="sm"
						>
							{certificateId ? 'Update' : 'Save'}
						</Button>
						
						<Button
							onClick={onExportPdf}
							icon={<Download className="w-4 h-4" />}
							variant="secondary"
							size="sm"
						>
							Export PDF
						</Button>
					</div>
					
					{/* Title Input - flex-1 for maximum space */}
					<div className="flex-1 min-w-[200px]">
						<Input
							value={title}
							onChange={(e) => onTitleChange(e.target.value)}
							placeholder="Certificate title..."
							icon={<FileText className="w-4 h-4" />}
						/>
					</div>
					
					{/* History Controls */}
					<div className="flex items-center gap-1 border-l border-gray-300 pl-3">
						<Button
							onClick={onUndo}
							disabled={!canUndo}
							icon={<Undo className="w-3.5 h-3.5" />}
							variant="ghost"
							size="sm"
							title="Undo"
							className="!h-8 !px-2"
						/>
						<Button
							onClick={onRedo}
							disabled={!canRedo}
							icon={<Redo className="w-3.5 h-3.5" />}
							variant="ghost"
							size="sm"
							title="Redo"
							className="!h-8 !px-2"
						/>
					</div>
				</div>

				{/* Settings Row - compact, organized */}
				<div className="flex flex-wrap items-end gap-3 text-sm">
					{/* View Options */}
					<div className="flex flex-col gap-1.5">
						<span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1">View</span>
						<div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 h-10">
							<label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer hover:text-gray-900 transition-colors">
								<input
									type="checkbox"
									checked={snapping}
									onChange={onToggleSnapping}
									className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
								/>
								<Magnet className="w-3.5 h-3.5" />
								<span>Snap</span>
							</label>
							
							<div className="w-px h-4 bg-gray-300" />
							
							<label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer hover:text-gray-900 transition-colors">
								<input
									type="checkbox"
									checked={showGrid}
									onChange={onToggleGrid}
									className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
								/>
								<Grid className="w-3.5 h-3.5" />
								<span>Grid</span>
							</label>

							<div className="w-px h-4 bg-gray-300" />

							<label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer hover:text-gray-900 transition-colors">
								<input
									type="checkbox"
									checked={showRuler}
									onChange={onToggleRuler}
									className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
								/>
								<Ruler className="w-3.5 h-3.5" />
								<span>Ruler</span>
							</label>
						</div>
					</div>

					{/* Paper Controls */}
					<div className="flex flex-col gap-1.5">
						<span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1">Paper</span>
						<div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 h-10">
							<div className="w-20">
								<Select
									value={paper}
									onChange={(e) => onPaperChange(e.target.value)}
									className="text-xs"
								>
									<option value="a4">A4</option>
									<option value="letter">Letter</option>
									<option value="legal">Legal</option>
								</Select>
							</div>

							<div className="w-28">
								<Select
									value={orientation}
									onChange={(e) => onOrientationChange(e.target.value as 'portrait' | 'landscape')}
									className="text-xs"
								>
									<option value="portrait">Portrait</option>
									<option value="landscape">Landscape</option>
								</Select>
							</div>

							<div className="w-20">
								<Select
									value={String(zoom)}
									onChange={(e) => onZoomChange(Number(e.target.value))}
									className="text-xs"
								>
									{[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(z => (
										<option key={z} value={z}>
											{Math.round(z * 100)}%
										</option>
									))}
								</Select>
							</div>
						</div>
					</div>

					{/* Background Settings - horizontal with divider */}
					<div className="flex flex-col gap-1.5">
						<span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1">Background</span>
						<div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 h-10">
							{/* Color Picker */}
							<div className="flex items-center gap-2">
								<Palette className="w-3.5 h-3.5 text-gray-500" />
								<input
									type="color"
									value={bgColor}
									onChange={(e) => onBgColorChange(e.target.value)}
									className="h-6 w-6 p-0 border border-gray-300 rounded cursor-pointer"
									title="Background color"
								/>
							</div>

							<div className="w-px h-5 bg-gray-300" />

							{/* Image Upload */}
							<div className="flex items-center gap-2">
								<label className="flex items-center gap-1.5 px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 cursor-pointer text-xs text-gray-600 h-6">
									<Image className="w-3.5 h-3.5 text-gray-500" />
									<span className="truncate">{bgImage ? 'Change' : 'Upload'}</span>
									<input
										type="file"
										accept="image/*"
										onChange={handleBgImageChange}
										className="hidden"
										title="Background image"
									/>
								</label>
								{bgImage && (
									<>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => onBgImageChange(null)}
											className="!h-6 !px-2 text-xs"
											title="Remove image"
										>
											×
										</Button>
										{onBgImageObjectFitChange && (
											<div className="w-24">
												<Select
													value={bgImageObjectFit ?? 'cover'}
													onChange={(e) => onBgImageObjectFitChange(e.target.value as 'cover' | 'contain' | 'fill' | 'none' | 'scale-down')}
													className="text-xs"
												>
													<option value="cover">Cover</option>
													<option value="contain">Contain</option>
													<option value="fill">Fill</option>
													<option value="none">None</option>
													<option value="scale-down">Scale Down</option>
												</Select>
											</div>
										)}
									</>
								)}
							</div>
						</div>
					</div>

					{/* Advanced Toggle */}
					<Button
						onClick={() => setShowAdvanced(!showAdvanced)}
						icon={<Settings className="w-4 h-4" />}
						variant="ghost"
						size="sm"
					>
						Advanced
					</Button>
				</div>

				{/* Advanced Settings */}
				<AnimatePresence>
					{showAdvanced && (
						<motion.div
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: 'auto' }}
							exit={{ opacity: 0, height: 0 }}
							className="mt-4 pt-4 border-t border-gray-200"
						>
							<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-2">
										Canvas Width
									</label>
									<Input
										type="number"
										value={paper === 'a4' ? (orientation === 'portrait' ? 794 : 1123) : 
											   paper === 'letter' ? (orientation === 'portrait' ? 816 : 1056) : 
											   (orientation === 'portrait' ? 816 : 1344)}
										disabled
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-2">
										Canvas Height
									</label>
									<Input
										type="number"
										value={paper === 'a4' ? (orientation === 'portrait' ? 1123 : 794) : 
											   paper === 'letter' ? (orientation === 'portrait' ? 1056 : 816) : 
											   (orientation === 'portrait' ? 1344 : 816)}
										disabled
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-2">
										Scale Factor
									</label>
									<Input
										type="number"
										value={zoom}
										onChange={(e) => onZoomChange(Number(e.target.value))}
										step={0.1}
										min={0.1}
										max={3}
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-2">
										Institution
									</label>
									<Input
										value={currentInstitution?.name || 'No access'}
										disabled
									/>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</motion.div>
	);
};

export default CertificateToolbar;
