import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DocumentTextIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  ArrowUpTrayIcon,
  PhotoIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import {
  studentAssessmentService,
  type TakeAssessmentPayload,
  type AssessmentQuestion,
  type AssessmentAnswers,
  type UploadAnswer,
} from '@/services/studentAssessmentService';
import { Button } from '@/components/button';

const isUploadAnswer = (value: unknown): value is UploadAnswer =>
  !!value && typeof value === 'object' && !Array.isArray(value) && 'path' in (value as Record<string, unknown>);

export const TakeAssessment: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<AssessmentAnswers>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ score: number; max_score: number } | null>(null);

  const { data: showData, isLoading: showLoading } = useQuery({
    queryKey: ['student-assessment', id],
    queryFn: () => studentAssessmentService.show(id!),
    enabled: !!id && !submitted,
  });

  const startMutation = useMutation({
    mutationFn: () => studentAssessmentService.start(id!),
    onSuccess: (res) => {
      queryClient.setQueryData(['student-assessment', id], res);
      if (res.data?.answers) setAnswers(res.data.answers);
    },
  });

  const submitMutation = useMutation({
    mutationFn: (ans: AssessmentAnswers) => studentAssessmentService.submit(id!, ans),
    onSuccess: (res) => {
      setResult(res.data);
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['student-assessments'] });
    },
  });

  const payload = showData?.data as (TakeAssessmentPayload & { attempt_status?: string; attempt?: { score?: number; max_score?: number } }) | undefined;
  const status = payload?.attempt_status;
  const questions = payload?.questions ?? [];
  const needStart = status === 'not_started' && questions.length > 0 && !startMutation.isSuccess && !startMutation.data;
  const alreadySubmitted = status === 'submitted' && payload?.attempt && !submitted && !result;

  useEffect(() => {
    if (payload?.answers && Object.keys(payload.answers).length > 0) setAnswers(payload.answers);
  }, [payload?.answers]);

  useEffect(() => {
    if (
      status === 'not_started' &&
      questions.length > 0 &&
      !startMutation.isPending &&
      !startMutation.data &&
      !startMutation.isError
    ) {
      startMutation.mutate();
    }
  }, [status, questions.length, startMutation.isPending, startMutation.data, startMutation.isError]);

  useEffect(() => {
    if (alreadySubmitted && payload?.attempt) {
      setResult({ score: payload.attempt.score ?? 0, max_score: payload.attempt.max_score ?? 0 });
      setSubmitted(true);
    }
  }, [alreadySubmitted, payload?.attempt]);

  const handleAnswer = (index: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [String(index)]: value }));
  };

  const handleMultipleChoice = (index: number, letter: string) => {
    setAnswers((prev) => {
      const key = String(index);
      const current = prev[key];
      const arr: string[] = Array.isArray(current)
        ? current.filter((v): v is string => typeof v === 'string')
        : typeof current === 'string'
          ? [current]
          : [];
      const set = new Set(arr);
      if (set.has(letter)) set.delete(letter);
      else set.add(letter);
      return { ...prev, [key]: Array.from(set).sort() };
    });
  };

  const handleFillInBlank = (index: number, blankIdx: number, value: string) => {
    setAnswers((prev) => {
      const key = String(index);
      const current = prev[key];
      const arr = Array.isArray(current) ? [...current] : [];
      const next = [...arr];
      next[blankIdx] = value;
      return { ...prev, [key]: next };
    });
  };

  const handleTextAnswer = (index: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [String(index)]: value }));
  };

  const handleFileUpload = async (index: number, file: File) => {
    const key = String(index);
    setUploading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await studentAssessmentService.uploadAttachment(id!, index, file);
      setAnswers((prev) => ({ ...prev, [key]: res.data }));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Upload failed. Please try again.');
    } finally {
      setUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleSubmit = () => {
    submitMutation.mutate(answers);
  };

  if (!id) {
    navigate('/my-assessments');
    return null;
  }

  if (showLoading || (needStart && startMutation.isPending)) {
    return (
      <div className="max-w-2xl mx-auto p-6 flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        <span className="ml-3 text-gray-600">Loading...</span>
      </div>
    );
  }

  if (startMutation.isError && !startMutation.data) {
    const startError = startMutation.error as { response?: { data?: { message?: string } } } | undefined;
    const message =
      startError?.response?.data?.message ?? 'This assessment cannot be started right now.';
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
          <DocumentTextIcon className="w-14 h-14 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Assessment unavailable</h2>
          <p className="text-gray-600 mb-6">{message}</p>
          <Button onClick={() => navigate('/my-assessments')}>Back to My Assessments</Button>
        </div>
      </div>
    );
  }

  if (submitted && result) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
          <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Submitted</h2>
          <p className="text-3xl font-bold text-indigo-600 mb-2">
            {result.score} / {result.max_score}
          </p>
          <p className="text-gray-600 mb-6">Your score has been recorded.</p>
          <Button onClick={() => navigate('/my-assessments')}>Back to My Assessments</Button>
        </div>
      </div>
    );
  }

  const currentPayload = startMutation.data?.data ?? payload;
  const currentQuestions = (currentPayload?.questions ?? []) as AssessmentQuestion[];
  const canSubmit = currentQuestions.length > 0;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-2 mb-2">
          <DocumentTextIcon className="w-6 h-6 text-indigo-600" />
          <h1 className="text-xl font-bold text-gray-900">{currentPayload?.title ?? 'Assessment'}</h1>
        </div>
        {currentPayload?.description && (
          <p className="text-gray-600 text-sm mb-4">{currentPayload.description}</p>
        )}
        <p className="text-sm text-gray-500">
          {currentPayload?.subject_title && <span>{currentPayload.subject_title}</span>}
          {currentPayload?.quarter && <span> · Quarter {currentPayload.quarter}</span>}
          {currentPayload?.max_score != null && <span> · Max score: {currentPayload.max_score}</span>}
        </p>
      </div>

      <div className="space-y-6">
        {currentQuestions.map((q, idx) => {
          const type = q.type ?? 'single_choice';
          const key = String(q.index);
          const answerVal = answers[key];
          return (
            <div key={q.index} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <p className="font-medium text-gray-900 mb-3">
                <span className="inline-flex items-center justify-center w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full text-sm font-bold mr-2">
                  {idx + 1}
                </span>
                {q.question}
              </p>
              <div className="space-y-2 ml-10">
                {type === 'true_false' && (
                  <>
                    {['True', 'False'].map((opt) => {
                      const isSelected = answerVal === opt;
                      return (
                        <label
                          key={opt}
                          className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${q.index}`}
                            value={opt}
                            checked={isSelected}
                            onChange={() => handleAnswer(q.index, opt)}
                            className="text-indigo-600"
                          />
                          <span className="text-gray-800">{opt}</span>
                        </label>
                      );
                    })}
                  </>
                )}
                {type === 'single_choice' &&
                  q.choices?.map((choice, cIdx) => {
                    const letter = String.fromCharCode(65 + cIdx);
                    const isSelected = answerVal === letter || answerVal === choice;
                    return (
                      <label
                        key={cIdx}
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${q.index}`}
                          value={letter}
                          checked={isSelected}
                          onChange={() => handleAnswer(q.index, letter)}
                          className="text-indigo-600"
                        />
                        <span className="text-gray-800">{choice}</span>
                      </label>
                    );
                  })}
                {type === 'multiple_choice' && (
                  q.choices?.map((choice, cIdx) => {
                    const letter = String.fromCharCode(65 + cIdx);
                    const selectedArr = Array.isArray(answerVal) ? answerVal : answerVal ? [answerVal] : [];
                    const isSelected = selectedArr.includes(letter);
                    return (
                      <label
                        key={cIdx}
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleMultipleChoice(q.index, letter)}
                          className="rounded border-gray-300 text-indigo-600"
                        />
                        <span className="text-gray-800">{choice}</span>
                      </label>
                    );
                  })
                )}
                {type === 'fill_in_the_blanks' && (
                  <div className="space-y-2">
                    {Array.from({ length: q.num_blanks ?? 1 }, (_, bIdx) => (
                      <div key={bIdx}>
                        <label className="block text-xs text-gray-500 mb-1">Blank {bIdx + 1}</label>
                        <input
                          type="text"
                          value={Array.isArray(answerVal) ? (answerVal[bIdx] ?? '') : ''}
                          onChange={(e) => handleFillInBlank(q.index, bIdx, e.target.value)}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          placeholder={`Answer ${bIdx + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {type === 'short_answer' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Your answer</label>
                    <input
                      type="text"
                      value={typeof answerVal === 'string' ? answerVal : ''}
                      onChange={(e) => handleTextAnswer(q.index, e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder={q.placeholder ?? 'Write your answer'}
                    />
                  </div>
                )}
                {type === 'essay' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Your answer</label>
                    <textarea
                      value={typeof answerVal === 'string' ? answerVal : ''}
                      onChange={(e) => handleTextAnswer(q.index, e.target.value)}
                      className="w-full min-h-32 border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder={q.placeholder ?? 'Write your detailed response'}
                    />
                  </div>
                )}
                {(type === 'image_upload' || type === 'video_upload') && (() => {
                  const upload = isUploadAnswer(answerVal) ? answerVal : null;
                  const isUploading = !!uploading[key];
                  const accept = q.accept ?? (type === 'image_upload' ? 'image/*' : 'video/*');
                  return (
                    <div className="space-y-3">
                      {q.instructions && <p className="text-sm text-gray-600">{q.instructions}</p>}
                      {upload && (
                        <div className="rounded-lg border border-gray-200 p-3">
                          {type === 'image_upload' && upload.url && (
                            <img
                              src={upload.url}
                              alt={upload.name}
                              className="max-h-64 rounded-md object-contain"
                            />
                          )}
                          {type === 'video_upload' && upload.url && (
                            <video src={upload.url} controls className="max-h-64 w-full rounded-md" />
                          )}
                          <p className="mt-2 truncate text-xs text-gray-500" title={upload.name}>
                            {upload.name}
                          </p>
                        </div>
                      )}
                      <label
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          isUploading
                            ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
                            : 'border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50'
                        }`}
                      >
                        {type === 'image_upload' ? (
                          <PhotoIcon className="h-4 w-4" />
                        ) : (
                          <VideoCameraIcon className="h-4 w-4" />
                        )}
                        {isUploading ? (
                          'Uploading…'
                        ) : (
                          <>
                            <ArrowUpTrayIcon className="h-4 w-4" />
                            {upload
                              ? 'Replace file'
                              : `Upload ${type === 'image_upload' ? 'image' : 'video'}`}
                          </>
                        )}
                        <input
                          type="file"
                          accept={accept}
                          disabled={isUploading}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(q.index, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center pt-4">
        <Button variant="outline" onClick={() => navigate('/my-assessments')}>
          Back
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || submitMutation.isPending}
          className="inline-flex items-center gap-2"
        >
          <PaperAirplaneIcon className="w-4 h-4" />
          Submit
        </Button>
      </div>
    </div>
  );
};

export default TakeAssessment;
