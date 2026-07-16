import type { UpdateFilter } from 'mongodb';
import { database, mongo, saveUsers } from '../database/index.js';
import { decryptSecret, encryptSecret } from '../services/secret-encryption.service.js';
import type { User } from '../types/index.js';

function withDecryptedPhone(user: User): User {
  return user.phone ? { ...user, phone: decryptSecret(user.phone) } : user;
}

function withEncryptedPhone(user: User): User {
  return user.phone ? { ...user, phone: encryptSecret(user.phone) } : user;
}

export const userRepository = {
  async findAll(): Promise<User[]> {
    if (mongo.isConnected) {
      const users = await mongo.users().find({}, { projection: { _id: 0 } }).toArray();
      return users.map(withDecryptedPhone);
    }

    return database.users.map(withDecryptedPhone);
  },

  async findByEmail(email: string): Promise<User | undefined> {
    if (mongo.isConnected) {
      const user = await mongo.users().findOne({ email: email.toLowerCase() }, { projection: { _id: 0 } });
      return user ? withDecryptedPhone(user) : undefined;
    }

    const user = database.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
    return user ? withDecryptedPhone(user) : undefined;
  },

  async findById(id: string): Promise<User | undefined> {
    if (mongo.isConnected) {
      const user = await mongo.users().findOne({ id }, { projection: { _id: 0 } });
      return user ? withDecryptedPhone(user) : undefined;
    }

    const user = database.users.find((user) => user.id === id);
    return user ? withDecryptedPhone(user) : undefined;
  },

  async create(user: User): Promise<User> {
    const stored = withEncryptedPhone(user);
    if (mongo.isConnected) {
      await mongo.users().insertOne(stored);
      return withDecryptedPhone(stored);
    }

    database.users.push(stored);
    saveUsers();
    return withDecryptedPhone(stored);
  },

  async update(id: string, updates: Partial<User>): Promise<User | undefined> {
    const storedUpdates = updates.phone !== undefined ? { ...updates, phone: encryptSecret(updates.phone) } : updates;

    if (mongo.isConnected) {
      const fieldsToSet = Object.fromEntries(Object.entries(storedUpdates).filter(([, value]) => value !== undefined)) as Partial<User>;
      const fieldsToUnset = Object.fromEntries(Object.entries(storedUpdates).filter(([, value]) => value === undefined).map(([key]) => [key, '' as const]));
      const update: UpdateFilter<User> = {
        ...(Object.keys(fieldsToSet).length ? { $set: fieldsToSet } : {}),
        ...(Object.keys(fieldsToUnset).length ? { $unset: fieldsToUnset } : {})
      };
      await mongo.users().updateOne({ id }, update);
      return this.findById(id);
    }

    const user = database.users.find((item) => item.id === id);
    if (!user) return undefined;

    Object.entries(storedUpdates).forEach(([key, value]) => {
      if (value === undefined) {
        delete user[key as keyof User];
        return;
      }

      Object.assign(user, { [key]: value });
    });
    saveUsers();
    return withDecryptedPhone(user);
  }
};
