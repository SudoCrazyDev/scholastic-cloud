// Database schema definitions for offline storage
export const createTables = `
  -- Users table for authentication
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    role TEXT,
    institution_id TEXT,
    last_login TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Auth tokens table
  CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Class sections table
  CREATE TABLE IF NOT EXISTS class_sections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    institution_id TEXT,
    adviser_id TEXT,
    academic_year TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced BOOLEAN DEFAULT 0
  );

  -- Students table
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    lrn TEXT UNIQUE,
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    date_of_birth TEXT,
    gender TEXT,
    address TEXT,
    contact_number TEXT,
    email TEXT,
    guardian_name TEXT,
    guardian_contact TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced BOOLEAN DEFAULT 0
  );

  -- Student sections junction table
  CREATE TABLE IF NOT EXISTS student_sections (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced BOOLEAN DEFAULT 0,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (section_id) REFERENCES class_sections(id),
    UNIQUE(student_id, section_id, academic_year)
  );

  -- Subjects table
  CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    description TEXT,
    grade_level TEXT,
    institution_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced BOOLEAN DEFAULT 0
  );

  -- Subject assignments table
  CREATE TABLE IF NOT EXISTS subject_assignments (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    teacher_id TEXT,
    academic_year TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced BOOLEAN DEFAULT 0,
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (section_id) REFERENCES class_sections(id)
  );

  -- Grade items table
  CREATE TABLE IF NOT EXISTS grade_items (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('Written Works', 'Performance Tasks', 'Quarterly Assessment')),
    quarter TEXT NOT NULL CHECK (quarter IN ('First Quarter', 'Second Quarter', 'Third Quarter', 'Fourth Quarter')),
    total_score INTEGER NOT NULL,
    date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced BOOLEAN DEFAULT 0,
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

  -- Student scores table
  CREATE TABLE IF NOT EXISTS student_scores (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    grade_item_id TEXT NOT NULL,
    score REAL NOT NULL,
    date_submitted TEXT,
    remarks TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced BOOLEAN DEFAULT 0,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (grade_item_id) REFERENCES grade_items(id),
    UNIQUE(student_id, grade_item_id)
  );

  -- Quarterly grades table
  CREATE TABLE IF NOT EXISTS quarterly_grades (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    quarter TEXT NOT NULL,
    written_works_score REAL,
    written_works_ps REAL,
    written_works_ws REAL,
    performance_tasks_score REAL,
    performance_tasks_ps REAL,
    performance_tasks_ws REAL,
    quarterly_assessment_score REAL,
    quarterly_assessment_ps REAL,
    quarterly_assessment_ws REAL,
    initial_grade REAL,
    quarterly_grade REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced BOOLEAN DEFAULT 0,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    UNIQUE(student_id, subject_id, quarter)
  );

  -- Sync queue table for tracking changes
  CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    record_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced BOOLEAN DEFAULT 0,
    synced_at TEXT,
    error TEXT
  );

  -- Sync history table
  CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_type TEXT NOT NULL CHECK (sync_type IN ('FULL', 'PARTIAL', 'MANUAL')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    records_synced INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    status TEXT CHECK (status IN ('SUCCESS', 'PARTIAL', 'FAILED')),
    error_message TEXT
  );

  -- App settings table
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes for better performance
  CREATE INDEX IF NOT EXISTS idx_students_lrn ON students(lrn);
  CREATE INDEX IF NOT EXISTS idx_student_sections_student ON student_sections(student_id);
  CREATE INDEX IF NOT EXISTS idx_student_sections_section ON student_sections(section_id);
  CREATE INDEX IF NOT EXISTS idx_student_scores_student ON student_scores(student_id);
  CREATE INDEX IF NOT EXISTS idx_student_scores_item ON student_scores(grade_item_id);
  CREATE INDEX IF NOT EXISTS idx_grade_items_subject ON grade_items(subject_id);
  CREATE INDEX IF NOT EXISTS idx_subject_assignments_section ON subject_assignments(section_id);
  CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced);
`;

export const dropAllTables = `
  DROP TABLE IF EXISTS sync_history;
  DROP TABLE IF EXISTS sync_queue;
  DROP TABLE IF EXISTS quarterly_grades;
  DROP TABLE IF EXISTS student_scores;
  DROP TABLE IF EXISTS grade_items;
  DROP TABLE IF EXISTS subject_assignments;
  DROP TABLE IF EXISTS subjects;
  DROP TABLE IF EXISTS student_sections;
  DROP TABLE IF EXISTS students;
  DROP TABLE IF EXISTS class_sections;
  DROP TABLE IF EXISTS auth_tokens;
  DROP TABLE IF EXISTS users;
  DROP TABLE IF EXISTS app_settings;
`;