import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Collection, Db, MongoClient, OptionalUnlessRequiredId } from 'mongodb';
import { config } from '../config/index.js';
import { complaints as seedComplaints, users as seedUsers } from '../data/index.js';
import { ensurePasswordHash } from '../services/password.service.js';
import type { AuditEvent, Complaint, User } from '../types/index.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const usersFile = resolve(currentDir, '../../data/users.json');
const complaintsFile = resolve(currentDir, '../../data/complaints.json');
let client: MongoClient | null = null;
let mongoDatabase: Db | null = null;

function loadUsers(): User[] {
  if (!config.seedDemoData) return [];
  let loadedUsers: User[];

  if (!existsSync(usersFile)) {
    loadedUsers = seedUsers;
  } else {
    try {
      const storedUsers = JSON.parse(readFileSync(usersFile, 'utf8')) as User[];
      loadedUsers = storedUsers.length ? storedUsers : seedUsers;
    } catch {
      loadedUsers = seedUsers;
    }
  }

  const hashedUsers = loadedUsers.map(hashUserPassword);
  if (hashedUsers.some((user, index) => user.password !== loadedUsers[index]?.password)) {
    persistUsers(hashedUsers);
  }

  return hashedUsers;
}

function hashUserPassword(user: User): User {
  return { ...user, password: ensurePasswordHash(user.password) };
}

function persistUsers(users: User[]): void {
  mkdirSync(dirname(usersFile), { recursive: true });
  writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function loadComplaints(): Complaint[] {
  if (!config.seedDemoData) return [];
  if (!existsSync(complaintsFile)) return seedComplaints;

  try {
    const storedComplaints = JSON.parse(readFileSync(complaintsFile, 'utf8')) as Complaint[];
    return storedComplaints.length ? storedComplaints : seedComplaints;
  } catch {
    return seedComplaints;
  }
}

function persistComplaints(complaints: Complaint[]): void {
  mkdirSync(dirname(complaintsFile), { recursive: true });
  writeFileSync(complaintsFile, JSON.stringify(complaints, null, 2));
}

export const database = {
  users: loadUsers(),
  complaints: loadComplaints()
};

export const mongo = {
  get isConnected(): boolean {
    return Boolean(mongoDatabase);
  },

  users(): Collection<User> {
    if (!mongoDatabase) {
      throw new Error('MongoDB is not connected');
    }
    return mongoDatabase.collection<User>('users');
  },

  complaints(): Collection<Complaint> {
    if (!mongoDatabase) {
      throw new Error('MongoDB is not connected');
    }
    return mongoDatabase.collection<Complaint>('complaints');
  },

  auditEvents(): Collection<AuditEvent> {
    if (!mongoDatabase) {
      throw new Error('MongoDB is not connected');
    }
    return mongoDatabase.collection<AuditEvent>('auditEvents');
  }
};

export async function connectDatabase(): Promise<void> {
  if (!config.mongodbUri) {
    console.log('MONGODB_URI is not set. Using local JSON/seed data.');
    return;
  }

  client = new MongoClient(config.mongodbUri);
  await client.connect();
  mongoDatabase = client.db(config.mongodbDatabase);

  await mongo.users().createIndex({ email: 1 }, { unique: true });
  await mongo.users().createIndex({ id: 1 }, { unique: true });
  await mongo.complaints().createIndex({ id: 1 }, { unique: true });
  await mongo.complaints().createIndex({ studentUserId: 1, submitted: -1 });
  await mongo.complaints().createIndex({ staffUserId: 1, status: 1 });
  await mongo.auditEvents().createIndex({ createdAt: -1 });
  if (config.seedDemoData) {
    await seedMongoCollection(mongo.users(), database.users);
    await seedMongoCollection(mongo.complaints(), database.complaints);
  }
  await migrateMongoPasswords();
  await migrateSeedComplaintOwnership();

  console.log(`MongoDB connected: ${config.mongodbDatabase}`);
}

async function migrateSeedComplaintOwnership(): Promise<void> {
  await Promise.all(seedComplaints.map(async (complaint) => {
    await mongo.complaints().updateOne(
      { id: complaint.id, studentUserId: { $exists: false } },
      {
        $set: {
          studentUserId: complaint.studentUserId,
          ...(complaint.staffUserId ? { staffUserId: complaint.staffUserId } : {})
        }
      }
    );
  }));
}

async function migrateMongoPasswords(): Promise<void> {
  const users = await mongo.users().find({}, { projection: { _id: 0 } }).toArray();
  await Promise.all(
    users.map(async (user) => {
      const hashedPassword = ensurePasswordHash(user.password);
      if (hashedPassword && hashedPassword !== user.password) {
        await mongo.users().updateOne({ id: user.id }, { $set: { password: hashedPassword } });
      }
    })
  );
}

async function seedMongoCollection<T extends { id: string }>(collection: Collection<T>, records: T[]): Promise<void> {
  const count = await collection.estimatedDocumentCount();
  if (count > 0) return;

  await collection.insertMany(records as OptionalUnlessRequiredId<T>[]);
}

export function saveUsers(): void {
  persistUsers(database.users);
}

export function saveComplaints(): void {
  persistComplaints(database.complaints);
}
