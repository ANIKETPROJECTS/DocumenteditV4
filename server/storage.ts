import { type User, type Employee, type ImageRequest, getDatabase } from "@shared/schema";
import { ObjectId, Binary } from "mongodb";

export interface IStorage {
  // Employee operations
  getEmployeeByEmployeeId(employeeId: string): Promise<Employee | null>;
  createEmployee(employee: Omit<Employee, '_id' | 'createdAt'>): Promise<Employee>;
  getAllEmployees(): Promise<Employee[]>;
  deleteAllEmployees(): Promise<void>;
  
  // User operations
  getUserByEmployeeId(employeeId: string): Promise<User | null>;
  createUser(user: Omit<User, '_id' | 'createdAt'>): Promise<User>;
  
  // Image request operations
  createImageRequest(request: Omit<ImageRequest, '_id' | 'uploadedAt'>): Promise<ImageRequest>;
  getImageRequestById(id: string): Promise<ImageRequest | null>;
  getImageRequestsByUserId(userId: string): Promise<ImageRequest[]>;
  getAllImageRequests(): Promise<ImageRequest[]>;
  getAllUsers(): Promise<User[]>;
  updateImageRequest(id: string, update: Partial<ImageRequest>): Promise<ImageRequest | null>;
}

export class MongoStorage implements IStorage {
  // Employee operations
  async getEmployeeByEmployeeId(employeeId: string): Promise<Employee | null> {
    const db = await getDatabase();
    const employee = await db.collection<Employee>('employees').findOne({ employeeId: String(employeeId) });
    return employee;
  }

  async createEmployee(employee: Omit<Employee, '_id' | 'createdAt'>): Promise<Employee> {
    const db = await getDatabase();
    const newEmployee: Employee = {
      ...employee,
      createdAt: new Date(),
    };
    const result = await db.collection<Employee>('employees').insertOne(newEmployee as any);
    return { ...newEmployee, _id: result.insertedId };
  }

  async getAllEmployees(): Promise<Employee[]> {
    const db = await getDatabase();
    const employees = await db.collection<Employee>('employees').find({}).toArray();
    return employees;
  }

  async deleteAllEmployees(): Promise<void> {
    const db = await getDatabase();
    await db.collection('employees').deleteMany({});
  }

  // User operations
  async getUserByEmployeeId(employeeId: string): Promise<User | null> {
    const db = await getDatabase();
    const user = await db.collection<User>('users').findOne({ employeeId: String(employeeId) });
    return user;
  }

  async createUser(user: Omit<User, '_id' | 'createdAt'>): Promise<User> {
    const db = await getDatabase();
    const newUser: User = {
      ...user,
      createdAt: new Date(),
    };
    const result = await db.collection<User>('users').insertOne(newUser as any);
    return { ...newUser, _id: result.insertedId };
  }

  async getAllUsers(): Promise<User[]> {
    const db = await getDatabase();
    const users = await db.collection<User>('users').find({}).toArray();
    return users;
  }

  // Image request operations
  async createImageRequest(request: Omit<ImageRequest, '_id' | 'uploadedAt'>): Promise<ImageRequest> {
    const db = await getDatabase();
    const newRequest: any = {
      ...request,
      uploadedAt: new Date(),
    };

    // Store as Binary (raw format in MongoDB)
    if (request.originalFileContent) {
      const base64Data = request.originalFileContent.split(",")[1] || request.originalFileContent;
      newRequest.originalFileContent = new Binary(Buffer.from(base64Data, "base64"));
    }
    if (request.editedFileContent) {
      const base64Data = request.editedFileContent.split(",")[1] || request.editedFileContent;
      newRequest.editedFileContent = new Binary(Buffer.from(base64Data, "base64"));
    }

    const result = await db.collection("image_storage").insertOne(newRequest);
    return { ...request, uploadedAt: newRequest.uploadedAt, _id: result.insertedId };
  }

  async getImageRequestById(id: string): Promise<ImageRequest | null> {
    const db = await getDatabase();
    const doc = await db.collection("image_storage").findOne({ _id: new ObjectId(id) }) as any;
    if (!doc) return null;

    // Convert Binary back to base64 for the frontend
    if (doc.originalFileContent instanceof Binary) {
      const prefix = doc.originalContentType ? `data:${doc.originalContentType};base64,` : "";
      doc.originalFileContent = prefix + doc.originalFileContent.buffer.toString("base64");
    }
    if (doc.editedFileContent instanceof Binary) {
      const prefix = doc.editedContentType ? `data:${doc.editedContentType};base64,` : "";
      doc.editedFileContent = prefix + doc.editedFileContent.buffer.toString("base64");
    }

    return doc as ImageRequest;
  }

  async getImageRequestsByUserId(userId: string): Promise<ImageRequest[]> {
    const db = await getDatabase();
    const requests = await db.collection('image_storage')
      .find({ userId })
      .project({ originalFileContent: 0, editedFileContent: 0 })
      .sort({ uploadedAt: -1 })
      .toArray() as any[];
    return requests;
  }

  async getAllImageRequests(): Promise<ImageRequest[]> {
    const db = await getDatabase();
    const requests = await db.collection('image_storage')
      .find({})
      .project({ originalFileContent: 0, editedFileContent: 0 })
      .sort({ uploadedAt: -1 })
      .toArray() as any[];
    return requests;
  }

  async updateImageRequest(id: string, update: Partial<ImageRequest>): Promise<ImageRequest | null> {
    const db = await getDatabase();
    
    const docUpdate: any = { ...update };
    if (update.originalFileContent) {
      const base64Data = update.originalFileContent.split(",")[1] || update.originalFileContent;
      docUpdate.originalFileContent = new Binary(Buffer.from(base64Data, "base64"));
    }
    if (update.editedFileContent) {
      const base64Data = update.editedFileContent.split(",")[1] || update.editedFileContent;
      docUpdate.editedFileContent = new Binary(Buffer.from(base64Data, "base64"));
    }

    const result = await db.collection('image_storage').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: docUpdate },
      { returnDocument: 'after' }
    );
    
    if (!result) return null;
    const doc = result as any;
    
    if (doc.originalFileContent instanceof Binary) {
      const prefix = doc.originalContentType ? `data:${doc.originalContentType};base64,` : "";
      doc.originalFileContent = prefix + doc.originalFileContent.buffer.toString("base64");
    }
    if (doc.editedFileContent instanceof Binary) {
      const prefix = doc.editedContentType ? `data:${doc.editedContentType};base64,` : "";
      doc.editedFileContent = prefix + doc.editedFileContent.buffer.toString("base64");
    }
    
    return doc as ImageRequest;
  }
}

export const storage = new MongoStorage();
