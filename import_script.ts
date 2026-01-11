import { MongoClient } from 'mongodb';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    
    // Import Employees
    const employeeFile = 'attached_assets/employees_(2)_1768142907846.xlsx';
    if (fs.existsSync(employeeFile)) {
      const buf = fs.readFileSync(employeeFile);
      const workbook = XLSX.read(buf, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet) as any[];
      
      console.log(`Processing ${data.length} employees...`);
      let empCount = 0;
      for (const row of data) {
        const employeeId = String(row['Employee ID'] || row['employeeId'] || '');
        if (!employeeId) continue;
        
        await db.collection('employees').updateOne(
          { employeeId },
          { $set: {
            employeeId,
            displayName: String(row['Display Name'] || row['displayName'] || ''),
            miniRegionName: String(row['Mini Region'] || row['miniRegionName'] || ''),
            regionName: String(row['Region'] || row['regionName'] || ''),
            subZoneName: String(row['Sub Zone'] || row['subZoneName'] || ''),
            zoneName: String(row['Zone'] || row['zoneName'] || ''),
            createdAt: new Date()
          }},
          { upsert: true }
        );
        empCount++;
      }
      console.log(`Imported/Updated ${empCount} employees.`);
    }

    // Import Users
    const userFile = 'attached_assets/users_(1)_1768142907846.xlsx';
    if (fs.existsSync(userFile)) {
      const buf = fs.readFileSync(userFile);
      const workbook = XLSX.read(buf, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet) as any[];
      
      console.log(`Processing ${data.length} users...`);
      let userCount = 0;
      for (const row of data) {
        const employeeId = String(row['Employee ID'] || row['employeeId'] || '');
        if (!employeeId) continue;
        
        await db.collection('users').updateOne(
          { employeeId },
          { $set: {
            employeeId,
            displayName: String(row['Full Name'] || row['displayName'] || ''),
            role: (row['Role'] || 'user').toLowerCase(),
            createdAt: new Date()
          }},
          { upsert: true }
        );
        userCount++;
      }
      console.log(`Imported/Updated ${userCount} users.`);
    }

  } catch (error) {
    console.error("Import error:", error);
  } finally {
    await client.close();
  }
}

run();
