import React from 'react';
import { Select } from '@/components/select';

interface MatchingQuestionProps {
  /** Left prompts, in a fixed order (student answers align to this order). */
  lefts: string[];
  /** Right values to match against, shuffled server-side. */
  options: string[];
  /** Current answer: value[i] is the option chosen for lefts[i]. */
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * Matching Type (student view): each left prompt gets a dropdown of the shuffled
 * right-side options. Dropdowns are reliable across desktop and touch and keep
 * the interaction accessible.
 */
export const MatchingQuestion: React.FC<MatchingQuestionProps> = ({ lefts, options, value, onChange }) => {
  const setAnswer = (index: number, chosen: string) => {
    const next = [...value];
    while (next.length < lefts.length) next.push('');
    next[index] = chosen;
    onChange(next);
  };

  const selectOptions = [
    { value: '', label: 'Select a match…' },
    ...options.map((opt) => ({ value: opt, label: opt })),
  ];

  return (
    <div className="space-y-3">
      {lefts.map((left, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 sm:flex-row sm:items-center sm:gap-3"
        >
          <div className="flex-1 text-sm font-medium text-gray-800">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">
              {index + 1}
            </span>
            {left}
          </div>
          <div className="sm:w-56">
            <Select
              value={value[index] ?? ''}
              onChange={(event) => setAnswer(index, event.target.value)}
              options={selectOptions}
              className="w-full"
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default MatchingQuestion;
