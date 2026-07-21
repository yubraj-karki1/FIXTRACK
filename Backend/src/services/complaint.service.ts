import { randomUUID } from 'node:crypto';
import type { CreateComplaintDto, UpdateComplaintDto } from '../dtos/complaint.dto.js';
import { HttpError } from '../errors/http-error.js';
import { complaintRepository } from '../repositories/complaint.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { auditService } from './audit.service.js';
import type { Complaint, ComplaintStatus, User } from '../types/index.js';

const defaultEvidenceImage = 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?auto=format&fit=crop&w=900&q=80';

export function canAccessComplaint(user: User, complaint: Complaint): boolean {
  if (user.role === 'Administrator') return true;
  // Staff can see their own assigned work plus the unassigned queue (read-only, until an
  // administrator assigns it), but not complaints already assigned to a different staff member.
  if (user.role === 'Maintenance Staff') return complaint.staffUserId === user.id || complaint.status === 'Pending';
  return complaint.studentUserId === user.id;
}

function assertComplaintAccess(user: User, complaint: Complaint): void {
  if (!canAccessComplaint(user, complaint)) {
    // Avoid revealing whether an inaccessible complaint ID exists.
    throw new HttpError(404, 'Complaint not found');
  }
}

/** Only the complaint's own submitter or an administrator may replace its evidence image. */
export function canReplaceComplaintImage(user: User, complaint: Complaint): boolean {
  return user.role === 'Administrator' || complaint.studentUserId === user.id;
}

function addStatusHistory(complaint: Complaint, status: ComplaintStatus): ComplaintStatus[] {
  return complaint.updates.at(-1) === status ? complaint.updates : [...complaint.updates, status];
}

async function findComplaint(id: string): Promise<Complaint> {
  const complaint = await complaintRepository.findById(id);
  if (!complaint) throw new HttpError(404, 'Complaint not found');
  return complaint;
}

// Joined at read time (rather than stored on the complaint) so it always reflects the
// student's current phone number, including after they update their profile.
async function withStudentPhone(complaint: Complaint): Promise<Complaint> {
  const student = await userRepository.findById(complaint.studentUserId);
  return { ...complaint, studentPhone: student?.phone || '' };
}

async function withStudentPhones(complaints: Complaint[]): Promise<Complaint[]> {
  const uniqueStudentIds = [...new Set(complaints.map((complaint) => complaint.studentUserId))];
  const students = await Promise.all(uniqueStudentIds.map((id) => userRepository.findById(id)));
  const phoneById = new Map(
    students.filter((student): student is User => Boolean(student)).map((student) => [student.id, student.phone])
  );
  return complaints.map((complaint) => ({ ...complaint, studentPhone: phoneById.get(complaint.studentUserId) || '' }));
}

export const complaintService = {
  async getComplaints(user: User): Promise<Complaint[]> {
    const complaints = await complaintRepository.findAll();
    const accessible = complaints.filter((complaint) => canAccessComplaint(user, complaint));
    return withStudentPhones(accessible);
  },

  async getComplaintById(id: string, user: User): Promise<Complaint> {
    const complaint = await findComplaint(id);
    assertComplaintAccess(user, complaint);
    return withStudentPhone(complaint);
  },

  /** Authorizes and loads a complaint for an image-replacement request; upload.controller does the actual upload. */
  async assertCanReplaceImage(id: string, user: User): Promise<Complaint> {
    const complaint = await findComplaint(id);
    assertComplaintAccess(user, complaint);
    if (!canReplaceComplaintImage(user, complaint)) {
      throw new HttpError(403, 'You may only replace the image on your own complaint.');
    }
    return complaint;
  },

  /** Called only after upload.service has fully validated, scanned, and stored the new file. */
  async attachImage(id: string, uploadId: string, imageUrl: string, caption: string | undefined): Promise<Complaint> {
    const updated = await complaintRepository.update(id, {
      imageUploadId: uploadId,
      image: imageUrl,
      imageCaption: caption
    });
    if (!updated) throw new HttpError(404, 'Complaint not found');
    // upload.service.ts already records the upload.succeeded/upload.rejected audit event
    // for this action, so no separate complaint.* event is logged here.
    return withStudentPhone(updated);
  },

  async createComplaint(input: CreateComplaintDto, user: User): Promise<Complaint> {
    if (user.role === 'Maintenance Staff') {
      throw new HttpError(403, 'Maintenance staff cannot submit student complaints');
    }

    const created = await complaintRepository.create({
      id: `FX-${randomUUID().slice(0, 8).toUpperCase()}`,
      title: input.title,
      category: input.category,
      priority: input.priority,
      status: 'Pending',
      building: input.building,
      room: input.room,
      studentUserId: user.id,
      student: user.name,
      staff: 'Unassigned',
      submitted: new Date().toISOString().slice(0, 10),
      description: input.description,
      image: input.image || defaultEvidenceImage,
      notes: [],
      updates: ['Pending']
    });

    void auditService.record(
      'complaint.created',
      `${user.name} submitted a complaint: "${created.title}".`,
      { id: user.id, name: user.name, role: user.role },
      created.id
    );

    // The submitter is already in scope, so there is no need for the usual lookup join.
    return { ...created, studentPhone: user.phone };
  },

  async updateComplaint(id: string, input: UpdateComplaintDto, user: User): Promise<Complaint> {
    const complaint = await findComplaint(id);
    assertComplaintAccess(user, complaint);

    const updates: Partial<Complaint> = {};

    if (user.role === 'Student') {
      if (complaint.status !== 'Pending' || input.status !== 'Closed') {
        throw new HttpError(403, 'Students may only cancel their own pending complaints');
      }
      updates.status = 'Closed';
      updates.updates = addStatusHistory(complaint, 'Closed');
      updates.notes = [...complaint.notes, 'Cancelled by the student before assignment.'];
    } else if (user.role === 'Maintenance Staff') {
      // Viewing the unassigned queue is allowed, but acting on it is not: only an
      // administrator can assign a complaint to a staff member.
      if (complaint.staffUserId !== user.id) {
        throw new HttpError(403, 'This complaint is not assigned to you yet.');
      }
      if (input.status) {
        const validTransition =
          (complaint.status === 'Assigned' && input.status === 'In Progress') ||
          (complaint.status === 'In Progress' && input.status === 'Resolved');
        if (!validTransition) throw new HttpError(409, 'Invalid maintenance status transition');
        updates.status = input.status;
        updates.updates = addStatusHistory(complaint, input.status);
      }
      if (input.note) updates.notes = [...complaint.notes, `${user.name}: ${input.note}`];
      if (!input.status && !input.note) throw new HttpError(400, 'A status or note update is required');
    } else {
      if (input.title !== undefined) updates.title = input.title;
      if (input.category !== undefined) updates.category = input.category;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.building !== undefined) updates.building = input.building;
      if (input.room !== undefined) updates.room = input.room;
      if (input.description !== undefined) updates.description = input.description;
      if (input.image !== undefined) updates.image = input.image;

      let nextStatus = input.status;
      if (input.staffUserId) {
        const staff = await userRepository.findById(input.staffUserId);
        if (!staff || staff.role !== 'Maintenance Staff' || staff.status !== 'Active') {
          throw new HttpError(400, 'Assigned user must be active maintenance staff');
        }
        updates.staffUserId = staff.id;
        updates.staff = staff.name;
        if (!nextStatus && complaint.status === 'Pending') nextStatus = 'Assigned';
      }

      if (nextStatus) {
        updates.status = nextStatus;
        updates.updates = addStatusHistory(complaint, nextStatus);
      }
      if (input.note) updates.notes = [...complaint.notes, `${user.name}: ${input.note}`];
      if (!Object.keys(updates).length) throw new HttpError(400, 'At least one complaint update is required');
    }

    const updated = await complaintRepository.update(id, updates);
    if (!updated) throw new HttpError(404, 'Complaint not found');

    const auditActor = { id: user.id, name: user.name, role: user.role };
    if (updates.staffUserId !== undefined) {
      void auditService.record('complaint.assigned', `${user.name} assigned complaint ${updated.id} to ${updated.staff}.`, auditActor, updated.id);
    }
    if (updates.status !== undefined) {
      void auditService.record('complaint.status_changed', `${user.name} changed complaint ${updated.id} status to ${updated.status}.`, auditActor, updated.id);
    }
    if (updates.notes !== undefined) {
      void auditService.record('complaint.note_added', `${user.name} added a note to complaint ${updated.id}.`, auditActor, updated.id);
    }

    return withStudentPhone(updated);
  }
};
