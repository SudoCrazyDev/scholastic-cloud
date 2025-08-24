import { useState, useRef, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import ElementsPanel from './components/ElementsPanel';
import PropertiesPanel from './components/PropertiesPanel';
import { CertificateCanvas, type CanvasElement } from './components/CertificateCanvas';
import Button from '@/components/ui/Button';

export default function CertificateBuilder() {
	const [elements, setElements] = useState<CanvasElement[]>([]);
	const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
	const [showGrid, setShowGrid] = useState(true);
	const [snapping, setSnapping] = useState(true);

	const [history, setHistory] = useState<CanvasElement[][]>([]);
	const [future, setFuture] = useState<CanvasElement[][]>([]);
	const canvasRef = useRef<HTMLDivElement | null>(null);

	const selectedElement = useMemo(() => elements.find(e => e.id === selectedElementId) || null, [elements, selectedElementId]);

	// History helpers
	function pushHistory(state: CanvasElement[]) {
		setHistory(prev => [...prev, state.map(e => ({ ...e }))]);
		setFuture([]);
	}

	function undo() {
		setHistory(prev => {
			if (prev.length === 0) return prev;
			const newHistory = prev.slice(0, -1);
			const last = prev[prev.length - 1];
			setFuture(f => [elements.map(e => ({ ...e })), ...f]);
			setElements(last.map(e => ({ ...e })));
			return newHistory;
		});
	}

	function redo() {
		setFuture(prev => {
			if (prev.length === 0) return prev;
			const [next, ...rest] = prev;
			setHistory(h => [...h, elements.map(e => ({ ...e }))]);
			setElements(next.map(e => ({ ...e })));
			return rest;
		});
	}

	function handleAddElement(newElement: CanvasElement) {
		pushHistory(elements);
		setElements(prev => [...prev, newElement]);
		setSelectedElementId(newElement.id);
	}

	function handleUpdateElement(updated: CanvasElement) {
		setElements(prev => prev.map(e => e.id === updated.id ? updated : e));
	}

	function handleDeleteSelected() {
		if (!selectedElementId) return;
		pushHistory(elements);
		setElements(prev => prev.filter(e => e.id !== selectedElementId));
		setSelectedElementId(null);
	}

	function handleInteractionStart() {
		pushHistory(elements);
	}

	function handleChangeEnd() {
		// no-op placeholder for now
	}

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			const meta = e.ctrlKey || e.metaKey;
			if (meta && e.key.toLowerCase() === 'z') {
				e.preventDefault();
				if (e.shiftKey) {
					redo();
				} else {
					undo();
				}
			}
			if (meta && e.key.toLowerCase() === 'y') {
				e.preventDefault();
				redo();
			}
			if (e.key === 'Delete' || e.key === 'Backspace') {
				if (selectedElementId) {
					e.preventDefault();
					handleDeleteSelected();
				}
			}
		}
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [selectedElementId, elements]);

	async function handleExportPdf() {
		if (!canvasRef.current) return;
		const node = canvasRef.current;
		const canvas = await html2canvas(node, { background: '#ffffff', scale: 2 } as any);
		const imgData = canvas.toDataURL('image/png');
		const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
		const pageWidth = pdf.internal.pageSize.getWidth();
		const pageHeight = pdf.internal.pageSize.getHeight();
		pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
		pdf.save('certificate.pdf');
	}

	const canvasWidth = 1123;
	const canvasHeight = 794;

	return (
		<div className="flex h-full w-full overflow-hidden">
			{/* Left: Elements Panel */}
			<div className="w-64 border-r bg-white">
				<ElementsPanel onAddElement={handleAddElement} />
			</div>

			{/* Center: Canvas */}
			<div className="flex-1 flex flex-col bg-gray-50">
				<div className="p-3 border-b bg-white flex items-center gap-2">
					<Button onClick={handleExportPdf}>Export PDF</Button>
					<Button variant="secondary" onClick={undo} disabled={history.length === 0}>Undo</Button>
					<Button variant="secondary" onClick={redo} disabled={future.length === 0}>Redo</Button>
					<div className="flex items-center ml-auto gap-2">
						<label className="inline-flex items-center gap-2 text-sm text-gray-700">
							<input type="checkbox" checked={snapping} onChange={(e) => setSnapping(e.target.checked)} /> Snapping
						</label>
						<label className="inline-flex items-center gap-2 text-sm text-gray-700">
							<input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid
						</label>
						<Button variant="secondary" onClick={handleDeleteSelected} disabled={!selectedElementId}>Delete</Button>
					</div>
				</div>
				<div className="flex-1 overflow-auto p-6">
					<div className="mx-auto bg-white shadow relative rounded" style={{ width: canvasWidth, height: canvasHeight }} ref={canvasRef}>
						<CertificateCanvas
							width={canvasWidth}
							height={canvasHeight}
							elements={elements}
							selectedElementId={selectedElementId}
							onSelect={setSelectedElementId}
							onChange={handleUpdateElement}
							onInteractionStart={handleInteractionStart}
							onChangeEnd={handleChangeEnd}
							showGrid={showGrid}
							snappingEnabled={snapping}
						/>
					</div>
				</div>
			</div>

			{/* Right: Properties Panel */}
			<div className="w-72 border-l bg-white">
				<PropertiesPanel element={selectedElement} onChange={(el) => { pushHistory(elements); handleUpdateElement(el); }} />
			</div>
		</div>
	);
}