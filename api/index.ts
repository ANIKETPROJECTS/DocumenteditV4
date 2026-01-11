import express, { type Request, Response, NextFunction } from "express";
import { MongoClient, ObjectId, Binary } from "mongodb";
import multer from "multer";
import path from "path";
import nodemailer from "nodemailer";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

let cachedClient: MongoClient | null = null;

let cachedDb: any = null;

async function connectToDatabase() {
  // Logic merged into getDatabase for better serverless reliability
  return await getDatabase();
}

async function getDatabase() {
  if (cachedDb) {
    return cachedDb;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  try {
    if (!cachedClient) {
      cachedClient = new MongoClient(uri, {
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        retryWrites: true,
        // Authentication options explicitly for serverless
        authSource: "admin",
      });
      await cachedClient.connect();
    }
    cachedDb = cachedClient.db("bg_remover_portal");
    return cachedDb;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    cachedClient = null;
    cachedDb = null;
    throw error;
  }
}

interface Employee {
  _id?: ObjectId;
  employeeId: string;
  displayName: string;
  miniRegionName: string;
  regionName: string;
  subZoneName: string;
  zoneName: string;
  createdAt: Date;
}

interface User {
  _id?: ObjectId;
  employeeId: string;
  displayName: string;
  role: "user" | "admin";
  createdAt: Date;
}

interface ImageRequest {
  _id?: ObjectId;
  userId: string;
  employeeId: string;
  displayName: string;
  originalFileName: string;
  originalFilePath: string;
  originalFileContent?: string;
  originalContentType?: string;
  editedFileName?: string;
  editedFilePath?: string;
  editedFileContent?: string;
  editedContentType?: string;
  status: "pending" | "completed";
  uploadedAt: Date;
  completedAt?: Date;
}

const COMMON_PASSWORD = "duolin";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPG, PNG, and WEBP are allowed."));
    }
  },
});

function log(message: string, source = "api") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const { employeeId, password } = req.body;

    if (!employeeId || !password) {
      return res
        .status(400)
        .json({ message: "Employee ID and password are required" });
    }

    if (password !== COMMON_PASSWORD) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const db = await getDatabase();
    const employee = await db
      .collection("employees")
      .findOne({ employeeId: String(employeeId) }) as Employee | null;

    if (!employee) {
      return res.status(401).json({
        message: "Employee ID not found. Please contact your administrator.",
      });
    }

    let user = await db
      .collection("users")
      .findOne({ employeeId: String(employeeId) }) as User | null;

    if (!user) {
      const newUser: User = {
        employeeId: String(employeeId),
        displayName: employee.displayName,
        role: "user",
        createdAt: new Date(),
      };
      const result = await db.collection("users").insertOne(newUser as any);
      user = { ...newUser, _id: result.insertedId };
    }

    res.json({
      message: "Login successful",
      user: {
        id: user._id?.toString(),
        employeeId: user.employeeId,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (error: any) {
    log(`Error in login: ${error.message}`, "error");
    res.status(500).json({ message: "Failed to login" });
  }
});

app.post("/api/images/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const { userId, employeeId, displayName } = req.body;

    if (!userId || !employeeId || !displayName) {
      return res.status(400).json({ message: "User information is required" });
    }

    const db = await getDatabase();
    const imageBuffer = req.file.buffer;
    const imageMimeType = req.file.mimetype;

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: "original" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(imageBuffer);
    }) as any;

    const newRequest: ImageRequest = {
      userId,
      employeeId,
      displayName,
      originalFileName: req.file.originalname,
      originalFilePath: uploadResult.secure_url,
      originalFileContent: imageBuffer.toString("base64"),
      originalContentType: imageMimeType,
      status: "pending",
      uploadedAt: new Date(),
    };

    const doc: any = { ...newRequest };
    // Store as Binary for efficiency (this is how Mongo stores files)
    doc.originalFileContent = new Binary(imageBuffer);

    const result = await db
      .collection("image_requests")
      .insertOne(doc);
    const imageRequest = { ...newRequest, _id: result.insertedId };

    res.json({
      message: "Image uploaded successfully",
      request: {
        id: imageRequest._id?.toString(),
        status: imageRequest.status,
        uploadedAt: imageRequest.uploadedAt,
      },
    });
  } catch (error: any) {
    log(`Error in image upload: ${error.message}`, "error");
    res.status(500).json({ message: "Failed to upload image" });
  }
});

app.get("/api/images/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDatabase();
    const requests = await db
      .collection("image_requests")
      .find({ userId })
      .sort({ uploadedAt: -1 })
      .toArray() as any[];

    res.json({
      requests: requests.map((r) => ({
        id: r._id?.toString(),
        originalFileName: r.originalFileName,
        originalFilePath: r.originalFilePath,
        editedFileName: r.editedFileName,
        editedFilePath: r.editedFilePath,
        status: r.status,
        uploadedAt: r.uploadedAt,
        completedAt: r.completedAt,
      })),
    });
  } catch (error: any) {
    log(`Error fetching user requests: ${error.message}`, "error");
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});

app.get("/api/images/download/:requestId", async (req, res) => {
  try {
    const { requestId } = req.params;
    const { type } = req.query;

    const db = await getDatabase();
    const request = await db
      .collection("image_requests")
      .findOne({ _id: new ObjectId(requestId) }) as ImageRequest | null;

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    const filePath =
      type === "edited" ? request.editedFilePath : request.originalFilePath;
    const fileName =
      type === "edited" ? request.editedFileName : request.originalFileName;

    if (!filePath) {
      return res.status(404).json({ message: "File not found" });
    }

    if (filePath.startsWith("data:")) {
      const matches = filePath.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");

        res.setHeader("Content-Type", mimeType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${fileName || "image"}"`
        );
        return res.send(buffer);
      }
    }

    res.status(404).json({ message: "File format not supported" });
  } catch (error: any) {
    log(`Error downloading file: ${error.message}`, "error");
    res.status(500).json({ message: "Failed to download file" });
  }
});

// New download endpoint that matches main server structure
app.get("/api/images/download-by-id/:requestId/:type", async (req, res) => {
  try {
    const { requestId, type } = req.params;

    if (type !== "original" && type !== "edited") {
      return res.status(400).json({ message: "Invalid image type" });
    }

    const db = await getDatabase();
    const request = await db
      .collection("image_requests")
      .findOne({ _id: new ObjectId(requestId) }) as ImageRequest | null;

    if (!request) {
      return res.status(404).json({ message: "Image request not found" });
    }

    let fileContent: string | undefined;
    let contentType: string | undefined;
    let fileName: string;

    if (type === "original") {
      fileContent = request.originalFileContent;
      contentType = request.originalContentType;
      fileName = request.originalFileName;
    } else {
      fileContent = request.editedFileContent;
      contentType = request.editedContentType;
      fileName = request.editedFileName || "edited-image";
    }

    // Try fileContent first (main server format)
    if (fileContent) {
      const buffer = Buffer.from(fileContent, "base64");
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );
      return res.send(buffer);
    }

    // Fallback to filePath with data URI (Vercel format)
    const filePath =
      type === "edited" ? request.editedFilePath : request.originalFilePath;

    if (filePath && filePath.startsWith("data:")) {
      const matches = filePath.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");

        res.setHeader("Content-Type", mimeType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${fileName || "image"}"`
        );
        return res.send(buffer);
      }
    }

    res.status(404).json({ 
      message: "This image was uploaded before the storage system was updated. The file content is no longer available. Please re-upload the image." 
    });
  } catch (error: any) {
    log(`Error downloading file by ID: ${error.message}`, "error");
    res.status(500).json({ message: "Failed to download file" });
  }
});

app.get("/api/admin/requests", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 5;
    const skip = (page - 1) * limit;

    log(`API_START: Fetching requests page=${page}, limit=${limit}`, "admin-api");

    const db = await getDatabase();
    log("API_DB: Database connected", "admin-api");

    const total = await db.collection("image_requests").countDocuments();
    log(`API_DB: Total documents count=${total}`, "admin-api");

    const requests = await db
      .collection("image_requests")
      .find({}, {
        projection: {
          originalFileContent: 0,
          editedFileContent: 0
        }
      })
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray() as any[];

    log(`API_DB: Records fetched count=${requests.length}`, "admin-api");

    const responseData = {
      requests: requests.map((r) => ({
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
      })),
      pagination: {
        total: total || 0,
        page: page || 1,
        limit: limit || 5,
        totalPages: Math.ceil((total || 0) / (limit || 5))
      }
    };

    log("API_SUCCESS: Sending response", "admin-api");
    res.json(responseData);
  } catch (error: any) {
    log(`API_ERROR: ${error.stack || error.message}`, "admin-api");
    res.status(500).json({ 
      message: "Failed to fetch requests", 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.post(
  "/api/admin/upload-edited/:requestId",
  upload.single("editedImage"),
  async (req, res) => {
    try {
      const { requestId } = req.params;

      if (!req.file) {
        return res
          .status(400)
          .json({ message: "No edited image file provided" });
      }

      const imageBuffer = req.file.buffer;
      const imageMimeType = req.file.mimetype;

      // Upload to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "edited" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(imageBuffer);
      }) as any;

      const db = await getDatabase();
      const updatedDoc = await db
        .collection("image_requests")
        .findOneAndUpdate(
          { _id: new ObjectId(requestId) },
          {
            $set: {
              editedFileName: req.file.originalname,
              editedFilePath: uploadResult.secure_url,
              editedFileContent: new Binary(imageBuffer) as any,
              editedContentType: imageMimeType,
              status: "completed",
              completedAt: new Date(),
            },
          },
          { returnDocument: "after" }
        ) as any;
      
      if (!updatedDoc) {
        return res.status(404).json({ message: "Request not found" });
      }

      res.json({
        message: "Edited image uploaded successfully",
        request: {
          id: updatedDoc._id?.toString(),
          status: updatedDoc.status,
          completedAt: updatedDoc.completedAt,
        },
      });
    } catch (error: any) {
      log(`Error uploading edited image: ${error.message}`, "error");
      res.status(500).json({ message: "Failed to upload edited image" });
    }
  }
);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
});

export default app;
