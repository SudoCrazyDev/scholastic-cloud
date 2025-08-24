import type { CanvasElement } from './CertificateCanvas';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Label from '@/components/ui/Label';

export default function PropertiesPanel({ element, onChange }:{ element: CanvasElement | null, onChange: (el: CanvasElement) => void }) {
	if (!element) {
		return <div className="p-3 text-sm text-gray-500">Select an element to edit its properties.</div>;
	}

	function update<K extends keyof CanvasElement>(key: K, value: CanvasElement[K]) {
		onChange({ ...element, [key]: value } as CanvasElement);
	}

	return (
		<div className="p-3 space-y-3 text-sm">
			<div>
				<Label className="mb-1">Type</Label>
				<div className="text-gray-700 capitalize">{element.type}</div>
			</div>

			{element.type === 'text' && (
				<div className="space-y-2">
					<Label>Text</Label>
					<textarea className="mt-1 w-full border rounded p-2" rows={3} value={element.text || ''} onChange={(e) => update('text', e.target.value)} />
					<div className="grid grid-cols-2 gap-2">
						<div>
							<Label>Font family</Label>
							<Select value={element.fontFamily || 'serif'} onChange={(e) => update('fontFamily', e.target.value)}>
								<option value="serif">Serif</option>
								<option value="sans-serif">Sans Serif</option>
								<option value="monospace">Monospace</option>
							</Select>
						</div>
						<div>
							<Label>Font size</Label>
							<Input type="number" value={element.fontSize || 24} onChange={(e) => update('fontSize', Number(e.target.value))} />
						</div>
						<div>
							<Label>Weight</Label>
							<Input type="number" value={element.fontWeight || 400} onChange={(e) => update('fontWeight', Number(e.target.value))} />
						</div>
						<div>
							<Label>Color</Label>
							<Input type="color" value={element.color || '#111827'} onChange={(e) => update('color', e.target.value)} />
						</div>
						<div className="col-span-2">
							<Label>Text align</Label>
							<Select value={element.textAlign || 'left'} onChange={(e) => update('textAlign', e.target.value as CanvasElement['textAlign'])}>
								<option value="left">Left</option>
								<option value="center">Center</option>
								<option value="right">Right</option>
							</Select>
						</div>
					</div>
				</div>
			)}

			{element.type === 'shape' && (
				<div className="space-y-2">
					<div>
						<Label>Fill</Label>
						<Input type="color" value={element.fill || '#e5e7eb'} onChange={(e) => update('fill', e.target.value)} />
					</div>
					<div>
						<Label>Stroke</Label>
						<Input type="color" value={element.stroke || '#000000'} onChange={(e) => update('stroke', e.target.value)} />
					</div>
					<div>
						<Label>Stroke width</Label>
						<Input type="number" value={element.strokeWidth || 0} onChange={(e) => update('strokeWidth', Number(e.target.value))} />
					</div>
				</div>
			)}

			<div className="grid grid-cols-2 gap-2">
				<div>
					<Label>X</Label>
					<Input type="number" value={element.x} onChange={(e) => update('x', Number(e.target.value))} />
				</div>
				<div>
					<Label>Y</Label>
					<Input type="number" value={element.y} onChange={(e) => update('y', Number(e.target.value))} />
				</div>
				<div>
					<Label>Width</Label>
					<Input type="number" value={element.width} onChange={(e) => update('width', Number(e.target.value))} />
				</div>
				<div>
					<Label>Height</Label>
					<Input type="number" value={element.height} onChange={(e) => update('height', Number(e.target.value))} />
				</div>
				<div className="col-span-2">
					<Label>Rotation</Label>
					<Input type="number" value={element.rotation} onChange={(e) => update('rotation', Number(e.target.value))} />
				</div>
			</div>
		</div>
	);
}