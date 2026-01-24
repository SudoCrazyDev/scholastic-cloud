# Queue Worker Setup for AI Generation

The AI Planner now uses Laravel's queue system for long-running tasks (lesson plan generation). This prevents timeout errors and provides real-time progress tracking.

## Prerequisites

✅ Migration already run: `ai_generation_tasks` table created
✅ Queue connection: `database` (configured in `.env`)
✅ Jobs table: Already exists

## Starting the Queue Worker

### Development (Windows)

Open a **new terminal/command prompt** and run:

```bash
cd C:\Users\admin\Documents\ScholasticCloud\api
php artisan queue:work --tries=1 --timeout=600
```

**Important:** Keep this terminal window open while using the AI Planner feature.

### Production (Background Process)

Use a process manager like `supervisor` or Windows Service:

```bash
# Option 1: Run as a background process
php artisan queue:work --tries=1 --timeout=600 --daemon

# Option 2: Use supervisor (Linux/Mac)
# Create a supervisor config in /etc/supervisor/conf.d/laravel-worker.conf

# Option 3: Windows Service
# Use nssm (Non-Sucking Service Manager) to create a Windows service
```

## How It Works

1. **User clicks "Generate"** → API creates a task record and dispatches a job
2. **API returns immediately** with `task_id`
3. **Frontend polls** the status endpoint every 5 seconds
4. **Queue worker** processes the job in background
5. **Progress updates** are shown in real-time (percentage bar)
6. **Completion** is detected automatically and data is refreshed

## Monitoring

### Check Queue Status

```bash
# View pending jobs
php artisan queue:monitor

# Clear failed jobs
php artisan queue:flush

# Retry failed jobs
php artisan queue:retry all
```

### Check Generation Tasks

```sql
-- View recent generation tasks
SELECT id, type, status, processed_items, total_items, created_at 
FROM ai_generation_tasks 
ORDER BY created_at DESC 
LIMIT 10;

-- View failed tasks
SELECT * FROM ai_generation_tasks WHERE status = 'failed';
```

## Troubleshooting

### Queue worker not running?
- Check if the terminal with `php artisan queue:work` is still open
- Look for errors in `storage/logs/laravel.log`

### Jobs stuck in "processing"?
- Restart the queue worker (Ctrl+C, then run again)
- Check the `jobs` table for stuck jobs

### Generation takes too long?
- Check your OpenAI API key and quota
- Verify internet connectivity
- Check `storage/logs/laravel.log` for API errors

## Files Modified

- ✅ `app/Jobs/GenerateLessonPlansJob.php` - Background job
- ✅ `app/Models/AiGenerationTask.php` - Task tracking model
- ✅ `app/Http/Controllers/AiPlannerController.php` - Async dispatch
- ✅ `database/migrations/*_create_ai_generation_tasks_table.php` - Status tracking
- ✅ `routes/api.php` - Status checking endpoint
- ✅ Frontend: Real-time progress bar with polling
