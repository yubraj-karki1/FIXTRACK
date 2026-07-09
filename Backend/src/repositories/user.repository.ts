import { database, mongo, saveUsers } from '../database/index.js';
import type { User } from '../types/index.js';

export const userRepository = {
  async findAll(): Promise<User[]> {
    if (mongo.isConnected) {
      return mongo.users().find({}, { projection: { _id: 0 } }).toArray();
    }

    return database.users;
  },

  async findByEmail(email: string): Promise<User | undefined> {
    if (mongo.isConnected) {
      const user = await mongo.users().findOne({ email: email.toLowerCase() }, { projection: { _id: 0 } });
      return user || undefined;
    }

    return database.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  },

  async findById(id: string): Promise<User | undefined> {
    if (mongo.isConnected) {
      const user = await mongo.users().findOne({ id }, { projection: { _id: 0 } });
      return user || undefined;
    }

    return database.users.find((user) => user.id === id);
  },

  async create(user: User): Promise<User> {
    if (mongo.isConnected) {
      await mongo.users().insertOne(user);
      return user;
    }

    database.users.push(user);
    saveUsers();
    return user;
  },

  async update(id: string, updates: Partial<User>): Promise<User | undefined> {
    if (mongo.isConnected) {
      await mongo.users().updateOne({ id }, { $set: updates });
      return this.findById(id);
    }

    const user = database.users.find((item) => item.id === id);
    if (!user) return undefined;

    Object.assign(user, updates);
    saveUsers();
    return user;
  }
};
