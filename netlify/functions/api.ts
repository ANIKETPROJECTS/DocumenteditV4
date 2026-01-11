import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { MongoClient, ObjectId } from "mongodb";
import nodemailer from "nodemailer";
import Busboy from "busboy";

const APP_NAME = "Cipla Healthcare Portal";

let cachedClient: MongoClient | null = null;

async function getClient(): Promise<MongoClient> {
  if (cachedClient) return cachedClient;
  
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not configured");
  
  cachedClient = new MongoClient(uri);
  await cachedClient.connect();
  return cachedClient;
}

async function getDb() {
  const client = await getClient();
  return client.db();
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 12)}`;
}

function getTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error("Email service not configured. Please add GMAIL_USER and GMAIL_APP_PASSWORD to your Netlify environment variables.");
  }
  
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

async function sendOTPEmail(email: string, otp: string, fullName: string): Promise<boolean> {
  try {
    const transporter = getTransporter();
    
    await transporter.sendMail({
      from: `${APP_NAME} <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Your Login Code - ${APP_NAME}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
          <div style="max-width: 400px; margin: 0 auto; background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #18181b; font-size: 24px; margin: 0 0 8px 0;">Login Code</h1>
            <p style="color: #71717a; font-size: 14px; margin: 0 0 24px 0;">Hello ${fullName},</p>
            <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #18181b;">${otp}</span>
            </div>
            <p style="color: #71717a; font-size: 14px; margin: 0 0 8px 0;">This code expires in 10 minutes.</p>
            <p style="color: #a1a1aa; font-size: 12px; margin: 0;">If you did not request this code, please ignore this email.</p>
          </div>
        </body>
        </html>
      `,
    });
    
    console.log(`OTP email sent to ${email}`);
    return true;
  } catch (err) {
    console.error("Error sending OTP email:", err);
    throw err;
  }
}

async function sendEditedImageNotification(email: string, fullName: string, originalFileName: string): Promise<boolean> {
  try {
    const transporter = getTransporter();
    
    await transporter.sendMail({
      from: `${APP_NAME} <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Your Image is Ready! - ${APP_NAME}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
          <div style="max-width: 400px; margin: 0 auto; background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #18181b; font-size: 24px; margin: 0 0 8px 0;">Your Image is Ready!</h1>
            <p style="color: #71717a; font-size: 14px; margin: 0 0 24px 0;">Hello ${fullName},</p>
            <p style="color: #3f3f46; font-size: 14px; margin: 0 0 16px 0;">
              Great news! The background has been removed from your image:
            </p>
            <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <span style="font-size: 14px; color: #18181b; font-weight: 500;">${originalFileName}</span>
            </div>
            <p style="color: #3f3f46; font-size: 14px; margin: 0 0 24px 0;">
              Log in to your account to download the edited image.
            </p>
            <p style="color: #a1a1aa; font-size: 12px; margin: 0;">Thank you for using ${APP_NAME}!</p>
          </div>
        </body>
        </html>
      `,
    });
    
    console.log(`Notification email sent to ${email}`);
    return true;
  } catch (err) {
    console.error("Error sending notification email:", err);
    return false;
  }
}

interface ParsedFormData {
  fields: Record<string, string>;
  files: Record<string, { filename: string; type: string; content: Buffer }>;
}

function parseMultipartForm(event: HandlerEvent): Promise<ParsedFormData> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    const files: Record<string, { filename: string; type: string; content: Buffer }> = {};

    const busboy = Busboy({ headers: event.headers as Record<string, string> });

    busboy.on('file', (fieldname: string, filestream: any, info: { filename: string; encoding: string; mimeType: string }) => {
      const { filename, mimeType } = info;
      const chunks: Buffer[] = [];
      
      filestream.on('data', (data: Buffer) => {
        chunks.push(data);
      });
      
      filestream.on('end', () => {
        files[fieldname] = {
          filename,
          type: mimeType,
          content: Buffer.concat(chunks),
        };
      });
    });

    busboy.on('field', (fieldName: string, value: string) => {
      fields[fieldName] = value;
    });

    busboy.on('finish', () => {
      resolve({ fields, files });
    });

    busboy.on('error', (error: Error) => {
      reject(error);
    });

    const bodyBuffer = event.isBase64Encoded 
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '');
    
    busboy.write(bodyBuffer);
    busboy.end();
  });
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const path = event.path.replace("/.netlify/functions/api", "").replace("/api", "");
  const method = event.httpMethod;
  
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };

  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const db = await getDb();

    // POST /auth/request-otp
    if (path === "/auth/request-otp" && method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { email, fullName } = body;

      if (!email || !fullName) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: "Email and full name are required" }) };
      }

      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.collection("otp_sessions").updateOne(
        { email },
        { $set: { email, fullName, otp, expiresAt } },
        { upsert: true }
      );

      try {
        await sendOTPEmail(email, otp, fullName);
        return { 
          statusCode: 200, 
          headers, 
          body: JSON.stringify({ message: "OTP sent successfully", emailSent: true }) 
        };
      } catch (emailError: any) {
        console.error("Email send error:", emailError);
        return { 
          statusCode: 500, 
          headers, 
          body: JSON.stringify({ message: "Failed to send OTP email. Please check email configuration.", emailSent: false }) 
        };
      }
    }

    // POST /auth/verify-otp
    if (path === "/auth/verify-otp" && method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { email, otp } = body;

      if (!email || !otp) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: "Email and OTP are required" }) };
      }

      const session = await db.collection("otp_sessions").findOne({ email });
      if (!session) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: "No OTP session found. Please request a new OTP." }) };
      }

      if (new Date() > session.expiresAt) {
        await db.collection("otp_sessions").deleteOne({ email });
        return { statusCode: 400, headers, body: JSON.stringify({ message: "OTP has expired. Please request a new one." }) };
      }

      if (session.otp !== otp) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: "Invalid OTP" }) };
      }

      await db.collection("otp_sessions").deleteOne({ email });

      let user = await db.collection("users").findOne({ email });
      
      if (!user) {
        const result = await db.collection("users").insertOne({
          email: session.email,
          fullName: session.fullName,
          role: email === "abhijeet18012001@gmail.com" ? "admin" : "user",
          createdAt: new Date(),
        });
        user = { _id: result.insertedId, email: session.email, fullName: session.fullName, role: email === "abhijeet18012001@gmail.com" ? "admin" : "user" };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: "Login successful",
          user: {
            id: user._id.toString(),
            email: user.email,
            fullName: user.fullName,
            role: user.role,
          },
        }),
      };
    }

    // POST /images/upload - User uploads an image (store in MongoDB)
    if (path === "/images/upload" && method === "POST") {
      try {
        const formData = await parseMultipartForm(event);
        const { userId, userEmail, userFullName } = formData.fields;
        const imageFile = formData.files.image;

        if (!imageFile) {
          return { statusCode: 400, headers, body: JSON.stringify({ message: "No image file provided" }) };
        }

        if (!userId || !userEmail || !userFullName) {
          return { statusCode: 400, headers, body: JSON.stringify({ message: "User information is required" }) };
        }

        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(imageFile.type)) {
          return { statusCode: 400, headers, body: JSON.stringify({ message: "Invalid file type. Only JPG, PNG, and WEBP are allowed." }) };
        }

        if (imageFile.content.length > 1 * 1024 * 1024) {
          return { statusCode: 400, headers, body: JSON.stringify({ message: "File too large. Maximum size is 1MB." }) };
        }

        const uniqueId = generateUniqueId();

        // Store image data directly in MongoDB
        const imageDoc = {
          uniqueId,
          filename: imageFile.filename,
          contentType: imageFile.type,
          data: imageFile.content.toString('base64'),
          type: 'original',
          uploadedAt: new Date(),
        };

        await db.collection("images").insertOne(imageDoc);

        const imageRequest = {
          userId,
          userEmail,
          userFullName,
          originalFileName: imageFile.filename,
          originalImageId: uniqueId,
          status: 'pending',
          uploadedAt: new Date(),
        };

        const result = await db.collection("image_requests").insertOne(imageRequest);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            message: "Image uploaded successfully",
            request: {
              id: result.insertedId.toString(),
              status: 'pending',
              uploadedAt: imageRequest.uploadedAt,
            }
          })
        };
      } catch (uploadError: any) {
        console.error("Upload error:", uploadError);
        return { statusCode: 500, headers, body: JSON.stringify({ message: uploadError.message || "Failed to upload image" }) };
      }
    }

    // POST /admin/upload-edited/:requestId - Admin uploads edited image
    if (path.startsWith("/admin/upload-edited/") && method === "POST") {
      try {
        const requestId = path.replace("/admin/upload-edited/", "");
        
        const formData = await parseMultipartForm(event);
        // Accept both 'image' and 'editedImage' field names
        const imageFile = formData.files.image || formData.files.editedImage;

        if (!imageFile) {
          return { statusCode: 400, headers, body: JSON.stringify({ message: "No image file provided" }) };
        }

        const imageRequest = await db.collection("image_requests").findOne({ _id: new ObjectId(requestId) });
        if (!imageRequest) {
          return { statusCode: 404, headers, body: JSON.stringify({ message: "Image request not found" }) };
        }

        const uniqueId = generateUniqueId();

        // Store edited image in MongoDB
        const imageDoc = {
          uniqueId,
          filename: imageFile.filename,
          contentType: imageFile.type,
          data: imageFile.content.toString('base64'),
          type: 'edited',
          requestId,
          uploadedAt: new Date(),
        };

        await db.collection("images").insertOne(imageDoc);

        await db.collection("image_requests").updateOne(
          { _id: new ObjectId(requestId) },
          { 
            $set: { 
              editedFileName: imageFile.filename,
              editedImageId: uniqueId,
              status: 'completed',
              completedAt: new Date(),
            } 
          }
        );

        await sendEditedImageNotification(
          imageRequest.userEmail,
          imageRequest.userFullName,
          imageRequest.originalFileName
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            message: "Edited image uploaded successfully",
            request: {
              id: requestId,
              status: 'completed',
              editedImageId: uniqueId,
            }
          })
        };
      } catch (uploadError: any) {
        console.error("Upload edited error:", uploadError);
        return { statusCode: 500, headers, body: JSON.stringify({ message: uploadError.message || "Failed to upload edited image" }) };
      }
    }

    // GET /images/serve/:uniqueId - Serve image from MongoDB
    if (path.startsWith("/images/serve/") && method === "GET") {
      try {
        const uniqueId = path.replace("/images/serve/", "");
        
        const imageDoc = await db.collection("images").findOne({ uniqueId });
        if (!imageDoc) {
          return { statusCode: 404, headers, body: JSON.stringify({ message: "Image not found" }) };
        }

        return {
          statusCode: 200,
          headers: {
            "Content-Type": imageDoc.contentType || 'image/jpeg',
            "Cache-Control": "public, max-age=31536000",
            "Access-Control-Allow-Origin": "*",
          },
          body: imageDoc.data,
          isBase64Encoded: true,
        };
      } catch (error: any) {
        console.error("Serve image error:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ message: "Failed to serve image" }) };
      }
    }

    // GET /images/user/:userId
    if (path.startsWith("/images/user/") && method === "GET") {
      const userId = path.replace("/images/user/", "");
      const requests = await db.collection("image_requests").find({ userId }).sort({ uploadedAt: -1 }).toArray();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          requests: requests.map((r) => ({
            id: r._id.toString(),
            originalFileName: r.originalFileName,
            originalImageId: r.originalImageId,
            editedFileName: r.editedFileName,
            editedImageId: r.editedImageId,
            status: r.status,
            uploadedAt: r.uploadedAt,
            completedAt: r.completedAt,
          })),
        }),
      };
    }

    // GET /admin/requests
    if (path === "/admin/requests" && method === "GET") {
      const requests = await db.collection("image_requests").find({}).sort({ uploadedAt: -1 }).toArray();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          requests: requests.map((r) => ({
            id: r._id.toString(),
            userId: r.userId,
            userEmail: r.userEmail,
            userFullName: r.userFullName,
            originalFileName: r.originalFileName,
            originalImageId: r.originalImageId,
            editedFileName: r.editedFileName,
            editedImageId: r.editedImageId,
            status: r.status,
            uploadedAt: r.uploadedAt,
            completedAt: r.completedAt,
          })),
        }),
      };
    }

    // GET /admin/users - Get all users for admin
    if (path === "/admin/users" && method === "GET") {
      const users = await db.collection("users").find({}).sort({ createdAt: -1 }).toArray();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          users: users.map((u) => ({
            id: u._id.toString(),
            email: u.email,
            fullName: u.fullName,
            role: u.role,
            createdAt: u.createdAt,
          })),
        }),
      };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ message: "Not found" }) };
  } catch (error: any) {
    console.error("API Error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: error.message || "Internal server error" }) };
  }
};

export { handler };
