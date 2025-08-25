import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCertificate } from '@/hooks/useCertificates';
import { nanoid } from 'nanoid';

// Components
import ElementsPanel from './components/ElementsPanel';
import PropertiesPanel from './components/PropertiesPanel';
import CertificateCanvas, { type CanvasElement } from './components/CertificateCanvas';
import LayersPanel from './components/LayersPanel';
import CertificateToolbar from './components/CertificateToolbar';

// UI Components
import Button from '@/components/ui/Button';
import Card, { CardBody } from '@/components/ui/Card';
import { AlertTriangle, Building2 } from 'lucide-react';

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

interface DesignData {
	paper: Paper;
	orientation: Orientation;
	zoom: number;
	bgColor: string;
	bgImage: string | null;
	elements: CanvasElement[];
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
	const [showGrid, setShowGrid] = useState(true);
	const [snapping, setSnapping] = useState(true);
	const [history, setHistory] = useState<CanvasElement[][]>([]);
	const [future, setFuture] = useState<CanvasElement[][]>([]);
	const [paper, setPaper] = useState<Paper>('a4');
	const [orientation, setOrientation] = useState<Orientation>('landscape');
	const [zoom, setZoom] = useState<number>(1);
	const [bgColor, setBgColor] = useState<string>('#ffffff');
	const [bgImage, setBgImage] = useState<string | null>(null);
	const [title, setTitle] = useState<string>('Untitled Certificate');
	
	// Refs
	const canvasRef = useRef<HTMLDivElement | null>(null);
	
	// Get certificate ID from URL or state
	const certificateId = searchParams.get('id') ? Number(searchParams.get('id')) : null;
	
	// TanStack Query hooks
	const { data: certificate, isLoading: isLoadingCertificate } = useCertificate(certificateId);
	
	// Get user's default institution
	const currentInstitution = useMemo(() => {
		const defaultInstitution = user?.user_institutions?.find((ui: UserInstitution) => ui.is_default)?.institution;
		const mainInstitution = user?.user_institutions?.find((ui: UserInstitution) => ui.is_main)?.institution;
		return defaultInstitution || mainInstitution;
	}, [user?.user_institutions]);

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

	// Serialize current design
	const buildDesignJson = useCallback((): DesignData => ({
		paper,
		orientation,
		zoom,
		bgColor,
		bgImage,
		elements,
	}), [paper, orientation, zoom, bgColor, bgImage, elements]);

	// Load certificate data
	useEffect(() => {
		if (certificate && !isLoadingCertificate) {
			setTitle(certificate.title);
			const design = certificate.design_json || {};
			setElements(design.elements || []);
			if (design.paper) setPaper(design.paper);
			if (design.orientation) setOrientation(design.orientation);
			if (design.zoom) setZoom(design.zoom);
			if (design.bgColor) setBgColor(design.bgColor);
			setBgImage(design.bgImage || null);
		}
	}, [certificate, isLoadingCertificate]);

	// Load certificate from URL parameter
	useEffect(() => {
		if (certificateId && !certificate && !isLoadingCertificate) {
			toast.error('Certificate not found');
			navigate('/certificates');
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
			{/* Left Sidebar - Elements Only */}
			<motion.div
				initial={{ x: -300 }}
				animate={{ x: 0 }}
				transition={{ type: "spring", stiffness: 300, damping: 30 }}
				className="w-64 bg-white border-r border-gray-200"
			>
				<ElementsPanel onAddElement={handleAddElement} />
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
					title={title}
					certificateId={certificateId}
					onPaperChange={(paper: string) => setPaper(paper as Paper)}
					onOrientationChange={setOrientation}
					onZoomChange={setZoom}
					onBgColorChange={setBgColor}
					onBgImageChange={setBgImage}
					onTitleChange={setTitle}
					onExportPdf={handleExportPdf}
					onUndo={undo}
					onRedo={redo}
					onToggleGrid={() => setShowGrid(!showGrid)}
					onToggleSnapping={() => setSnapping(!snapping)}
					showGrid={showGrid}
					snapping={snapping}
					canUndo={canUndo}
					canRedo={canRedo}
					designData={buildDesignJson()}
				/>

				{/* Canvas Area */}
				<div className="flex-1 overflow-auto p-6">
					<div 
						className="mx-auto shadow-2xl relative rounded-lg"
						style={{
							width: canvasSize.w,
							height: canvasSize.h,
							backgroundColor: '#f8fafc',
							zIndex: 1
						}}
					>
						<div 
							key={`canvas-${canvasSize.w}-${canvasSize.h}`}
							style={{ 
								transform: `scale(${zoom})`, 
								transformOrigin: 'top left', 
								width: canvasSize.w, 
								height: canvasSize.h, 
								backgroundColor: bgColor, 
								backgroundImage: bgImage ? `url(${bgImage})` : undefined, 
								backgroundSize: 'cover', 
								backgroundPosition: 'center',
								position: 'absolute',
								top: 0,
								left: 0,
								zIndex: 3
							}} 
							ref={canvasRef}
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
								key={`${canvasSize.w}-${canvasSize.h}`}
							/>
						</div>
					</div>
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

			{/* Right Sidebar - Properties & Layers */}
			<motion.div
				initial={{ x: 300 }}
				animate={{ x: 0 }}
				transition={{ type: "spring", stiffness: 300, damping: 30 }}
				className="w-80 border-l border-gray-200 bg-white flex flex-col"
			>
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