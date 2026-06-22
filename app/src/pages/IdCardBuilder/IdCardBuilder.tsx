import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useIdCardTemplate } from '@/hooks/useIdCardTemplates';
import { institutionService } from '@/services/institutionService';
import { studentService } from '@/services/studentService';
import { classSectionService } from '@/services/classSectionService';
import { nanoid } from 'nanoid';
import type { Institution, UserInstitution as UserInstitutionType, Student } from '@/types';

import IdElementsPanel from './components/IdElementsPanel';
import IdPropertiesPanel from './components/IdPropertiesPanel';
import IdCardCanvas, { type CanvasElement, type StudentContext } from './components/IdCardCanvas';
import IdLayersPanel from './components/IdLayersPanel';
import IdCardToolbar, { type CardSize, type Orientation, type Side, type BgObjectFit } from './components/IdCardToolbar';
import { CARD_PRESETS, parseDesign, type SideDesign, type IdCardDesign } from './idCardDesignUtils';
import { designHasStudentVariables } from './idCardDesignUtils';

import Button from '@/components/ui/Button';
import Card, { CardBody } from '@/components/ui/Card';
import { AlertTriangle, Building2, PanelLeft, User, X } from 'lucide-react';

interface UserInstitution {
	is_default?: boolean;
	is_main?: boolean;
	institution: { name: string };
}

type Sides = { front: SideDesign; back: SideDesign };

const reindex = (els: CanvasElement[]): CanvasElement[] => els.map((e, idx) => ({ ...e, zIndex: idx }));

const RULER_SIZE = 24;
const TICK_INTERVAL = 50;

export default function IdCardBuilder() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { user } = useAuth();

	const templateId = searchParams.get('id') || null;
	const { data: template, isLoading: isLoadingTemplate } = useIdCardTemplate(templateId);

	// Design state
	const initial = useMemo(() => parseDesign(null), []);
	const [sides, setSides] = useState<Sides>({ front: initial.front, back: initial.back });
	const [activeSide, setActiveSide] = useState<Side>('front');
	const [cardSize, setCardSize] = useState<CardSize>('cr80');
	const [orientation, setOrientation] = useState<Orientation>('portrait');
	const [zoom, setZoom] = useState<number>(1);
	const [autoFit, setAutoFit] = useState(true);
	const [fitZoom, setFitZoom] = useState<number>(1);
	const [title, setTitle] = useState<string>('Untitled ID Template');

	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [showGrid, setShowGrid] = useState(false);
	const [showRuler, setShowRuler] = useState(true);
	const [snapping, setSnapping] = useState(true);
	const [history, setHistory] = useState<Sides[]>([]);
	const [future, setFuture] = useState<Sides[]>([]);
	const [elementsPanelOpen, setElementsPanelOpen] = useState(true);

	// Student preview
	const [previewStudent, setPreviewStudent] = useState<Student | null>(null);
	const [studentSearchQuery, setStudentSearchQuery] = useState('');
	const [studentSearchFocused, setStudentSearchFocused] = useState(false);

	const canvasRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const frontExportRef = useRef<HTMLDivElement | null>(null);
	const backExportRef = useRef<HTMLDivElement | null>(null);

	const preset = CARD_PRESETS[cardSize][orientation];

	// Zoom shown/used on screen: auto-fit the card to the available canvas area, or the user's explicit zoom.
	const displayZoom = autoFit ? fitZoom : zoom;

	// Recompute the fit zoom whenever the viewport or card geometry changes.
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const PADDING = 64; // breathing room around the card
		const compute = () => {
			const availW = el.clientWidth - PADDING;
			const availH = el.clientHeight - PADDING;
			if (availW <= 0 || availH <= 0) return;
			const offset = showRuler ? RULER_SIZE : 0;
			const fit = Math.min(availW / (preset.w + offset), availH / (preset.h + offset));
			setFitZoom(Math.max(0.4, Math.min(3, fit)));
		};
		compute();
		const ro = new ResizeObserver(compute);
		ro.observe(el);
		return () => ro.disconnect();
	}, [preset.w, preset.h, elementsPanelOpen, showRuler]);

	// Institution
	const institutionId = useMemo(() => {
		const defaultUi = user?.user_institutions?.find((ui: UserInstitution) => ui.is_default) as UserInstitutionType | undefined;
		const mainUi = user?.user_institutions?.find((ui: UserInstitution) => ui.is_main) as UserInstitutionType | undefined;
		return defaultUi?.institution_id ?? mainUi?.institution_id ?? '';
	}, [user?.user_institutions]);

	const { data: institutionResponse } = useQuery({
		queryKey: ['institution', institutionId],
		queryFn: () => institutionService.getInstitution(institutionId),
		enabled: !!institutionId,
	});
	const fullInstitution = institutionResponse?.data as Institution | undefined;

	const currentInstitution = useMemo(() => {
		const def = user?.user_institutions?.find((ui: UserInstitution) => ui.is_default)?.institution;
		const main = user?.user_institutions?.find((ui: UserInstitution) => ui.is_main)?.institution;
		const fromUser = def || main;
		if (fullInstitution?.title) return { name: fullInstitution.title };
		if (fromUser && typeof fromUser === 'object' && 'name' in fromUser) return { name: (fromUser as { name?: string }).name };
		return fromUser ? { name: (fromUser as { name?: string; title?: string }).name ?? (fromUser as { title?: string }).title ?? 'Institution' } : null;
	}, [user?.user_institutions, fullInstitution]);

	// Student search (only meaningful when the design binds student data)
	const hasStudentVars = designHasStudentVariables(sides);
	const { data: studentsResponse } = useQuery({
		queryKey: ['students', 'id-card-preview', studentSearchQuery, studentSearchFocused],
		queryFn: () =>
			studentSearchQuery.trim()
				? studentService.getStudents({ search: studentSearchQuery.trim(), per_page: 20 })
				: studentService.getStudents({ per_page: 20 }),
		enabled: hasStudentVars && (studentSearchFocused || studentSearchQuery.length >= 1),
	});
	const searchStudents = Array.isArray((studentsResponse as { data?: unknown })?.data) ? (studentsResponse as { data: Student[] }).data : [];

	// Resolve grade level + section title from the previewed student's current section
	const { data: studentContext } = useQuery<StudentContext>({
		queryKey: ['id-card-student-context', previewStudent?.id, previewStudent?.student_section_id],
		queryFn: async () => {
			const sectionId = previewStudent?.student_section_id;
			if (!sectionId) return {};
			const resp = await classSectionService.getClassSection(sectionId);
			const sec = resp?.data;
			return { gradeLevel: sec?.grade_level, sectionTitle: sec?.title };
		},
		enabled: !!previewStudent?.student_section_id,
	});

	// Derived
	const activeElements = sides[activeSide].elements;
	const selectedElements = useMemo(() => activeElements.filter((e) => selectedIds.includes(e.id)), [activeElements, selectedIds]);
	const canUndo = history.length > 0;
	const canRedo = future.length > 0;

	// History
	const pushHistory = useCallback(() => {
		setHistory((prev) => [...prev, sides]);
		setFuture([]);
	}, [sides]);

	const mutateActiveElements = useCallback(
		(fn: (els: CanvasElement[]) => CanvasElement[]) => {
			setSides((prev) => ({ ...prev, [activeSide]: { ...prev[activeSide], elements: reindex(fn(prev[activeSide].elements)) } }));
		},
		[activeSide],
	);

	const undo = useCallback(() => {
		setHistory((prev) => {
			if (prev.length === 0) return prev;
			const last = prev[prev.length - 1];
			setFuture((f) => [sides, ...f]);
			setSides(last);
			return prev.slice(0, -1);
		});
	}, [sides]);

	const redo = useCallback(() => {
		setFuture((prev) => {
			if (prev.length === 0) return prev;
			const [next, ...rest] = prev;
			setHistory((h) => [...h, sides]);
			setSides(next);
			return rest;
		});
	}, [sides]);

	// Element actions
	const handleAddElement = useCallback(
		(el: CanvasElement) => {
			pushHistory();
			mutateActiveElements((prev) => [...prev, { ...el, zIndex: prev.length }]);
			setSelectedIds([el.id]);
		},
		[pushHistory, mutateActiveElements],
	);

	const handleUpdateElement = useCallback(
		(updated: CanvasElement) => {
			setSides((prev) => ({ ...prev, [activeSide]: { ...prev[activeSide], elements: prev[activeSide].elements.map((e) => (e.id === updated.id ? updated : e)) } }));
		},
		[activeSide],
	);

	const handleDeleteSelected = useCallback(() => {
		if (!selectedIds.length) return;
		pushHistory();
		mutateActiveElements((prev) => prev.filter((e) => !selectedIds.includes(e.id)));
		setSelectedIds([]);
	}, [selectedIds, pushHistory, mutateActiveElements]);

	const handleDuplicateElement = useCallback(
		(element: CanvasElement) => {
			const dup = { ...element, id: nanoid(), x: element.x + 16, y: element.y + 16 };
			pushHistory();
			mutateActiveElements((prev) => [...prev, dup]);
			setSelectedIds([dup.id]);
			toast.success('Element duplicated');
		},
		[pushHistory, mutateActiveElements],
	);

	const handleInteractionStart = useCallback(() => pushHistory(), [pushHistory]);

	// Background setters (per active side)
	const setSideBg = useCallback(
		(updates: Partial<SideDesign>) => setSides((prev) => ({ ...prev, [activeSide]: { ...prev[activeSide], ...updates } })),
		[activeSide],
	);

	// Serialize
	const buildDesignJson = useCallback(
		(): IdCardDesign => ({ card: { size: cardSize, orientation }, zoom: displayZoom, front: sides.front, back: sides.back }),
		[cardSize, orientation, displayZoom, sides],
	);

	// Switching side clears selection
	const handleSideChange = useCallback((side: Side) => {
		setActiveSide(side);
		setSelectedIds([]);
	}, []);

	// Load template
	useEffect(() => {
		if (!template || isLoadingTemplate || !templateId) return;
		if (String(template.id) !== String(templateId)) return;
		setTitle(template.title);
		const design = parseDesign(template.design_json);
		setSides({ front: design.front, back: design.back });
		setCardSize(design.card.size);
		setOrientation(design.card.orientation);
		// Keep auto-fit on load so the card fills the viewport regardless of the saved zoom.
		setAutoFit(true);
		setZoom(design.zoom || 1);
		setHistory([]);
		setFuture([]);
	}, [template, templateId, isLoadingTemplate]);

	// Not found
	useEffect(() => {
		if (templateId && !template && !isLoadingTemplate) {
			toast.error('ID template not found');
			navigate('/id-card-builder');
		}
	}, [templateId, template, isLoadingTemplate, navigate]);

	// Keyboard shortcuts
	useEffect(() => {
		const isTyping = (el: Element | null) => {
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
			if (e.key === 'Delete' || e.key === 'Backspace') {
				if (isTyping(document.activeElement)) return;
				if (selectedIds.length) {
					e.preventDefault();
					handleDeleteSelected();
				}
			}
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [selectedIds, undo, redo, handleDeleteSelected]);

	// Export PDF — front on page 1, back on page 2, at the card's physical size
	const handleExportPdf = useCallback(async () => {
		const front = frontExportRef.current;
		const back = backExportRef.current;
		if (!front || !back) return;
		try {
			const opts = { backgroundColor: '#ffffff', scale: 3, useCORS: true } as Parameters<typeof html2canvas>[1];
			const frontCanvas = await html2canvas(front, opts);
			const backCanvas = await html2canvas(back, opts);

			const pdf = new jsPDF({ orientation, unit: 'pt', format: [preset.pw, preset.ph] });
			const pageW = pdf.internal.pageSize.getWidth();
			const pageH = pdf.internal.pageSize.getHeight();
			pdf.addImage(frontCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
			pdf.addPage([preset.pw, preset.ph], orientation);
			pdf.addImage(backCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
			pdf.save(`${title || 'student-id'}.pdf`);
			toast.success('PDF exported (front + back)');
		} catch (error) {
			toast.error('Failed to export PDF. The template image may block cross-origin capture.');
			console.error('ID PDF export error:', error);
		}
	}, [orientation, preset.pw, preset.ph, title]);

	if (!currentInstitution) {
		return (
			<motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center justify-center h-full bg-gray-50">
				<Card className="max-w-md mx-auto text-center">
					<CardBody>
						<div className="w-24 h-24 bg-gradient-to-br from-red-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-6">
							<AlertTriangle className="w-12 h-12 text-red-600" />
						</div>
						<h3 className="text-xl font-semibold text-gray-900 mb-2">No Institution Access</h3>
						<p className="text-gray-600 mb-8">You don't have access to any institution. Please contact your administrator.</p>
						<Button onClick={() => navigate('/dashboard')} variant="primary">Go to Dashboard</Button>
					</CardBody>
				</Card>
			</motion.div>
		);
	}

	if (isLoadingTemplate) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
					<p className="text-gray-600">Loading template...</p>
				</div>
			</div>
		);
	}

	const renderSide = (side: SideDesign, interactive: boolean) => (
		<div
			style={{
				width: preset.w,
				height: preset.h,
				backgroundColor: side.bgColor,
				backgroundImage: side.bgImage ? `url(${side.bgImage})` : undefined,
				backgroundSize: side.bgImage ? (side.bgImageObjectFit === 'fill' ? '100% 100%' : side.bgImageObjectFit) : undefined,
				backgroundPosition: 'center',
				backgroundRepeat: 'no-repeat',
				position: 'relative',
			}}
		>
			<IdCardCanvas
				width={preset.w}
				height={preset.h}
				scale={interactive ? displayZoom : 1}
				elements={side.elements}
				selectedElementIds={interactive ? selectedIds : []}
				onSelect={setSelectedIds}
				onChange={handleUpdateElement}
				onInteractionStart={handleInteractionStart}
				onChangeEnd={() => {}}
				showGrid={interactive && showGrid}
				snappingEnabled={snapping}
				previewStudent={previewStudent}
				studentContext={studentContext}
				readOnly={!interactive}
			/>
		</div>
	);

	return (
		<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full w-full overflow-hidden bg-gray-50">
			{/* Left - Elements */}
			<motion.div
				initial={false}
				animate={{ width: elementsPanelOpen ? 240 : 52 }}
				transition={{ type: 'spring', stiffness: 300, damping: 30 }}
				className="flex-shrink-0 flex flex-col bg-gradient-to-b from-gray-50 to-white border-r border-gray-200 shadow-sm overflow-hidden"
			>
				{elementsPanelOpen ? (
					<IdElementsPanel institution={fullInstitution} onAddElement={handleAddElement} onCollapse={() => setElementsPanelOpen(false)} />
				) : (
					<button type="button" onClick={() => setElementsPanelOpen(true)} className="flex flex-col items-center justify-center w-full flex-1 min-h-[120px] py-4 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors" title="Show Elements panel">
						<PanelLeft className="w-6 h-6" />
						<span className="mt-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Elements</span>
					</button>
				)}
			</motion.div>

			{/* Main */}
			<div className="flex-1 flex flex-col">
				<IdCardToolbar
					activeSide={activeSide}
					onSideChange={handleSideChange}
					cardSize={cardSize}
					orientation={orientation}
					zoom={displayZoom}
					isFit={autoFit}
					onFit={() => setAutoFit(true)}
					bgColor={sides[activeSide].bgColor}
					bgImage={sides[activeSide].bgImage}
					bgImageObjectFit={sides[activeSide].bgImageObjectFit}
					title={title}
					templateId={templateId}
					onCardSizeChange={setCardSize}
					onOrientationChange={setOrientation}
					onZoomChange={(z) => { setAutoFit(false); setZoom(z); }}
					onBgColorChange={(c) => setSideBg({ bgColor: c })}
					onBgImageChange={(img) => setSideBg({ bgImage: img })}
					onBgImageObjectFitChange={(fit: BgObjectFit) => setSideBg({ bgImageObjectFit: fit })}
					onTitleChange={setTitle}
					onExportPdf={handleExportPdf}
					onUndo={undo}
					onRedo={redo}
					onToggleGrid={() => setShowGrid((g) => !g)}
					onToggleRuler={() => setShowRuler((r) => !r)}
					onToggleSnapping={() => setSnapping((s) => !s)}
					showGrid={showGrid}
					showRuler={showRuler}
					snapping={snapping}
					canUndo={canUndo}
					canRedo={canRedo}
					designData={buildDesignJson()}
					onBackToList={() => navigate('/id-card-builder')}
					onSaved={(id) => navigate(`/id-card-builder?id=${id}`)}
				/>

				{/* Student preview bar */}
				{hasStudentVars && (
					<div className="px-4 py-2 bg-emerald-50/80 border-b border-emerald-200 flex items-center gap-3 flex-wrap">
						<div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
							<User className="w-4 h-4" />
							<span>Preview student</span>
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
								<button type="button" onClick={() => { setPreviewStudent(null); setStudentSearchQuery(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100" title="Clear">
									<X className="w-4 h-4" />
								</button>
							)}
							{studentSearchFocused && !previewStudent && (
								<ul className="absolute z-[100] left-0 right-0 mt-1 py-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
									{searchStudents.length === 0 ? (
										<li className="px-3 py-2 text-sm text-gray-500">{studentSearchQuery.length >= 1 ? 'No students found. Try name or LRN.' : 'Type to search, or pick one below...'}</li>
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
						{previewStudent && <span className="text-xs text-emerald-700">Previewing both sides with this student</span>}
					</div>
				)}

				{/* Canvas */}
				<div ref={scrollRef} className="flex-1 overflow-auto p-6">
					<div className="min-h-full min-w-full flex items-center justify-center">
						<div className="flex flex-col items-center gap-3">
							<span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{activeSide} side</span>
							{(() => {
								const offset = showRuler ? RULER_SIZE : 0;
								const groupW = offset + preset.w;
								const groupH = offset + preset.h;
								return (
									<div style={{ width: groupW * displayZoom, height: groupH * displayZoom, position: 'relative' }}>
										<div style={{ transform: `scale(${displayZoom})`, transformOrigin: 'top left', width: groupW, height: groupH, position: 'absolute', top: 0, left: 0 }}>
											{showRuler && (
												<>
													{/* Corner */}
													<div className="bg-gray-100 border-r border-b border-gray-300 rounded-tl" style={{ position: 'absolute', top: 0, left: 0, width: RULER_SIZE, height: RULER_SIZE }} />
													{/* Top ruler */}
													<div className="bg-gray-100 border-b border-gray-300" style={{ position: 'absolute', top: 0, left: RULER_SIZE, width: preset.w, height: RULER_SIZE }}>
														{(() => {
															const centerX = preset.w / 2;
															const ticks = Array.from({ length: Math.ceil(preset.w / TICK_INTERVAL) + 1 }, (_, i) => i * TICK_INTERVAL).filter((v) => v <= preset.w);
															if (!ticks.some((v) => Math.abs(v - centerX) < 2)) ticks.push(Math.round(centerX));
															ticks.sort((a, b) => a - b);
															return ticks.map((pos) => {
																const isCenter = Math.abs(pos - centerX) < 2;
																return (
																	<div key={`h-${pos}`} className="absolute flex flex-col items-center text-gray-500" style={{ left: pos, top: 0 }}>
																		<div className={`w-px ${isCenter ? 'h-3 bg-indigo-500' : 'h-2 bg-gray-400'}`} style={{ marginTop: 2 }} />
																		<span className={`text-[8px] mt-0.5 select-none ${isCenter ? 'text-indigo-600 font-semibold' : ''}`}>{isCenter ? '½' : pos}</span>
																	</div>
																);
															});
														})()}
													</div>
													{/* Left ruler */}
													<div className="bg-gray-100 border-r border-gray-300" style={{ position: 'absolute', top: RULER_SIZE, left: 0, width: RULER_SIZE, height: preset.h }}>
														{(() => {
															const centerY = preset.h / 2;
															const ticks = Array.from({ length: Math.ceil(preset.h / TICK_INTERVAL) + 1 }, (_, i) => i * TICK_INTERVAL).filter((v) => v <= preset.h);
															if (!ticks.some((v) => Math.abs(v - centerY) < 2)) ticks.push(Math.round(centerY));
															ticks.sort((a, b) => a - b);
															return ticks.map((pos) => {
																const isCenter = Math.abs(pos - centerY) < 2;
																return (
																	<div key={`v-${pos}`} className="absolute flex items-center gap-0.5 text-gray-500" style={{ left: 0, top: pos }}>
																		<div className={`h-px flex-shrink-0 ${isCenter ? 'w-3 bg-indigo-500' : 'w-2 bg-gray-400'}`} style={{ marginLeft: 2 }} />
																		<span className={`text-[8px] select-none whitespace-nowrap origin-left ${isCenter ? 'text-indigo-600 font-semibold' : ''}`} style={{ transform: 'rotate(-90deg)', marginLeft: 2 }}>{isCenter ? '½' : pos}</span>
																	</div>
																);
															});
														})()}
													</div>
												</>
											)}
											{/* Card paper */}
											<div className="shadow-2xl relative rounded-xl overflow-hidden ring-1 ring-gray-200" style={{ position: 'absolute', top: offset, left: offset, width: preset.w, height: preset.h }}>
												{showRuler && (
													<div className="absolute inset-0 pointer-events-none z-20">
														<div className="absolute top-0 bottom-0 w-0 border-l border-dashed border-indigo-400/60" style={{ left: '50%' }} />
														<div className="absolute left-0 right-0 h-0 border-t border-dashed border-indigo-400/60" style={{ top: '50%' }} />
													</div>
												)}
												<div ref={canvasRef} style={{ width: preset.w, height: preset.h, position: 'relative', zIndex: 3 }}>
													{renderSide(sides[activeSide], true)}
												</div>
											</div>
										</div>
									</div>
								);
							})()}
						</div>
					</div>
				</div>

				{/* Institution footer */}
				<div className="px-6 py-3 bg-white border-t border-gray-200">
					<div className="flex items-center gap-2 text-sm text-gray-600">
						<Building2 className="w-4 h-4 text-gray-400" />
						<span>Designing ID for: <strong className="text-gray-900">{currentInstitution.name}</strong></span>
					</div>
				</div>
			</div>

			{/* Right - Properties + Layers */}
			<motion.div initial={{ x: 300 }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="w-80 border-l border-gray-200 bg-white flex flex-col">
				<div className="flex-1 overflow-hidden">
					<IdPropertiesPanel
						element={selectedElements[0] || null}
						onChange={(el) => { pushHistory(); handleUpdateElement(el); }}
						onDelete={handleDeleteSelected}
						onDuplicate={handleDuplicateElement}
					/>
				</div>
				<div className="border-t border-gray-200" />
				<div className="flex-1 overflow-hidden">
					<IdLayersPanel
						elements={activeElements}
						selectedIds={selectedIds}
						onSelect={setSelectedIds}
						onToggleHide={(id) => mutateActiveElements((prev) => prev.map((e) => (e.id === id ? { ...e, hidden: !e.hidden } : e)))}
						onToggleLock={(id) => mutateActiveElements((prev) => prev.map((e) => (e.id === id ? { ...e, locked: !e.locked } : e)))}
						onReorder={(id, dir) =>
							mutateActiveElements((prev) => {
								const list = [...prev];
								const i = list.findIndex((e) => e.id === id);
								if (i === -1) return prev;
								const t = dir === 'up' ? i + 1 : i - 1;
								if (t < 0 || t >= list.length) return prev;
								[list[i], list[t]] = [list[t], list[i]];
								return list;
							})
						}
						onDelete={handleDeleteSelected}
						onDuplicate={handleDuplicateElement}
					/>
				</div>
			</motion.div>

			{/* Off-screen full-size render of both sides for clean PDF capture.
			    width/height 0 + overflow hidden ⇒ zero layout impact (no page scroll). */}
			<div aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
				<div ref={frontExportRef} style={{ position: 'absolute', top: 0, left: 0 }}>{renderSide(sides.front, false)}</div>
				<div ref={backExportRef} style={{ position: 'absolute', top: 0, left: 0 }}>{renderSide(sides.back, false)}</div>
			</div>
		</motion.div>
	);
}
