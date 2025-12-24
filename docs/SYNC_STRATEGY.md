# Sync Strategy Recommendations

## Overview
This document outlines the recommended sync strategy for the desktop application, focusing on handling offline edits and unstable network connections.

## Editable Tables
Only two tables will be edited offline:
1. **student_ecr_item_scores** - Student scores for ECR items
2. **student_running_grades** - Student running grades per quarter

## Sync Strategy

### 1. **Optimistic Updates with Queue System**

#### Concept
- All offline edits are immediately saved to local SQLite
- Edits are queued in a separate `sync_queue` table
- Sync happens in the background when connection is available

#### Implementation Approach

**Create `sync_queue` table:**
```sql
CREATE TABLE sync_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,  -- 'student_ecr_item_scores' or 'student_running_grades'
  record_id TEXT NOT NULL,    -- ID of the record being synced
  operation TEXT NOT NULL,    -- 'create', 'update', 'delete'
  data TEXT NOT NULL,         -- JSON of the record data
  status TEXT DEFAULT 'pending', -- 'pending', 'syncing', 'synced', 'failed'
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TEXT,
  updated_at TEXT,
  synced_at TEXT
);
```

**Workflow:**
1. User edits a score/grade → Save to local table + Add to sync_queue
2. Background sync process checks queue periodically
3. For each pending item:
   - Mark as 'syncing'
   - Send to backend API
   - On success: Mark as 'synced', remove from queue
   - On failure: Mark as 'failed', increment retry_count
4. Retry failed items with exponential backoff

### 2. **Conflict Resolution**

#### Last-Write-Wins (LWW) with Timestamp
- Each record has `updated_at` timestamp
- On sync, compare local `updated_at` with server `updated_at`
- If server is newer: Server wins (overwrite local)
- If local is newer: Local wins (send to server)
- If equal: No conflict, proceed

#### Alternative: User Choice
- Detect conflicts during sync
- Show conflict resolution UI
- Let user choose: Keep local, Keep server, or Merge

### 3. **Handling Unstable Connections**

#### Connection Detection
- Use `navigator.onLine` API
- Implement heartbeat ping to backend
- Track connection state in app state

#### Strategies:

**A. Chunked Sync**
- Break large syncs into smaller chunks
- Process one chunk at a time
- Resume from last successful chunk on reconnection

**B. Incremental Sync**
- Only sync changed records (track `updated_at`)
- Use `last_sync_timestamp` to fetch only new/updated records
- Reduces data transfer on unstable connections

**C. Retry with Exponential Backoff**
```
Retry delays: 1s, 2s, 4s, 8s, 16s, 32s, max 60s
Max retries: 10 attempts
After max retries: Mark as failed, require manual sync
```

**D. Background Sync API (if available)**
- Use Service Worker Background Sync
- Queue sync requests
- Execute when connection is restored

### 4. **Sync Process Flow**

```
1. User makes edit offline
   ↓
2. Save to local SQLite table
   ↓
3. Add to sync_queue (status: 'pending')
   ↓
4. Background sync process (runs every 30s or on connection restore)
   ↓
5. For each pending item:
   a. Check connection
   b. If offline: Skip, wait for next cycle
   c. If online: Attempt sync
      - Mark as 'syncing'
      - Send to backend API
      - Handle response
   ↓
6. On success:
   - Mark as 'synced'
   - Update local record with server response (get server updated_at)
   - Remove from queue (or keep for audit)
   ↓
7. On failure:
   - Mark as 'failed'
   - Increment retry_count
   - Schedule retry with backoff
   ↓
8. If retry_count > max:
   - Mark as 'failed_permanently'
   - Show notification to user
   - Allow manual retry
```

### 5. **Backend API Endpoints Needed**

#### Sync Endpoints:
```
POST /api/desktop/sync/ecr-scores
  - Accept array of student_ecr_item_scores
  - Return synced records with server timestamps
  - Handle conflicts

POST /api/desktop/sync/running-grades
  - Accept array of student_running_grades
  - Return synced records with server timestamps
  - Handle conflicts

GET /api/desktop/sync/status
  - Return last_sync_timestamp
  - Return any conflicts detected
```

### 6. **Data Integrity**

#### Validation Before Sync:
- Check required fields are present
- Validate data types and ranges
- Ensure foreign keys exist (student_id, subject_id, etc.)

#### Server-Side Validation:
- Backend should validate all data
- Return clear error messages
- Reject invalid data, keep local copy for user to fix

### 7. **User Experience**

#### Visual Indicators:
- Show sync status in UI (synced, syncing, pending, failed)
- Display number of pending syncs
- Show last sync time
- Alert on sync failures

#### Manual Sync:
- "Sync Now" button
- Force immediate sync attempt
- Show progress indicator
- Display sync results

#### Conflict Resolution UI:
- List conflicts
- Show local vs server values
- Allow user to choose resolution
- Batch resolution option

### 8. **Performance Considerations**

#### Batch Operations:
- Group multiple edits into single API call
- Reduce network overhead
- Faster sync for multiple changes

#### Compression:
- Compress JSON payloads for large batches
- Use gzip on API responses

#### Pagination:
- For large syncs, paginate queue processing
- Process 50-100 items per batch

### 9. **Error Handling**

#### Network Errors:
- Timeout: 30 seconds per request
- Retry with backoff
- Log error for debugging

#### Server Errors:
- 4xx (Client Error): Don't retry, show to user
- 5xx (Server Error): Retry with backoff
- 401 (Unauthorized): Re-authenticate, then retry

#### Data Errors:
- Invalid data: Don't retry, show to user
- Missing foreign keys: Download missing data first

### 10. **Testing Scenarios**

#### Test Cases:
1. Edit offline, sync when online
2. Edit while syncing (queue new edit)
3. Multiple rapid edits (batch correctly)
4. Connection drops during sync (resume)
5. Server conflict (resolve correctly)
6. Large number of edits (performance)
7. Sync after long offline period (incremental sync)

## Implementation Priority

### Phase 1: Basic Sync
1. Create sync_queue table
2. Queue edits on save
3. Basic background sync process
4. Simple retry mechanism

### Phase 2: Conflict Resolution
1. Timestamp comparison
2. Conflict detection
3. User choice resolution

### Phase 3: Advanced Features
1. Incremental sync
2. Chunked processing
3. Background sync API
4. Advanced error handling

## Recommendations Summary

1. **Start Simple**: Implement basic queue + retry first
2. **Monitor**: Track sync success rates, identify issues
3. **Iterate**: Add advanced features based on real-world usage
4. **User Feedback**: Always show sync status, don't hide failures
5. **Data Safety**: Never lose user data, always keep local copy until confirmed synced

