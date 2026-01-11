import XLSX from 'xlsx';
import { MongoClient } from 'mongodb';

interface ExcelEmployee {
  'User/Employee ID': number | string;
  'Display Name': string;
  'Mini Region Name': string;
  'Region  Name': string;
  'Sub-Zone Name': string;
  'Zone  Name': string;
}

async function seedEmployees() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  const client = new MongoClient(mongoUri);
  
  try {
    await client.connect();
    const db = client.db('bg_remover_portal');
    
    console.log('Reading Excel file...');
    const workbook = XLSX.readFile('attached_assets/Documentemployees_1765191243008.xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data: ExcelEmployee[] = XLSX.utils.sheet_to_json(sheet);
    
    console.log(`Found ${data.length} employees in Excel file`);
    
    console.log('Clearing existing employees...');
    await db.collection('employees').deleteMany({});
    
    console.log('Inserting employees...');
    const employees = data.map((row) => ({
      employeeId: String(row['User/Employee ID']),
      displayName: row['Display Name'] || '',
      miniRegionName: row['Mini Region Name'] || '',
      regionName: row['Region  Name'] || '',
      subZoneName: row['Sub-Zone Name'] || '',
      zoneName: row['Zone  Name'] || '',
      createdAt: new Date(),
    }));
    
    if (employees.length > 0) {
      await db.collection('employees').insertMany(employees);
      console.log(`Successfully inserted ${employees.length} employees`);
    }
    
    const count = await db.collection('employees').countDocuments();
    console.log(`Total employees in database: ${count}`);
    
  } catch (error) {
    console.error('Error seeding employees:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('Database connection closed');
  }
}

seedEmployees();
