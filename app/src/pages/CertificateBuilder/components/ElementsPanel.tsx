import { nanoid } from 'nanoid';
import type { CanvasElement } from './CertificateCanvas';
import { useRef } from 'react';
import Button from '@/components/ui/Button';
import { Type as TypeIcon, Image as ImageIcon, Square as SquareIcon, Circle as CircleIcon, Building2, MapPin, Braces } from 'lucide-react';

export default function ElementsPanel({ onAddElement }:{ onAddElement: (el: CanvasElement) => void }) {
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	function addText() {
		onAddElement({
			id: nanoid(),
			type: 'text',
			name: 'Text',
			x: 100,
			y: 100,
			width: 300,
			height: 60,
			rotation: 0,
			text: 'Certificate Title',
			fontFamily: 'serif',
			fontSize: 36,
			fontWeight: 700,
			color: '#111827'
		});
	}

	function addRectangle() {
		onAddElement({
			id: nanoid(),
			type: 'shape',
			name: 'Rectangle',
			x: 80,
			y: 80,
			width: 400,
			height: 200,
			rotation: 0,
			shape: 'rect',
			fill: '#f3f4f6',
			stroke: '#d1d5db',
			strokeWidth: 1
		});
	}

	function addEllipse() {
		onAddElement({
			id: nanoid(),
			type: 'shape',
			name: 'Ellipse',
			x: 200,
			y: 200,
			width: 200,
			height: 200,
			rotation: 0,
			shape: 'ellipse',
			fill: '#eef2ff',
			stroke: '#c7d2fe',
			strokeWidth: 1
		});
	}

	function triggerImage() {
		fileInputRef.current?.click();
	}

	function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const src = reader.result as string;
			onAddElement({ id: nanoid(), type: 'image', name: 'Image', x: 150, y: 120, width: 400, height: 300, rotation: 0, src });
			if (fileInputRef.current) fileInputRef.current.value = '';
		};
		reader.readAsDataURL(file);
	}

	function addInstitutionTitleVar() {
		onAddElement({
			id: nanoid(),
			type: 'text',
			name: 'Var: {institution_title}',
			x: 120,
			y: 120,
			width: 480,
			height: 50,
			rotation: 0,
			text: '{institution_title}',
			fontFamily: 'serif',
			fontSize: 28,
			fontWeight: 600,
			color: '#111827'
		});
	}

	function addInstitutionAddressVar() {
		onAddElement({
			id: nanoid(),
			type: 'text',
			name: 'Var: {institution_address}',
			x: 120,
			y: 180,
			width: 520,
			height: 50,
			rotation: 0,
			text: '{institution_address}',
			fontFamily: 'serif',
			fontSize: 18,
			fontWeight: 400,
			color: '#374151'
		});
	}

	function addLogoVar() {
		const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'><rect width='100%' height='100%' fill='%23e5e7eb' stroke='%23d1d5db'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='sans-serif' font-size='24'>Logo</text></svg>`;
		const src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
		onAddElement({ id: nanoid(), type: 'image', name: 'Var: {logo}', x: 140, y: 220, width: 300, height: 200, rotation: 0, src });
	}

	return (
		<div className="p-3 space-y-4">
			<div className="space-y-3">
				<h3 className="text-sm font-medium text-gray-700">Elements</h3>
				<div className="flex items-center gap-2 flex-wrap">
					<Button variant="secondary" size="sm" className="p-2" onClick={addText} title="Add Text">
						<TypeIcon className="w-4 h-4" />
					</Button>
					<Button variant="secondary" size="sm" className="p-2" onClick={triggerImage} title="Add Image">
						<ImageIcon className="w-4 h-4" />
					</Button>
					<input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
					<Button variant="secondary" size="sm" className="p-2" onClick={addRectangle} title="Add Rectangle">
						<SquareIcon className="w-4 h-4" />
					</Button>
					<Button variant="secondary" size="sm" className="p-2" onClick={addEllipse} title="Add Ellipse">
						<CircleIcon className="w-4 h-4" />
					</Button>
				</div>
			</div>

			<div className="space-y-3">
				<h3 className="text-sm font-medium text-gray-700">Variables</h3>
				<div className="flex items-center gap-2 flex-wrap">
					<Button variant="secondary" size="sm" className="p-2" onClick={addInstitutionTitleVar} title="{institution_title}">
						<Building2 className="w-4 h-4" />
					</Button>
					<Button variant="secondary" size="sm" className="p-2" onClick={addInstitutionAddressVar} title="{institution_address}">
						<MapPin className="w-4 h-4" />
					</Button>
					<Button variant="secondary" size="sm" className="p-2" onClick={addLogoVar} title="{logo}">
						<Braces className="w-4 h-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}