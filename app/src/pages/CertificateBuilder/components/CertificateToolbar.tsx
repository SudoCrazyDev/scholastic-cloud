import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
	Download, 
	Save, 
	Undo, 
	Redo, 
	Settings,
	Grid,
	Magnet,
	FileText,
	Image,
	Palette
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
	title: string;
	certificateId: number | null;
	onPaperChange: (paper: string) => void;
	onOrientationChange: (orientation: 'portrait' | 'landscape') => void;
	onZoomChange: (zoom: number) => void;
	onBgColorChange: (color: string) => void;
	onBgImageChange: (image: string | null) => void;
	onTitleChange: (title: string) => void;
	onExportPdf: () => void;
	onUndo: () => void;
	onRedo: () => void;
	onToggleGrid: () => void;
	onToggleSnapping: () => void;
	showGrid: boolean;
	snapping: boolean;
	canUndo: boolean;
	canRedo: boolean;
	designData: any;
}

const CertificateToolbar: React.FC<CertificateToolbarProps> = ({
	paper,
	orientation,
	zoom,
	bgColor,
	bgImage,
	title,
	certificateId,
	onPaperChange,
	onOrientationChange,
	onZoomChange,
	onBgColorChange,
	onBgImageChange,
	onTitleChange,
	onExportPdf,
	onUndo,
	onRedo,
	onToggleGrid,
	onToggleSnapping,
	showGrid,
	snapping,
	canUndo,
	canRedo,
	designData
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
			className="bg-white border-b border-gray-200 shadow-sm"
		>
			<div className="px-6 py-4">
				{/* Main Toolbar */}
				<div className="flex items-center gap-3 mb-4">
					<Button
						onClick={onExportPdf}
						icon={<Download className="w-4 h-4" />}
						variant="primary"
					>
						Export PDF
					</Button>
					
					<Button
						onClick={handleSave}
						icon={<Save className="w-4 h-4" />}
						variant="secondary"
						loading={isSaving}
					>
						{certificateId ? 'Update' : 'Save'}
					</Button>
					
					<div className="flex-1" />
					
					<Button
						onClick={onUndo}
						disabled={!canUndo}
						icon={<Undo className="w-4 h-4" />}
						variant="ghost"
						size="sm"
					>
						Undo
					</Button>
					
					<Button
						onClick={onRedo}
						disabled={!canRedo}
						icon={<Redo className="w-4 h-4" />}
						variant="ghost"
						size="sm"
					>
						Redo
					</Button>
				</div>

				{/* Title Input */}
				<div className="mb-4">
					<Input
						value={title}
						onChange={(e) => onTitleChange(e.target.value)}
						placeholder="Enter certificate title..."
						size="lg"
						icon={<FileText className="w-4 h-4" />}
					/>
				</div>

				{/* Settings Row */}
				<div className="flex flex-wrap items-center gap-4">
					{/* Grid & Snapping */}
					<div className="flex flex-col gap-2">
						<label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
							<input
								type="checkbox"
								checked={snapping}
								onChange={onToggleSnapping}
								className="rounded border-gray-300 text-black focus:ring-black"
							/>
							<Magnet className="w-4 h-4" />
							<span>Snapping</span>
						</label>
						
						<label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
							<input
								type="checkbox"
								checked={showGrid}
								onChange={onToggleGrid}
								className="rounded border-gray-300 text-black focus:ring-black"
							/>
							<Grid className="w-4 h-4" />
							<span>Grid</span>
						</label>
					</div>

					<div className="h-6 w-px bg-gray-300" />

					{/* Paper Settings */}
					<div className="flex items-center gap-3">
						<Select
							value={paper}
							onChange={(e) => onPaperChange(e.target.value)}
							size="sm"
							label="Paper"
						>
							<option value="a4">A4</option>
							<option value="letter">Letter</option>
							<option value="legal">Legal</option>
						</Select>

						<Select
							value={orientation}
							onChange={(e) => onOrientationChange(e.target.value as 'portrait' | 'landscape')}
							size="sm"
							label="Orientation"
						>
							<option value="portrait">Portrait</option>
							<option value="landscape">Landscape</option>
						</Select>

						<Select
							value={String(zoom)}
							onChange={(e) => onZoomChange(Number(e.target.value))}
							size="sm"
							label="Zoom"
						>
							{[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(z => (
								<option key={z} value={z}>
									{Math.round(z * 100)}%
								</option>
							))}
						</Select>
					</div>

					<div className="h-6 w-px bg-gray-300" />

					{/* Background Settings */}
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							<Palette className="w-4 h-4 text-gray-500" />
							<input
								type="color"
								value={bgColor}
								onChange={(e) => onBgColorChange(e.target.value)}
								className="h-8 w-8 p-0 border rounded cursor-pointer"
								title="Background color"
							/>
						</div>

						<div className="flex items-center gap-2">
							<Image className="w-4 h-4 text-gray-500" />
							<input
								type="file"
								accept="image/*"
								onChange={handleBgImageChange}
								className="text-sm"
								title="Background image"
							/>
							{bgImage && (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => onBgImageChange(null)}
									title="Remove background image"
								>
									Remove
								</Button>
							)}
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
										size="sm"
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
										size="sm"
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
										size="sm"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-2">
										Institution
									</label>
									<Input
										value={currentInstitution?.name || 'No access'}
										disabled
										size="sm"
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
