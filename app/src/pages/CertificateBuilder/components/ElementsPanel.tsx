import { nanoid } from 'nanoid';
import type { CanvasElement } from './CertificateCanvas';
import { useRef } from 'react';

export default function ElementsPanel({ onAddElement }:{ onAddElement: (el: CanvasElement) => void }) {
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	function addText() {
		onAddElement({
			id: nanoid(),
			type: 'text',
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
			onAddElement({ id: nanoid(), type: 'image', x: 150, y: 120, width: 400, height: 300, rotation: 0, src });
			if (fileInputRef.current) fileInputRef.current.value = '';
		};
		reader.readAsDataURL(file);
	}

	return (
		<div className="p-3 space-y-2">
			<h3 className="text-sm font-medium text-gray-700">Elements</h3>
			<button className="w-full px-3 py-2 border rounded" onClick={addText}>Add Text</button>
			<button className="w-full px-3 py-2 border rounded" onClick={triggerImage}>Add Image</button>
			<input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
			<button className="w-full px-3 py-2 border rounded" onClick={addRectangle}>Add Rectangle</button>
			<button className="w-full px-3 py-2 border rounded" onClick={addEllipse}>Add Ellipse</button>
		</div>
	);
}