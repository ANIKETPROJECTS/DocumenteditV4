import nodemailer from 'nodemailer';
import { log } from './index';

const transporter = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })
  : null;

const FROM_EMAIL = process.env.GMAIL_USER || 'noreply@example.com';
const APP_NAME = 'BG Remover Portal';

export async function sendOTPEmail(email: string, otp: string, fullName: string): Promise<boolean> {
  if (!transporter) {
    log('Gmail credentials not configured, skipping OTP email', 'email');
    return false;
  }
  
  try {
    const info = await transporter.sendMail({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
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

    log(`OTP email sent to ${email} (ID: ${info.messageId})`, 'email');
    return true;
  } catch (error: any) {
    log(`Error sending OTP email: ${error.message}`, 'email');
    return false;
  }
}

export async function sendEditedImageNotification(
  email: string, 
  fullName: string, 
  originalFileName: string
): Promise<boolean> {
  if (!transporter) {
    log('Gmail credentials not configured, skipping notification email', 'email');
    return false;
  }
  
  try {
    const info = await transporter.sendMail({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
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

    log(`Notification email sent to ${email} (ID: ${info.messageId})`, 'email');
    return true;
  } catch (error: any) {
    log(`Error sending notification email: ${error.message}`, 'email');
    return false;
  }
}
