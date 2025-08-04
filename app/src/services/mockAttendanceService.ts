import type {
  AttendanceStats,
  TeacherAttendanceSummary,
  TeacherAttendance,
  PaginatedResponse,
} from '../types';

// Generate 110 mock teachers
const generateMockTeachers = () => {
  const firstNames = [
    'John', 'Sarah', 'Michael', 'Emily', 'David', 'Lisa', 'James', 'Jennifer', 'Robert', 'Jessica',
    'William', 'Amanda', 'Christopher', 'Stephanie', 'Daniel', 'Nicole', 'Matthew', 'Ashley', 'Anthony', 'Elizabeth',
    'Mark', 'Megan', 'Donald', 'Lauren', 'Steven', 'Rachel', 'Paul', 'Kimberly', 'Andrew', 'Heather',
    'Joshua', 'Michelle', 'Kenneth', 'Tiffany', 'Kevin', 'Melissa', 'Brian', 'Christine', 'George', 'Amber',
    'Timothy', 'Danielle', 'Ronald', 'Brittany', 'Jason', 'Crystal', 'Edward', 'Vanessa', 'Jeffrey', 'Angela',
    'Ryan', 'Monica', 'Jacob', 'Heather', 'Gary', 'Deborah', 'Nicholas', 'Lisa', 'Eric', 'Nancy',
    'Jonathan', 'Karen', 'Stephen', 'Betty', 'Larry', 'Helen', 'Justin', 'Sandra', 'Scott', 'Donna',
    'Brandon', 'Carol', 'Benjamin', 'Ruth', 'Samuel', 'Julie', 'Frank', 'Joyce', 'Gregory', 'Virginia',
    'Raymond', 'Victoria', 'Alexander', 'Kelly', 'Patrick', 'Lauren', 'Jack', 'Christina', 'Dennis', 'Joan',
    'Jerry', 'Evelyn', 'Tyler', 'Judith', 'Aaron', 'Megan', 'Jose', 'Cheryl', 'Adam', 'Andrea',
    'Nathan', 'Hannah', 'Henry', 'Jacqueline', 'Douglas', 'Martha', 'Zachary', 'Gloria', 'Peter', 'Teresa',
    'Kyle', 'Ann', 'Walter', 'Sara', 'Ethan', 'Madison', 'Jeremy', 'Frances', 'Harold', 'Kathryn'
  ];

  const lastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
    'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
    'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
    'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
    'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts',
    'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes',
    'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper',
    'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson',
    'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes',
    'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster', 'Jimenez'
  ];

  const teachers = [];
  for (let i = 1; i <= 110; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[i % lastNames.length];
    const gender = i % 2 === 0 ? 'male' as const : 'female' as const;
    
    teachers.push({
      id: i.toString(),
      first_name: firstName,
      last_name: lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@school.edu`,
      gender,
      birthdate: `198${Math.floor(Math.random() * 10)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      is_new: i > 100, // Last 10 teachers are new
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    });
  }
  
  return teachers;
};

const mockTeachers = generateMockTeachers();

// Generate attendance data for all 110 teachers
const generateAttendanceData = () => {
  const statuses = ['present', 'absent', 'late', 'on_break', 'checked_out', 'no_scan'] as const;
  const attendanceData: TeacherAttendanceSummary[] = [];

  for (let i = 0; i < mockTeachers.length; i++) {
    const teacher = mockTeachers[i];
    const status = statuses[i % statuses.length];
    
    let attendance: TeacherAttendanceSummary = {
      user: teacher,
      status,
    };

    // Add time data based on status
    switch (status) {
      case 'present':
        attendance = {
          ...attendance,
          check_in_time: `2024-01-15T0${7 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
          total_hours: 7 + Math.random() * 2,
        };
        break;
      case 'late':
        attendance = {
          ...attendance,
          check_in_time: `2024-01-15T0${8 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
          total_hours: 6 + Math.random() * 2,
        };
        break;
      case 'on_break':
        attendance = {
          ...attendance,
          check_in_time: `2024-01-15T0${7 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
          break_out_time: `2024-01-15T1${Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
          total_hours: 4 + Math.random() * 2,
        };
        break;
      case 'checked_out':
        attendance = {
          ...attendance,
          check_in_time: `2024-01-15T0${7 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
          check_out_time: `2024-01-15T1${6 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
          total_hours: 8 + Math.random() * 2,
        };
        break;
      case 'present':
        // Some present teachers might have break times
        if (Math.random() > 0.5) {
          attendance = {
            ...attendance,
            check_in_time: `2024-01-15T0${7 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
            break_out_time: `2024-01-15T1${Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
            break_in_time: `2024-01-15T1${3 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
            total_hours: 7 + Math.random() * 2,
          };
        }
        break;
    }

    attendanceData.push(attendance);
  }

  return attendanceData;
};

const mockAttendanceData = generateAttendanceData();

export const mockAttendanceService = {
  // Get attendance statistics
  getStats: async (): Promise<AttendanceStats> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const present = mockAttendanceData.filter(t => t.status === 'present').length;
    const absent = mockAttendanceData.filter(t => t.status === 'absent').length;
    const late = mockAttendanceData.filter(t => t.status === 'late').length;
    const onBreak = mockAttendanceData.filter(t => t.status === 'on_break').length;
    const checkedOut = mockAttendanceData.filter(t => t.status === 'checked_out').length;
    const noScan = mockAttendanceData.filter(t => t.status === 'no_scan').length;

    return {
      total_teachers: mockTeachers.length,
      present_today: present,
      absent_today: absent,
      late_today: late,
      on_break: onBreak,
      checked_out: checkedOut,
      no_scan_yet: noScan,
    };
  },

  // Get today's attendance summary for all teachers with pagination
  getTodayAttendance: async (
    page: number = 1,
    perPage: number = 20,
    search?: string,
    statusFilter?: string
  ): Promise<PaginatedResponse<TeacherAttendanceSummary>> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    let filteredData = [...mockAttendanceData];

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filteredData = filteredData.filter(teacher => 
        teacher.user.first_name.toLowerCase().includes(searchLower) ||
        teacher.user.last_name.toLowerCase().includes(searchLower) ||
        teacher.user.email.toLowerCase().includes(searchLower)
      );
    }

    // Apply status filter
    if (statusFilter && statusFilter !== 'all') {
      filteredData = filteredData.filter(teacher => teacher.status === statusFilter);
    }

    // Calculate pagination
    const total = filteredData.length;
    const totalPages = Math.ceil(total / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedData = filteredData.slice(startIndex, endIndex);

    return {
      data: paginatedData,
      success: true,
      pagination: {
        current_page: page,
        last_page: totalPages,
        per_page: perPage,
        total: total,
      },
    };
  },

  // Get paginated attendance records
  getAttendanceRecords: async (
    institutionId: string,
    page: number = 1,
    perPage: number = 15,
  ): Promise<PaginatedResponse<TeacherAttendance>> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 600));
    
    const mockRecords: TeacherAttendance[] = mockAttendanceData.map((data, index) => ({
      id: `att_${index + 1}`,
      user_id: data.user.id,
      institution_id: institutionId,
      date: new Date().toISOString().split('T')[0],
      check_in_time: data.check_in_time,
      check_out_time: data.check_out_time,
      break_out_time: data.break_out_time,
      break_in_time: data.break_in_time,
      status: data.status,
      total_hours: data.total_hours,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user: data.user,
    }));

    return {
      data: mockRecords,
      success: true,
      pagination: {
        current_page: page,
        last_page: 1,
        per_page: perPage,
        total: mockRecords.length,
      },
    };
  },

  // Check in teacher
  checkIn: async (userId: string, institutionId: string): Promise<TeacherAttendance> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const teacher = mockTeachers.find(t => t.id === userId);
    if (!teacher) {
      throw new Error('Teacher not found');
    }

    return {
      id: `att_${Date.now()}`,
      user_id: userId,
      institution_id: institutionId,
      date: new Date().toISOString().split('T')[0],
      check_in_time: new Date().toISOString(),
      status: 'present',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user: teacher,
    };
  },

  // Check out teacher
  checkOut: async (userId: string, institutionId: string): Promise<TeacherAttendance> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const teacher = mockTeachers.find(t => t.id === userId);
    if (!teacher) {
      throw new Error('Teacher not found');
    }

    return {
      id: `att_${Date.now()}`,
      user_id: userId,
      institution_id: institutionId,
      date: new Date().toISOString().split('T')[0],
      check_in_time: '2024-01-15T07:30:00Z',
      check_out_time: new Date().toISOString(),
      status: 'checked_out',
      total_hours: 8.5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user: teacher,
    };
  },

  // Break out teacher
  breakOut: async (userId: string, institutionId: string): Promise<TeacherAttendance> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const teacher = mockTeachers.find(t => t.id === userId);
    if (!teacher) {
      throw new Error('Teacher not found');
    }

    return {
      id: `att_${Date.now()}`,
      user_id: userId,
      institution_id: institutionId,
      date: new Date().toISOString().split('T')[0],
      check_in_time: '2024-01-15T07:30:00Z',
      break_out_time: new Date().toISOString(),
      status: 'on_break',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user: teacher,
    };
  },

  // Break in teacher
  breakIn: async (userId: string, institutionId: string): Promise<TeacherAttendance> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const teacher = mockTeachers.find(t => t.id === userId);
    if (!teacher) {
      throw new Error('Teacher not found');
    }

    return {
      id: `att_${Date.now()}`,
      user_id: userId,
      institution_id: institutionId,
      date: new Date().toISOString().split('T')[0],
      check_in_time: '2024-01-15T07:30:00Z',
      break_out_time: '2024-01-15T12:00:00Z',
      break_in_time: new Date().toISOString(),
      status: 'present',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user: teacher,
    };
  },
}; 