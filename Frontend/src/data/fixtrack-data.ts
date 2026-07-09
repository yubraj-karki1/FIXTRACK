import type { Complaint, ComplaintCategory, ComplaintPriority, ComplaintStatus, User } from '@/types';

export const categories: ComplaintCategory[] = [
  { name: 'Water', color: '#0ea5e9' },
  { name: 'Electricity', color: '#f59e0b' },
  { name: 'Wi-Fi', color: '#2563eb' },
  { name: 'Bathroom', color: '#14b8a6' },
  { name: 'Door/Lock', color: '#64748b' },
  { name: 'Furniture', color: '#8b5cf6' },
  { name: 'Cleaning', color: '#22c55e' },
  { name: 'Other', color: '#475569' }
];

export const users: User[] = [
  { id: 'U-1001', name: 'Aarav Sharma', studentId: 'STU-2026-014', role: 'Student', email: 'aarav@hostel.edu', phone: '+977 9800001111', building: 'Maple Hall', room: '204', status: 'Active', photo: '', totpEnabled: false },
  { id: 'U-1002', name: 'Nisha Thapa', studentId: 'STU-2026-018', role: 'Student', email: 'nisha@hostel.edu', phone: '+977 9800002222', building: 'Cedar Block', room: '118', status: 'Active', photo: '', totpEnabled: false },
  { id: 'U-2001', name: 'Ramesh Karki', role: 'Maintenance Staff', email: 'ramesh@hostel.edu', phone: '+977 9800003333', building: 'All Buildings', room: '-', status: 'Active', photo: '', totpEnabled: false },
  { id: 'U-2002', name: 'Mina Gurung', role: 'Maintenance Staff', email: 'mina@hostel.edu', phone: '+977 9800004444', building: 'North Wing', room: '-', status: 'Active', photo: '', totpEnabled: false },
  { id: 'U-3001', name: 'Hostel Admin', role: 'Administrator', email: 'admin@hostel.edu', phone: '+977 9800005555', building: 'Admin Office', room: 'A-01', status: 'Active', photo: '', totpEnabled: false }
];

export const defaultCurrentUser: User = users[0];

export const initialComplaints: Complaint[] = [
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
    id: 'FX-2402',
    title: 'Room light flickering continuously',
    category: 'Electricity',
    priority: 'Medium',
    status: 'Assigned',
    building: 'Maple Hall',
    room: '211',
    student: 'Nisha Thapa',
    staff: 'Mina Gurung',
    submitted: '2026-07-04',
    description: 'Main tube light flickers and sometimes turns off while studying at night.',
    image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80',
    notes: ['Assigned to electrical team.'],
    updates: ['Pending', 'Assigned']
  },
  {
    id: 'FX-2403',
    title: 'Wi-Fi weak in study corner',
    category: 'Wi-Fi',
    priority: 'Low',
    status: 'Pending',
    building: 'Cedar Block',
    room: '118',
    student: 'Aarav Sharma',
    staff: 'Unassigned',
    submitted: '2026-07-03',
    description: 'Internet keeps dropping around the study desk, especially in the evening.',
    image: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=900&q=80',
    notes: [],
    updates: ['Pending']
  },
  {
    id: 'FX-2404',
    title: 'Bathroom exhaust fan not working',
    category: 'Bathroom',
    priority: 'Medium',
    status: 'Resolved',
    building: 'North Wing',
    room: '305',
    student: 'Pratik Rai',
    staff: 'Ramesh Karki',
    submitted: '2026-07-01',
    description: 'Fan stopped working and the bathroom remains damp after showers.',
    image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80',
    notes: ['Fan motor replaced.', 'Student confirmed the repair.'],
    updates: ['Pending', 'Assigned', 'In Progress', 'Resolved']
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
  },
  {
    id: 'FX-2406',
    title: 'Study chair leg broken',
    category: 'Furniture',
    priority: 'Low',
    status: 'Closed',
    building: 'Maple Hall',
    room: '204',
    student: 'Aarav Sharma',
    staff: 'Mina Gurung',
    submitted: '2026-06-29',
    description: 'Wooden chair is unstable and one leg is cracked.',
    image: 'https://images.unsplash.com/photo-1501045661006-fcebe0257c3f?auto=format&fit=crop&w=900&q=80',
    notes: ['Chair replaced with a new unit.', 'Closed after room inspection.'],
    updates: ['Pending', 'Assigned', 'In Progress', 'Resolved', 'Closed']
  }
];

export const statuses: ComplaintStatus[] = ['Pending', 'Assigned', 'In Progress', 'Resolved', 'Closed'];
export const priorities: ComplaintPriority[] = ['Low', 'Medium', 'High', 'Emergency'];
export const buildings = ['Maple Hall', 'Cedar Block', 'North Wing', 'South Wing', 'Admin Office'] as const;
