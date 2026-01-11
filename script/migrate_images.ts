import { getDatabase } from "../shared/schema";
import { ObjectId, Binary } from "mongodb";
import fs from "fs";
import path from "path";

async function migrate() {
  console.log("Starting migration...");
  const db = await getDatabase();
  const collection = db.collection("image_storage");

  const rawContent = fs.readFileSync(path.join(process.cwd(), "attached_assets/Pasted-now-in-the-root-folder-i-have-uploaded-a-folder-named-i_1768150545403.txt"), "utf8");
  
  // Find the start of the JSON array
  const jsonStart = rawContent.indexOf('[');
  if (jsonStart === -1) {
    throw new Error("Could not find start of JSON array in file");
  }
  const oldDataStr = rawContent.substring(jsonStart);
  const oldData = JSON.parse(oldDataStr);

  console.log(`Processing ${oldData.length} records...`);

  for (const record of oldData) {
    const employeeId = record.employeeId;
    const employeeDir = path.join(process.cwd(), "images for DB", employeeId);
    
    let originalContent: Buffer | null = null;
    let editedContent: Buffer | null = null;

    if (fs.existsSync(path.join(employeeDir, "original.jpg"))) {
      originalContent = fs.readFileSync(path.join(employeeDir, "original.jpg"));
    }
    if (fs.existsSync(path.join(employeeDir, "edited.jpg"))) {
      editedContent = fs.readFileSync(path.join(employeeDir, "edited.jpg"));
    }

    const document: any = {
      userId: record.userId,
      employeeId: record.employeeId,
      displayName: record.displayName,
      originalFileName: record.originalFileName,
      originalFilePath: record.originalFilePath,
      status: record.status,
      uploadedAt: record.uploadedAt?.$date ? new Date(record.uploadedAt.$date) : new Date(),
      completedAt: record.completedAt?.$date ? new Date(record.completedAt.$date) : null,
      editedFileName: record.editedFileName,
      editedFilePath: record.editedFilePath,
    };

    if (originalContent) {
      document.originalFileContent = new Binary(originalContent);
      document.originalContentType = "image/jpeg";
    }
    if (editedContent) {
      document.editedFileContent = new Binary(editedContent);
      document.editedContentType = "image/jpeg";
    }

    await collection.updateOne(
      { userId: record.userId, employeeId: record.employeeId, originalFileName: record.originalFileName },
      { $set: document },
      { upsert: true }
    );
  }

  console.log("Migration complete!");
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
