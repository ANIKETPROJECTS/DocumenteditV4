import { getDatabase } from "../shared/schema";
import { v2 as cloudinary } from 'cloudinary';
import fs from "fs";
import path from "path";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: '646536967735165',
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function migrate() {
  console.log("Starting Cloudinary migration...");
  const db = await getDatabase();
  const collection = db.collection("image_storage");

  const rawContent = fs.readFileSync(path.join(process.cwd(), "attached_assets/Pasted--id-oid-6957b6abab1c4e894f871373-userId-6957b68bab1c4-1_1768156542404.txt"), "utf8");
  
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
    
    console.log(`Processing record ${oldData.indexOf(record) + 1}/${oldData.length}: ${employeeId}`);

    const updateData: any = { ...record };
    delete updateData._id;

    // Handle Dates
    if (updateData.uploadedAt?.$date) updateData.uploadedAt = new Date(updateData.uploadedAt.$date);
    if (updateData.completedAt?.$date) updateData.completedAt = new Date(updateData.completedAt.$date);

    // Upload Original
    if (fs.existsSync(path.join(employeeDir, "original.jpg"))) {
      try {
        const result = await cloudinary.uploader.upload(path.join(employeeDir, "original.jpg"), {
          folder: 'original',
          public_id: `${employeeId}_original`
        });
        updateData.originalFilePath = result.secure_url;
      } catch (err) {
        console.error(`Failed to upload original for ${employeeId}:`, err);
      }
    }

    // Upload Edited
    if (fs.existsSync(path.join(employeeDir, "edited.jpg"))) {
      try {
        const result = await cloudinary.uploader.upload(path.join(employeeDir, "edited.jpg"), {
          folder: 'edited',
          public_id: `${employeeId}_edited`
        });
        updateData.editedFilePath = result.secure_url;
      } catch (err) {
        console.error(`Failed to upload edited for ${employeeId}:`, err);
      }
    }

    await collection.updateOne(
      { userId: record.userId, employeeId: record.employeeId, originalFileName: record.originalFileName },
      { $set: updateData },
      { upsert: true }
    );
  }

  console.log("Cloudinary migration complete!");
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
