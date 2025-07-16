import React, { useState, useEffect } from 'react';
import { Input } from '@/components/input';
import { Button } from '@/components/button';
import { Alert } from '@/components/alert';
import { Fieldset, Field, Label } from '@/components/fieldset';
import { Badge } from '@/components/badge';
import { Divider } from '@/components/divider';
import { subjectEcrService } from '../../../services/subjectEcrService';
import type { SubjectEcrComponent } from '../../../services/subjectEcrService';

interface SummativeAssessmentTabProps {
  subjectId: string;
}

interface AssessmentComponent {
  id?: string;
  title: string;
  percentage: number | '';
}

const SummativeAssessmentTab: React.FC<SummativeAssessmentTabProps> = ({ subjectId }) => {
  const [components, setComponents] = useState<AssessmentComponent[]>([]);
  const [originalComponents, setOriginalComponents] = useState<AssessmentComponent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isReadOnly, setIsReadOnly] = useState(false);

  useEffect(() => {
    let mounted = true;
    setFetching(true);
    subjectEcrService
      .getBySubject(subjectId)
      .then((res: { success: boolean; data: SubjectEcrComponent[] }) => {
        if (!mounted) return;
        if (res.success && res.data && res.data.length > 0) {
          setComponents(res.data.map((c) => ({ id: c.id, title: c.title, percentage: c.percentage })));
          setOriginalComponents(res.data.map((c) => ({ id: c.id, title: c.title, percentage: c.percentage })));
          setIsReadOnly(true);
        } else {
          setIsReadOnly(false);
          setComponents([]);
          setOriginalComponents([]);
        }
      })
      .catch(() => {
        if (mounted) setError('Failed to fetch existing assessment.');
      })
      .finally(() => {
        if (mounted) setFetching(false);
      });
    return () => {
      mounted = false;
    };
  }, [subjectId]);

  const handleChange = (index: number, field: keyof AssessmentComponent, value: string) => {
    if (isReadOnly) return;
    const updated = [...components];
    if (field === 'percentage') {
      updated[index][field] = value === '' ? '' : Number(value);
    } else {
      updated[index][field] = value;
    }
    setComponents(updated);
    setValidationErrors({});
  };

  const handleAdd = () => {
    if (isReadOnly) return;
    setComponents([...components, { title: '', percentage: '' }]);
  };

  const handleRemove = async (index: number) => {
    if (isReadOnly) return;
    const comp = components[index];
    if (comp.id) {
      setLoading(true);
      try {
        await subjectEcrService.delete(comp.id);
        const updated = components.filter((_, i) => i !== index);
        setComponents(updated);
        setOriginalComponents(updated);
        setSuccess('Component deleted successfully!');
      } catch (err: any) {
        setError('Failed to delete component.');
      } finally {
        setLoading(false);
      }
    } else {
      setComponents(components.filter((_, i) => i !== index));
    }
  };

  const handleEdit = () => {
    setIsReadOnly(false);
    setError(null);
    setSuccess(null);
    setValidationErrors({});
    setOriginalComponents(components.map((c) => ({ ...c })));
  };

  const handleCancel = () => {
    setIsReadOnly(true);
    setError(null);
    setSuccess(null);
    setValidationErrors({});
    setComponents(originalComponents.map((c) => ({ ...c })));
  };

  const totalPercentage = components.reduce(
    (sum, c) => sum + (typeof c.percentage === 'number' ? c.percentage : 0),
    0
  );

  const isValid =
    components.length > 0 &&
    components.every(
      (c) => c.title.trim() !== '' && typeof c.percentage === 'number' && c.percentage > 0
    ) &&
    totalPercentage === 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setValidationErrors({});
    if (isReadOnly) return;
    if (!isValid) {
      setError('Please ensure all fields are filled and total percentage is exactly 100%.');
      return;
    }
    setLoading(true);
    try {
      // Create or update each component
      for (const comp of components) {
        if (comp.id) {
          await subjectEcrService.update(comp.id, {
            subject_id: subjectId,
            title: comp.title,
            percentage: typeof comp.percentage === 'number' ? comp.percentage : 0,
          });
        } else {
          await subjectEcrService.create({
            subject_id: subjectId,
            title: comp.title,
            percentage: typeof comp.percentage === 'number' ? comp.percentage : 0,
          });
        }
      }
      // Remove deleted components
      const currentIds = components.filter((c) => c.id).map((c) => c.id);
      for (const orig of originalComponents) {
        if (orig.id && !currentIds.includes(orig.id)) {
          await subjectEcrService.delete(orig.id);
        }
      }
      setSuccess('Summative assessment components saved successfully!');
      setIsReadOnly(true);
      // Refetch to get updated IDs
      const res = await subjectEcrService.getBySubject(subjectId);
      setComponents(res.data.map((c: any) => ({ id: c.id, title: c.title, percentage: c.percentage })));
      setOriginalComponents(res.data.map((c: any) => ({ id: c.id, title: c.title, percentage: c.percentage })));
    } catch (err: any) {
      setError('Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="text-center py-8">Loading assessment...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Components of Summative Assessment</h2>
      <Fieldset className="bg-white rounded-lg shadow p-6 space-y-6 border border-zinc-100">
        {isReadOnly && components.length > 0 && (
          <div className="flex justify-end mb-2">
            <Button
              type="button"
              variant="outline"
              color="primary"
              size="sm"
              onClick={handleEdit}
            >
              Edit
            </Button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {components.map((comp, idx) => (
            <Field key={comp.id || idx} className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor={`title-${idx}`}>Title</Label>
                <Input
                  id={`title-${idx}`}
                  type="text"
                  placeholder="e.g. Written Exam"
                  value={comp.title}
                  onChange={(e) => handleChange(idx, 'title', e.target.value)}
                  required
                  size="md"
                  disabled={isReadOnly}
                />
              </div>
              <div className="w-32">
                <Label htmlFor={`percentage-${idx}`}>Percentage</Label>
                <Input
                  id={`percentage-${idx}`}
                  type="number"
                  placeholder="%"
                  value={comp.percentage}
                  min={1}
                  max={100}
                  onChange={(e) => handleChange(idx, 'percentage', e.target.value)}
                  required
                  size="md"
                  rightIcon={<span className="text-zinc-400">%</span>}
                  disabled={isReadOnly}
                />
              </div>
              {components.length > 1 && !isReadOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  color="danger"
                  size="sm"
                  onClick={() => handleRemove(idx)}
                  aria-label="Remove"
                  className="mb-1"
                >
                  &times;
                </Button>
              )}
            </Field>
          ))}
          <div className="flex items-center gap-4 mt-2">
            {!isReadOnly && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  color="primary"
                  size="sm"
                  onClick={handleAdd}
                >
                  + Add Component
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  color="secondary"
                  size="sm"
                  onClick={handleCancel}
                  className="ml-2"
                >
                  Cancel
                </Button>
              </>
            )}
            <Badge color={totalPercentage === 100 ? 'green' : 'red'}>
              Total: {totalPercentage}%
            </Badge>
          </div>
          <Divider soft className="my-2" />
          {error && (
            <Alert
              type="error"
              message={error}
              onClose={() => setError(null)}
              show={!!error}
              className="mb-2"
            />
          )}
          {success && (
            <Alert
              type="success"
              message={success}
              onClose={() => setSuccess(null)}
              show={!!success}
              className="mb-2"
            />
          )}
          <Button
            type="submit"
            variant="solid"
            color="primary"
            size="md"
            loading={loading}
            disabled={!isValid || loading || isReadOnly}
            fullWidth
          >
            {isReadOnly ? 'Assessment Already Set' : loading ? 'Saving...' : 'Save Components'}
          </Button>
        </form>
      </Fieldset>
    </div>
  );
};

export default SummativeAssessmentTab; 