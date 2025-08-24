import { useState, useRef, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import ElementsPanel from './components/ElementsPanel';
import PropertiesPanel from './components/PropertiesPanel';
import { CertificateCanvas, type CanvasElement } from './components/CertificateCanvas';
import Button from '@/components/ui/Button';

export default function CertificateBuilder() {
	const [elements, setElements] = useState<CanvasElement[]>([]);
	const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
	const canvasRef = useRef<HTMLDivElement | null>(null);

	const selectedElement = useMemo(() => elements.find(e => e.id === selectedElementId) || null, [elements, selectedElementId]);

	function handleAddElement(newElement: CanvasElement) {
		setElements(prev => [...prev, newElement]);
		setSelectedElementId(newElement.id);
	}

	function handleUpdateElement(updated: CanvasElement) {
		setElements(prev => prev.map(e => e.id === updated.id ? updated : e));
	}

	function handleDeleteSelected() {
		if (!selectedElementId) return;
		setElements(prev => prev.filter(e => e.id !== selectedElementId));
		setSelectedElementId(null);
	}

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
					<Button variant="secondary" onClick={handleDeleteSelected} disabled={!selectedElementId}>Delete</Button>
				</div>
				<div className="flex-1 overflow-auto p-6">
					<div className="mx-auto bg-white shadow relative rounded" style={{ width: 1123, height: 794 }} ref={canvasRef}>
						<CertificateCanvas
							elements={elements}
							selectedElementId={selectedElementId}
							onSelect={setSelectedElementId}
							onChange={handleUpdateElement}
						/>
					</div>
				</div>
			</div>

			{/* Right: Properties Panel */}
			<div className="w-72 border-l bg-white">
				<PropertiesPanel element={selectedElement} onChange={handleUpdateElement} />
			</div>
		</div>
	);
}