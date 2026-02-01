import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { subjectEcrService } from '@/services/subjectEcrService';
import { subjectEcrItemService, type SubjectEcrItem } from '@/services/subjectEcrItemService';
import { Button } from '@/components/button';
import { Input } from '@/components/input';
import { Badge } from '@/components/badge';

type AssessmentType = 'quiz' | 'assignment' | 'exam';

interface AssessmentBuilderTabProps {
  subjectId: string;
}

type QuestionType = 'true_false' | 'single_choice' | 'multiple_choice' | 'fill_in_the_blanks';

interface QuestionForm {
  type: QuestionType;
  question: string;
  choices: string[];
  answer: string;
  answerMultiple: string[]; // for multiple_choice (e.g. ['A','B'])
  blanks: string[]; // for fill_in_the_blanks (correct answers in order)
  points: number;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  true_false: 'True / False',
  single_choice: 'Single Choice',
  multiple_choice: 'Multiple Choice',
  fill_in_the_blanks: 'Fill In The Blanks',
};

const DEFAULT_QUESTION: QuestionForm = {
  type: 'single_choice',
  question: '',
  choices: ['A. ', 'B. ', 'C. ', 'D. '],
  answer: 'A',
  answerMultiple: [],
  blanks: [''],
  points: 1,
};

export const AssessmentBuilderTab: React.FC<AssessmentBuilderTabProps> = ({ subjectId }) => {
  const queryClient = useQueryClient();
  const [builderType, setBuilderType] = useState<AssessmentType>('quiz');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SubjectEcrItem | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    score: 10,
    quarter: '1',
    questions: [] as QuestionForm[],
  });

  const { data: ecrRes } = useQuery({
    queryKey: ['subjectEcrs', subjectId],
    queryFn: () => subjectEcrService.getBySubject(subjectId),
    enabled: !!subjectId,
  });
  const ecrs = (ecrRes?.data ?? []) as { id: string; title: string }[];
  const firstEcrId = ecrs[0]?.id;

  const { data: itemsRes, isLoading } = useQuery({
    queryKey: ['subjectEcrItems', subjectId, builderType],
    queryFn: () =>
      subjectEcrItemService.listBySubject({
        subject_id: subjectId,
        type: builderType,
      }),
    enabled: !!subjectId,
  });
  const items = (itemsRes?.data ?? []) as SubjectEcrItem[];

  const createMutation = useMutation({
    mutationFn: (data: Omit<SubjectEcrItem, 'id'>) => subjectEcrItemService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjectEcrItems'] });
      closeModal();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SubjectEcrItem> }) =>
      subjectEcrItemService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjectEcrItems'] });
      closeModal();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => subjectEcrItemService.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subjectEcrItems'] }),
  });

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
    setForm({
      title: '',
      description: '',
      score: 10,
      quarter: '1',
      questions: [],
    });
  };

  const openCreate = () => {
    setEditingItem(null);
    setForm({
      title: '',
      description: '',
      score: builderType === 'exam' ? 50 : builderType === 'quiz' ? 10 : 20,
      quarter: '1',
      questions: [{ ...DEFAULT_QUESTION }],
    });
    setModalOpen(true);
  };

  const openEdit = (item: SubjectEcrItem) => {
    setEditingItem(item);
    const questions = (item.content?.questions ?? []).map((q: any) => {
      const type = (q.type ?? 'single_choice') as QuestionType;
      const answerRaw = q.answer;
      const answerSingle = Array.isArray(answerRaw)
        ? (answerRaw[0] ?? 'A').toString().trim().charAt(0).toUpperCase() || 'A'
        : (answerRaw ?? 'A').toString().trim().charAt(0).toUpperCase() || 'A';
      const answerMultiple = Array.isArray(answerRaw)
        ? answerRaw.map((a: string) => (a ?? '').toString().trim().charAt(0).toUpperCase() || '')
        : (typeof answerRaw === 'string' && answerRaw.includes(','))
          ? answerRaw.split(',').map((a: string) => a.trim().charAt(0).toUpperCase() || '')
          : [];
      return {
        type,
        question: q.question ?? '',
        choices: type === 'true_false' ? ['True', 'False'] : (Array.isArray(q.choices) ? q.choices : ['A. ', 'B. ', 'C. ', 'D. ']),
        answer: type === 'true_false' ? (answerSingle === 'T' ? 'True' : 'False') : answerSingle,
        answerMultiple: answerMultiple.length ? answerMultiple : [],
        blanks: Array.isArray(q.blanks) && q.blanks.length > 0 ? q.blanks : [''],
        points: typeof q.points === 'number' ? q.points : 1,
      };
    });
    setForm({
      title: item.title ?? '',
      description: item.description ?? '',
      score: Number(item.score) ?? 10,
      quarter: item.quarter ?? '1',
      questions: questions.length ? questions : [{ ...DEFAULT_QUESTION }],
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!firstEcrId) return;
    const payload: Omit<SubjectEcrItem, 'id'> = {
      subject_ecr_id: firstEcrId,
      type: builderType,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      score: form.score,
      quarter: form.quarter,
      content:
        form.questions.length > 0
          ? {
              questions: form.questions.map((q) => {
                const base = { type: q.type, question: q.question.trim(), points: q.points };
                if (q.type === 'true_false') {
                  return { ...base, choices: ['True', 'False'], answer: q.answer };
                }
                if (q.type === 'single_choice') {
                  return {
                    ...base,
                    choices: q.choices.filter((c) => c.trim().length > 0),
                    answer: q.answer.trim().charAt(0).toUpperCase() || 'A',
                  };
                }
                if (q.type === 'multiple_choice') {
                  return {
                    ...base,
                    choices: q.choices.filter((c) => c.trim().length > 0),
                    answer: q.answerMultiple.filter(Boolean).length > 0 ? q.answerMultiple.filter(Boolean) : [q.answer],
                  };
                }
                if (q.type === 'fill_in_the_blanks') {
                  return { ...base, blanks: q.blanks.filter((b) => b.trim().length > 0).map((b) => b.trim()) };
                }
                return { ...base, choices: q.choices, answer: q.answer };
              }),
            }
          : undefined,
    };
    if (editingItem?.id) {
      updateMutation.mutate({ id: editingItem.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const setQuestion = (index: number, field: keyof QuestionForm, value: any) => {
    const next = form.questions.map((q, i) =>
      i !== index ? q : { ...q, [field]: value }
    );
    if (field === 'type') {
      const newType = value as QuestionType;
      const q = next[index];
      if (newType === 'true_false') {
        q.choices = ['True', 'False'];
        q.answer = 'True';
        q.answerMultiple = [];
        q.blanks = [''];
      } else if (newType === 'single_choice') {
        q.choices = q.choices?.length ? q.choices : ['A. ', 'B. ', 'C. ', 'D. '];
        q.answer = q.answer?.charAt(0).toUpperCase() || 'A';
        q.answerMultiple = [];
        q.blanks = [''];
      } else if (newType === 'multiple_choice') {
        q.choices = q.choices?.length ? q.choices : ['A. ', 'B. ', 'C. ', 'D. '];
        q.answerMultiple = q.answerMultiple?.length ? q.answerMultiple : [];
        q.blanks = [''];
      } else {
        q.blanks = q.blanks?.length ? q.blanks : [''];
        q.answerMultiple = [];
      }
    }
    setForm({ ...form, questions: next });
  };

  const setBlank = (qIndex: number, blankIndex: number, value: string) => {
    const next = [...form.questions];
    const blanks = [...(next[qIndex].blanks ?? [])];
    blanks[blankIndex] = value;
    next[qIndex].blanks = blanks;
    setForm({ ...form, questions: next });
  };

  const addBlank = (qIndex: number) => {
    const next = [...form.questions];
    next[qIndex].blanks = [...(next[qIndex].blanks ?? []), ''];
    setForm({ ...form, questions: next });
  };

  const removeBlank = (qIndex: number, blankIndex: number) => {
    const next = [...form.questions];
    next[qIndex].blanks = (next[qIndex].blanks ?? []).filter((_, i) => i !== blankIndex);
    setForm({ ...form, questions: next });
  };

  const toggleMultipleAnswer = (qIndex: number, letter: string) => {
    const next = [...form.questions];
    const arr = next[qIndex].answerMultiple ?? [];
    const set = new Set(arr);
    if (set.has(letter)) set.delete(letter);
    else set.add(letter);
    next[qIndex].answerMultiple = Array.from(set).sort();
    setForm({ ...form, questions: next });
  };

  const addQuestion = () => {
    setForm({ ...form, questions: [...form.questions, { ...DEFAULT_QUESTION }] });
  };

  const removeQuestion = (index: number) => {
    setForm({
      ...form,
      questions: form.questions.filter((_, i) => i !== index),
    });
  };

  const types: { id: AssessmentType; label: string }[] = [
    { id: 'quiz', label: 'Quiz' },
    { id: 'assignment', label: 'Assignment' },
    { id: 'exam', label: 'Exam' },
  ];

  return (
    <div className="space-y-4">
      {!firstEcrId && (
        <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          Set &quot;Components of Summative Assessment&quot; first so this subject has an ECR category (e.g. Written Works) to attach quizzes/assignments/exams to.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setBuilderType(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              builderType === t.id
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          {builderType.charAt(0).toUpperCase() + builderType.slice(1)}s
        </h3>
        <Button
          type="button"
          onClick={openCreate}
          disabled={!firstEcrId}
          className="inline-flex items-center gap-2"
        >
          <PlusIcon className="w-4 h-4" />
          Add {builderType.charAt(0).toUpperCase() + builderType.slice(1)}
        </Button>
      </div>
      {isLoading ? (
        <div className="py-8 text-center text-gray-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No {builderType}s yet. Add one to let students take it interactively (with live score).
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-200"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900">{item.title}</span>
                  {item.quarter && (
                    <Badge color="zinc">Q{item.quarter}</Badge>
                  )}
                  {item.content?.questions?.length != null && item.content.questions.length > 0 && (
                    <span className="text-xs text-gray-500">
                      {item.content.questions.length} question(s)
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="text-sm text-gray-600 mt-1 truncate">{item.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="p-2 text-gray-500 hover:text-indigo-600 rounded"
                  title="Edit"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Delete this item?')) deleteMutation.mutate(item.id!);
                  }}
                  className="p-2 text-gray-500 hover:text-red-600 rounded"
                  title="Delete"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {editingItem ? 'Edit' : 'Add'} {builderType.charAt(0).toUpperCase() + builderType.slice(1)}
              </h3>
              <button type="button" onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Quiz 1: Operations"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total score</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.score}
                    onChange={(e) => setForm({ ...form, score: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quarter</label>
                  <select
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    value={form.quarter}
                    onChange={(e) => setForm({ ...form, quarter: e.target.value })}
                  >
                    {['1', '2', '3', '4'].map((q) => (
                      <option key={q} value={q}>Q{q}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Questions</label>
                  <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
                    <PlusIcon className="w-4 h-4 mr-1" /> Add question
                  </Button>
                </div>
                <div className="space-y-4">
                  {form.questions.map((q, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-700">Question {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeQuestion(idx)}
                          className="text-red-600 text-sm hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mb-2">
                        <label className="block text-xs text-gray-500 mb-1">Type</label>
                        <select
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          value={q.type}
                          onChange={(e) => setQuestion(idx, 'type', e.target.value as QuestionType)}
                        >
                          {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
                            <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
                          ))}
                        </select>
                      </div>
                      <Input
                        className="mb-2"
                        value={q.question}
                        onChange={(e) => setQuestion(idx, 'question', e.target.value)}
                        placeholder={q.type === 'fill_in_the_blanks' ? 'e.g. The capital of Philippines is _____.' : 'Question text'}
                      />
                      {q.type === 'true_false' && (
                        <div className="mb-2">
                          <label className="block text-xs text-gray-500 mb-1">Correct answer</label>
                          <select
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            value={q.answer}
                            onChange={(e) => setQuestion(idx, 'answer', e.target.value)}
                          >
                            <option value="True">True</option>
                            <option value="False">False</option>
                          </select>
                        </div>
                      )}
                      {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                        <>
                          <div className="space-y-1 mb-2">
                            <label className="block text-xs text-gray-500 mb-1">Choices</label>
                            {(q.choices ?? []).map((choice, cIdx) => (
                              <Input
                                key={cIdx}
                                value={choice}
                                onChange={(e) => {
                                  const next = [...(q.choices ?? [])];
                                  next[cIdx] = e.target.value;
                                  setQuestion(idx, 'choices', next);
                                }}
                                placeholder={`Choice ${String.fromCharCode(65 + cIdx)}`}
                              />
                            ))}
                          </div>
                          {q.type === 'single_choice' && (
                            <div className="mb-2">
                              <label className="block text-xs text-gray-500 mb-1">Correct answer</label>
                              <select
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                value={q.answer}
                                onChange={(e) => setQuestion(idx, 'answer', e.target.value)}
                              >
                                {(q.choices ?? []).map((_, cIdx) => (
                                  <option key={cIdx} value={String.fromCharCode(65 + cIdx)}>{String.fromCharCode(65 + cIdx)}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {q.type === 'multiple_choice' && (
                            <div className="mb-2">
                              <label className="block text-xs text-gray-500 mb-1">Correct answer(s) (select all that apply)</label>
                              <div className="flex flex-wrap gap-2">
                                {(q.choices ?? []).map((_, cIdx) => {
                                  const letter = String.fromCharCode(65 + cIdx);
                                  const checked = (q.answerMultiple ?? []).includes(letter);
                                  return (
                                    <label key={cIdx} className="inline-flex items-center gap-1 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleMultipleAnswer(idx, letter)}
                                        className="rounded border-gray-300 text-indigo-600"
                                      />
                                      <span className="text-sm">{letter}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {q.type === 'fill_in_the_blanks' && (
                        <div className="mb-2">
                          <label className="block text-xs text-gray-500 mb-1">Correct answers for each blank (in order)</label>
                          <p className="text-xs text-gray-400 mb-1">Use <code className="bg-gray-100 px-1 rounded"> | </code> to allow multiple acceptable answers, e.g. Manila | Manila City</p>
                          <div className="space-y-1">
                            {(q.blanks ?? ['']).map((blank, bIdx) => (
                              <div key={bIdx} className="flex gap-2 items-center">
                                <Input
                                  value={blank}
                                  onChange={(e) => setBlank(idx, bIdx, e.target.value)}
                                  placeholder={`Blank ${bIdx + 1}`}
                                  className="flex-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeBlank(idx, bIdx)}
                                  className="text-red-600 text-sm hover:underline"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addBlank(idx)}
                              className="text-indigo-600 text-sm hover:underline"
                            >
                              + Add blank
                            </button>
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Points</label>
                        <Input
                          type="number"
                          min={0}
                          step={0.5}
                          value={q.points}
                          onChange={(e) => setQuestion(idx, 'points', Number(e.target.value) || 0)}
                          className="w-20"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!form.title.trim() || createMutation.isPending || updateMutation.isPending}
              >
                {editingItem ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentBuilderTab;
