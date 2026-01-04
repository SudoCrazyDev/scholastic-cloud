import React, { useState, useEffect } from "react";
import { Plus, X, Loader2, Edit2 } from "lucide-react";
import {
  getSubjectEcrsBySubjectId,
  createSubjectEcr,
  updateSubjectEcr,
  deleteSubjectEcr,
} from "@/lib/db";
import { Button, Input, Alert, Badge } from "@/components";

export function SummativeAssessmentTab({ subjectId }) {
  const [components, setComponents] = useState([]);
  const [originalComponents, setOriginalComponents] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Load existing components
  useEffect(() => {
    loadComponents();
  }, [subjectId]);

  const loadComponents = async () => {
    try {
      setFetching(true);
      const ecrs = await getSubjectEcrsBySubjectId(subjectId);
      
      if (ecrs && ecrs.length > 0) {
        setComponents(ecrs.map((c) => ({ id: c.id, title: c.title, percentage: c.percentage })));
        setOriginalComponents(ecrs.map((c) => ({ id: c.id, title: c.title, percentage: c.percentage })));
        setIsReadOnly(true);
      } else {
        setIsReadOnly(false);
        setComponents([]);
        setOriginalComponents([]);
      }
    } catch (err) {
      console.error("Error loading components:", err);
      setError("Failed to load assessment components");
    } finally {
      setFetching(false);
    }
  };

  const handleChange = (index, field, value) => {
    if (isReadOnly) return;
    const updated = [...components];
    if (field === "percentage") {
      updated[index][field] = value === "" ? "" : Number(value);
    } else {
      updated[index][field] = value;
    }
    setComponents(updated);
  };

  const handleAdd = () => {
    if (isReadOnly) return;
    setComponents([...components, { title: "", percentage: "" }]);
  };

  const handleRemove = async (index) => {
    if (isReadOnly) return;
    const comp = components[index];
    
    if (comp.id) {
      // If it has an ID, delete from database
      setLoading(true);
      try {
        await deleteSubjectEcr(comp.id);
        const updated = components.filter((_, i) => i !== index);
        setComponents(updated);
        setOriginalComponents(updated);
        setSuccess("Component deleted successfully!");
      } catch (err) {
        console.error("Error deleting component:", err);
        setError("Failed to delete component");
      } finally {
        setLoading(false);
      }
    } else {
      // If no ID, just remove from state
      setComponents(components.filter((_, i) => i !== index));
    }
  };

  const handleEdit = () => {
    setIsReadOnly(false);
    setError(null);
    setSuccess(null);
    setOriginalComponents(components.map((c) => ({ ...c })));
  };

  const handleCancel = () => {
    setIsReadOnly(true);
    setError(null);
    setSuccess(null);
    setComponents(originalComponents.map((c) => ({ ...c })));
  };

  const totalPercentage = components.reduce(
    (sum, c) => sum + (typeof c.percentage === "number" ? c.percentage : 0),
    0
  );

  const isValid =
    components.length > 0 &&
    components.every(
      (c) => c.title.trim() !== "" && typeof c.percentage === "number" && c.percentage > 0
    ) &&
    totalPercentage === 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    if (isReadOnly) return;
    
    if (!isValid) {
      setError("Please ensure all fields are filled and total percentage is exactly 100%");
      return;
    }

    setLoading(true);
    try {
      // Create or update each component
      const updatedComponents = [];
      for (const comp of components) {
        if (comp.id) {
          const updated = await updateSubjectEcr(comp.id, {
            subject_id: subjectId,
            title: comp.title,
            percentage: typeof comp.percentage === "number" ? comp.percentage : 0,
          });
          updatedComponents.push(updated);
        } else {
          const created = await createSubjectEcr({
            subject_id: subjectId,
            title: comp.title,
            percentage: typeof comp.percentage === "number" ? comp.percentage : 0,
          });
          updatedComponents.push(created);
        }
      }

      // Remove deleted components
      const currentIds = components.filter((c) => c.id).map((c) => c.id);
      for (const orig of originalComponents) {
        if (orig.id && !currentIds.includes(orig.id)) {
          await deleteSubjectEcr(orig.id);
        }
      }

      setSuccess("Summative assessment components saved successfully!");
      setIsReadOnly(true);
      
      // Reload components to get updated data
      await loadComponents();
    } catch (err) {
      console.error("Error saving components:", err);
      setError("Failed to save components. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading assessment...</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold mb-4 text-gray-900">
        Components of Summative Assessment
      </h2>
      
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-6">
        {isReadOnly && components.length > 0 && (
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={handleEdit}
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {components.map((comp, idx) => (
            <div key={comp.id || idx} className="flex items-end gap-2">
              <div className="flex-1">
                <label
                  htmlFor={`title-${idx}`}
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Title
                </label>
                <input
                  id={`title-${idx}`}
                  type="text"
                  placeholder="e.g. Written Works"
                  value={comp.title}
                  onChange={(e) => handleChange(idx, "title", e.target.value)}
                  required
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              
              <div className="w-32">
                <label
                  htmlFor={`percentage-${idx}`}
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Percentage
                </label>
                <div className="relative">
                  <input
                    id={`percentage-${idx}`}
                    type="number"
                    placeholder="%"
                    value={comp.percentage}
                    min={1}
                    max={100}
                    onChange={(e) => handleChange(idx, "percentage", e.target.value)}
                    required
                    disabled={isReadOnly}
                    className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                    %
                  </span>
                </div>
              </div>
              
              {components.length > 1 && !isReadOnly && (
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-md mb-1"
                  aria-label="Remove"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}

          <div className="flex items-center gap-4 mt-2">
            {!isReadOnly && (
              <>
                <button
                  type="button"
                  onClick={handleAdd}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Component
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
              </>
            )}
            
            <div className="ml-auto">
              <Badge
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  totalPercentage === 100
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                Total: {totalPercentage}%
              </Badge>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            {error && (
              <Alert
                type="error"
                message={error}
                onClose={() => setError(null)}
                show={!!error}
                className="mb-4"
              />
            )}
            
            {success && (
              <Alert
                type="success"
                message={success}
                onClose={() => setSuccess(null)}
                show={!!success}
                className="mb-4"
              />
            )}

            <button
              type="submit"
              disabled={!isValid || loading || isReadOnly}
              className={`w-full py-2 px-4 rounded-md text-white font-medium ${
                !isValid || loading || isReadOnly
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {isReadOnly
                ? "Assessment Already Set"
                : loading
                ? "Saving..."
                : "Save Components"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
