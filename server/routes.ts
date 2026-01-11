import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";
import { log } from "./index";
import { sendEditedImageNotification } from "./email";
import { notifyNewImageUpload, notifyImageEdited } from "./websocket";
import * as XLSX from 'xlsx';

const COMMON_PASSWORD = 'duolin';

import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: 'LGxeOBqys9s1XOEFLJUO7Cuy2nE',
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const imageUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Increase limit for Cloudinary
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and WEBP are allowed.'));
    }
  }
});

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Increased to 10MB for large Excel files
  fileFilter: (req, file, cb) => {
    // Log for debugging
    console.log(`[Multer] Received file: ${file.originalname}, mimetype: ${file.mimetype}`);
    const allowedExtensions = ['.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'));
    }
  }
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { employeeId, password } = req.body;
      
      if (!employeeId || !password) {
        return res.status(400).json({ message: 'Employee ID and password are required' });
      }

      if (password !== COMMON_PASSWORD) {
        return res.status(401).json({ message: 'Invalid password' });
      }

      const employee = await storage.getEmployeeByEmployeeId(String(employeeId));
      if (!employee) {
        return res.status(401).json({ message: 'Employee ID not found. Please contact your administrator.' });
      }

      let user = await storage.getUserByEmployeeId(String(employeeId));
      
      if (!user) {
        user = await storage.createUser({
          employeeId: String(employeeId),
          displayName: employee.displayName,
          role: 'user',
        });
      }

      res.json({ 
        message: 'Login successful',
        user: {
          id: user._id?.toString(),
          employeeId: user.employeeId,
          displayName: user.displayName,
          role: user.role,
        }
      });
    } catch (error: any) {
      log(`Error in login: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to login' });
    }
  });

  app.post('/api/images/upload', imageUpload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No image file provided' });
      }

      const { userId, employeeId, displayName } = req.body;

      if (!userId || !employeeId || !displayName) {
        return res.status(400).json({ message: 'User information is required' });
      }

      // Upload to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'original' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file!.buffer);
      }) as any;

      const imageRequest = await storage.createImageRequest({
        userId,
        employeeId,
        displayName,
        originalFileName: req.file.originalname,
        originalFilePath: uploadResult.secure_url,
        status: 'pending',
      });

      notifyNewImageUpload({
        id: imageRequest._id?.toString() || '',
        userId: imageRequest.userId,
        employeeId: imageRequest.employeeId,
        displayName: imageRequest.displayName,
        originalFileName: imageRequest.originalFileName,
        originalFilePath: imageRequest.originalFilePath,
        status: imageRequest.status,
        uploadedAt: imageRequest.uploadedAt,
      });

      res.json({
        message: 'Image uploaded successfully',
        request: {
          id: imageRequest._id?.toString(),
          status: imageRequest.status,
          uploadedAt: imageRequest.uploadedAt,
        }
      });
    } catch (error: any) {
      log(`Error in image upload: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to upload image' });
    }
  });

  app.get('/api/images/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const requests = await storage.getImageRequestsByUserId(userId);
      
      res.json({
        requests: requests.map(r => ({
          id: r._id?.toString(),
          originalFileName: r.originalFileName,
          originalFilePath: r.originalFilePath,
          editedFileName: r.editedFileName,
          editedFilePath: r.editedFilePath,
          status: r.status,
          uploadedAt: r.uploadedAt,
          completedAt: r.completedAt,
        }))
      });
    } catch (error: any) {
      log(`Error fetching user requests: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to fetch requests' });
    }
  });

  // New route: Download by request ID from MongoDB
  app.get('/api/images/download-by-id/:requestId/:type', async (req, res) => {
    try {
      const { requestId, type } = req.params;
      
      log(`Download by ID request - requestId: ${requestId}, type: ${type}`, 'info');
      
      if (type !== 'original' && type !== 'edited') {
        return res.status(400).json({ message: 'Invalid image type' });
      }

      const imageRequest = await storage.getImageRequestById(requestId);
      
      if (!imageRequest) {
        return res.status(404).json({ message: 'Image request not found' });
      }

      let fileContent: string | undefined;
      let contentType: string | undefined;
      let fileName: string;

      if (type === 'original') {
        fileContent = imageRequest.originalFileContent;
        contentType = imageRequest.originalContentType;
        fileName = imageRequest.originalFileName;
      } else {
        fileContent = imageRequest.editedFileContent;
        contentType = imageRequest.editedContentType;
        fileName = imageRequest.editedFileName || 'edited-image';
      }

      if (!fileContent) {
        // Fallback to local file if content not in MongoDB
        const filePath = type === 'original' ? imageRequest.originalFilePath : imageRequest.editedFilePath;
        if (filePath && fs.existsSync(filePath)) {
          return res.download(filePath);
        }
        log(`File content not in database for request ${requestId}, type: ${type}`, 'error');
        return res.status(404).json({ 
          message: 'This image was uploaded before the storage system was updated. The file content is no longer available. Please re-upload the image.' 
        });
      }

      const buffer = Buffer.from(fileContent, 'base64');
      res.setHeader('Content-Type', contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (error: any) {
      log(`Error downloading file by ID: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to download file' });
    }
  });

  // Legacy route: Download by filename from local storage (kept for backward compatibility)
  app.get('/api/images/download/:type/:filename', (req, res) => {
    try {
      const { type } = req.params;
      let { filename } = req.params;
      
      filename = decodeURIComponent(filename);
      
      log(`Legacy download request - type: ${type}, filename: ${filename}`, 'info');
      
      if (type !== 'original' && type !== 'edited') {
        return res.status(400).json({ message: 'Invalid image type' });
      }

      const filePath = path.join(process.cwd(), 'uploads', type, filename);
      
      if (!fs.existsSync(filePath)) {
        log(`File not found locally: ${filePath}`, 'error');
        return res.status(404).json({ 
          message: 'File not found. Please use the new download endpoint with request ID.',
          requestedFile: filename,
          type: type
        });
      }
      
      res.download(filePath);
    } catch (error: any) {
      log(`Error downloading file: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to download file' });
    }
  });

  app.get('/api/admin/requests', async (req, res) => {
    try {
      const requests = await storage.getAllImageRequests();
      
      res.json({
        requests: requests.map(r => ({
          id: r._id?.toString(),
          userId: r.userId,
          employeeId: r.employeeId,
          displayName: r.displayName,
          originalFileName: r.originalFileName,
          originalFilePath: r.originalFilePath,
          editedFileName: r.editedFileName,
          editedFilePath: r.editedFilePath,
          status: r.status,
          uploadedAt: r.uploadedAt,
          completedAt: r.completedAt,
        }))
      });
    } catch (error: any) {
      log(`Error fetching all requests: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to fetch requests' });
    }
  });

  app.get('/api/admin/employees/export', async (req, res) => {
    try {
      const employees = await storage.getAllEmployees();
      
      const worksheet = XLSX.utils.json_to_sheet(employees.map(e => ({
        'Employee ID': e.employeeId,
        'Display Name': e.displayName,
        'Mini Region': e.miniRegionName,
        'Region': e.regionName,
        'Sub Zone': e.subZoneName,
        'Zone': e.zoneName,
        'Created At': e.createdAt
      })));
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="employees.xlsx"');
      res.send(buffer);
    } catch (error: any) {
      log(`Error exporting employees: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to export employees' });
    }
  });

  app.get('/api/admin/requests/export-file', async (req, res) => {
    try {
      const requests = await storage.getAllImageRequests();
      
      const worksheet = XLSX.utils.json_to_sheet(requests.map(r => ({
        'ID': r._id?.toString(),
        'User ID': r.userId,
        'Employee ID': r.employeeId,
        'Display Name': r.displayName,
        'Original File': r.originalFileName,
        'Original Path': r.originalFilePath,
        'Edited File': r.editedFileName || '',
        'Edited Path': r.editedFilePath || '',
        'Status': r.status,
        'Uploaded At': r.uploadedAt,
        'Completed At': r.completedAt || ''
      })));
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Image Requests");
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      // Also save to root folder as requested
      fs.writeFileSync('image_requests_export.xlsx', buffer);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="image_requests_export.xlsx"');
      res.send(buffer);
    } catch (error: any) {
      log(`Error exporting requests: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to export requests' });
    }
  });

  app.post('/api/admin/employees/import', excelUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file provided' });
      }

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet) as any[];

      let importedCount = 0;
      let skippedCount = 0;

      for (const row of data) {
        const employeeId = String(row['Employee ID'] || row['employeeId'] || '');
        if (!employeeId) continue;

        const existing = await storage.getEmployeeByEmployeeId(employeeId);
        if (existing) {
          skippedCount++;
          continue;
        }

        await storage.createEmployee({
          employeeId,
          displayName: String(row['Display Name'] || row['displayName'] || ''),
          miniRegionName: String(row['Mini Region'] || row['miniRegionName'] || ''),
          regionName: String(row['Region'] || row['regionName'] || ''),
          subZoneName: String(row['Sub Zone'] || row['subZoneName'] || ''),
          zoneName: String(row['Zone'] || row['zoneName'] || ''),
        });
        importedCount++;
      }

      res.json({
        message: 'Import completed',
        importedCount,
        skippedCount,
      });
    } catch (error: any) {
      log(`Error importing employees: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to import employees' });
    }
  });

  app.get('/api/admin/users/export', async (req, res) => {
    try {
      const users = await storage.getAllUsers?.() || [];
      
      const worksheet = XLSX.utils.json_to_sheet(users.map(u => ({
        'User ID': u._id?.toString(),
        'Employee ID': u.employeeId,
        'Full Name': u.displayName,
        'Role': u.role,
        'Created At': u.createdAt
      })));
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Users");
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="users.xlsx"');
      res.send(buffer);
    } catch (error: any) {
      log(`Error exporting users: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to export users' });
    }
  });

  app.post('/api/admin/users/import', excelUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file provided' });
      }

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet) as any[];

      let importedCount = 0;
      let skippedCount = 0;

      for (const row of data) {
        const employeeId = String(row['Employee ID'] || row['employeeId'] || '');
        if (!employeeId) continue;

        const existing = await storage.getUserByEmployeeId(employeeId);
        if (existing) {
          skippedCount++;
          continue;
        }

        await storage.createUser({
          employeeId,
          displayName: String(row['Full Name'] || row['displayName'] || ''),
          role: (row['Role'] || 'user') as 'user' | 'admin',
        });
        importedCount++;
      }

      res.json({
        message: 'Import completed',
        importedCount,
        skippedCount,
      });
    } catch (error: any) {
      log(`Error importing users: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to import users' });
    }
  });

  app.post('/api/admin/upload-edited/:requestId', imageUpload.single('editedImage'), async (req, res) => {
    try {
      const { requestId } = req.params;

      if (!req.file) {
        return res.status(400).json({ message: 'No edited image file provided' });
      }

      // Upload to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'edited' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file!.buffer);
      }) as any;

      const updatedRequest = await storage.updateImageRequest(requestId, {
        editedFileName: req.file.originalname,
        editedFilePath: uploadResult.secure_url,
        status: 'completed',
        completedAt: new Date(),
      });

      if (!updatedRequest) {
        return res.status(404).json({ message: 'Request not found' });
      }

      notifyImageEdited({
        id: updatedRequest._id?.toString() || '',
        userId: updatedRequest.userId,
        employeeId: updatedRequest.employeeId,
        displayName: updatedRequest.displayName,
        originalFileName: updatedRequest.originalFileName,
        originalFilePath: updatedRequest.originalFilePath,
        editedFileName: updatedRequest.editedFileName || '',
        editedFilePath: updatedRequest.editedFilePath || '',
        status: updatedRequest.status,
        uploadedAt: updatedRequest.uploadedAt,
        completedAt: updatedRequest.completedAt || new Date(),
      });

      res.json({
        message: 'Edited image uploaded successfully',
        request: {
          id: updatedRequest._id?.toString(),
          status: updatedRequest.status,
          completedAt: updatedRequest.completedAt,
        }
      });
    } catch (error: any) {
      log(`Error uploading edited image: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to upload edited image' });
    }
  });

  app.use('/uploads', express.static('uploads'));

  return httpServer;
}
