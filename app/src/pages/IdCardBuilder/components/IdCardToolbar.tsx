import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Save, Undo, Redo, Grid, Ruler, Magnet, IdCard, Image as ImageIcon, Palette, ArrowLeft, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import { useCreateIdCardTemplate, useUpdateIdCardTemplate } from '@/hooks/useIdCardTemplates';
import { uploadIdCardAsset } from '@/services/idCardTemplateService';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'react-hot-toast';

export type CardSize = 'cr80' | 'cr80_lanyard';
export type Orientation = 'portrait' | 'landscape';
export type Side = 'front' | 'back';
export type BgObjectFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';

interface IdCardToolbarProps {
	activeSide: Side;
	onSideChange: (side: Side) => void;
	cardSize: CardSize;
	orientation: Orientation;
	zoom: number;
	isFit?: boolean;
	onFit?: () => void;
	bgColor: string;
	bgImage: string | null;
	bgImageObjectFit: BgObjectFit;
	title: string;
	templateId: number | string | null;
	onCardSizeChange: (size: CardSize) => void;
	onOrientationChange: (orientation: Orientation) => void;
	onZoomChange: (zoom: number) => void;
	onBgColorChange: (color: string) => void;
	onBgImageChange: (image: string | null) => void;
	onBgImageObjectFitChange: (value: BgObjectFit) => void;
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
	onSaved?: (id: number | string) => void;
}

const IdCardToolbar: React.FC<IdCardToolbarProps> = ({
	activeSide,
	onSideChange,
	cardSize,
	orientation,
	zoom,
	isFit,
	onFit,
	bgColor,
	bgImage,
	bgImageObjectFit,
	title,
	templateId,
	onCardSizeChange,
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
	onBackToList,
	onSaved,
}) => {
	const [isSaving, setIsSaving] = useState(false);
	const [uploadingBg, setUploadingBg] = useState(false);
	const { user } = useAuth();
	const createTemplate = useCreateIdCardTemplate();
	const updateTemplate = useUpdateIdCardTemplate();

	const defaultInstitution = user?.user_institutions?.find((ui: any) => ui.is_default)?.institution;
	const mainInstitution = user?.user_institutions?.find((ui: any) => ui.is_main)?.institution;
	const currentInstitution = defaultInstitution || mainInstitution;

	const handleSave = async () => {
		if (!currentInstitution) {
			toast.error('No institution access. Please contact your administrator.');
			return;
		}
		if (!title.trim()) {
			toast.error('Please enter a template title');
			return;
		}

		setIsSaving(true);
		try {
			if (templateId) {
				await updateTemplate.mutateAsync({ id: templateId, payload: { title, design_json: designData } });
			} else {
				const created = await createTemplate.mutateAsync({ title, design_json: designData, institution_id: currentInstitution.id });
				onSaved?.(created.id);
			}
		} catch (error) {
			console.error('Save failed:', error);
		} finally {
			setIsSaving(false);
		}
	};

	const handleBgImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = '';
		if (!file) return;
		setUploadingBg(true);
		try {
			const { url } = await uploadIdCardAsset(file);
			onBgImageChange(url);
			toast.success(`${activeSide === 'front' ? 'Front' : 'Back'} template uploaded`);
		} catch {
			toast.error('Failed to upload template');
		} finally {
			setUploadingBg(false);
		}
	};

	return (
		<motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-r from-white to-gray-50 border-b border-gray-200 shadow-sm">
			<div className="px-4 py-3">
				{/* Top Row */}
				<div className="flex items-center gap-3 mb-3">
					<div className="flex items-center gap-2">
						{onBackToList && (
							<Button onClick={onBackToList} icon={<ArrowLeft className="w-4 h-4" />} variant="ghost" size="sm" title="Back to ID templates">
								Back to list
							</Button>
						)}
						<Button onClick={handleSave} icon={<Save className="w-4 h-4" />} variant="primary" loading={isSaving} size="sm">
							{templateId ? 'Update' : 'Save'}
						</Button>
						<Button onClick={onExportPdf} icon={<Download className="w-4 h-4" />} variant="secondary" size="sm">
							Export PDF
						</Button>
					</div>

					<div className="flex-1 min-w-[200px]">
						<Input value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="ID template title..." icon={<IdCard className="w-4 h-4" />} />
					</div>

					<div className="flex items-center gap-1 border-l border-gray-300 pl-3">
						<Button onClick={onUndo} disabled={!canUndo} icon={<Undo className="w-3.5 h-3.5" />} variant="ghost" size="sm" title="Undo" className="!h-8 !px-2" />
						<Button onClick={onRedo} disabled={!canRedo} icon={<Redo className="w-3.5 h-3.5" />} variant="ghost" size="sm" title="Redo" className="!h-8 !px-2" />
					</div>
				</div>

				{/* Settings Row */}
				<div className="flex flex-wrap items-end gap-3 text-sm">
					{/* Side switcher */}
					<div className="flex flex-col gap-1.5">
						<span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1">Side</span>
						<div className="flex items-center rounded-lg border border-gray-200 h-10 overflow-hidden">
							{(['front', 'back'] as const).map((side) => (
								<button
									key={side}
									type="button"
									onClick={() => onSideChange(side)}
									className={`px-4 h-full text-xs font-semibold capitalize transition-colors ${
										activeSide === side ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
									}`}
								>
									{side}
								</button>
							))}
						</div>
					</div>

					{/* View options */}
					<div className="flex flex-col gap-1.5">
						<span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1">View</span>
						<div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 h-10">
							<label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer hover:text-gray-900 transition-colors">
								<input type="checkbox" checked={snapping} onChange={onToggleSnapping} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5" />
								<Magnet className="w-3.5 h-3.5" />
								<span>Snap</span>
							</label>
							<div className="w-px h-4 bg-gray-300" />
							<label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer hover:text-gray-900 transition-colors">
								<input type="checkbox" checked={showGrid} onChange={onToggleGrid} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5" />
								<Grid className="w-3.5 h-3.5" />
								<span>Grid</span>
							</label>
							<div className="w-px h-4 bg-gray-300" />
							<label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer hover:text-gray-900 transition-colors">
								<input type="checkbox" checked={showRuler} onChange={onToggleRuler} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5" />
								<Ruler className="w-3.5 h-3.5" />
								<span>Ruler</span>
							</label>
						</div>
					</div>

					{/* Card controls */}
					<div className="flex flex-col gap-1.5">
						<span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1">Card</span>
						<div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 h-10">
							<div className="w-32">
								<Select value={cardSize} onChange={(e) => onCardSizeChange(e.target.value as CardSize)} className="text-xs">
									<option value="cr80">Standard (CR80)</option>
									<option value="cr80_lanyard">Lanyard</option>
								</Select>
							</div>
							<div className="w-28">
								<Select value={orientation} onChange={(e) => onOrientationChange(e.target.value as Orientation)} className="text-xs">
									<option value="portrait">Portrait</option>
									<option value="landscape">Landscape</option>
								</Select>
							</div>
							<div className="w-24">
								<Select
									value={isFit ? 'fit' : String(zoom)}
									onChange={(e) => {
										if (e.target.value === 'fit') { onFit?.(); return; }
										onZoomChange(Number(e.target.value));
									}}
									className="text-xs"
								>
									<option value="fit">Fit{isFit ? ` (${Math.round(zoom * 100)}%)` : ''}</option>
									{[0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => (
										<option key={z} value={z}>{Math.round(z * 100)}%</option>
									))}
								</Select>
							</div>
						</div>
					</div>

					{/* Background (per side) */}
					<div className="flex flex-col gap-1.5">
						<span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1">{activeSide} Background / Template</span>
						<div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 h-10">
							<div className="flex items-center gap-2">
								<Palette className="w-3.5 h-3.5 text-gray-500" />
								<input type="color" value={bgColor} onChange={(e) => onBgColorChange(e.target.value)} className="h-6 w-6 p-0 border border-gray-300 rounded cursor-pointer" title="Background color" />
							</div>
							<div className="w-px h-5 bg-gray-300" />
							<div className="flex items-center gap-2">
								<label className="flex items-center gap-1.5 px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 cursor-pointer text-xs text-gray-600 h-6">
									{uploadingBg ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" /> : <ImageIcon className="w-3.5 h-3.5 text-gray-500" />}
									<span className="truncate">{uploadingBg ? 'Uploading' : bgImage ? 'Change' : 'Upload template'}</span>
									<input type="file" accept="image/*" onChange={handleBgImageChange} disabled={uploadingBg} className="hidden" />
								</label>
								{bgImage && (
									<>
										<Button variant="ghost" size="sm" onClick={() => onBgImageChange(null)} className="!h-6 !px-2 text-xs" title="Remove template">×</Button>
										<div className="w-24">
											<Select value={bgImageObjectFit} onChange={(e) => onBgImageObjectFitChange(e.target.value as BgObjectFit)} className="text-xs">
												<option value="cover">Cover</option>
												<option value="contain">Contain</option>
												<option value="fill">Fill</option>
											</Select>
										</div>
									</>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</motion.div>
	);
};

export default IdCardToolbar;
