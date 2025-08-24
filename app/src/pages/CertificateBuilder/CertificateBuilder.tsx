import { useState, useRef, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import ElementsPanel from './components/ElementsPanel';
import PropertiesPanel from './components/PropertiesPanel';
import { CertificateCanvas, type CanvasElement } from './components/CertificateCanvas';
import LayersPanel from './components/LayersPanel';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';

const presets = {
	a4: { portrait: { w: 794, h: 1123, pdf: 'a4' as const }, landscape: { w: 1123, h: 794, pdf: 'a4' as const } },
	letter: { portrait: { w: 816, h: 1056, pdf: 'letter' as const }, landscape: { w: 1056, h: 816, pdf: 'letter' as const } },
	legal: { portrait: { w: 816, h: 1344, pdf: 'legal' as const }, landscape: { w: 1344, h: 816, pdf: 'legal' as const } },
};

type Paper = keyof typeof presets;

type Orientation = 'portrait' | 'landscape';

export default function CertificateBuilder() {
	const [elements, setElements] = useState<CanvasElement[]>([]);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [showGrid, setShowGrid] = useState(true);
	const [snapping, setSnapping] = useState(true);
	const [history, setHistory] = useState<CanvasElement[][]>([]);
	const [future, setFuture] = useState<CanvasElement[][]>([]);
	const [paper, setPaper] = useState<Paper>('a4');
	const [orientation, setOrientation] = useState<Orientation>('landscape');
	const [zoom, setZoom] = useState<number>(1);
	const canvasRef = useRef<HTMLDivElement | null>(null);

	const selectedElements = useMemo(() => elements.filter(e => selectedIds.includes(e.id)), [elements, selectedIds]);
	const canvasSize = presets[paper][orientation];

	function snapshot(state: CanvasElement[]): CanvasElement[] { return state.map((e, idx) => ({ ...e, zIndex: idx })); }
	function pushHistory(state: CanvasElement[]) { setHistory(prev => [...prev, snapshot(state)]); setFuture([]); }
	function setElementsAndKeepOrder(next: CanvasElement[] | ((prev: CanvasElement[]) => CanvasElement[])) { setElements(prev => snapshot(typeof next === 'function' ? (next as (prev: CanvasElement[]) => CanvasElement[])(prev) : next)); }

	function undo() { setHistory(prev => { if (prev.length === 0) return prev; const newHistory = prev.slice(0, -1); const last = prev[prev.length - 1]; setFuture(f => [snapshot(elements), ...f]); setElementsAndKeepOrder(last); return newHistory; }); }
	function redo() { setFuture(prev => { if (prev.length === 0) return prev; const [next, ...rest] = prev; setHistory(h => [...h, snapshot(elements)]); setElementsAndKeepOrder(next); return rest; }); }

	function handleAddElement(newElement: CanvasElement) { pushHistory(elements); setElementsAndKeepOrder(prev => [...prev, { ...newElement, zIndex: prev.length } as any] as any); setSelectedIds([newElement.id]); }
	function handleUpdateElement(updated: CanvasElement) { setElements(prev => prev.map(e => e.id === updated.id ? updated : e)); }
	function handleDeleteSelected() { if (!selectedIds.length) return; pushHistory(elements); setElementsAndKeepOrder(prev => prev.filter(e => !selectedIds.includes(e.id))); setSelectedIds([]); }
	function handleInteractionStart() { pushHistory(elements); }
	function handleChangeEnd() {}

	useEffect(() => {
		function isTypingTarget(el: Element | null) { if (!el) return false; const tag = (el as HTMLElement).tagName.toLowerCase(); return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable; }
		function onKey(e: KeyboardEvent) { const meta = e.ctrlKey || e.metaKey; if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); } if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); return redo(); } if ((e.key === 'Delete' || e.key === 'Backspace')) { if (isTypingTarget(document.activeElement)) return; if (selectedIds.length) { e.preventDefault(); handleDeleteSelected(); } } }
		document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
	}, [selectedIds, elements]);

	async function handleExportPdf() { if (!canvasRef.current) return; const node = canvasRef.current; const canvas = await html2canvas(node, { background: '#ffffff', scale: 2 } as any); const imgData = canvas.toDataURL('image/png'); const pdf = new jsPDF({ orientation, unit: 'pt', format: canvasSize.pdf }); const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = pdf.internal.pageSize.getHeight(); pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST'); pdf.save('certificate.pdf'); }

	return (
		<div className="flex h-full w-full overflow-hidden">
			<div className="w-64 border-r bg-white overflow-auto">
				<ElementsPanel onAddElement={handleAddElement} />
				<div className="border-t" />
				<LayersPanel elements={elements} selectedIds={selectedIds} onSelect={setSelectedIds} onToggleHide={(id) => setElements(prev => prev.map(e => e.id === id ? { ...e, hidden: !e.hidden } : e))} onToggleLock={(id) => setElements(prev => prev.map(e => e.id === id ? { ...e, locked: !e.locked } : e))} onReorder={(id, dir) => setElements(prev => { const list = [...prev]; const i = list.findIndex(e => e.id === id); if (i === -1) return prev; const t = dir === 'up' ? i + 1 : i - 1; if (t < 0 || t >= list.length) return prev; [list[i], list[t]] = [list[t], list[i]]; return snapshot(list); })} onDelete={(id) => { setSelectedIds(ids => ids.filter(x => x !== id)); setElements(prev => prev.filter(e => e.id !== id)); }} />
			</div>

			<div className="flex-1 flex flex-col bg-gray-50">
				<div className="p-3 border-b bg-white">
					<div className="flex items-center gap-2">
						<Button onClick={handleExportPdf}>Export PDF</Button>
						<div className="flex-1" />
						<Button variant="secondary" onClick={undo} disabled={history.length === 0}>Undo</Button>
						<Button variant="secondary" onClick={redo} disabled={future.length === 0}>Redo</Button>
					</div>
					<div className="mt-3 flex flex-wrap items-center gap-2">
						<label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={snapping} onChange={(e) => setSnapping(e.target.checked)} /> Snapping</label>
						<label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid</label>
						<div className="h-6 w-px bg-gray-200 mx-1" />
						<Select value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
							<option value="a4">A4</option>
							<option value="letter">Letter</option>
							<option value="legal">Legal</option>
						</Select>
						<Select value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)}>
							<option value="portrait">Portrait</option>
							<option value="landscape">Landscape</option>
						</Select>
						<Select value={String(zoom)} onChange={(e) => setZoom(Number(e.target.value))}>
							{[0.25,0.5,0.75,1,1.25,1.5].map(z => <option key={z} value={z}>{Math.round(z*100)}%</option>)}
						</Select>
					</div>
				</div>
				<div className="flex-1 overflow-auto p-6">
					<div className="mx-auto bg-white shadow relative rounded" style={{ width: canvasSize.w * zoom, height: canvasSize.h * zoom }}>
						<div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: canvasSize.w, height: canvasSize.h }} ref={canvasRef}>
							<CertificateCanvas width={canvasSize.w} height={canvasSize.h} scale={zoom} elements={elements} selectedElementIds={selectedIds} onSelect={setSelectedIds} onChange={handleUpdateElement} onInteractionStart={handleInteractionStart} onChangeEnd={handleChangeEnd} showGrid={showGrid} snappingEnabled={snapping} />
						</div>
					</div>
				</div>
			</div>

			<div className="w-72 border-l bg-white">
				<PropertiesPanel element={selectedElements[0] || null} onChange={(el) => { pushHistory(elements); handleUpdateElement(el); }} />
			</div>
		</div>
	);
}