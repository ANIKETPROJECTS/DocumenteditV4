import { storage } from "./server/storage";
import * as XLSX from 'xlsx';
import * as fs from 'fs';

async function exportToExcel() {
  try {
    const requests = await storage.getAllImageRequests();
    const worksheet = XLSX.utils.json_to_sheet(requests.map(r => ({
      'ID': r._id?.toString(),
      'User ID': r.userId,
      'Employee ID': r.employeeId,
      'Display Name': r.displayName,
      'Original File': r.originalFileName,
      'Status': r.status,
      'Uploaded At': r.uploadedAt,
      'Completed At': r.completedAt || ''
    })));
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Image Requests");
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    fs.writeFileSync('image_requests_export.xlsx', buffer);
    console.log("File saved successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}
exportToExcel();
