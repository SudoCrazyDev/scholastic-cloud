import type { CanvasElement } from './CertificateCanvas';

export default function PropertiesPanel({ element, onChange }:{ element: CanvasElement | null, onChange: (el: CanvasElement) => void }) {
	if (!element) {
		return <div className="p-3 text-sm text-gray-500">Select an element to edit its properties.</div>;
	}

	function update<K extends keyof CanvasElement>(key: K, value: CanvasElement[K]) {
		onChange({ ...element, [key]: value } as CanvasElement);
	}

	return (
		<div className="p-3 space-y-3 text-sm">
			<h3 className="text-sm font-medium text-gray-700">Properties</h3>
			{element.type === 'text' && (
				<div className="space-y-2">
					<label className="block">
						<span className="text-gray-600">Text</span>
						<textarea className="mt-1 w-full border rounded p-2" rows={3} value={element.text || ''} onChange={(e) => update('text', e.target.value)} />
					</label>
					<div className="grid grid-cols-2 gap-2">
						<label className="block">
							<span className="text-gray-600">Font family</span>
							<select className="mt-1 w-full border rounded p-2" value={element.fontFamily || 'serif'} onChange={(e) => update('fontFamily', e.target.value)}>
								<option value="serif">Serif</option>
								<option value="sans-serif">Sans Serif</option>
								<option value="monospace">Monospace</option>
							</select>
						</label>
						<label className="block">
							<span className="text-gray-600">Font size</span>
							<input type="number" className="mt-1 w-full border rounded p-2" value={element.fontSize || 24} onChange={(e) => update('fontSize', Number(e.target.value))} />
						</label>
						<label className="block">
							<span className="text-gray-600">Weight</span>
							<input type="number" className="mt-1 w-full border rounded p-2" value={element.fontWeight || 400} onChange={(e) => update('fontWeight', Number(e.target.value))} />
						</label>
						<label className="block">
							<span className="text-gray-600">Color</span>
							<input type="color" className="mt-1 w-full border rounded p-2" value={element.color || '#111827'} onChange={(e) => update('color', e.target.value)} />
						</label>
					</div>
				</div>
			)}

			{element.type === 'shape' && (
				<div className="space-y-2">
					<label className="block">
						<span className="text-gray-600">Fill</span>
						<input type="color" className="mt-1 w-full border rounded p-2" value={element.fill || '#e5e7eb'} onChange={(e) => update('fill', e.target.value)} />
					</label>
					<label className="block">
						<span className="text-gray-600">Stroke</span>
						<input type="color" className="mt-1 w-full border rounded p-2" value={element.stroke || '#000000'} onChange={(e) => update('stroke', e.target.value)} />
					</label>
					<label className="block">
						<span className="text-gray-600">Stroke width</span>
						<input type="number" className="mt-1 w-full border rounded p-2" value={element.strokeWidth || 0} onChange={(e) => update('strokeWidth', Number(e.target.value))} />
					</label>
				</div>
			)}

			<div className="grid grid-cols-2 gap-2">
				<label className="block">
					<span className="text-gray-600">X</span>
					<input type="number" className="mt-1 w-full border rounded p-2" value={element.x} onChange={(e) => update('x', Number(e.target.value))} />
				</label>
				<label className="block">
					<span className="text-gray-600">Y</span>
					<input type="number" className="mt-1 w-full border rounded p-2" value={element.y} onChange={(e) => update('y', Number(e.target.value))} />
				</label>
				<label className="block">
					<span className="text-gray-600">Width</span>
					<input type="number" className="mt-1 w-full border rounded p-2" value={element.width} onChange={(e) => update('width', Number(e.target.value))} />
				</label>
				<label className="block">
					<span className="text-gray-600">Height</span>
					<input type="number" className="mt-1 w-full border rounded p-2" value={element.height} onChange={(e) => update('height', Number(e.target.value))} />
				</label>
				<label className="block col-span-2">
					<span className="text-gray-600">Rotation</span>
					<input type="number" className="mt-1 w-full border rounded p-2" value={element.rotation} onChange={(e) => update('rotation', Number(e.target.value))} />
				</label>
			</div>
		</div>
	);
}