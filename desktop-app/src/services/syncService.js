import axios from "axios";
import {
    getPendingSyncItems,
    markAsSyncing,
    markAsSynced,
    markAsFailed,
    createSyncLog,
    completeSyncLog,
    failSyncLog,
    updateSyncLog,
} from "@/lib/db";

// Get API base URL from environment or default
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

/**
 * Sync service for manual synchronization of running grades
 */
class SyncService {
    constructor() {
        this.token = null;
    }

    /**
     * Set authentication token
     */
    setToken(token) {
        this.token = token;
    }

    /**
     * Get auth headers
     */
    getHeaders() {
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
        };
    }

    /**
     * Download running grades from server
     */
    async downloadRunningGrades(subjectId, classSectionId) {
        const logId = await createSyncLog("running_grades", "download");

        try {
            const params = new URLSearchParams({
                subject_id: subjectId,
            });

            if (classSectionId) {
                params.append("class_section_id", classSectionId);
            }

            const response = await axios.get(
                `${API_BASE_URL}/desktop/running-grades/download?${params}`,
                { headers: this.getHeaders() }
            );

            if (response.data.success) {
                const grades = response.data.data;

                // Save to local database
                const { saveStudentRunningGrade } = await import("@/lib/db");

                for (const grade of grades) {
                    await saveStudentRunningGrade(grade);
                }

                await completeSyncLog(logId, grades.length, 0);

                return {
                    success: true,
                    count: grades.length,
                    timestamp: response.data.timestamp,
                };
            } else {
                throw new Error(response.data.message || "Download failed");
            }
        } catch (error) {
            await failSyncLog(logId, error.message);
            throw error;
        }
    }

    /**
     * Upload running grades to server (with chunking and connection handling)
     */
    async uploadRunningGrades(subjectId) {
        const logId = await createSyncLog("running_grades", "upload");

        try {
            // Get pending items from sync queue
            const pendingItems = await getPendingSyncItems("student_running_grades");

            if (pendingItems.length === 0) {
                await completeSyncLog(logId, 0, 0);
                return {
                    success: true,
                    synced: [],
                    failed: [],
                    conflicts: [],
                    summary: {
                        total: 0,
                        synced_count: 0,
                        failed_count: 0,
                        conflict_count: 0,
                    },
                };
            }

            await updateSyncLog(logId, { items_count: pendingItems.length });

            // Process in chunks of 50
            const chunkSize = 50;
            const chunks = [];
            for (let i = 0; i < pendingItems.length; i += chunkSize) {
                chunks.push(pendingItems.slice(i, i + chunkSize));
            }

            let allSynced = [];
            let allFailed = [];
            let allConflicts = [];
            let connectionLost = false;

            for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                const chunk = chunks[chunkIndex];

                // Mark items as syncing
                for (const item of chunk) {
                    await markAsSyncing(item.id);
                }

                try {
                    // Prepare grades data
                    const gradesData = chunk.map((item) => item.data);

                    // Upload chunk
                    const response = await axios.post(
                        `${API_BASE_URL}/desktop/running-grades/upload`,
                        { grades: gradesData },
                        { headers: this.getHeaders() }
                    );

                    if (response.data.success) {
                        const { synced, failed, conflicts } = response.data;

                        // Mark synced items
                        for (const syncedId of synced) {
                            const queueItem = chunk.find((item) => item.data.id === syncedId);
                            if (queueItem) {
                                await markAsSynced(queueItem.id);
                            }
                        }

                        // Mark failed items
                        for (const failedItem of failed) {
                            const queueItem = chunk.find(
                                (item) => item.data.id === failedItem.data.id
                            );
                            if (queueItem) {
                                await markAsFailed(queueItem.id, failedItem.error);
                            }
                        }

                        // Mark conflict items as failed
                        for (const conflictItem of conflicts) {
                            const queueItem = chunk.find(
                                (item) => item.data.id === conflictItem.data.id
                            );
                            if (queueItem) {
                                await markAsFailed(queueItem.id, conflictItem.message);
                            }
                        }

                        allSynced.push(...synced);
                        allFailed.push(...failed);
                        allConflicts.push(...conflicts);

                        // Update progress
                        await updateSyncLog(logId, {
                            success_count: allSynced.length,
                            failed_count: allFailed.length + allConflicts.length,
                        });
                    }
                } catch (error) {
                    // Connection lost or error - mark chunk as failed
                    console.error("Chunk upload failed:", error);
                    connectionLost = true;

                    for (const item of chunk) {
                        await markAsFailed(
                            item.id,
                            error.message || "Connection interrupted"
                        );
                        allFailed.push({
                            data: item.data,
                            error: error.message || "Connection interrupted",
                        });
                    }

                    // Stop processing remaining chunks
                    break;
                }
            }

            await completeSyncLog(logId, allSynced.length, allFailed.length + allConflicts.length);

            return {
                success: !connectionLost || allSynced.length > 0,
                synced: allSynced,
                failed: allFailed,
                conflicts: allConflicts,
                connectionLost,
                summary: {
                    total: pendingItems.length,
                    synced_count: allSynced.length,
                    failed_count: allFailed.length,
                    conflict_count: allConflicts.length,
                },
            };
        } catch (error) {
            await failSyncLog(logId, error.message);
            throw error;
        }
    }
}

// Export singleton instance
export const syncService = new SyncService();
