import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Save, Plus, Edit2, Trash2,
  FileText, Users, Calculator, Download
} from 'lucide-react';

interface Section {
  id: string;
  name: string;
  grade_level: string;
}

interface Subject {
  id: string;
  name: string;
  code?: string;
}

interface Student {
  id: string;
  lrn?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
}

interface GradeItem {
  id: string;
  subject_id: string;
  title: string;
  category: 'Written Works' | 'Performance Tasks' | 'Quarterly Assessment';
  quarter: string;
  total_score: number;
  date?: string;
}

interface StudentScore {
  student_id: string;
  grade_item_id: string;
  score: number;
}

export const GradeManagement: React.FC = () => {
  const navigate = useNavigate();
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedQuarter, setSelectedQuarter] = useState<string>('First Quarter');
  const [students, setStudents] = useState<Student[]>([]);
  const [gradeItems, setGradeItems] = useState<GradeItem[]>([]);
  const [scores, setScores] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  
  // New grade item form
  const [newItem, setNewItem] = useState({
    title: '',
    category: 'Written Works' as const,
    total_score: 100,
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadSections();
  }, []);

  useEffect(() => {
    if (selectedSection) {
      loadSubjects(selectedSection);
      loadStudents(selectedSection);
    }
  }, [selectedSection]);

  useEffect(() => {
    if (selectedSubject && selectedQuarter) {
      loadGradeItems();
    }
  }, [selectedSubject, selectedQuarter]);

  const loadSections = async () => {
    try {
      const data = await window.api.sections.getAll();
      setSections(data);
    } catch (error) {
      console.error('Failed to load sections:', error);
    }
  };

  const loadSubjects = async (sectionId: string) => {
    try {
      const data = await window.api.subjects.getBySection(sectionId);
      setSubjects(data.map((sa: any) => sa.subject));
    } catch (error) {
      console.error('Failed to load subjects:', error);
    }
  };

  const loadStudents = async (sectionId: string) => {
    try {
      const data = await window.api.students.getBySection(sectionId);
      setStudents(data.map((ss: any) => ss.student));
    } catch (error) {
      console.error('Failed to load students:', error);
    }
  };

  const loadGradeItems = async () => {
    setIsLoading(true);
    try {
      const items = await window.api.gradeItems.getBySubject(selectedSubject);
      const filteredItems = items.filter((item: GradeItem) => item.quarter === selectedQuarter);
      setGradeItems(filteredItems);
      
      // Load scores for each item
      const scoreMap = new Map<string, number>();
      for (const item of filteredItems) {
        const itemScores = await window.api.scores.getByGradeItem(item.id);
        for (const score of itemScores) {
          const key = `${score.student_id}-${item.id}`;
          scoreMap.set(key, score.score);
        }
      }
      setScores(scoreMap);
    } catch (error) {
      console.error('Failed to load grade items:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddGradeItem = async () => {
    try {
      const item = await window.api.gradeItems.create({
        subject_id: selectedSubject,
        title: newItem.title,
        category: newItem.category,
        quarter: selectedQuarter,
        total_score: newItem.total_score,
        date: newItem.date
      });
      
      setGradeItems([...gradeItems, item]);
      setShowAddItem(false);
      setNewItem({
        title: '',
        category: 'Written Works',
        total_score: 100,
        date: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      console.error('Failed to add grade item:', error);
    }
  };

  const handleDeleteGradeItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this grade item?')) return;
    
    try {
      await window.api.gradeItems.delete(id);
      setGradeItems(gradeItems.filter(item => item.id !== id));
      
      // Remove scores for this item
      const newScores = new Map(scores);
      for (const key of newScores.keys()) {
        if (key.endsWith(`-${id}`)) {
          newScores.delete(key);
        }
      }
      setScores(newScores);
    } catch (error) {
      console.error('Failed to delete grade item:', error);
    }
  };

  const handleScoreChange = (studentId: string, itemId: string, value: string) => {
    const key = `${studentId}-${itemId}`;
    const score = parseFloat(value) || 0;
    const newScores = new Map(scores);
    newScores.set(key, score);
    setScores(newScores);
  };

  const handleSaveScores = async () => {
    setIsSaving(true);
    try {
      const scoresToSave: any[] = [];
      
      for (const [key, score] of scores.entries()) {
        const [studentId, gradeItemId] = key.split('-');
        scoresToSave.push({
          student_id: studentId,
          grade_item_id: gradeItemId,
          score: score
        });
      }
      
      await window.api.scores.bulkSave(scoresToSave);
      alert('Scores saved successfully!');
    } catch (error) {
      console.error('Failed to save scores:', error);
      alert('Failed to save scores. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const calculateStudentAverage = (studentId: string, category?: string) => {
    let totalScore = 0;
    let totalPossible = 0;
    
    gradeItems
      .filter(item => !category || item.category === category)
      .forEach(item => {
        const key = `${studentId}-${item.id}`;
        const score = scores.get(key) || 0;
        totalScore += score;
        totalPossible += item.total_score;
      });
    
    return totalPossible > 0 ? ((totalScore / totalPossible) * 100).toFixed(2) : '0.00';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => navigate('/dashboard')}
                className="mr-4 p-2 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-semibold text-gray-900">
                Grade Management
              </h1>
            </div>
            
            {selectedSubject && (
              <button
                onClick={handleSaveScores}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save All Scores'}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Selection Controls */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Class Section
              </label>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Section</option>
                {sections.map(section => (
                  <option key={section.id} value={section.id}>
                    {section.name} - {section.grade_level}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subject
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                disabled={!selectedSection}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">Select Subject</option>
                {subjects.map(subject => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name} {subject.code && `(${subject.code})`}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quarter
              </label>
              <select
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value)}
                disabled={!selectedSubject}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="First Quarter">First Quarter</option>
                <option value="Second Quarter">Second Quarter</option>
                <option value="Third Quarter">Third Quarter</option>
                <option value="Fourth Quarter">Fourth Quarter</option>
              </select>
            </div>
          </div>
        </div>

        {/* Grade Items Management */}
        {selectedSubject && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Grade Items
              </h2>
              <button
                onClick={() => setShowAddItem(true)}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center text-sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </button>
            </div>
            
            {showAddItem && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-4 bg-gray-50 rounded-lg"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    type="text"
                    placeholder="Item Title"
                    value={newItem.title}
                    onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value as any })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Written Works">Written Works</option>
                    <option value="Performance Tasks">Performance Tasks</option>
                    <option value="Quarterly Assessment">Quarterly Assessment</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Total Score"
                    value={newItem.total_score}
                    onChange={(e) => setNewItem({ ...newItem, total_score: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={handleAddGradeItem}
                      disabled={!newItem.title}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setShowAddItem(false)}
                      className="px-3 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
            
            <div className="space-y-2">
              {['Written Works', 'Performance Tasks', 'Quarterly Assessment'].map(category => {
                const categoryItems = gradeItems.filter(item => item.category === category);
                if (categoryItems.length === 0) return null;
                
                return (
                  <div key={category} className="border rounded-lg p-3">
                    <h3 className="font-medium text-sm text-gray-700 mb-2">{category}</h3>
                    <div className="space-y-1">
                      {categoryItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <span>{item.title} ({item.total_score} pts)</span>
                          <button
                            onClick={() => handleDeleteGradeItem(item.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scores Table */}
        {selectedSubject && students.length > 0 && gradeItems.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50">
                      Student
                    </th>
                    {gradeItems.map(item => (
                      <th key={item.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <div>
                          <div>{item.title}</div>
                          <div className="font-normal">({item.total_score})</div>
                        </div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Average
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {students.map(student => (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white">
                        {student.last_name}, {student.first_name}
                      </td>
                      {gradeItems.map(item => {
                        const key = `${student.id}-${item.id}`;
                        const score = scores.get(key) || 0;
                        
                        return (
                          <td key={item.id} className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="number"
                              min="0"
                              max={item.total_score}
                              value={score}
                              onChange={(e) => handleScoreChange(student.id, item.id, e.target.value)}
                              className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-medium">
                        {calculateStudentAverage(student.id)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}
      </main>
    </div>
  );
};