import type { Complaint, User } from '../types/index.js';

export const users: User[] = [
  { id: 'U-1001', name: 'Aarav Sharma', studentId: 'STU-2026-014', role: 'Student', email: 'aarav@hostel.edu', password: 'password123', phone: '+977 9800001111', building: 'Maple Hall', room: '204', status: 'Active', totpEnabled: false },
  { id: 'U-1002', name: 'Nisha Thapa', studentId: 'STU-2026-018', role: 'Student', email: 'nisha@hostel.edu', password: 'password123', phone: '+977 9800002222', building: 'Cedar Block', room: '118', status: 'Active', totpEnabled: false },
  { id: 'U-2001', name: 'Ramesh Karki', role: 'Maintenance Staff', email: 'ramesh@hostel.edu', password: 'password123', phone: '+977 9800003333', building: 'All Buildings', room: '-', status: 'Active', totpEnabled: false },
  { id: 'U-2002', name: 'Mina Gurung', role: 'Maintenance Staff', email: 'mina@hostel.edu', password: 'password123', phone: '+977 9800004444', building: 'North Wing', room: '-', status: 'Active', totpEnabled: false },
  { id: 'U-3001', name: 'Hostel Admin', role: 'Administrator', email: 'admin@hostel.edu', password: 'password123', phone: '+977 9800005555', building: 'Admin Office', room: 'A-01', status: 'Active', totpEnabled: false }
];

export const complaints: Complaint[] = [
  {
    id: 'FX-2401',
    title: 'Water leaking near wash basin',
    category: 'Water',
    priority: 'High',
    status: 'In Progress',
    building: 'Maple Hall',
    room: '204',
    student: 'Aarav Sharma',
    staff: 'Ramesh Karki',
    submitted: '2026-07-05',
    description: 'Water has been leaking below the wash basin since yesterday evening and the floor stays wet.',
    image: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=900&q=80',
    notes: ['Pipe joint inspected. Replacement washer requested.', 'Work scheduled for today afternoon.'],
    updates: ['Pending', 'Assigned', 'In Progress']
  },
  {
    id: 'FX-2405',
    title: 'Main door lock jammed',
    category: 'Door/Lock',
    priority: 'Emergency',
    status: 'Pending',
    building: 'Cedar Block',
    room: '120',
    student: 'Kritika Lama',
    staff: 'Unassigned',
    submitted: '2026-07-06',
    description: 'Door lock is jammed from inside. It takes several minutes to open.',
    image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80',
    notes: [],
    updates: ['Pending']
  }
];
