import React, { useEffect, useState } from 'react';
import { authService } from '../services/authService';

const OfflineGrades: React.FC = () => {
  const user = authService.getCurrentUser();
  const [assignedSubjects, setAssignedSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [students, setStudents] = useState<any[]>([]);
  const [ecrItems, setEcrItems] = useState<any[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const res = await window.api.offline.getAssignedSubjects(user.id);
      if (res.success) {
        setAssignedSubjects(res.subjects || []);
      }
    };
    load();
  }, [user]);

  useEffect(() => {
    const subject = assignedSubjects.find(s => s.id === selectedSubjectId);
    if (!subject) return;
    const sectionId = subject.class_section_id;
    setSelectedSectionId(sectionId);
    const run = async () => {
      const st = await window.api.offline.getStudentsBySection(sectionId);
      if (st.success) setStudents(st.students || []);
      const items = await window.api.offline.getEcrItemsBySubject(subject.id);
      if (items.success) setEcrItems(items.items || []);
    };
    run();
  }, [assignedSubjects, selectedSubjectId]);

  // derive selected item id via selectedItemId; no memoized object needed

  const handleSave = async () => {
    if (!selectedItemId) return;
    try {
      setSaving(true);
      const payload = Object.entries(scores)
        .filter(([studentId]) => !!studentId)
        .map(([studentId, score]) => ({ student_id: studentId, subject_ecr_item_id: selectedItemId, score: Number(score) }));
      if (payload.length === 0) return;
      const res = await window.api.offline.upsertStudentScores(payload);
      if (res.success) {
        alert('Scores saved locally for sync.');
      } else {
        alert(`Failed to save: ${res.error}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <select value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)} className="w-full border-gray-300 rounded-lg">
              <option value="">Select subject</option>
              {assignedSubjects.map(s => (
                <option key={s.id} value={s.id}>{s.title} ({s.class_section_title})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
            <input value={selectedSectionId} readOnly className="w-full border-gray-300 rounded-lg bg-gray-50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ECR Item</label>
            <select value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)} className="w-full border-gray-300 rounded-lg">
              <option value="">Select ECR item</option>
              {ecrItems.map(i => (
                <option key={i.id} value={i.id}>{i.title} {i.score ? `(max ${i.score})` : ''}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Students</h2>
          <button disabled={saving || !selectedItemId} onClick={handleSave} className={`px-4 py-2 rounded-lg text-white ${saving ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
            {saving ? 'Saving...' : 'Save Scores'}
          </button>
        </div>
        <div className="p-4">
          {students.length === 0 ? (
            <div className="text-gray-500 text-sm">Select a subject to load students.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">LRN</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {students.map(st => (
                    <tr key={st.id}>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{st.lrn || '-'}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{st.last_name}, {st.first_name}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <input
                          type="number"
                          className="w-24 border-gray-300 rounded-lg"
                          value={scores[st.id] ?? ''}
                          onChange={(e) => setScores(prev => ({ ...prev, [st.id]: Number(e.target.value) }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OfflineGrades;

