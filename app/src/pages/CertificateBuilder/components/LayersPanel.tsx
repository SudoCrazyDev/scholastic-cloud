import type { CanvasElement } from './CertificateCanvas';
import Button from '@/components/ui/Button';

export default function LayersPanel({ elements, selectedIds, onSelect, onToggleHide, onToggleLock, onReorder, onDelete }:{
	elements: CanvasElement[];
	selectedIds: string[];
	onSelect: (ids: string[]) => void;
	onToggleHide: (id: string) => void;
	onToggleLock: (id: string) => void;
	onReorder: (id: string, direction: 'up' | 'down') => void;
	onDelete?: (id: string) => void;
}) {
	return (
		<div className="p-3 space-y-2 text-sm">
			<h3 className="text-sm font-medium text-gray-700 mb-2">Layers</h3>
			<div className="space-y-1">
				{elements.map((el, idx) => {
					const selected = selectedIds.includes(el.id);
					return (
						<div key={el.id} className={`flex items-center justify-between px-2 py-2 rounded border ${selected ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-200'} hover:bg-gray-50`}>
							<button className="text-left flex-1 truncate" onClick={() => onSelect([el.id])} title={el.name || el.text || el.id}>
								{el.name || el.text || el.type}
							</button>
							<div className="flex items-center gap-1">
								<Button variant="ghost" size="sm" onClick={() => onToggleHide(el.id)} title={el.hidden ? 'Show' : 'Hide'}>{el.hidden ? '👁️‍🗨️' : '👁️'}</Button>
								<Button variant="ghost" size="sm" onClick={() => onToggleLock(el.id)} title={el.locked ? 'Unlock' : 'Lock'}>{el.locked ? '🔒' : '🔓'}</Button>
								<Button variant="ghost" size="sm" onClick={() => onReorder(el.id, 'up')} disabled={idx === elements.length - 1} title="Move up">⬆️</Button>
								<Button variant="ghost" size="sm" onClick={() => onReorder(el.id, 'down')} disabled={idx === 0} title="Move down">⬇️</Button>
								{onDelete && (
									<Button variant="ghost" size="sm" onClick={() => onDelete(el.id)} title="Delete">🗑️</Button>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}