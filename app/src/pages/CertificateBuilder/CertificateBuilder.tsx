import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useCertificate } from '@/hooks/useCertificates';
import { institutionService } from '@/services/institutionService';
import { studentService } from '@/services/studentService';
import { nanoid } from 'nanoid';
import type { Institution, UserInstitution as UserInstitutionType, Student } from '@/types';
import { designHasStudentVariables } from './certificateDesignUtils';

// Components
import ElementsPanel from './components/ElementsPanel';
import PropertiesPanel from './components/PropertiesPanel';
import CertificateCanvas, { type CanvasElement } from './components/CertificateCanvas';
import LayersPanel from './components/LayersPanel';
import CertificateToolbar from './components/CertificateToolbar';
import PublishOptionsPanel, { type PublishOptions } from './components/PublishOptionsPanel';

// UI Components
import Button from '@/components/ui/Button';
import Card, { CardBody } from '@/components/ui/Card';
import { AlertTriangle, Building2, PanelLeft, User, X } from 'lucide-react';

const RULER_SIZE = 28;
const TICK_INTERVAL = 100;

const PAPER_PRESETS = {
	a4: { 
		portrait: { w: 794, h: 1123, pdf: 'a4' as const }, 
		landscape: { w: 1123, h: 794, pdf: 'a4' as const } 
	},
	letter: { 
		portrait: { w: 816, h: 1056, pdf: 'letter' as const }, 
		landscape: { w: 1056, h: 816, pdf: 'letter' as const } 
	},
	legal: { 
		portrait: { w: 816, h: 1344, pdf: 'legal' as const }, 
		landscape: { w: 1344, h: 816, pdf: 'legal' as const } 
	},
} as const;

type Paper = keyof typeof PAPER_PRESETS;
type Orientation = 'portrait' | 'landscape';

type BgImageObjectFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';

interface DesignData {
	paper: Paper;
	orientation: Orientation;
	zoom: number;
	bgColor: string;
	bgImage: string | null;
	bgImageObjectFit?: BgImageObjectFit;
	elements: CanvasElement[];
	publish_options?: PublishOptions;
}

interface UserInstitution {
	is_default?: boolean;
	is_main?: boolean;
	institution: {
		name: string;
	};
}

export default function CertificateBuilder() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { user } = useAuth();
	
	// State
	const [elements, setElements] = useState<CanvasElement[]>([]);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [showGrid, setShowGrid] = useState(false);
	const [showRuler, setShowRuler] = useState(true);
	const [snapping, setSnapping] = useState(false);
	const [history, setHistory] = useState<CanvasElement[][]>([]);
	const [future, setFuture] = useState<CanvasElement[][]>([]);
	const [paper, setPaper] = useState<Paper>('a4');
	const [orientation, setOrientation] = useState<Orientation>('landscape');
	const [zoom, setZoom] = useState<number>(1);
	const [bgColor, setBgColor] = useState<string>('#ffffff');
	const [bgImage, setBgImage] = useState<string | null>(null);
	const [bgImageObjectFit, setBgImageObjectFit] = useState<BgImageObjectFit>('cover');
	const [title, setTitle] = useState<string>('Untitled Certificate');
	const [elementsPanelOpen, setElementsPanelOpen] = useState(true);
	const [previewStudent, setPreviewStudent] = useState<Student | null>(null);
	const [studentSearchQuery, setStudentSearchQuery] = useState('');
	const [studentSearchFocused, setStudentSearchFocused] = useState(false);
	const [publishOptions, setPublishOptions] = useState<PublishOptions>({
		scopeGradeLevelsOnly: false,
		gradeLevels: [],
		studentScope: 'all',
	});
	
	// Refs
	const canvasRef = useRef<HTMLDivElement | null>(null);
	
	// Get certificate ID from URL (API uses UUID string)
	const certificateId = searchParams.get('id') || null;
	
	// TanStack Query hooks
	const { data: certificate, isLoading: isLoadingCertificate } = useCertificate(certificateId);
	
	// Get user's default/main institution ID
	const institutionId = useMemo(() => {
		const defaultUi = user?.user_institutions?.find((ui: UserInstitution) => ui.is_default) as UserInstitutionType | undefined;
		const mainUi = user?.user_institutions?.find((ui: UserInstitution) => ui.is_main) as UserInstitutionType | undefined;
		return defaultUi?.institution_id ?? mainUi?.institution_id ?? '';
	}, [user?.user_institutions]);

	// Fetch full institution data (for variables: title, gov_id, division, region, address, logo)
	const { data: institutionResponse } = useQuery({
		queryKey: ['institution', institutionId],
		queryFn: () => institutionService.getInstitution(institutionId),
		enabled: !!institutionId,
	});
	const fullInstitution = institutionResponse?.data as Institution | undefined;

	// Student search for sample data (when certificate has student variables)
	const hasStudentVars = designHasStudentVariables({ elements });
	const { data: studentsResponse } = useQuery({
		queryKey: ['students', 'certificate-preview', studentSearchQuery, studentSearchFocused],
		queryFn: () =>
			studentSearchQuery.trim()
				? studentService.getStudents({ search: studentSearchQuery.trim(), per_page: 20 })
				: studentService.getStudents({ per_page: 20 }),
		enabled: hasStudentVars && (studentSearchFocused || studentSearchQuery.length >= 1),
	});
	const searchStudents = Array.isArray((studentsResponse as { data?: unknown })?.data)
		? ((studentsResponse as { data: Student[] }).data)
		: [];

	// Fallback for "Creating certificate for" label (name/title from user_institutions or full fetch)
	const currentInstitution = useMemo(() => {
		const defaultInstitution = user?.user_institutions?.find((ui: UserInstitution) => ui.is_default)?.institution;
		const mainInstitution = user?.user_institutions?.find((ui: UserInstitution) => ui.is_main)?.institution;
		const fromUser = defaultInstitution || mainInstitution;
		if (fullInstitution?.title) return { name: fullInstitution.title };
		if (fromUser && typeof fromUser === 'object' && 'name' in fromUser) return { name: (fromUser as { name?: string }).name };
		if (fullInstitution?.title) return { name: fullInstitution.title };
		return fromUser ? { name: (fromUser as { name?: string; title?: string }).name ?? (fromUser as { title?: string }).title ?? 'Institution' } : null;
	}, [user?.user_institutions, fullInstitution]);

	// Computed values
	const selectedElements = useMemo(() => 
		elements.filter(e => selectedIds.includes(e.id)), 
		[elements, selectedIds]
	);
	const canvasSize = PAPER_PRESETS[paper][orientation];
	const canUndo = history.length > 0;
	const canRedo = future.length > 0;

	// History management
	const snapshot = useCallback((state: CanvasElement[]): CanvasElement[] => 
		state.map((e, idx) => ({ ...e, zIndex: idx })), 
		[]
	);
	
	const pushHistory = useCallback((state: CanvasElement[]) => {
		setHistory(prev => [...prev, snapshot(state)]);
		setFuture([]);
	}, [snapshot]);
	
	const setElementsAndKeepOrder = useCallback((next: CanvasElement[] | ((prev: CanvasElement[]) => CanvasElement[])) => {
		setElements(prev => snapshot(typeof next === 'function' ? next(prev) : next));
	}, [snapshot]);

	const undo = useCallback(() => {
		setHistory(prev => {
			if (prev.length === 0) return prev;
			const newHistory = prev.slice(0, -1);
			const last = prev[prev.length - 1];
			setFuture(f => [snapshot(elements), ...f]);
			setElementsAndKeepOrder(last);
			return newHistory;
		});
	}, [elements, snapshot, setElementsAndKeepOrder]);
	
	const redo = useCallback(() => {
		setFuture(prev => {
			if (prev.length === 0) return prev;
			const [next, ...rest] = prev;
			setHistory(h => [...h, snapshot(elements)]);
			setElementsAndKeepOrder(next);
			return rest;
		});
	}, [elements, snapshot, setElementsAndKeepOrder]);

	// Element management
	const handleAddElement = useCallback((newElement: CanvasElement) => {
		pushHistory(elements);
		setElementsAndKeepOrder(prev => [...prev, { ...newElement, zIndex: prev.length }]);
		setSelectedIds([newElement.id]);
	}, [elements, pushHistory, setElementsAndKeepOrder]);
	
	const handleUpdateElement = useCallback((updated: CanvasElement) => {
		setElements(prev => prev.map(e => e.id === updated.id ? updated : e));
	}, []);
	
	const handleDeleteSelected = useCallback(() => {
		if (!selectedIds.length) return;
		pushHistory(elements);
		setElementsAndKeepOrder(prev => prev.filter(e => !selectedIds.includes(e.id)));
		setSelectedIds([]);
	}, [selectedIds, elements, pushHistory, setElementsAndKeepOrder]);
	
	const handleDuplicateElement = useCallback((element: CanvasElement) => {
		const duplicated = {
			...element,
			id: nanoid(),
			x: element.x + 20,
			y: element.y + 20,
			zIndex: elements.length,
		};
		pushHistory(elements);
		setElementsAndKeepOrder(prev => [...prev, duplicated]);
		setSelectedIds([duplicated.id]);
		toast.success('Element duplicated');
	}, [elements, pushHistory, setElementsAndKeepOrder]);
	
	const handleInteractionStart = useCallback(() => {
		pushHistory(elements);
	}, [elements, pushHistory]);

	// Serialize current design (include publish_options when editing)
	const buildDesignJson = useCallback((): DesignData => {
		const base: DesignData = {
			paper,
			orientation,
			zoom,
			bgColor,
			bgImage,
			bgImageObjectFit,
			elements,
		};
		if (certificateId) {
			base.publish_options = publishOptions;
		}
		return base;
	}, [paper, orientation, zoom, bgColor, bgImage, bgImageObjectFit, elements, certificateId, publishOptions]);

	// Load certificate data when certificate is fetched (only apply for current certificateId)
	useEffect(() => {
		if (!certificate || isLoadingCertificate || !certificateId) return;
		if (String(certificate.id) !== String(certificateId)) return;

		setTitle(certificate.title);
		const design = certificate.design_json || {};
		setElements(Array.isArray(design.elements) ? design.elements : []);
		if (design.paper) setPaper(design.paper);
		if (design.orientation) setOrientation(design.orientation);
		if (design.zoom != null) setZoom(Number(design.zoom));
		if (design.bgColor) 		setBgColor(design.bgColor);
		setBgImage(design.bgImage ?? null);
		if (design.bgImageObjectFit) setBgImageObjectFit(design.bgImageObjectFit);
		const po = design.publish_options;
		if (po && typeof po === 'object') {
			setPublishOptions({
				scopeGradeLevelsOnly: Boolean(po.scopeGradeLevelsOnly),
				gradeLevels: Array.isArray(po.gradeLevels) ? (po.gradeLevels as unknown[]).filter((g: unknown): g is string => typeof g === 'string') : [],
				studentScope: po.studentScope === 'limited' ? 'limited' : 'all',
			});
		}
	}, [certificate, certificateId, isLoadingCertificate]);

	// Certificate not found (e.g. 404) — redirect back to list
	useEffect(() => {
		if (certificateId && !certificate && !isLoadingCertificate) {
			toast.error('Certificate not found');
			navigate('/certificate-builder');
		}
	}, [certificateId, certificate, isLoadingCertificate, navigate]);

	// Keyboard shortcuts
	useEffect(() => {
		const isTypingTarget = (el: Element | null): boolean => {
			if (!el) return false;
			const tag = (el as HTMLElement).tagName.toLowerCase();
			return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
		};
		
		const onKey = (e: KeyboardEvent) => {
			const meta = e.ctrlKey || e.metaKey;
			if (meta && e.key.toLowerCase() === 'z') {
				e.preventDefault();
				return e.shiftKey ? redo() : undo();
			}
			if (meta && e.key.toLowerCase() === 'y') {
				e.preventDefault();
				return redo();
			}
			if ((e.key === 'Delete' || e.key === 'Backspace')) {
				if (isTypingTarget(document.activeElement)) return;
				if (selectedIds.length) {
					e.preventDefault();
					handleDeleteSelected();
				}
			}
		};
		
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [selectedIds, undo, redo, handleDeleteSelected]);

	// Export PDF
	const handleExportPdf = useCallback(async () => {
		if (!canvasRef.current) return;
		
		try {
			const node = canvasRef.current;
			const canvas = await html2canvas(node, { 
				background: '#ffffff', 
				scale: 2 
			} as Parameters<typeof html2canvas>[1]);
			const imgData = canvas.toDataURL('image/png');
			const pdf = new jsPDF({ 
				orientation, 
				unit: 'pt', 
				format: canvasSize.pdf 
			});
			const pageWidth = pdf.internal.pageSize.getWidth();
			const pageHeight = pdf.internal.pageSize.getHeight();
			pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
			pdf.save(`${title || 'certificate'}.pdf`);
			toast.success('PDF exported successfully');
		} catch (error) {
			toast.error('Failed to export PDF');
			console.error('PDF export error:', error);
		}
	}, [orientation, canvasSize.pdf, title]);

	// Show no institution access message
	if (!currentInstitution) {
		return (
			<motion.div
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				className="flex items-center justify-center h-full bg-gray-50"
			>
				<Card className="max-w-md mx-auto text-center">
					<CardBody>
						<div className="w-24 h-24 bg-gradient-to-br from-red-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-6">
							<AlertTriangle className="w-12 h-12 text-red-600" />
						</div>
						<h3 className="text-xl font-semibold text-gray-900 mb-2">No Institution Access</h3>
						<p className="text-gray-600 mb-8">
							You don't have access to any institution. Please contact your administrator to set up your institution access.
						</p>
						<Button onClick={() => navigate('/dashboard')} variant="primary">
							Go to Dashboard
						</Button>
					</CardBody>
				</Card>
			</motion.div>
		);
	}

	// Loading state
	if (isLoadingCertificate) {
		return (
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				className="flex items-center justify-center h-full"
			>
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
					<p className="text-gray-600">Loading certificate...</p>
				</div>
			</motion.div>
		);
	}

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			className="flex h-full w-full overflow-hidden bg-gray-50"
		>
			{/* Left Sidebar - Elements Panel (collapsible for more canvas space) */}
			<motion.div
				initial={false}
				animate={{ width: elementsPanelOpen ? 224 : 52 }}
				transition={{ type: "spring", stiffness: 300, damping: 30 }}
				className="flex-shrink-0 flex flex-col bg-gradient-to-b from-gray-50 to-white border-r border-gray-200 shadow-sm overflow-hidden"
			>
				{elementsPanelOpen ? (
					<ElementsPanel
						institution={fullInstitution}
						onAddElement={handleAddElement}
						onCollapse={() => setElementsPanelOpen(false)}
					/>
				) : (
					<button
						type="button"
						onClick={() => setElementsPanelOpen(true)}
						className="flex flex-col items-center justify-center w-full flex-1 min-h-[120px] py-4 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors"
						title="Show Elements panel"
					>
						<PanelLeft className="w-6 h-6" />
						<span className="mt-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Elements</span>
					</button>
				)}
			</motion.div>

			{/* Main Content */}
			<div className="flex-1 flex flex-col">
				{/* Toolbar */}
				<CertificateToolbar
					paper={paper}
					orientation={orientation}
					zoom={zoom}
					bgColor={bgColor}
					bgImage={bgImage}
					bgImageObjectFit={bgImageObjectFit}
					title={title}
					certificateId={certificateId}
					onPaperChange={(paper: string) => setPaper(paper as Paper)}
					onOrientationChange={setOrientation}
					onZoomChange={setZoom}
					onBgColorChange={setBgColor}
					onBgImageChange={setBgImage}
					onBgImageObjectFitChange={setBgImageObjectFit}
					onTitleChange={setTitle}
					onExportPdf={handleExportPdf}
					onUndo={undo}
					onRedo={redo}
					onToggleGrid={() => setShowGrid(!showGrid)}
					onToggleRuler={() => setShowRuler(!showRuler)}
					onToggleSnapping={() => setSnapping(!snapping)}
					showGrid={showGrid}
					showRuler={showRuler}
					snapping={snapping}
					canUndo={canUndo}
					canRedo={canRedo}
					designData={buildDesignJson()}
					onBackToList={() => navigate('/certificate-builder')}
				/>

				{/* Sample data: student search (when certificate has student variables) */}
				{hasStudentVars && (
					<div className="px-4 py-2 bg-emerald-50/80 border-b border-emerald-200 flex items-center gap-3 flex-wrap">
						<div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
							<User className="w-4 h-4" />
							<span>Sample data</span>
						</div>
						<div className="relative flex-1 min-w-[200px] max-w-sm">
							<input
								type="text"
								readOnly={!!previewStudent}
								value={previewStudent ? `${previewStudent.first_name} ${previewStudent.last_name}${previewStudent.lrn ? ` (${previewStudent.lrn})` : ''}` : studentSearchQuery}
								onChange={(e) => !previewStudent && setStudentSearchQuery(e.target.value)}
								onFocus={() => setStudentSearchFocused(true)}
								onBlur={() => setTimeout(() => setStudentSearchFocused(false), 200)}
								placeholder="Search by name or LRN..."
								className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
							/>
							{previewStudent && (
								<button
									type="button"
									onClick={() => { setPreviewStudent(null); setStudentSearchQuery(''); }}
									className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100"
									title="Clear sample"
								>
									<X className="w-4 h-4" />
								</button>
							)}
							{studentSearchFocused && !previewStudent && (
								<ul className="absolute z-[100] left-0 right-0 mt-1 py-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
									{searchStudents.length === 0 ? (
										<li className="px-3 py-2 text-sm text-gray-500">
											{studentSearchQuery.length >= 1 ? 'No students found. Try name or LRN.' : 'Type to search by name or LRN, or pick one below...'}
										</li>
									) : (
										searchStudents.slice(0, 10).map((s) => (
											<li key={s.id}>
												<button
													type="button"
													className="w-full px-3 py-2 text-left text-sm hover:bg-emerald-50 flex justify-between items-center"
													onMouseDown={(e) => {
														e.preventDefault();
														e.stopPropagation();
														setPreviewStudent(s);
														setStudentSearchQuery('');
														setStudentSearchFocused(false);
													}}
												>
													<span>{s.first_name} {s.middle_name ?? ''} {s.last_name}{s.ext_name ? ` ${s.ext_name}` : ''}</span>
													{s.lrn && <span className="text-gray-500 text-xs">{s.lrn}</span>}
												</button>
											</li>
										))
									)}
								</ul>
							)}
						</div>
						{previewStudent && (
							<span className="text-xs text-emerald-700">Previewing with selected student</span>
						)}
					</div>
				)}

				{/* Canvas Area with optional Rulers - canvas centered in viewport */}
				<div className="flex-1 overflow-auto p-6">
					{(() => {
						const rulerOffset = showRuler ? RULER_SIZE : 0;
						const canvasWidth = (rulerOffset + canvasSize.w) * zoom;
						const canvasHeight = (rulerOffset + canvasSize.h) * zoom;
						return (
							<div
								className="min-h-full min-w-full flex items-center justify-center"
								style={{ minHeight: '100%', minWidth: '100%' }}
							>
								<div
									className="relative"
									style={{
										width: canvasWidth,
										height: canvasHeight,
									}}
								>
								<div
									key={`canvas-${canvasSize.w}-${canvasSize.h}-${showRuler}`}
									style={{
										transform: `scale(${zoom})`,
										transformOrigin: 'top left',
										width: rulerOffset + canvasSize.w,
										height: rulerOffset + canvasSize.h,
										position: 'absolute',
										top: 0,
										left: 0,
									}}
								>
									{showRuler && (
										<>
											{/* Corner */}
											<div
												className="bg-gray-100 border-r border-b border-gray-300 rounded-tl"
												style={{ position: 'absolute', top: 0, left: 0, width: RULER_SIZE, height: RULER_SIZE }}
											/>
											{/* Top ruler */}
											<div
												className="bg-gray-100 border-b border-gray-300 relative"
												style={{ position: 'absolute', top: 0, left: RULER_SIZE, width: canvasSize.w, height: RULER_SIZE }}
											>
												{(() => {
													const centerX = canvasSize.w / 2;
													const ticks = Array.from({ length: Math.ceil(canvasSize.w / TICK_INTERVAL) + 1 }, (_, i) => i * TICK_INTERVAL).filter((v) => v <= canvasSize.w);
													if (!ticks.some((v) => Math.abs(v - centerX) < 2)) ticks.push(Math.round(centerX));
													ticks.sort((a, b) => a - b);
													return ticks.map((pos) => {
														const isCenter = Math.abs(pos - centerX) < 2;
														return (
															<div
																key={`h-${pos}`}
																className="absolute flex flex-col items-center text-gray-500"
																style={{ left: pos, top: 0 }}
															>
																<div
																	className={`w-px ${isCenter ? 'h-3 bg-indigo-500' : 'h-2 bg-gray-400'}`}
																	style={{ marginTop: 2 }}
																/>
																<span className={`text-[10px] mt-0.5 select-none ${isCenter ? 'text-indigo-600 font-semibold' : ''}`}>
																	{isCenter ? 'Center' : pos}
																</span>
															</div>
														);
													});
												})()}
											</div>
											{/* Left ruler */}
											<div
												className="bg-gray-100 border-r border-gray-300 relative"
												style={{ position: 'absolute', top: RULER_SIZE, left: 0, width: RULER_SIZE, height: canvasSize.h }}
											>
												{(() => {
													const centerY = canvasSize.h / 2;
													const ticks = Array.from({ length: Math.ceil(canvasSize.h / TICK_INTERVAL) + 1 }, (_, i) => i * TICK_INTERVAL).filter((v) => v <= canvasSize.h);
													if (!ticks.some((v) => Math.abs(v - centerY) < 2)) ticks.push(Math.round(centerY));
													ticks.sort((a, b) => a - b);
													return ticks.map((pos) => {
														const isCenter = Math.abs(pos - centerY) < 2;
														return (
															<div
																key={`v-${pos}`}
																className="absolute flex items-center gap-0.5 text-gray-500"
																style={{ left: 0, top: pos }}
															>
																<div
																	className={`h-px flex-shrink-0 ${isCenter ? 'w-3 bg-indigo-500' : 'w-2 bg-gray-400'}`}
																	style={{ marginLeft: 2 }}
																/>
																<span className={`text-[10px] select-none whitespace-nowrap origin-left ${isCenter ? 'text-indigo-600 font-semibold' : ''}`} style={{ transform: 'rotate(-90deg)', marginLeft: 4 }}>
																	{isCenter ? 'Center' : pos}
																</span>
															</div>
														);
													});
												})()}
											</div>
										</>
									)}
									{/* Paper with canvas and optional center lines */}
									<div
										className="shadow-2xl relative rounded-lg overflow-hidden"
										style={{
											position: 'absolute',
											top: rulerOffset,
											left: rulerOffset,
											width: canvasSize.w,
											height: canvasSize.h,
											backgroundColor: '#f8fafc',
										}}
									>
										{showRuler && (
											<div className="absolute inset-0 pointer-events-none z-10">
												<div
													className="absolute top-0 bottom-0 w-0 border-l border-dashed border-indigo-400/70"
													style={{ left: '50%' }}
												/>
												<div
													className="absolute left-0 right-0 h-0 border-t border-dashed border-indigo-400/70"
													style={{ top: '50%' }}
												/>
											</div>
										)}
										<div
									ref={canvasRef}
									style={{
										width: canvasSize.w,
										height: canvasSize.h,
										backgroundColor: bgColor,
										backgroundImage: bgImage ? `url(${bgImage})` : undefined,
										backgroundSize: bgImage ? (bgImageObjectFit === 'fill' ? '100% 100%' : bgImageObjectFit) : undefined,
										backgroundPosition: 'center',
										position: 'relative',
										zIndex: 3,
									}}
								>
									<CertificateCanvas
										width={canvasSize.w}
										height={canvasSize.h}
										scale={zoom}
										elements={elements}
										selectedElementIds={selectedIds}
										onSelect={setSelectedIds}
										onChange={handleUpdateElement}
										onInteractionStart={handleInteractionStart}
										onChangeEnd={() => {}}
										showGrid={showGrid}
										snappingEnabled={snapping}
										previewStudent={previewStudent}
										key={`${canvasSize.w}-${canvasSize.h}`}
									/>
								</div>
							</div>
						</div>
							</div>
					</div>
					);
					})()}
				</div>

				{/* Institution Info */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="px-6 py-3 bg-white border-t border-gray-200"
				>
					<div className="flex items-center gap-2 text-sm text-gray-600">
						<Building2 className="w-4 h-4 text-gray-400" />
						<span>Creating certificate for: <strong className="text-gray-900">{currentInstitution.name}</strong></span>
					</div>
				</motion.div>
			</div>

			{/* Right Sidebar - Publish options (when editing), Properties & Layers */}
			<motion.div
				initial={{ x: 300 }}
				animate={{ x: 0 }}
				transition={{ type: "spring", stiffness: 300, damping: 30 }}
				className="w-80 border-l border-gray-200 bg-white flex flex-col"
			>
				{/* Publish options – only when editing (certificate has id) */}
				{certificateId && (
					<PublishOptionsPanel options={publishOptions} onChange={setPublishOptions} />
				)}
				{/* Properties Panel */}
				<div className="flex-1 overflow-hidden">
					<PropertiesPanel 
						element={selectedElements[0] || null} 
						onChange={(el) => { 
							pushHistory(elements); 
							handleUpdateElement(el); 
						}} 
						onDelete={handleDeleteSelected}
						onDuplicate={handleDuplicateElement}
					/>
				</div>
				
				{/* Divider */}
				<div className="border-t border-gray-200" />
				
				{/* Layers Panel */}
				<div className="flex-1 overflow-hidden">
					<LayersPanel 
						elements={elements} 
						selectedIds={selectedIds} 
						onSelect={setSelectedIds} 
						onToggleHide={(id) => setElements(prev => prev.map(e => e.id === id ? { ...e, hidden: !e.hidden } : e))} 
						onToggleLock={(id) => setElements(prev => prev.map(e => e.id === id ? { ...e, locked: !e.locked } : e))} 
						onReorder={(id, dir) => setElements(prev => { 
							const list = [...prev]; 
							const i = list.findIndex(e => e.id === id); 
							if (i === -1) return prev; 
							const t = dir === 'up' ? i + 1 : i - 1; 
							if (t < 0 || t >= list.length) return prev; 
							[list[i], list[t]] = [list[t], list[i]]; 
							return snapshot(list); 
						})} 
						onDelete={handleDeleteSelected} 
						onDuplicate={handleDuplicateElement}
					/>
				</div>
			</motion.div>
		</motion.div>
	);
}