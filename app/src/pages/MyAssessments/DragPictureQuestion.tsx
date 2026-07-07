import React from 'react';
import clsx from 'clsx';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { DragTargetView, DragCardView, DragPictureAnswer } from '@/services/studentAssessmentService';

interface DragPictureQuestionProps {
  targets: DragTargetView[];
  cards: DragCardView[];
  /** Current answer: maps card id -> target id it was placed in. */
  value: DragPictureAnswer;
  onChange: (next: DragPictureAnswer) => void;
}

const TRAY_ID = 'drag-picture-tray';

const CardChip: React.FC<{ card: DragCardView }> = ({ card }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={clsx(
        'flex w-24 cursor-grab touch-none flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-sm active:cursor-grabbing',
        isDragging && 'opacity-50'
      )}
      {...attributes}
      {...listeners}
    >
      <div className="h-16 w-full overflow-hidden rounded-md bg-gray-50">
        {card.imageUrl ? (
          <img src={card.imageUrl} alt={card.label || 'picture'} className="h-full w-full object-cover" />
        ) : null}
      </div>
      {card.label && <span className="w-full truncate text-center text-xs text-gray-600">{card.label}</span>}
    </div>
  );
};

const DropZone: React.FC<{ id: string; label: string; children: React.ReactNode; index: number }> = ({
  id,
  label,
  children,
  index,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'min-h-28 rounded-xl border-2 border-dashed p-3 transition-colors',
        isOver ? 'border-orange-400 bg-orange-50' : 'border-gray-300 bg-gray-50'
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-orange-200 bg-orange-100 text-xs font-bold text-orange-700">
          {index + 1}
        </span>
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
};

/**
 * Drag The Picture (student view): drag each picture card from the tray into the
 * correct labeled drop zone. Placement is stored as a card-id → target-id map.
 */
export const DragPictureQuestion: React.FC<DragPictureQuestionProps> = ({ targets, cards, value, onChange }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  const trayDroppable = useDroppable({ id: TRAY_ID });

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over) return;
    const cardId = String(event.active.id);
    const overId = String(event.over.id);
    const next = { ...value };
    if (overId === TRAY_ID) {
      delete next[cardId];
    } else if (targets.some((target) => target.id === overId)) {
      next[cardId] = overId;
    }
    onChange(next);
  };

  const trayCards = cards.filter((card) => !value[card.id]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        <div
          ref={trayDroppable.setNodeRef}
          className={clsx(
            'rounded-xl border p-3 transition-colors',
            trayDroppable.isOver ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white'
          )}
        >
          <p className="mb-2 text-xs font-medium text-gray-500">Pictures — drag into a zone below</p>
          <div className="flex min-h-24 flex-wrap gap-2">
            {trayCards.length === 0 ? (
              <span className="text-xs text-gray-400">All pictures placed.</span>
            ) : (
              trayCards.map((card) => <CardChip key={card.id} card={card} />)
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {targets.map((target, index) => (
            <DropZone key={target.id} id={target.id} label={target.label} index={index}>
              {cards
                .filter((card) => value[card.id] === target.id)
                .map((card) => (
                  <CardChip key={card.id} card={card} />
                ))}
            </DropZone>
          ))}
        </div>
      </div>
    </DndContext>
  );
};

export default DragPictureQuestion;
