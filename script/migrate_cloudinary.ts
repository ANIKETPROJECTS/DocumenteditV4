import { getDatabase } from "../shared/schema";
import { v2 as cloudinary } from 'cloudinary';
import fs from "fs";
import path from "path";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: 'LGxeOBqys9s1XOEFLJUO7Cuy2nE',
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function migrate() {
  console.log("Starting Cloudinary migration with enhanced logging...");
  const db = await getDatabase();
  const collection = db.collection("image_storage");

  const rawContent = fs.readFileSync(path.join(process.cwd(), "attached_assets/Pasted--id-oid-6957b6abab1c4e894f871373-userId-6957b68bab1c4-1_1768156542404.txt"), "utf8");
  
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
    
    console.log(`\n--- Record ${oldData.indexOf(record) + 1}/${oldData.length}: ${employeeId} ---`);

    const updateData: any = { ...record };
    delete updateData._id;

    if (updateData.uploadedAt?.$date) updateData.uploadedAt = new Date(updateData.uploadedAt.$date);
    if (updateData.completedAt?.$date) updateData.completedAt = new Date(updateData.completedAt.$date);

    // Find original file with various extensions
    const originalExts = ['.jpg', '.jpeg', '.JPG', '.JPEG', '.png', '.PNG'];
    let originalFile = null;
    for (const ext of originalExts) {
      const p = path.join(employeeDir, `original${ext}`);
      if (fs.existsSync(p)) {
        originalFile = p;
        break;
      }
    }

    if (originalFile) {
      console.log(`Found original: ${originalFile}`);
      try {
        const result = await cloudinary.uploader.upload(originalFile, {
          folder: 'original',
          public_id: `${employeeId}_original_${Date.now()}`
        });
        updateData.originalFilePath = result.secure_url;
        console.log(`Uploaded original: ${result.secure_url}`);
      } catch (err) {
        console.error(`Failed to upload original for ${employeeId}:`, err);
      }
    } else {
      console.log(`Original file NOT FOUND for ${employeeId}`);
    }

    // Find edited file with various extensions
    const editedExts = ['.jpg', '.jpeg', '.JPG', '.JPEG', '.png', '.PNG'];
    let editedFile = null;
    for (const ext of editedExts) {
      const p = path.join(employeeDir, `edited${ext}`);
      if (fs.existsSync(p)) {
        editedFile = p;
        break;
      }
    }

    if (editedFile) {
      console.log(`Found edited: ${editedFile}`);
      try {
        const result = await cloudinary.uploader.upload(editedFile, {
          folder: 'edited',
          public_id: `${employeeId}_edited_${Date.now()}`
        });
        updateData.editedFilePath = result.secure_url;
        console.log(`Uploaded edited: ${result.secure_url}`);
      } catch (err) {
        console.error(`Failed to upload edited for ${employeeId}:`, err);
      }
    } else {
      console.log(`Edited file NOT FOUND for ${employeeId}`);
    }

    const result = await collection.updateOne(
      { employeeId: record.employeeId, originalFileName: record.originalFileName },
      { $set: updateData },
      { upsert: true }
    );
    console.log(`DB Update result: ${JSON.stringify(result)}`);
  }

  console.log("\nCloudinary migration complete!");
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
