import type { CanvasElement } from './CertificateCanvas';
import Button from '@/components/ui/Button';

export default function LayersPanel({ elements, selectedIds, onSelect, onToggleHide, onToggleLock, onReorder }:{
	elements: CanvasElement[];
	selectedIds: string[];
	onSelect: (ids: string[]) => void;
	onToggleHide: (id: string) => void;
	onToggleLock: (id: string) => void;
	onReorder: (id: string, direction: 'up' | 'down') => void;
}) {
	return (
		<div className="p-3 space-y-2 text-sm">
			<h3 className="text-sm font-medium text-gray-700 mb-2">Layers</h3>
			<div className="space-y-1">
				{elements.map((el, idx) => {
					const selected = selectedIds.includes(el.id);
					return (
						<div key={el.id} className={`flex items-center justify-between px-2 py-1 rounded ${selected ? 'bg-gray-100' : ''}`}>
							<button className="text-left flex-1 truncate" onClick={() => onSelect([el.id])} title={el.name || el.text || el.id}>
								{el.name || el.text || el.type}
							</button>
							<div className="flex items-center gap-1">
								<Button variant="ghost" size="sm" onClick={() => onToggleHide(el.id)}>{el.hidden ? '👁️‍🗨️' : '👁️'}</Button>
								<Button variant="ghost" size="sm" onClick={() => onToggleLock(el.id)}>{el.locked ? '🔒' : '🔓'}</Button>
								<Button variant="ghost" size="sm" onClick={() => onReorder(el.id, 'up')} disabled={idx === elements.length - 1}>⬆️</Button>
								<Button variant="ghost" size="sm" onClick={() => onReorder(el.id, 'down')} disabled={idx === 0}>⬇️</Button>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}