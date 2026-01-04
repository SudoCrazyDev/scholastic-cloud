import React, { useState, useEffect } from "react";
import { Trash2, Loader2 } from "lucide-react";
import {
  createStudentEcrItemScore,
  updateStudentEcrItemScore,
  deleteStudentEcrItemScore,
  getStudentEcrItemScore,
} from "@/lib/db";

export function StudentScoreInput({
  studentId,
  itemId,
  maxScore,
  initialScore,
  scoreId: initialScoreId,
  onSuccess,
  onEnterPress,
  inputId,
  disabled = false,
}) {
  const [score, setScore] = useState(initialScore ?? "");
  const [scoreId, setScoreId] = useState(initialScoreId);
  const [hasExistingScore, setHasExistingScore] = useState(!!initialScoreId);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingMoveToNext, setPendingMoveToNext] = useState(false);

  // Update state when props change
  useEffect(() => {
    setScore(initialScore ?? "");
    setScoreId(initialScoreId);
    setHasExistingScore(!!initialScoreId);
  }, [initialScore, initialScoreId]);

  const validateScore = (value) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return "Score must be a number";
    }
    if (numValue < 0) {
      return "Score cannot be negative";
    }
    if (numValue > maxScore) {
      return `Score cannot exceed ${maxScore}`;
    }
    return "";
  };

  const handleScoreChange = async (newScore, moveToNext = false) => {
    // Clear previous errors
    setError("");

    // Parse score
    const numScore = parseFloat(newScore);

    // Validate
    const validationError = validateScore(newScore);
    if (validationError) {
      setError(validationError);
      return;
    }

    // If no change, just move to next if requested
    if (numScore === initialScore && moveToNext) {
      onEnterPress?.();
      return;
    }

    // If no change, don't save
    if (numScore === initialScore) {
      return;
    }

    // Set flag to move to next after save
    if (moveToNext) {
      setPendingMoveToNext(true);
    }

    setIsLoading(true);

    try {
      if (hasExistingScore && scoreId) {
        // Update existing score
        const updated = await updateStudentEcrItemScore(scoreId, {
          score: numScore,
        });
        setHasExistingScore(true);
        onSuccess?.(updated);
      } else {
        // Create new score
        const created = await createStudentEcrItemScore({
          student_id: studentId,
          subject_ecr_item_id: itemId,
          score: numScore,
          academic_year: "2025-2026",
        });
        setScoreId(created.id);
        setHasExistingScore(true);
        onSuccess?.(created);
      }

      // Move to next input if Enter was pressed
      if (pendingMoveToNext) {
        setPendingMoveToNext(false);
        setTimeout(() => onEnterPress?.(), 50);
      }
    } catch (err) {
      console.error("Error saving score:", err);
      setError(err.message || "Failed to save score");
      setPendingMoveToNext(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!scoreId) return;

    setIsLoading(true);
    try {
      await deleteStudentEcrItemScore(scoreId);
      setScore("");
      setScoreId(null);
      setHasExistingScore(false);
      onSuccess?.({});
    } catch (err) {
      console.error("Error deleting score:", err);
      setError(err.message || "Failed to delete score");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await handleScoreChange(score, true);
    }
  };

  const handleBlur = async () => {
    if (score !== "" && score !== initialScore) {
      await handleScoreChange(score);
    }
  };

  return (
    <div className="relative flex items-center space-x-1">
      <input
        type="number"
        min={0}
        max={maxScore}
        step={1}
        value={score}
        onChange={(e) => setScore(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        disabled={disabled || isLoading}
        data-input-id={inputId}
        className={`w-full px-3 py-2 text-center border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          hasExistingScore
            ? "bg-green-50 border-green-200"
            : "bg-gray-50 border-gray-200"
        } ${error ? "border-red-300" : ""} ${
          disabled || isLoading ? "opacity-50 cursor-not-allowed" : ""
        }`}
        placeholder="Score"
      />

      {/* Delete button for existing score */}
      {hasExistingScore && !disabled && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={isLoading}
          className="p-1 rounded hover:bg-red-100 disabled:opacity-50"
          title="Delete score"
        >
          <Trash2 className="w-4 h-4 text-red-500" />
        </button>
      )}

      {/* Visual indicator for existing score */}
      {hasExistingScore && (
        <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full"></div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="absolute -bottom-6 left-0 text-xs text-red-500">
          {error}
        </div>
      )}
    </div>
  );
}
